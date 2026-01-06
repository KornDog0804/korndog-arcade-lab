// input.js — smooth finger tracking + keyboard + gamepad
// Drop-in: creates Input class with .move {x,y} in range [-1..1]
// Smoothing runs internally so game.js can just read input.move.

(function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const len = (x, y) => Math.hypot(x, y);
  const norm = (x, y) => {
    const l = Math.hypot(x, y) || 1;
    return { x: x / l, y: y / l };
  };

  class Input {
    constructor(canvas) {
      this.canvas = canvas;

      // Output vector (what the game reads)
      this.move = { x: 0, y: 0 };

      // Target vector (what input wants)
      this.target = { x: 0, y: 0 };

      // Pointer drag state
      this.active = false;
      this.pointerId = null;
      this.anchor = { x: 0, y: 0 }; // where touch started
      this.pos = { x: 0, y: 0 }; // current touch
      this.maxRadius = 80; // pixels; how far to drag for full speed

      // Smoothing / feel
      this.deadzone = 0.12;       // 0..1
      this.response = 18;         // higher = snappier
      this.friction = 22;         // higher = stops faster

      // Keyboard
      this.keys = new Set();

      // Gamepad
      this.gamepadIndex = null;
      this.padDeadzone = 0.18;

      this._bind();
      this._tick(); // internal smoothing loop
    }

    // Convert screen coords to canvas coords (handles CSS scaling)
    _toCanvasXY(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect();
      const sx = this.canvas.width / r.width;
      const sy = this.canvas.height / r.height;
      return {
        x: (clientX - r.left) * sx,
        y: (clientY - r.top) * sy,
      };
    }

    _bind() {
      // Prevent browser gestures from stealing input
      // (also add CSS touch-action:none on the canvas; see below)
      this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

      // Pointer events (touch + mouse unified)
      this.canvas.addEventListener("pointerdown", (e) => {
        // Only left click / primary touch
        if (e.button !== undefined && e.button !== 0) return;

        this.active = true;
        this.pointerId = e.pointerId;
        try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}

        const p = this._toCanvasXY(e.clientX, e.clientY);
        this.anchor.x = p.x;
        this.anchor.y = p.y;
        this.pos.x = p.x;
        this.pos.y = p.y;

        // start from zero; player accelerates as you drag
        this.target.x = 0;
        this.target.y = 0;
      }, { passive: false });

      this.canvas.addEventListener("pointermove", (e) => {
        if (!this.active || e.pointerId !== this.pointerId) return;

        const p = this._toCanvasXY(e.clientX, e.clientY);
        this.pos.x = p.x;
        this.pos.y = p.y;

        const dx = this.pos.x - this.anchor.x;
        const dy = this.pos.y - this.anchor.y;

        // map drag distance to [-1..1]
        const dist = len(dx, dy);
        if (dist < 1) {
          this.target.x = 0;
          this.target.y = 0;
          return;
        }

        const capped = Math.min(dist, this.maxRadius);
        const n = norm(dx, dy);
        const mag = capped / this.maxRadius; // 0..1

        // deadzone on magnitude
        const dz = this.deadzone;
        const mag2 = mag <= dz ? 0 : (mag - dz) / (1 - dz);

        this.target.x = n.x * mag2;
        this.target.y = n.y * mag2;

        e.preventDefault();
      }, { passive: false });

      const endPointer = (e) => {
        if (!this.active) return;
        if (e.pointerId !== this.pointerId) return;

        this.active = false;
        this.pointerId = null;
        this.target.x = 0;
        this.target.y = 0;
        try { this.canvas.releasePointerCapture(e.pointerId); } catch (_) {}
      };

      this.canvas.addEventListener("pointerup", endPointer, { passive: true });
      this.canvas.addEventListener("pointercancel", endPointer, { passive: true });
      this.canvas.addEventListener("pointerleave", endPointer, { passive: true });

      // Keyboard
      window.addEventListener("keydown", (e) => {
        const k = e.key.toLowerCase();
        if (["arrowup","arrowdown","arrowleft","arrowright","w","a","s","d"].includes(k)) {
          this.keys.add(k);
          e.preventDefault();
        }
      }, { passive: false });

      window.addEventListener("keyup", (e) => {
        const k = e.key.toLowerCase();
        this.keys.delete(k);
      });

      // Gamepad connect
      window.addEventListener("gamepadconnected", (e) => {
        this.gamepadIndex = e.gamepad.index;
      });
      window.addEventListener("gamepaddisconnected", (e) => {
        if (this.gamepadIndex === e.gamepad.index) this.gamepadIndex = null;
      });
    }

    _keyboardVector() {
      let x = 0, y = 0;
      if (this.keys.has("arrowleft") || this.keys.has("a")) x -= 1;
      if (this.keys.has("arrowright") || this.keys.has("d")) x += 1;
      if (this.keys.has("arrowup") || this.keys.has("w")) y -= 1;
      if (this.keys.has("arrowdown") || this.keys.has("s")) y += 1;

      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const n = norm(x, y);
      return { x: n.x, y: n.y };
    }

    _gamepadVector() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = this.gamepadIndex != null ? pads[this.gamepadIndex] : (pads && pads[0]);
      if (!gp) return { x: 0, y: 0 };

      // Left stick
      let x = gp.axes?.[0] ?? 0;
      let y = gp.axes?.[1] ?? 0;

      const d = this.padDeadzone;
      const m = len(x, y);
      if (m <= d) return { x: 0, y: 0 };

      const n = norm(x, y);
      const mag2 = (m - d) / (1 - d);
      return { x: n.x * mag2, y: n.y * mag2 };
    }

    // Internal smoothing loop — so game.js doesn’t have to call update()
    _tick() {
      let last = performance.now();

      const step = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        // Priority: touch drag > gamepad > keyboard
        let v = { x: 0, y: 0 };

        if (this.active) {
          v.x = this.target.x;
          v.y = this.target.y;
        } else {
          const gp = this._gamepadVector();
          if (gp.x || gp.y) v = gp;
          else v = this._keyboardVector();
        }

        // Smooth: move -> v
        // response pulls toward desired, friction pulls toward 0
        const rx = this.response;
        const fr = this.friction;

        // If player input present, accelerate toward it.
        // If no input, decelerate to 0.
        const hasInput = Math.abs(v.x) + Math.abs(v.y) > 0.001;

        if (hasInput) {
          this.move.x += (v.x - this.move.x) * (1 - Math.exp(-rx * dt));
          this.move.y += (v.y - this.move.y) * (1 - Math.exp(-rx * dt));
        } else {
          this.move.x += (0 - this.move.x) * (1 - Math.exp(-fr * dt));
          this.move.y += (0 - this.move.y) * (1 - Math.exp(-fr * dt));
        }

        // Clamp final
        this.move.x = clamp(this.move.x, -1, 1);
        this.move.y = clamp(this.move.y, -1, 1);

        requestAnimationFrame(step);
      };

      requestAnimationFrame(step);
    }
  }

  // Expose globally
  window.Input = Input;
})();
