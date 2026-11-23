// One pending frame per player. The player supplies eligibility, resets its own
// clock when suspended, and returns true only while another frame is needed.
export function createFrameLoop(draw, { window: win = globalThis, eligible = () => true } = {}) {
  let pending = null, revision = 0, disposed = false;
  function request() {
    if (disposed || pending !== null || !eligible()) return;
    const current = revision;
    pending = win.requestAnimationFrame(now => {
      if (disposed || current !== revision) return;
      pending = null;
      // Deliver an already requested frame so the player's existing visibility
      // guard can clear its clock or surface before deciding whether to continue.
      const again = draw(now);
      if (again === true && current === revision) request();
    });
  }
  function cancel() {
    revision++;
    if (pending !== null) win.cancelAnimationFrame(pending);
    pending = null;
  }
  return { request, cancel, dispose() { disposed = true; cancel(); } };
}
