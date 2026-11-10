import { valueGauge } from './ui-material.js';
import { formatParam } from "./effects.js";
import {
  CATALOG,
  CATALOG_BY_ID,
  CATEGORIES,
  isTargetOn,
  targetState,
} from "./effect-catalog.js";
import {
  ConsoleEngine,
  MAX_GROUP_ROUTES,
  createGroup,
  captureScene,
  normalizeConsoleState,
  normalizeRoute,
} from "./console-state.js";
import { normalizeShaderState } from "./shader-state.js";
import { bindXY } from "./touch.js";
import {
  thumbnail,
  thumbnailStats,
  pruneThumbnails,
} from "./console-thumbnails.js";
const KEY = "brainhertz.pixelpusher.console.v1";
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
function icon(name) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
    u = document.createElementNS(s.namespaceURI, "use");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("aria-hidden", "true");
  u.setAttribute("href", "#pp-icon-" + name);
  s.append(u);
  return s;
}
function button(label, symbol, fn, cls = "icon-button") {
  const b = el("button", cls);
  b.type = "button";
  b.setAttribute("aria-label", label);
  b.title = label;
  if (symbol) b.append(icon(symbol));
  else b.textContent = label;
  if (fn) b.addEventListener("click", fn);
  return b;
}
function select(options, value, change, label) {
  const s = el("select");
  s.setAttribute("aria-label", label);
  for (const [v, name] of options) {
    const o = el("option", null, name);
    o.value = v;
    s.append(o);
  }
  s.value = value;
  s.addEventListener("change", () => change(s.value));
  return s;
}
function field(name, input) {
  const l = el("label", "console-field", name);
  l.append(input);
  return l;
}
const SOURCES = [
  ["none", "Off"],
  ["lfo", "LFO"],
  ["low", "Audio low"],
  ["mid", "Audio mid"],
  ["high", "Audio high"],
  ["beat", "Audio onset"],
  ["bpm", "BPM"],
];
export class PerformanceConsole {
  constructor(
    root,
    {
      getModel,
      getTarget = () => null,
      setShader,
      onChange,
      onTarget,
      onStudio = () => {},
      note,
      cancelPicture,
    },
  ) {
    Object.assign(this, {
      root,
      getModel,
      getTarget,
      setShader,
      onChange,
      onTarget,
      onStudio,
      note,
      cancelPicture,
    });
    let saved;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw && raw.length < 250000) saved = JSON.parse(raw);
    } catch {
      note("Console storage unavailable. This session still works.");
    }
    this.engine = new ConsoleEngine(saved);
    for (const g of this.engine.state.groups) g.enabled = false;
    this.category = "All";
    this.selection = new Set();
    this.tiles = new Map();
    this.activeScene = null;
    this.syncFields = [];
    this.panel = $("performance-panel");
    this.rail = $("effect-rail");
    this.tabs = $("effect-categories");
    this.gesture = null;
    this.lastSync = 0;
    this.build();
    this.renderRail();
    window.addEventListener("blur", () => this.cancelGesture());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.cancelGesture();
        this.flush();
      }
    });
    window.addEventListener("pagehide", () => this.flush());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.cancelGesture();
        this.closePanel();
        if (this.selecting) this.endSelection();
      }
    });
  }
  get state() {
    return this.engine.state;
  }
  get groups() {
    return this.state.groups;
  }
  build() {
    for (const name of CATEGORIES) {
      const b = el("button", "category-tab", name);
      b.dataset.category = name;
      b.tabIndex = name === this.category ? 0 : -1;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(name === this.category));
      b.addEventListener("click", () => this.setCategory(name));
      b.addEventListener("keydown", (e) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        const names = CATEGORIES.filter(
          (n) => !this.isSimple() || n !== "Groups",
        );
        const i = names.indexOf(name),
          j =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? names.length - 1
                : (i + (e.key === "ArrowRight" ? 1 : -1) + names.length) %
                  names.length;
        this.setCategory(names[j]);
        this.tabs.querySelector('[data-category="' + names[j] + '"]').focus();
      });
      this.tabs.append(b);
    }
    const tools = $("console-toolbar"),
      scenes = el("div", "scene-bank");
    scenes.setAttribute("aria-label", "Scene snapshots");
    for (let i = 0; i < 4; i++) {
      const b = button(String.fromCharCode(65 + i), null, null, "scene-button");
      b.dataset.scene = i;
      b.setAttribute(
        "aria-label",
        "Scene " + b.textContent + ". Tap recall; hold or Shift-click save.",
      );
      let timer,
        long = false;
      b.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        long = false;
        timer = setTimeout(() => {
          long = true;
          this.storeScene(i);
        }, 450);
      });
      for (const event of [
        "pointerup",
        "pointercancel",
        "pointerleave",
        "lostpointercapture",
      ])
        b.addEventListener(event, () => clearTimeout(timer));
      b.addEventListener("click", (e) => {
        if (long) {
          long = false;
          return;
        }
        if (e.shiftKey || !this.state.scenes[i]) this.storeScene(i);
        else this.recallScene(i);
      });
      b.addEventListener("contextmenu", (e) => e.preventDefault());
      scenes.append(b);
    }
    tools.append(scenes);
    this.groupButton = button("Select effects to make a group", "group", () =>
      this.selecting ? this.endSelection() : this.beginSelection(),
    );
    this.groupButton.id = "group-select";
    this.groupButton.setAttribute("aria-pressed", "false");
    tools.append(this.groupButton);
    this.holdButton = button("Hold to momentarily apply", "hold", () => {
      this.cancelGesture();
      this.state.holdMode = !this.state.holdMode;
      this.changed("settings");
      this.sync(true);
    });
    this.holdButton.id = "momentary-mode";
    tools.append(this.holdButton);
    const settings = button(
      "Scene crossfade and console settings",
      "clock",
      () => this.openSettings(),
    );
    settings.id = "scene-settings";
    tools.append(settings);
    $("close-performance-panel").addEventListener("click", () =>
      this.closePanel(),
    );
    this.sync(true);
  }
  changed(reason = "parameter") {
    if (reason === "toggle" || reason === "structure") {
      this.engine.cancelTransition();
      this.activeScene = null;
    }
    this.onChange(reason);
    this.schedule();
    this.sync(true);
  }
  schedule() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 250);
  }
  flush() {
    clearTimeout(this.saveTimer);
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      if (!this.storageWarned) {
        this.note(
          "Console changes work for this session; local storage is full or unavailable.",
          true,
        );
        this.storageWarned = true;
      }
    }
  }
  externalChange() {
    this.engine.cancelTransition();
    this.activeScene = null;
    this.sync(true);
  }
  loadPreset(raw) {
    this.cancelGesture();
    if (raw) this.engine.setState(raw);
    else {
      this.engine.cancelTransition();
      for (const g of this.groups) g.enabled = false;
    }
    this.activeScene = null;
    this.endSelection();
    this.renderRail();
    this.closePanel();
    this.schedule();
  }
  reset() {
    this.cancelGesture();
    this.engine.cancelTransition();
    for (const g of this.groups) g.enabled = false;
    this.activeScene = null;
    this.sync(true);
    this.schedule();
  }
  setCategory(name) {
    if (this.isSimple() && name === "Groups") name = "All";
    this.cancelGesture();
    this.category = name;
    for (const b of this.tabs.children) {
      b.setAttribute("aria-selected", String(b.dataset.category === name));
      b.tabIndex = b.dataset.category === name ? 0 : -1;
    }
    this.renderRail();
    this.tabs
      .querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    this.rail.scrollLeft = 0;
  }
  groupStatus(g) {
    const model = this.getModel(),
      all = g.members.every((id) => isTargetOn(model, id));
    return g.enabled ? (all ? "on" : "mix") : "off";
  }
  nativeTarget(id) {
    const d = CATALOG_BY_ID.get(id),
      m = this.getModel();
    return d?.kind === "shader" ? m.shader : targetState(m, id);
  }
  enableTarget(id, on) {
    const d = CATALOG_BY_ID.get(id),
      m = this.getModel();
    if (!d) return;
    if (d.kind === "shader") {
      if (m.shader.scene === d.scene) m.shader.enabled = on;
      else if (on)
        this.setShader({ ...m.shader, scene: d.scene, enabled: true });
    } else {
      const e = targetState(m, id);
      if (e) e.enabled = on;
    }
  }
  toggle(id, force) {
    this.cancelPicture();
    this.engine.cancelTransition();
    const group = this.groups.find((g) => g.id === id);
    if (group) {
      const on = force ?? this.groupStatus(group) !== "on";
      group.enabled = on;
      for (const member of group.members) this.enableTarget(member, on);
    } else {
      const on = force ?? !isTargetOn(this.getModel(), id);
      this.enableTarget(id, on);
    }
    this.onTarget(
      group ? group.id : id.startsWith("shader:") ? "shader" : id,
      false,
    );
    this.changed("toggle");
  }
  snapshot(id) {
    const g = this.groups.find((g) => g.id === id),
      members = g ? g.members : [id],
      m = this.getModel();
    return {
      id,
      target: this.getTarget(),
      groupEnabled: g?.enabled,
      flags: members
        .filter((k) => CATALOG_BY_ID.get(k)?.kind === "fx")
        .map((k) => [k, isTargetOn(m, k)]),
      shader: members.some((k) => k.startsWith("shader:"))
        ? { scene: m.shader.scene, enabled: m.shader.enabled }
        : null,
    };
  }
  restore(s) {
    if (!s) return;
    const m = this.getModel();
    for (const [id, on] of s.flags) {
      const e = targetState(m, id);
      if (e) e.enabled = on;
    }
    if (s.shader) {
      if (m.shader.scene === s.shader.scene)
        m.shader.enabled = s.shader.enabled;
      else
        this.setShader({
          ...m.shader,
          scene: s.shader.scene,
          enabled: s.shader.enabled,
        });
    }
    const g = this.groups.find((g) => g.id === s.id);
    if (g) g.enabled = s.groupEnabled;
    this.onTarget(s.target, false);
    this.changed("toggle");
  }
  cancelGesture() {
    const g = this.gesture;
    if (!g) return;
    clearTimeout(g.timer);
    this.gesture = null;
    if (g.snapshot) this.restore(g.snapshot);
    g.suppress?.();
  }
  isSimple() {
    return document.body.classList.contains("simple-mode");
  }
  bindTile(b, id) {
    let suppressed = 0;
    const finish = (e) => {
      const g = this.gesture;
      if (!g || g.button !== b || g.pointerId !== e.pointerId) return;
      clearTimeout(g.timer);
      this.gesture = null;
      if (g.snapshot) this.restore(g.snapshot);
      if (g.held || g.moved || g.opened) suppressed = performance.now() + 600;
    };
    b.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      this.cancelGesture();
      const g = {
        button: b,
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        held: false,
        opened: false,
        moved: false,
        suppress: () => {
          suppressed = performance.now() + 600;
        },
      };
      this.gesture = g;
      g.timer = setTimeout(
        () => {
          if (this.gesture !== g) return;
          if (this.state.holdMode && !this.selecting && !this.isSimple()) {
            g.snapshot = this.snapshot(id);
            g.held = true;
            this.toggle(id, true);
          } else if (!this.selecting) {
            g.opened = true;
            this.openInspector(id);
          }
        },
        this.state.holdMode && !this.selecting && !this.isSimple() ? 90 : 450,
      );
    });
    b.addEventListener("pointermove", (e) => {
      const g = this.gesture;
      if (!g || g.button !== b || g.pointerId !== e.pointerId) return;
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 8) {
        g.moved = true;
        clearTimeout(g.timer);
        if (g.snapshot) {
          this.restore(g.snapshot);
          g.snapshot = null;
        }
      }
    });
    for (const event of [
      "pointerup",
      "pointercancel",
      "lostpointercapture",
      "pointerleave",
    ])
      b.addEventListener(event, finish);
    b.addEventListener("click", (e) => {
      if (e.detail && performance.now() < suppressed) return;
      if (this.selecting) this.selectMember(id);
      else if (this.isSimple()) {
        this.toggle(id, true);
        this.openInspector(id);
      } else if (!this.state.holdMode) this.toggle(id);
    });
    b.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (!this.state.holdMode && !this.selecting && !this.isSimple())
        this.openInspector(id);
    });
    b.addEventListener("keydown", (e) => {
      if (e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        this.openInspector(id);
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const tiles = [...this.rail.querySelectorAll(".tile-trigger")],
          i = tiles.indexOf(b),
          next =
            tiles[
              (i + (e.key === "ArrowRight" ? 1 : -1) + tiles.length) %
                tiles.length
            ];
        next?.focus();
        return;
      }
      if (
        this.state.holdMode &&
        !this.isSimple() &&
        !this.selecting &&
        (e.code === "Space" || e.code === "Enter")
      ) {
        e.preventDefault();
        if (!e.repeat) {
          this.cancelGesture();
          const snapshot = this.snapshot(id);
          this.gesture = { button: b, pointerId: "key", snapshot, held: true };
          this.toggle(id, true);
        }
      }
    });
    b.addEventListener("keyup", (e) => {
      if (this.gesture?.button === b && this.gesture.pointerId === "key") {
        e.preventDefault();
        this.cancelGesture();
      }
    });
    b.addEventListener("blur", () => {
      if (this.gesture?.button === b && this.gesture.pointerId === "key")
        this.cancelGesture();
    });
  }
  tile(def) {
    if (this.tiles.has(def.id)) return this.tiles.get(def.id);
    const card = el("article", "effect-tile");
    card.dataset.tile = def.id;
    const trigger = button(def.name, null, null, "tile-trigger");
    trigger.replaceChildren(thumbnail(def.id));
    const title = el("span", "tile-name", def.name),
      state = el("span", "tile-state", "OFF");
    trigger.append(title, state);
    this.bindTile(trigger, def.id);
    const tune = button(
      "Tune " + def.name,
      "tune",
      () => this.openInspector(def.id),
      "tile-tune",
    );
    card.append(trigger, tune);
    const entry = { card, trigger, title, state, tune };
    this.tiles.set(def.id, entry);
    return entry;
  }
  renderRail() {
    this.cancelGesture();
    const ids = new Set([
      ...CATALOG.map((e) => e.id),
      ...this.groups.map((g) => g.id),
    ]);
    pruneThumbnails(ids);
    for (const [id] of this.tiles) if (!ids.has(id)) this.tiles.delete(id);
    const defs = [
      ...CATALOG,
      ...this.groups.map((g) => ({ ...g, category: "Groups" })),
    ].filter((d) => this.category === "All" || d.category === this.category);
    this.rail.replaceChildren(...defs.map((d) => this.tile(d).card));
    if (!defs.length)
      this.rail.append(
        el(
          "p",
          "empty-rail",
          this.category === "Groups"
            ? "Select tiles with the group button to build a performance group."
            : "No effects in this category.",
        ),
      );
    this.sync(true);
  }
  sync(force = false, now = performance.now()) {
    if (!force && now - this.lastSync < 100) return;
    this.lastSync = now;
    if(this.headerGauge && this.inspectorId){const ref=this.reference(this.inspectorId);if(ref)this.headerGauge.update(this.groups.includes(ref)?ref.values[0]:ref.intensity);}
    const model = this.getModel(),
      rawTarget = this.getTarget(),
      targetId =
        rawTarget === "shader" ? "shader:" + model.shader.scene : rawTarget;
    for (const [id, t] of this.tiles) {
      const g = this.groups.find((g) => g.id === id),
        d = CATALOG_BY_ID.get(id) || g;
      if (!d) continue;
      const status = g
          ? this.groupStatus(g)
          : isTargetOn(model, id)
            ? "on"
            : "off",
        selected = this.selection.has(id);
      const signature = [
        status,
        selected,
        !!this.selecting,
        d.name,
        this.inspectorId === id,
        targetId === id,
      ].join("|");
      if (t.signature === signature) continue;
      t.signature = signature;
      t.card.classList.toggle("is-on", status === "on");
      t.card.classList.toggle("is-mixed", status === "mix");
      t.card.classList.toggle("is-selected", selected);
      t.card.classList.toggle("is-inspected", this.inspectorId === id);
      t.card.classList.toggle("is-targeted", targetId === id);
      t.title.textContent = d.name;
      t.state.textContent = this.selecting
        ? selected
          ? "SELECTED"
          : g
            ? "GROUP"
            : "+ SELECT"
        : status.toUpperCase();
      t.trigger.setAttribute(
        "aria-pressed",
        this.selecting
          ? String(selected)
          : status === "mix"
            ? "mixed"
            : String(status === "on"),
      );
      t.trigger.setAttribute(
        "aria-label",
        (this.selecting ? "Select " : this.isSimple() ? "Edit " : "Toggle ") +
          d.name,
      );
      t.trigger.disabled = !!(this.selecting && g);
      t.tune.setAttribute("aria-label", "Tune " + d.name);
    }
    this.groupButton?.setAttribute("aria-pressed", String(!!this.selecting));
    this.holdButton?.setAttribute("aria-pressed", String(this.state.holdMode));
    this.root.classList.toggle("selection-mode", !!this.selecting);
    for (const b of this.root.querySelectorAll("[data-scene]")) {
      const i = Number(b.dataset.scene);
      b.classList.toggle("has-scene", !!this.state.scenes[i]);
      b.classList.toggle("scene-current", this.activeScene === i);
      b.title =
        "Scene " +
        b.textContent +
        (this.state.scenes[i]
          ? " · recall / hold to replace"
          : " · empty / tap to save");
    }
    for (const f of this.syncFields) {
      if (document.activeElement !== f.input) {
        const value = f.get();
        f.input.value = value * f.scale;
        f.out.textContent = f.format(value);
      }
    }
    if (
      this.inspectorId &&
      this.inspectedRef !== this.reference(this.inspectorId)
    ) {
      if (this.reference(this.inspectorId))
        this.openInspector(this.inspectorId, false);
      else this.closePanel();
    }
    if (this.selecting && $("group-selection-count"))
      $("group-selection-count").textContent =
        this.selection.size + " selected · one shader slot";
  }
  beginSelection() {
    this.cancelGesture();
    this.selecting = true;
    this.selection.clear();
    this.setCategory("All");
    this.openComposer();
    this.sync(true);
  }
  endSelection() {
    this.selecting = false;
    this.selection.clear();
    if (this.panelMode === "composer") this.closePanel();
    this.sync(true);
  }
  selectMember(id) {
    const d = CATALOG_BY_ID.get(id);
    if (!d) return;
    if (this.selection.has(id)) this.selection.delete(id);
    else {
      if (this.selection.size >= 19) {
        this.note("A group can have up to 19 members.", true);
        return;
      }
      if (d.kind === "shader")
        for (const old of this.selection)
          if (old.startsWith("shader:")) this.selection.delete(old);
      this.selection.add(id);
    }
    this.sync(true);
  }
  panelStart(title, kicker = "PARAMETERS") {
    this.headerGauge?.node.remove();this.headerGauge=null;
    this.syncFields = [];
    this.panel.hidden = false;
    $("performance-panel-title").textContent = title;
    $("performance-panel-kicker").textContent = kicker;
    const body = $("performance-panel-body");
    body.replaceChildren();
    return body;
  }
  closePanel() {
    this.panel.hidden = true;
    this.inspectorId = null;
    this.inspectedRef = null;
    this.syncFields = [];
    this.panelMode = null;
  }
  openComposer() {
    this.panelMode = "composer";
    this.inspectorId = null;
    const body = this.panelStart("Build a group", "MULTI-SELECT"),
      name = el("input");
    name.id = "new-group-name";
    name.maxLength = 32;
    name.placeholder = "Name your group";
    name.autocomplete = "off";
    body.append(
      field("Group name", name),
      el(
        "p",
        "console-help",
        "Tap tiles below to select members. One shader scene per group; shared members follow your last action.",
      ),
    );
    const count = el(
      "p",
      "console-selection-count",
      "0 selected · one shader slot",
    );
    count.id = "group-selection-count";
    body.append(count);
    const actions = el("div", "console-actions");
    actions.append(
      button("Cancel", null, () => this.endSelection(), "console-action"),
      button(
        "Save group",
        "save",
        () => {
          try {
            const g = createGroup(this.state, name.value, [...this.selection]);
            this.endSelection();
            this.setCategory("Groups");
            this.changed("structure");
            this.openInspector(g.id);
            this.note("Group saved. Tap its tile to enable the members.");
          } catch (e) {
            this.note(e.message, true);
          }
        },
        "console-action primary-action",
      ),
    );
    body.append(actions);
  }
  reference(id) {
    return (
      this.groups.find((g) => g.id === id) || targetState(this.getModel(), id)
    );
  }
  slider(body, label, id, get, set, meta = null) {
    const scale = meta?.max || 1,
      format = (v) => (meta ? formatParam(meta, v) : Math.round(v * 100) + "%");
    const wrap = el("label", "console-param"),
      caption = el("span", "console-param-caption", label),
      out = el("output", null, format(get())),
      input = el("input");
    input.type = "range";
    input.min = 0;
    input.max = scale;
    input.step = scale === 360 ? 1 : 0.01;
    input.value = get() * scale;
    input.id = id;
    input.setAttribute("aria-label", label);
    caption.append(out);
    input.addEventListener("input", () => {
      set(Number(input.value) / scale);
      out.textContent = format(Number(input.value) / scale);
      this.changed();
    });
    wrap.append(caption, input);
    body.append(wrap);
    this.syncFields.push({ input, out, get, scale, format });
    return input;
  }
  openInspector(id, target = true) {
    if (this.selecting) this.endSelection();
    const d = CATALOG_BY_ID.get(id),
      g = this.groups.find((g) => g.id === id);
    if (!d && !g) return;
    if (d?.kind === "shader" && this.getModel().shader.scene !== d.scene) {
      if (!target) {
        this.closePanel();
        return;
      }
      this.setShader({ ...this.getModel().shader, scene: d.scene });
    }
    const effect = this.reference(id);
    if (!effect) return;
    this.inspectorId = id;
    this.inspectedRef = effect;
    this.panelMode = "inspector";
    const body = this.panelStart(
        g ? g.name : d.name,
        g ? "PERFORMANCE GROUP" : d.category.toUpperCase(),
      ),
      params = effect.params || d.params;
    this.headerGauge=valueGauge(g?'Macro':'Intensity');
    this.headerGauge.update(g?g.values[0]:effect.intensity);
    this.panel.querySelector('header').insertBefore(this.headerGauge.node,$('close-performance-panel'));
    if (target) {
      this.cancelPicture();
      this.onTarget(g ? g.id : d.kind === "shader" ? "shader" : id);
    }
    if (g) {
      const name = el("input");
      name.value = g.name;
      name.maxLength = 32;
      name.setAttribute("aria-label", "Group name");
      name.addEventListener("change", () => {
        g.name = name.value.trim().slice(0, 32) || g.name;
        name.value = g.name;
        $("performance-panel-title").textContent = g.name;
        this.changed();
      });
      const setup = el("details", "console-details");
      setup.append(
        el("summary", null, "Group / order / name"),
        field("Name", name),
      );
      this.groupSetup = setup;
      const line = el("div", "group-tools"),
        index = this.groups.indexOf(g);
      const left = button("Move group earlier", "left", () => {
        this.engine.moveGroup(g.id, -1);
        this.renderRail();
        this.changed("structure");
        this.openInspector(g.id, false);
      });
      left.id = "group-earlier";
      left.disabled = index === 0;
      const right = button("Move group later", "right", () => {
        this.engine.moveGroup(g.id, 1);
        this.renderRail();
        this.changed("structure");
        this.openInspector(g.id, false);
      });
      right.id = "group-later";
      right.disabled = index === this.groups.length - 1;
      const del = button("Delete group; keep member effects", "trash", () => {
        this.cancelPicture();
        this.engine.removeGroup(g.id);
        this.closePanel();
        this.renderRail();
        this.changed("structure");
        this.note("Group deleted. Member effects are unchanged.");
      });
      del.id = "delete-group";
      line.append(
        el("span", "console-help", g.members.length + " linked layers"),
        left,
        right,
        del,
      );
      setup.append(line);
    }
    this.slider(
      body,
      g ? "Macro" : "Intensity",
      g ? "group-macro" : "console-intensity",
      () => (g ? g.values[0] : effect.intensity),
      (v) => {
        if (g) g.values[0] = v;
        else effect.intensity = v;
      },
    );
    const pad = el("div", "xy-pad console-xy", "XY / touch or arrow keys");
    pad.tabIndex = 0;
    pad.id = "console-xy";
    pad.setAttribute("role", "group");
    pad.setAttribute(
      "aria-label",
      (g ? g.name : d.name) + " XY performance pad",
    );
    bindXY(pad, effect, () => {
      this.changed();
    });
    body.append(pad);
    params.forEach((p, i) => {
      if (g && i === 0) return;
      this.slider(
        body,
        p.name,
        "console-param-" + i,
        () => effect.values[i],
        (v) => (effect.values[i] = v),
        d?.kind === "fx" ? p : null,
      );
    });
    if (effect.id === "smear" || effect.id === "trails") {
      const hold = button(
        effect.hold ? "Release memory" : "Hold memory",
        null,
        () => {
          effect.hold = !effect.hold;
          hold.textContent = effect.hold ? "Release memory" : "Hold memory";
          this.changed();
        },
        "console-action",
      );
      body.append(hold);
    }
    if (g) {
      this.slider(
        body,
        "Influence",
        "group-influence",
        () => g.intensity,
        (v) => {
          g.intensity = v;
        },
      );
      body.append(this.groupSetup);
    }
    const mappings = el("details", "console-details");
    mappings.append(el("summary", null, "Touch / picture mapping"));
    const grid = el("div", "console-two-columns");
    for (const [key, label] of [
      ["x", "Finger 1 X"],
      ["y", "Finger 1 Y"],
      ["x2", "Finger 2 X"],
      ["y2", "Finger 2 Y"],
      ["pinch", "Pinch"],
      ["twist", "Twist"],
    ]) {
      const s = select(
        [
          [-2, "Unassigned"],
          [-1, g ? "Influence" : "Intensity"],
          ...params.map((p, i) => [i, p.name]),
        ],
        effect.touch[key],
        (v) => {
          effect.touch[key] = Number(v);
          this.changed();
        },
        label,
      );
      s.id = "console-touch-" + key;
      grid.append(field(label, s));
    }
    mappings.append(grid);
    const spring = el("input");
    spring.type = "checkbox";
    spring.checked = effect.touch.spring;
    spring.id = "console-touch-spring";
    spring.addEventListener("change", () => {
      effect.touch.spring = spring.checked;
      this.changed();
    });
    const springLabel = el("label", "toggle-line");
    springLabel.append(
      spring,
      document.createTextNode("Spring back on release"),
    );
    mappings.append(springLabel);
    body.append(mappings);
    if (g || effect.id === "hue") {
      const prefix = g ? "group" : "hue",
        mods = el("details", "console-details");
      mods.id = prefix + "-modulations";
      mods.append(
        el(
          "summary",
          null,
          g ? "Macro / XY modulation" : "Hue · LFO / audio / BPM",
        ),
      );
      params.forEach((p, i) => {
        const mod = effect.modulations[i],
          section = el("div", "group-modulation");
        const source = select(
          SOURCES,
          mod.source,
          (v) => {
            mod.source = v;
            this.changed();
          },
          p.name + " source",
        );
        source.id = prefix + "-mod-" + i;
        section.append(field(p.name + " source", source));
        this.slider(
          section,
          "Amount",
          prefix + "-mod-amount-" + i,
          () => mod.amount,
          (v) => (mod.amount = v),
        );
        this.slider(
          section,
          "LFO / BPM rate",
          prefix + "-mod-rate-" + i,
          () => mod.rate,
          (v) => (mod.rate = v),
        );
        mods.append(section);
      });
      body.append(mods);
      if (g) {
        this.routesUI(body, g);
        body.append(
          el(
            "p",
            "console-help",
            "Group mappings are render-only; member sliders keep their base values. Shared routes follow group order. One shader scene at a time.",
          ),
        );
      }
    } else if (d.kind === "shader") {
      body.append(
        button(
          "Open Shader studio",
          null,
          () => {
            this.onStudio("shader");
            this.closePanel();
          },
          "console-action",
        ),
      );
    }
    if (id === "beat" || g?.members.includes("beat"))
      body.append(
        el(
          "p",
          "console-warning",
          "Flashing light warning · Pulse gate is opt-in.",
        ),
      );
    this.sync(true);
  }
  paramOptions(target) {
    const d = CATALOG_BY_ID.get(target);
    if (!d) return [];
    const p =
      d.kind === "shader"
        ? normalizeShaderState({ ...this.getModel().shader, scene: d.scene })
            .params
        : d.params;
    return [
      [-1, "Intensity"],
      ...p.map((v, i) => [d.kind === "shader" ? v.uniform : i, v.name]),
    ];
  }
  routesUI(body, g) {
    const details = el("details", "console-details");
    details.id = "group-routes";
    details.append(
      el("summary", null, "Parameter routes · " + g.routes.length),
    );
    for (const [i, r] of g.routes.entries()) {
      const row = el("div", "route-row");
      row.dataset.target = r.target;
      row.dataset.param = r.param;
      row.append(
        el("p", "route-target", CATALOG_BY_ID.get(r.target)?.name || r.target),
      );
      const param = select(
        this.paramOptions(r.target),
        r.param,
        (v) => {
          const value =
            v === "-1"
              ? -1
              : CATALOG_BY_ID.get(r.target).kind === "fx"
                ? Number(v)
                : v;
          if (
            g.routes.some(
              (other) =>
                other !== r &&
                other.target === r.target &&
                other.param === value,
            )
          ) {
            param.value = r.param;
            this.note("That parameter already has a route.", true);
            return;
          }
          r.param = value;
          row.dataset.param = value;
          this.changed();
        },
        "Member parameter",
      );
      row.append(param);
      const controls = el("div", "route-controls");
      controls.append(
        field(
          "From",
          select(
            [
              ["macro", "Macro"],
              ["x", "Axis X"],
              ["y", "Axis Y"],
            ],
            r.source,
            (v) => {
              r.source = v;
              this.changed();
            },
            "Route source",
          ),
        ),
      );
      for (const key of ["min", "max"]) {
        const input = el("input");
        input.type = "number";
        input.min = 0;
        input.max = 100;
        input.step = 1;
        input.value = Math.round(r[key] * 100);
        input.className = "route-" + key;
        input.setAttribute(
          "aria-label",
          key === "min" ? "Minimum percent" : "Maximum percent",
        );
        input.addEventListener("change", () => {
          let v = Math.max(0, Math.min(100, Number(input.value) || 0)) / 100;
          if (key === "min") v = Math.min(v, r.max);
          else v = Math.max(v, r.min);
          r[key] = v;
          input.value = Math.round(v * 100);
          this.changed();
        });
        controls.append(field(key === "min" ? "Min %" : "Max %", input));
      }
      const invert = el("input");
      invert.type = "checkbox";
      invert.checked = r.invert;
      invert.className = "route-invert";
      invert.addEventListener("change", () => {
        r.invert = invert.checked;
        this.changed();
      });
      controls.append(field("Invert", invert));
      const remove = button("Remove route " + (i + 1), "close", () => {
        g.routes.splice(i, 1);
        this.changed();
        this.openInspector(g.id, false);
      });
      controls.append(remove);
      row.append(controls);
      details.append(row);
    }
    const add = el("div", "route-add"),
      target = select(
        g.members.map((id) => [id, CATALOG_BY_ID.get(id).name]),
        g.members[0],
        () => update(),
        "New route member",
      ),
      params = select([], 0, () => {}, "New route parameter");
    function update() {
      params.replaceChildren();
      for (const [v, n] of this.paramOptions(target.value)) {
        const o = el("option", null, n);
        o.value = v;
        params.append(o);
      }
    }
    update = update.bind(this);
    update();
    target.id = "new-route-target";
    params.id = "new-route-param";
    add.append(
      field("Member", target),
      field("Parameter", params),
      button(
        "Add route",
        null,
        () => {
          if (g.routes.length >= MAX_GROUP_ROUTES) {
            this.note(MAX_GROUP_ROUTES + " routes per group reached.", true);
            return;
          }
          const d = CATALOG_BY_ID.get(target.value),
            param =
              params.value === "-1"
                ? -1
                : d.kind === "fx"
                  ? Number(params.value)
                  : params.value;
          if (
            g.routes.some((r) => r.target === target.value && r.param === param)
          ) {
            this.note("That parameter already has a route.", true);
            return;
          }
          g.routes.push(
            normalizeRoute(
              { target: target.value, param, source: "macro", min: 0, max: 1 },
              g.members,
            ),
          );
          this.changed();
          this.openInspector(g.id, false);
        },
        "console-action",
      ),
    );
    details.append(add);
    body.append(details);
  }
  storeScene(i) {
    this.cancelGesture();
    this.state.scenes[i] = captureScene(this.getModel(), this.groups);
    this.activeScene = i;
    this.schedule();
    this.sync(true);
    this.note(
      "Scene " + String.fromCharCode(65 + i) + " stored on this device.",
    );
  }
  recallScene(i) {
    this.cancelGesture();
    this.cancelPicture();
    const scene = this.state.scenes[i];
    if (!scene) return;
    this.setShader(
      this.engine.recall(scene, this.getModel(), performance.now()),
    );
    this.activeScene = i;
    this.onChange("scene");
    this.schedule();
    this.sync(true);
    this.note(
      "Scene " +
        String.fromCharCode(65 + i) +
        (this.state.crossfade
          ? " · " + this.state.crossfade + "s wet crossfade."
          : " recalled."),
    );
  }
  openSettings() {
    this.inspectorId = null;
    this.panelMode = "settings";
    const body = this.panelStart("Scene transitions", "CONSOLE SETTINGS"),
      input = el("input");
    input.type = "number";
    input.min = 0;
    input.max = 10;
    input.step = 0.1;
    input.value = this.state.crossfade;
    input.id = "scene-crossfade";
    input.addEventListener("change", () => {
      this.state.crossfade = Math.max(
        0,
        Math.min(10, Number(input.value) || 0),
      );
      input.value = this.state.crossfade;
      this.changed("settings");
    });
    body.append(
      field("Crossfade · seconds (0–10)", input),
      el(
        "p",
        "console-help",
        "Crossfades ramp layer intensity, not two complete video renders. Different shader scenes fade through the source. Tap A–D to recall; hold or Shift-click to overwrite.",
      ),
      el(
        "p",
        "console-help",
        "Tile: tap toggles · hold opens parameters. In momentary mode, hold applies and release restores. Tune buttons always open parameters. Arrow keys move through tiles; Shift-Enter tunes. Group macros accept LFO, audio bands, onset and BPM.",
      ),
      el(
        "p",
        "console-help",
        "Static original thumbnails keep your GPU available for the video. Camera frames are never used in tile previews.",
      ),
    );
  }
  getPresetState() {
    return normalizeConsoleState(this.state);
  }
  getStats() {
    return {
      ...thumbnailStats,
      tiles: this.tiles.size,
      groups: this.groups.length,
    };
  }
}
