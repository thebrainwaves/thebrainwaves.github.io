const signatureOf = (data) =>
  JSON.stringify(data, (_, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
// Session-only graph history. Still canvases are retained by reference, never serialized.
const clone = (s) => ({ ...s, data: structuredClone(s.data) });
export class EditHistory {
  constructor() {
    this.entries = [];
    this.cursor = -1;
  }
  reset(state) {
    this.entries = [
      {
        state: clone(state),
        signature: signatureOf(state.data),
        key: null,
        time: 0,
      },
    ];
    this.cursor = 0;
  }
  get canUndo() {
    return this.cursor > 0;
  }
  get canRedo() {
    return this.cursor < this.entries.length - 1;
  }
  peek(delta = 0) {
    const e = this.entries[this.cursor + delta];
    return e ? clone(e.state) : null;
  }
  move(delta) {
    if (!Number.isInteger(delta) || !this.entries[this.cursor + delta])
      return null;
    this.cursor += delta;
    return this.peek();
  }
  record(state, { key = null, time = performance.now() } = {}) {
    if (this.cursor < 0) {
      this.reset(state);
      return false;
    }
    const signature = signatureOf(state.data),
      current = this.entries[this.cursor];
    if (
      signature === current.signature &&
      state.source === current.state.source &&
      state.sourceKind === current.state.sourceKind &&
      state.label === current.state.label
    )
      return false;
    const branched = this.canRedo;
    this.entries.length = this.cursor + 1;
    const entry = { state: clone(state), signature, key, time };
    if (
      !branched &&
      this.cursor > 0 &&
      key &&
      key === current.key &&
      time >= current.time &&
      time - current.time < 450
    )
      this.entries[this.cursor] = entry;
    else {
      this.entries.push(entry);
      this.cursor++;
    }
    const photoCount = () =>
      new Set(
        this.entries
          .filter((e) => e.state.sourceKind === "image")
          .map((e) => e.state.source),
      ).size;
    while (this.entries.length > 32 || photoCount() > 4) {
      this.entries.shift();
      this.cursor--;
    }
    return true;
  }
}
