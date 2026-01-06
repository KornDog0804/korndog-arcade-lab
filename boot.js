function resizeCanvasToWrap() {
  const canvas = document.getElementById("game");
  const wrap = document.querySelector(".wrap");
  if (!canvas || !wrap) return;

  const rect = wrap.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap for performance

  canvas.width  = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
}

window.addEventListener("resize", resizeCanvasToWrap);
window.addEventListener("orientationchange", resizeCanvasToWrap);
resizeCanvasToWrap();
/ boot.js — tiny “config loader” (no changes to game.js needed)

// Change these anytime without touching game.js
window.KD_CONFIG_URL = window.KD_CONFIG_URL || "game.config.json";
window.KD_MAP_URL = window.KD_MAP_URL || "map.shop1.json";

// Optional: quick switches you can edit later
// window.KD_MAP_URL = "map.zelda.json";
// window.KD_MAP_URL = "map.shop2.json";
