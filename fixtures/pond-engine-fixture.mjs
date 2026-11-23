// A stand-in engine for testing Base's pond host. It honours the engine
// contract and draws one filled square, so the host's lifecycle can be seen.
export function createPond({ canvas, appearance }) {
  const ctx = canvas.getContext('2d');
  let width = 1, height = 1, time = 0;
  window.__engine = { steps: 0, renders: 0, pointer: null, drops: 0, scatters: 0, nudges: 0, theme: 'light', pace: appearance.pace };
  const state = window.__engine;
  return {
    resize(_cssWidth, _cssHeight, deviceWidth, deviceHeight) { width = canvas.width = deviceWidth; height = canvas.height = deviceHeight; },
    setTheme(value) { state.theme = value; },
    setPace(value) { state.pace = value; },
    step(dt) { state.steps++; time += dt; },
    render() {
      state.renders++;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = appearance.accent;
      const size = height / 2;
      ctx.fillRect((width - size) / 2 + Math.sin(time) * size / 4, (height - size) / 2, size, size);
    },
    setPointer(x, y) { state.pointer = [x, y]; },
    clearPointer() { state.pointer = null; },
    drop() { state.drops++; },
    scatter() { state.scatters++; },
    nudge() { state.nudges++; },
  };
}
