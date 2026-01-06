// boot.js — mobile-safe boot (does NOT kill movement)

window.addEventListener("load", () => {
  const canvas = document.getElementById("game");
  if (!canvas) return;

  // Make sure the browser doesn't pan/zoom when you drag on the canvas
  canvas.style.touchAction = "none";
  canvas.style.webkitUserSelect = "none";
  canvas.style.userSelect = "none";
  window.input = new Input(canvas);
  // Prevent page scroll ONLY when dragging on the canvas
  const stop = (e) => e.preventDefault();

  canvas.addEventListener("touchstart", stop, { passive: false });
  canvas.addEventListener("touchmove", stop, { passive: false });
  canvas.addEventListener("touchend", stop, { passive: false });

  // OPTIONAL: also prevent “rubber band” scroll bounce on the page
  document.documentElement.style.overscrollBehavior = "none";
  document.body.style.overscrollBehavior = "none";
});
