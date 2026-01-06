// debug.js - shows JS errors on-screen (mobile-friendly)
(function () {
  const toast = () => document.getElementById("toast") || document.body;

  function show(msg) {
    const el = toast();
    if (!el) return;
    el.style.pointerEvents = "none";
    el.style.position = el.id === "toast" ? el.style.position : "fixed";
    el.style.left = "12px";
    el.style.right = "12px";
    el.style.bottom = "110px";
    el.style.zIndex = "9999";
    el.style.padding = "10px 12px";
    el.style.borderRadius = "14px";
    el.style.background = "rgba(160,0,0,0.75)";
    el.style.border = "1px solid rgba(255,255,255,0.2)";
    el.style.color = "#fff";
    el.style.fontFamily = "monospace";
    el.style.fontSize = "12px";
    el.textContent = msg;
  }

  window.addEventListener("error", (e) => {
    show("JS ERROR: " + (e.message || "unknown") + (e.filename ? " @ " + e.filename : ""));
  });

  window.addEventListener("unhandledrejection", (e) => {
    show("PROMISE ERROR: " + (e.reason?.message || e.reason || "unknown"));
  });
})();
