import { EditHistory } from "./edit-history.js";
import { EFFECTS } from "./effects.js";
const $ = (id) => document.getElementById(id);
const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
const icon = (name) => {
  const n = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  n.setAttribute("viewBox", "0 0 24 24");
  n.setAttribute("aria-hidden", "true");
  const u = document.createElementNS(n.namespaceURI, "use");
  u.setAttribute("href", "#pp-icon-" + name);
  n.append(u);
  return n;
};
const action = (name, label, fn) => {
  const b = el("button", null, "editor-icon");
  b.type = "button";
  b.setAttribute("aria-label", label);
  b.title = label;
  b.append(icon(name));
  b.addEventListener("click", fn);
  return b;
};
export class EditorController {
  constructor(options) {
    Object.assign(this, options);
    this.history = new EditHistory();
    this.pending = false;
    this.restoring = false;
    this.exportURL = null;
    this.appliedKey = "";
    const chips=el('span',null,'material-chips');chips.setAttribute('aria-hidden','true');for(let i=0;i<4;i++)chips.append(el('i',null,'material-chip'));document.querySelector('.editor-kicker').insertBefore(chips,$('editor-privacy'));
    $("editor-privacy").addEventListener("click", () =>
      $("privacy-dialog").showModal(),
    );
    $("editor-undo").append(icon("undo"));
    $("editor-redo").append(icon("redo"));
    $("quick-export").append(icon("export"));
    $("editor-undo").addEventListener("click", () => this.move(-1));
    $("editor-redo").addEventListener("click", () => this.move(1));
    $("pro-toggle").addEventListener("click", () => this.setPro(!this.pro));
    $("quick-export").addEventListener("click", () => this.openExport());
    $("close-quick-export").addEventListener("click", () =>
      $("quick-export-dialog").close(),
    );
    $("quick-export-dialog").addEventListener("close", () => {
      if (this.exportURL) URL.revokeObjectURL(this.exportURL);
      this.exportURL = null;
      this.exportToken = null;
    });
    $("apply-bake").addEventListener("click", async () => {
      try {
        await this.bake();
        this.observe("bake");
      } catch (e) {
        this.note(e.message, true);
      }
      this.refresh();
    });
    for (const type of ["click", "input", "change"])
      document.addEventListener(
        type,
        (e) => {
          if (
            e.target.closest(
              "#editor-undo,#editor-redo,#quick-export-dialog,#pro-toggle,#quick-export",
            )
          )
            return;
          this.observe(type === "input" ? e.target.id || "input" : null);
        },
        true,
      );
    document.addEventListener("keydown", (e) => {
      const typing=e.target.isContentEditable || e.target.tagName==='TEXTAREA' || (e.target.tagName==='INPUT' && !['range','checkbox','radio','button','file'].includes(e.target.type));
      if (
        !(e.ctrlKey || e.metaKey) ||
        e.altKey ||
        typing
      )
        return;
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        this.move(e.shiftKey ? 1 : -1);
      } else if (e.key.toLowerCase() === "y") {
        e.preventDefault();
        this.move(1);
      }
    });
    let pro = false;
    try {
      pro = localStorage.getItem("brainhertz.pixelpusher.pro.v1") === "true";
    } catch {}
    this.setPro(pro);
    this.reset();
  }
  reset() {
    this.history.reset(this.read());
    this.refresh();
  }
  observe(key = null) {
    if (
      this.restoring ||
      this.pending ||
      this.loading?.() ||
      this.console.gesture?.held
    )
      return;
    this.pending = true;
    queueMicrotask(() => {
      this.pending = false;
      if (this.restoring || this.loading?.()) return;
      this.history.record(this.read(), { key });
      this.refresh();
    });
  }
  move(delta) {
    if (this.loading?.()) {
      this.note("Wait for the source to finish loading before undoing.", true);
      return;
    }
    const state = this.history.peek(delta);
    if (!state) return;
    if (this.recording() && state.source !== this.read().source) {
      this.note("Stop recording before undoing a photo bake.", true);
      return;
    }
    this.restoring = true;
    try {
      this.restore(this.history.move(delta));
      this.console.closePanel();
    } catch (e) {
      this.note(e.message, true);
    } finally {
      this.restoring = false;
      this.refresh();
    }
  }
  setPro(on) {
    this.pro = on;
    document.body.classList.toggle("pro-mode", on);
    document.body.classList.toggle("simple-mode", !on);
    $("pro-toggle").setAttribute("aria-pressed", String(on));
    const imports = on
      ? document.querySelector(".sourcebar")
      : $("editor-imports");
    for (const id of ["file", "photo"]) {
      const label = $(id).parentElement;
      if (on) imports.insertBefore(label, $("studio-toggle"));
      else imports.append(label);
    }
    $("file").parentElement.firstChild.textContent = on
      ? "Import media"
      : "Import";
    if (!on) {
      this.console.closePanel();
      this.console.cancelGesture();
      this.console.endSelection();
      if (this.console.category === "Groups") this.console.setCategory("All");
      document.body.classList.remove("studio-open");
      $("studio-toggle").setAttribute("aria-pressed", "false");
    }
    try {
      localStorage.setItem("brainhertz.pixelpusher.pro.v1", String(on));
    } catch {}
    if (this.history.entries.length) this.refresh();
  }
  refresh() {
    if (!this.history) return;
    $("editor-undo").disabled = !this.history.canUndo;
    $("editor-redo").disabled = !this.history.canRedo;
    $("apply-bake").disabled = !this.canBake();
    const s = this.read(),
      list = s.data.stack.filter((e) => e.enabled),
      shader = s.data.shader;
    const key = JSON.stringify([
      list.map((e) => e.id),
      shader.enabled,
      shader.scene,
    ]);
    if (key === this.appliedKey) return;
    this.appliedKey = key;
    $("applied-count").textContent =
      "APPLIED / " + (list.length + (shader.enabled ? 1 : 0));
    const rail = $("applied-rail");
    rail.replaceChildren();
    if (shader.enabled)
      this.appliedCard(
        rail,
        "shader:" + shader.scene,
        "Shader · " + shader.scene,
        -1,
        false,
      );
    list.forEach((e, i) =>
      this.appliedCard(
        rail,
        e.id,
        EFFECTS.find((d) => d.id === e.id).name,
        s.data.stack.findIndex((d) => d.id === e.id),
        true,
      ),
    );
    if (!list.length && !shader.enabled)
      rail.append(
        el(
          "p",
          "Choose an effect below. Drag on the picture to shape it.",
          "applied-empty",
        ),
      );
  }
  appliedCard(rail, id, name, index, movable) {
    const card = el("div", null, "applied-card");
    card.dataset.applied = id;
    const title = el("button", name, "applied-title");
    title.addEventListener("click", () => this.console.openInspector(id));
    card.append(title);
    if (movable) {
      const indices = this.read().data.stack.flatMap((e, i) =>
          e.enabled ? [i] : [],
        ),
        position = indices.indexOf(index);
      const up = action("left", "Move " + name + " earlier", () =>
        this.reorder(index, indices[position - 1] - index),
      );
      up.disabled = position <= 0;
      const down = action("right", "Move " + name + " later", () =>
        this.reorder(index, indices[position + 1] - index),
      );
      down.disabled = position >= indices.length - 1;
      card.append(up, down);
    }
    card.append(
      action("close", "Remove " + name, () => {
        this.console.toggle(id, false);
        this.observe();
      }),
    );
    rail.append(card);
  }
  async openExport() {
    const dialog = $("quick-export-dialog");
    if (!dialog.open) dialog.showModal();
    $("quick-export-status").textContent =
      "Preparing a PNG from the current preview…";
    $("quick-export-actions").replaceChildren();
    const token = {};
    this.exportToken = token;
    this.renderExports();
    try {
      // Let source/size changes render before reading the preserved WebGL buffer.
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if (this.exportToken !== token || !dialog.open) return;
      const width=this.canvas.width,height=this.canvas.height;
      const blob = await new Promise((resolve) =>
        this.canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("PNG export failed. Try a lower output size.");
      if (this.exportToken !== token || !dialog.open) return;
      if (this.exportURL) URL.revokeObjectURL(this.exportURL);
      this.exportURL = URL.createObjectURL(blob);
      const file = new File(
        [blob],
        "pixelpusher-" +
          new Date().toISOString().replace(/[:.]/g, "-") +
          ".png",
        { type: "image/png" },
      );
      this.exportActions(
        $("quick-export-actions"),
        this.exportURL,
        file,
        "Save PNG",
      );
      $("quick-export-status").textContent =
        width +
        " × " +
        height +
        " · PNG · on device only";
    } catch (e) {
      $("quick-export-status").textContent = e.message;
      this.note(e.message, true);
    }
  }
  exportActions(parent, url, file, label) {
    const a = el("a", label, "quick-save");
    a.href = url;
    a.download = file.name;
    parent.append(a);
    let share = false;
    try {
      share = !!navigator.canShare?.({ files: [file] });
    } catch {}
    if (share) {
      const b = el("button", "Share", "quick-share");
      b.addEventListener("click", async () => {
        try {
          await navigator.share({
            files: [file],
            title: "Pixel Pusher export",
          });
        } catch (e) {
          if (e.name !== "AbortError") {
            $("quick-export-status").textContent = e.message;
            this.note(e.message, true);
          }
        }
      });
      parent.append(b);
    }
  }
  renderExports() {
    const list = $("quick-recordings");
    list.replaceChildren();
    for (const e of [...this.getExports()].reverse()) {
      const row = el("div", null, "quick-recording");
      row.append(el("p", e.description || "Recorded export"));
      this.exportActions(
        row,
        e.url,
        e.file ||
          new File([e.blob], "pixelpusher-export.webm", { type: e.blob.type }),
        "Save " +
          (e.blob.type.includes("png")
            ? "PNG"
            : e.blob.type.includes("mp4")
              ? "MP4"
              : "WEBM"),
      );
      list.append(row);
    }
  }
  exportReady() {
    if (!this.pro) this.openExport();
    else if ($("quick-export-dialog").open) this.renderExports();
  }
}
