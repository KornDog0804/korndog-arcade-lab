// sim.js — gameplay loop: pick records -> stock shelves -> customers shop -> checkout
(function(){
  const rand = (a,b)=>a+Math.random()*(b-a);
  const dist = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

  function rectContains(r, p){
    return p.x>=r.x && p.x<=r.x+r.w && p.y>=r.y && p.y<=r.y+r.h;
  }

  class Sim {
    constructor(canvas){
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");

      // World scale (pixel-retro vibe)
      this.scale = 2; // render scale
      this.world = { w: 360, h: 200 };

      // Resize canvas to internal resolution (keeps crisp look)
      this._resize();

      // Input
      this.input = new window.KDInput(canvas);

      // Player
      this.player = { x: 160, y: 130, r: 6, carry: 0, carryMax: 6 };

      // Objects
      this.crate   = { x: 40,  y: 110, w: 46, h: 46, stock: 30 };
      this.shelves = [
        { x: 120, y: 38,  w: 70, h: 20, stock: 0, cap: 30, label:"Shelf A" },
        { x: 205, y: 38,  w: 70, h: 20, stock: 0, cap: 30, label:"Shelf B" },
        { x: 290, y: 38,  w: 70, h: 20, stock: 0, cap: 30, label:"Shelf C" },
      ];
      this.register = { x: 300, y: 98, w: 44, h: 28 };

      // Customers
      this.customers = [];
      this.queue = [];
      this.spawnTimer = 0;

      // Progress
      this.goal = 10;
      this.sold = 0;
      this.cash = 0;

      // Walls / collision blocks so you DON'T clip into shelves/register
      this.blocks = [
        // Outer walls
        { x: 10, y: 10, w: 340, h: 10 },
        { x: 10, y: 180, w: 340, h: 10 },
        { x: 10, y: 10, w: 10, h: 180 },
        { x: 340, y: 10, w: 10, h: 180 },

        // Counter area (purple)
        { x: 80, y: 100, w: 210, h: 60 },

        // Shelves are solid
        { x: 110, y: 32, w: 260, h: 30 },

        // Register is solid block too (top of it)
        { x: 295, y: 90, w: 55, h: 40 }
      ];
    }

    _resize(){
      // Internal res
      this.canvas.width  = this.world.w * this.scale;
      this.canvas.height = this.world.h * this.scale;
      this.ctx.imageSmoothingEnabled = false;
    }

    // Simple circle vs rect collision resolve
    _pushOutCircleRect(c, r){
      // Find closest point on rect
      const cx = Math.max(r.x, Math.min(c.x, r.x+r.w));
      const cy = Math.max(r.y, Math.min(c.y, r.y+r.h));
      const dx = c.x - cx;
      const dy = c.y - cy;
      const d2 = dx*dx + dy*dy;
      const rr = c.r;
      if (d2 >= rr*rr || d2 === 0) return;

      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const push = rr - d;
      c.x += nx * push;
      c.y += ny * push;
    }

    update(dt){
      this.input.update(dt);

      // Move player
      const speed = 90; // px/sec in world units
      this.player.x += this.input.move.x * speed * dt;
      this.player.y += this.input.move.y * speed * dt;

      // Clamp inside world
      this.player.x = Math.max(0, Math.min(this.world.w, this.player.x));
      this.player.y = Math.max(0, Math.min(this.world.h, this.player.y));

      // Collision blocks (prevents hiding in shelves)
      for (const b of this.blocks){
        this._pushOutCircleRect(this.player, b);
      }

      // Auto-interactions (the “idle game” feel)
      this._autoPickup();
      this._autoStock();
      this._autoCheckout();

      // Spawn customers
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.customers.length < 6){
        this.spawnTimer = rand(1.5, 3.5);
        this._spawnCustomer();
      }

      // Update customers AI
      this._updateCustomers(dt);
    }

    _nearRect(r, pad=14){
      const p = this.player;
      const cx = Math.max(r.x, Math.min(p.x, r.x+r.w));
      const cy = Math.max(r.y, Math.min(p.y, r.y+r.h));
      return Math.hypot(p.x-cx, p.y-cy) < pad;
    }

    _autoPickup(){
      if (this.player.carry >= this.player.carryMax) return;
      if (this.crate.stock <= 0) return;
      if (!this._nearRect(this.crate, 18)) return;

      // Pick up 1 per tick-ish
      this.player.carry += 1;
      this.crate.stock -= 1;
    }

    _autoStock(){
      if (this.player.carry <= 0) return;

      // find shelf near player with room
      for (const s of this.shelves){
        if (s.stock >= s.cap) continue;
        if (!this._nearRect(s, 18)) continue;

        s.stock += 1;
        this.player.carry -= 1;
        break;
      }
    }

    _spawnCustomer(){
      // spawn at "entrance"
      const c = {
        x: 30, y: 60,
        r: 6,
        state: "toShelf",
        targetShelf: this.shelves[Math.floor(Math.random()*this.shelves.length)],
        hasRecord: false,
        speed: rand(38, 52)
      };
      this.customers.push(c);
    }

    _moveToward(c, tx, ty, dt){
      const dx = tx - c.x;
      const dy = ty - c.y;
      const d = Math.hypot(dx, dy);
      if (d < 1) return true;
      const nx = dx / d;
      const ny = dy / d;
      c.x += nx * c.speed * dt;
      c.y += ny * c.speed * dt;

      // Keep customers out of walls too
      for (const b of this.blocks){
        this._pushOutCircleRect(c, b);
      }
      return false;
    }

    _updateCustomers(dt){
      // Queue positions
      const qBase = { x: 305, y: 140 };
      const qGap = 14;

      for (const c of this.customers){
        if (c.state === "toShelf"){
          const s = c.targetShelf;
          const arrived = this._moveToward(c, s.x + s.w/2, s.y + s.h + 16, dt);
          if (arrived){
            c.state = "getRecord";
          }
        } else if (c.state === "getRecord"){
          const s = c.targetShelf;
          if (s.stock > 0){
            s.stock -= 1;
            c.hasRecord = true;
            c.state = "toQueue";
            // Add to queue list
            if (!this.queue.includes(c)) this.queue.push(c);
          } else {
            // shelf empty -> wander for a sec then try again
            c.speed = rand(30, 45);
            c.x += rand(-5, 5);
            c.y += rand(2, 6);
          }
        } else if (c.state === "toQueue"){
          const idx = this.queue.indexOf(c);
          const tx = qBase.x;
          const ty = qBase.y + idx * qGap;
          this._moveToward(c, tx, ty, dt);
          c.state = "waiting";
        } else if (c.state === "waiting"){
          // keep them snapped in line
          const idx = this.queue.indexOf(c);
          if (idx === -1) continue;
          const tx = qBase.x;
          const ty = qBase.y + idx * qGap;
          this._moveToward(c, tx, ty, dt);

          // front of line goes to register spot
          if (idx === 0){
            c.state = "atRegister";
          }
        } else if (c.state === "atRegister"){
          this._moveToward(c, this.register.x + this.register.w/2, this.register.y + this.register.h + 18, dt);
        } else if (c.state === "leaving"){
          const left = this._moveToward(c, 20, 20, dt);
          if (left){
            // remove
            const qi = this.queue.indexOf(c);
            if (qi >= 0) this.queue.splice(qi,1);
            const i = this.customers.indexOf(c);
            if (i >= 0) this.customers.splice(i,1);
          }
        }
      }

      // Keep queue compact
      this.queue = this.queue.filter(c => this.customers.includes(c));
    }

    _autoCheckout(){
      if (!this._nearRect(this.register, 22)) return;
      if (this.queue.length === 0) return;

      const front = this.queue[0];
      if (!front) return;

      // If front is near register and has record, sell it
      if (front.hasRecord && dist(front, {x:this.register.x+this.register.w/2, y:this.register.y+this.register.h/2}) < 28){
        front.hasRecord = false;
        front.state = "leaving";
        this.queue.shift();

        this.sold += 1;
        this.cash += 12; // price per record for now

        // Win state later
      }
    }

    draw(){
      const ctx = this.ctx;
      const S = this.scale;

      // clear
      ctx.clearRect(0,0,this.canvas.width,this.canvas.height);

      // Background tiles
      ctx.fillStyle = "#c8d0d8";
      ctx.fillRect(0,0,this.canvas.width,this.canvas.height);

      // simple checker floor
      for (let y=0; y<this.world.h; y+=16){
        for (let x=0; x<this.world.w; x+=16){
          const a = ((x+y)/16)%2===0;
          ctx.fillStyle = a ? "#b8c4d0" : "#aebccc";
          ctx.fillRect(x*S, y*S, 16*S, 16*S);
        }
      }

      // Counter (purple zone)
      ctx.fillStyle = "#2b1553";
      ctx.fillRect(80*S,100*S,210*S,60*S);

      // Crate
      ctx.fillStyle = "#4b2ea8";
      ctx.fillRect(this.crate.x*S, this.crate.y*S, this.crate.w*S, this.crate.h*S);
      ctx.fillStyle = "#fff";
      ctx.font = `${10*S}px monospace`;
      ctx.fillText(`CRATE ${this.crate.stock}`, (this.crate.x+4)*S, (this.crate.y+16)*S);

      // Shelves
      for (const s of this.shelves){
        ctx.fillStyle = "#7b6f64";
        ctx.fillRect(s.x*S, s.y*S, s.w*S, s.h*S);
        ctx.fillStyle = "#fff";
        ctx.fillText(`${s.stock}/${s.cap}`, (s.x+6)*S, (s.y+14)*S);
      }

      // Register
      ctx.fillStyle = "#1b1b1b";
      ctx.fillRect(this.register.x*S, this.register.y*S, this.register.w*S, this.register.h*S);
      ctx.fillStyle = "#65ff9a";
      ctx.fillRect((this.register.x+6)*S, (this.register.y+6)*S, 16*S, 8*S);

      // Customers
      for (const c of this.customers){
        ctx.fillStyle = c.hasRecord ? "#ffcc66" : "#ff6b6b";
        ctx.fillRect((c.x-5)*S, (c.y-6)*S, 10*S, 12*S);
      }

      // Player
      ctx.fillStyle = "#ffffff";
      ctx.fillRect((this.player.x-5)*S, (this.player.y-6)*S, 10*S, 12*S);

      // HUD (minimal, you can re-skin later)
      ctx.fillStyle = "rgba(10,10,20,0.55)";
      ctx.fillRect(8*S, 8*S, 190*S, 24*S);
      ctx.fillStyle = "#fff";
      ctx.fillText(`Sold: ${this.sold}/${this.goal}   $${this.cash}   Carry:${this.player.carry}/${this.player.carryMax}`, 14*S, 26*S);

      // Touch “thumb guide” (optional visual)
      if (this.input.active){
        const a = this.input.anchor, p = this.input.pos;
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 2*S;
        ctx.beginPath(); ctx.arc(a.x, a.y, 22, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI*2); ctx.stroke();
      }
    }
  }

  window.KDSim = Sim;
})();
