// input.js — smooth finger tracking + keyboard + controller friendly
(function(){
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  class Input {
    constructor(canvas){
      this.canvas = canvas;

      // "Drag finger to walk" state
      this.active = false;
      this.pointerId = null;
      this.anchor = { x: 0, y: 0 };  // where finger started
      this.pos    = { x: 0, y: 0 };  // current finger position

      // Output movement vector (smoothed)
      this.move = { x: 0, y: 0 };
      this.smooth = { x: 0, y: 0 };

      // Keyboard fallback
      this.keys = new Set();

      this._bind();
    }

    _rect(){ return this.canvas.getBoundingClientRect(); }

    _toLocal(clientX, clientY){
      const r = this._rect();
      return { x: clientX - r.left, y: clientY - r.top };
    }

    _bind(){
      // Important: stop browser from hijacking touch
      this.canvas.style.touchAction = "none";

      this.canvas.addEventListener("pointerdown", (e) => {
        // ignore right click / secondary
        if (e.button !== undefined && e.button !== 0) return;

        this.active = true;
        this.pointerId = e.pointerId;
        this.canvas.setPointerCapture(e.pointerId);

        const p = this._toLocal(e.clientX, e.clientY);
        this.anchor.x = p.x; this.anchor.y = p.y;
        this.pos.x = p.x; this.pos.y = p.y;
      });

      this.canvas.addEventListener("pointermove", (e) => {
        if (!this.active || e.pointerId !== this.pointerId) return;
        const p = this._toLocal(e.clientX, e.clientY);
        this.pos.x = p.x; this.pos.y = p.y;
      });

      const end = (e) => {
        if (!this.active || e.pointerId !== this.pointerId) return;
        this.active = false;
        this.pointerId = null;
      };

      this.canvas.addEventListener("pointerup", end);
      this.canvas.addEventListener("pointercancel", end);
      this.canvas.addEventListener("pointerleave", end);

      window.addEventListener("keydown", (e) => this.keys.add(e.key));
      window.addEventListener("keyup", (e) => this.keys.delete(e.key));
    }

    // call every frame
    update(dt){
      // Base vector from finger drag
      let mx = 0, my = 0;

      if (this.active){
        const dx = this.pos.x - this.anchor.x;
        const dy = this.pos.y - this.anchor.y;

        // Bigger radius = less twitchy, more "fluid"
        const radius = 120; // Pixel-friendly
        mx = clamp(dx / radius, -1, 1);
        my = clamp(dy / radius, -1, 1);
      }

      // Keyboard adds on top (for testing)
      const k = this.keys;
      if (k.has("ArrowLeft") || k.has("a")) mx -= 1;
      if (k.has("ArrowRight")|| k.has("d")) mx += 1;
      if (k.has("ArrowUp")   || k.has("w")) my -= 1;
      if (k.has("ArrowDown") || k.has("s")) my += 1;

      // Normalize
      const len = Math.hypot(mx, my);
      if (len > 1e-6){ mx /= len; my /= len; }

      // Smooth movement so it feels like “glide” not “jank”
      const smoothing = 16; // higher = snappier, lower = floatier
      const t = 1 - Math.exp(-smoothing * dt);
      this.smooth.x += (mx - this.smooth.x) * t;
      this.smooth.y += (my - this.smooth.y) * t;

      this.move.x = this.smooth.x;
      this.move.y = this.smooth.y;
    }
  }

  window.KDInput = Input;
})();
