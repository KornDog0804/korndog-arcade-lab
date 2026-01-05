// ======================================
// KornDog Records — Idle Tycoon (V2.1)
// FIX: tap/click works on mobile + auto-interact + MUSIC
// Full copy/paste game.js
// ======================================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const cashEl   = document.getElementById("cash");
const xpFill   = document.getElementById("xpFill");
const xpNowEl  = document.getElementById("xpNow");
const xpNeedEl = document.getElementById("xpNeed");
const taskText = document.getElementById("taskText");
const taskIcon = document.getElementById("taskIcon");
const toast    = document.getElementById("toast");

// optional buttons (if you add them later)
const btnMusic = document.getElementById("btnMusic");

const W = canvas.width;
const H = canvas.height;

// ---------- helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp  = (a, b, t) => a + (b - a) * t;

function showToast(msg) {
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("show"), 900);
}

function money(n) { return `$${Math.floor(n).toLocaleString()}`; }

// ---------- AUDIO (original 8-bit loop) ----------
let audioCtx = null;
let musicOn = false;
let musicTimer = null;
let audioUnlocked = false;

function ensureAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx;
}

function unlockAudio() {
  const ac = ensureAudio();
  if (!ac) return;
  if (ac.state === "suspended") {
    ac.resume().catch(() => {});
  }
  audioUnlocked = true;
}

function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function playTone({ type="square", freq=440, dur=0.10, vol=0.05, when=0, lp=7000 }) {
  const ac = ensureAudio();
  if (!ac) return;
  const t0 = ac.currentTime + when;

  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(lp, t0);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);

  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function sfxPickup() {
  if (!audioUnlocked) return;
  playTone({ type:"square", freq:880, dur:0.06, vol:0.05, lp:6000 });
  playTone({ type:"square", freq:990, dur:0.05, vol:0.04, when:0.02, lp:6000 });
}
function sfxStock() {
  if (!audioUnlocked) return;
  playTone({ type:"triangle", freq:520, dur:0.08, vol:0.05, lp:5000 });
}
function sfxSale() {
  if (!audioUnlocked) return;
  playTone({ type:"square", freq:660, dur:0.06, vol:0.05, lp:7000 });
  playTone({ type:"square", freq:880, dur:0.08, vol:0.05, when:0.05, lp:7000 });
}

function startMusic() {
  if (musicTimer) return;
  const bpm = 120;
  const stepDur = 60 / bpm / 4; // 16ths
  let step = 0;

  // ORIGINAL (safe) pattern
  const lead = [76,null,79,null,81,null,79,null, 76,null,74,null,72,null,74,null];
  const bass = [40,null,null,null, 40,null,null,null, 43,null,null,null, 43,null,null,null];
  const arp  = [64,67,71,67, 64,67,71,67, 62,66,69,66, 62,66,69,66];

  musicTimer = setInterval(() => {
    if (!musicOn) return;

    const ln = lead[step % lead.length];
    if (ln != null) playTone({ type:"square", freq:midiToFreq(ln), dur:stepDur*1.5, vol:0.035, lp:7200 });

    const bn = bass[step % bass.length];
    if (bn != null) playTone({ type:"square", freq:midiToFreq(bn), dur:stepDur*2.6, vol:0.05, lp:2400 });

    const an = arp[step % arp.length];
    playTone({ type:"triangle", freq:midiToFreq(an), dur:stepDur*0.65, vol:0.02, lp:6000 });

    step++;
  }, stepDur * 1000);
}

function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}

function setMusic(on) {
  unlockAudio();
  musicOn = !!on;
  if (musicOn) startMusic();
  else stopMusic();
  if (btnMusic) btnMusic.textContent = musicOn ? "⏸ Music" : "▶ Music";
}

if (btnMusic) btnMusic.addEventListener("click", () => setMusic(!musicOn));

// ---------- progression ----------
let cash = 0;
let xp = 0;
let xpNeed = 5;

const TASKS = [
  { icon:"📦", text:"Pick up records", need:1, target:"crate" },
  { icon:"🧱", text:"Stock the shelf", need:1, target:"shelf" },
  { icon:"🧾", text:"Sell at register", need:1, target:"register" },
  { icon:"📦", text:"Pick up more", need:2, target:"crate" },
  { icon:"🧱", text:"Fill the shelf", need:2, target:"shelf" },
];
let taskIndex = 0;
let taskProgress = 0;

function setTask(i) {
  taskIndex = clamp(i, 0, TASKS.length - 1);
  taskProgress = 0;
  if (taskIcon) taskIcon.textContent = TASKS[taskIndex].icon;
  if (taskText) taskText.textContent = TASKS[taskIndex].text;
}

function bumpTask(n=1) {
  taskProgress += n;
  if (taskProgress >= TASKS[taskIndex].need) {
    setTask(taskIndex + 1);
    addXP(1);
    showToast("⭐ Objective complete!");
  }
}

function addCash(n) {
  cash += n;
  if (cashEl) cashEl.textContent = money(cash);
}

function addXP(n=1) {
  xp += n;
  if (xp >= xpNeed) {
    xp -= xpNeed;
    xpNeed = Math.round(xpNeed * 1.35 + 1);
    showToast("🔥 Level up!");
    if (player.carryMax < 10) player.carryMax += 1;
    saleValue += 1;
    customerInterval = Math.max(1.5, customerInterval - 0.12);
  }
  if (xpNowEl) xpNowEl.textContent = String(xp);
  if (xpNeedEl) xpNeedEl.textContent = String(xpNeed);
  if (xpFill) xpFill.style.width = `${Math.round((xp / xpNeed) * 100)}%`;
}

// ---------- input ----------
let keys = new Set();
let last = performance.now();

let dragging = false;
let dragStart = null;
let dragVec = { x:0, y:0 };

window.addEventListener("keydown", (e) => {
  unlockAudio();
  keys.add(e.key.toLowerCase());
  if (e.key.toLowerCase() === "m") setMusic(!musicOn);
});

window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

// IMPORTANT: use pointer events (mobile reliable)
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  canvas.setPointerCapture?.(e.pointerId);
  unlockAudio();
  if (!musicOn) setMusic(true); // auto start music on first touch

  dragging = true;
  const rect = canvas.getBoundingClientRect();
  dragStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  dragVec = { x:0, y:0 };
}, { passive:false });

canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  dragVec.x = x - dragStart.x;
  dragVec.y = y - dragStart.y;
});

canvas.addEventListener("pointerup", () => {
  dragging = false;
  dragStart = null;
  dragVec = { x:0, y:0 };
});

canvas.addEventListener("pointercancel", () => {
  dragging = false;
  dragStart = null;
  dragVec = { x:0, y:0 };
});

// Tap stations directly (use pointerup so drag doesn't count as a tap)
canvas.addEventListener("pointerup", (e) => {
  // treat as tap if you didn't drag much
  const d = Math.hypot(dragVec.x, dragVec.y);
  if (d > 10) return;

  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (W / rect.width);
  const my = (e.clientY - rect.top) * (H / rect.height);
  const wx = mx + cam.x;
  const wy = my + cam.y;

  for (const st of stations) {
    if (wx >= st.x - 10 && wx <= st.x + st.w + 10 && wy >= st.y - 10 && wy <= st.y + st.h + 10) {
      interact(st);
      return;
    }
  }
});

// ---------- world ----------
const world = { w:980, h:980 };
const room  = { x:120, y:160, w:740, h:640 };

const crate    = { x: room.x + 120, y: room.y + 170, w: 74,  h: 54, type:"crate" };
const shelf    = { x: room.x + 520, y: room.y + 160, w: 130, h: 78, type:"shelf", stock:0, stockMax:18 };
const register = { x: room.x + 420, y: room.y + 420, w: 160, h: 70, type:"register" };

const stations = [crate, shelf, register];

const player = {
  x: room.x + 260,
  y: room.y + 480,
  speed: 210,
  carry: 0,
  carryMax: 6,
  dir: 1,
};

const cam = { x:0, y:0, shake:0 };

// customers
let customers = [];
let customerSpawn = 0;
let customerInterval = 2.6;
let saleValue = 7;

function spawnCustomer() {
  customers.push({
    x: room.x + 40,
    y: room.y + room.h - 60,
    state: "toShelf",
  });
}

function moveTo(c, tx, ty, dt) {
  const dx = tx - c.x, dy = ty - c.y;
  const d = Math.hypot(dx, dy) || 1;
  const sp = 130;
  c.x += (dx/d) * sp * dt;
  c.y += (dy/d) * sp * dt;
  return d < 10;
}

function updateCustomers(dt) {
  customerSpawn += dt;
  if (customerSpawn >= customerInterval) {
    customerSpawn = 0;
    if (customers.length < 5) spawnCustomer();
  }

  for (const c of customers) {
    if (c.state === "toShelf") {
      if (moveTo(c, shelf.x + shelf.w*0.5, shelf.y + shelf.h + 30, dt)) c.state = "toRegister";
    } else if (c.state === "toRegister") {
      if (moveTo(c, register.x + register.w*0.5, register.y + register.h + 26, dt)) {
        if (shelf.stock > 0) {
          shelf.stock -= 1;
          addCash(saleValue);
          addXP(1);
          cam.shake = 1;
          sfxSale();
        }
        c.state = "leave";
      }
    } else if (c.state === "leave") {
      if (moveTo(c, room.x - 40, room.y + room.h - 40, dt)) c._dead = true;
    }
  }
  customers = customers.filter(c => !c._dead);
}

// ---------- interaction ----------
function nearRect(p, r, pad=18) {
  const cx = clamp(p.x, r.x - pad, r.x + r.w + pad);
  const cy = clamp(p.y, r.y - pad, r.y + r.h + pad);
  const dx = p.x - cx, dy = p.y - cy;
  return (dx*dx + dy*dy) < (28*28);
}

let interactCooldown = 0;

function interact(st) {
  if (!nearRect(player, st, 22)) {
    showToast("Walk closer");
    return;
  }

  if (st.type === "crate") {
    if (player.carry >= player.carryMax) return showToast("Hands full");
    const grab = Math.min(3, player.carryMax - player.carry);
    player.carry += grab;
    sfxPickup();
    showToast(`Picked up ${grab}`);
    bumpTask(1);
    return;
  }

  if (st.type === "shelf") {
    if (player.carry <= 0) return showToast("Nothing to stock");
    if (shelf.stock >= shelf.stockMax) return showToast("Shelf full");
    const place = Math.min(player.carry, shelf.stockMax - shelf.stock);
    shelf.stock += place;
    player.carry -= place;
    sfxStock();
    showToast(`Stocked ${place}`);
    bumpTask(1);
    return;
  }

  if (st.type === "register") {
    if (shelf.stock <= 0) return showToast("No stock");
    shelf.stock -= 1;
    addCash(saleValue);
    addXP(1);
    cam.shake = 1;
    sfxSale();
    showToast(`💸 Sale +$${saleValue}`);
    bumpTask(1);
    return;
  }
}

// auto-interact when close + correct task target (mobile-friendly)
function autoInteract(dt) {
  interactCooldown = Math.max(0, interactCooldown - dt);
  if (interactCooldown > 0) return;

  const targetType = TASKS[taskIndex].target;
  const target = stations.find(s => s.type === targetType);
  if (!target) return;

  if (nearRect(player, target, 18)) {
    interact(target);
    interactCooldown = 0.35; // prevents spam
  }
}

// ---------- drawing ----------
function rr(x,y,w,h,r) {
  ctx.beginPath();
  ctx.roundRect(x,y,w,h,r);
}

function drawStation(st) {
  const pulse = 0.5 + 0.5 * Math.sin(performance.now()*0.005);
  const isTarget = TASKS[taskIndex].target === st.type;

  if (isTarget) {
    ctx.fillStyle = `rgba(87,255,147,${0.10 + pulse*0.14})`;
    rr(st.x-10, st.y-10, st.w+20, st.h+20, 18);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(0,0,0,.38)";
  rr(st.x, st.y, st.w, st.h, 14);
  ctx.fill();

  ctx.fillStyle =
    st.type === "crate" ? "rgba(124,60,255,.55)" :
    st.type === "shelf" ? "rgba(87,255,147,.42)" :
    "rgba(255,255,255,.18)";
  rr(st.x+8, st.y+8, st.w-16, 16, 10);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,.18)";
  ctx.lineWidth = 2;
  rr(st.x, st.y, st.w, st.h, 14);
  ctx.stroke();

  if (st.type === "shelf") {
    ctx.fillStyle = "rgba(0,0,0,.30)";
    rr(st.x+10, st.y+st.h-22, st.w-20, 14, 8);
    ctx.fill();
    const pct = st.stock / st.stockMax;
    ctx.fillStyle = "rgba(87,255,147,.80)";
    rr(st.x+10, st.y+st.h-22, (st.w-20)*pct, 14, 8);
    ctx.fill();
  }
}

function drawPlayer() {
  ctx.fillStyle = "rgba(0,0,0,.25)";
  ctx.beginPath();
  ctx.ellipse(player.x, player.y+16, 20, 8, 0, 0, Math.PI*2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,.16)";
  rr(player.x-8, player.y+6, 6, 10, 3); ctx.fill();
  rr(player.x+2, player.y+6, 6, 10, 3); ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,.85)";
  rr(player.x-12, player.y-10, 24, 20, 8); ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.beginPath();
  ctx.arc(player.x, player.y-18, 10, 0, Math.PI*2);
  ctx.fill();

  ctx.fillStyle = "rgba(124,60,255,.85)";
  rr(player.x-12, player.y-32, 24, 8, 4); ctx.fill();

  ctx.fillStyle = "rgba(0,0,0,.30)";
  const ex = player.x + player.dir*4;
  ctx.beginPath();
  ctx.arc(ex, player.y-20, 2, 0, Math.PI*2);
  ctx.fill();
}

function drawCustomer(c) {
  ctx.fillStyle = "rgba(0,0,0,.22)";
  ctx.beginPath();
  ctx.ellipse(c.x, c.y+16, 18, 7, 0, 0, Math.PI*2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,.70)";
  rr(c.x-11, c.y-10, 22, 22, 10); ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,.80)";
  ctx.beginPath();
  ctx.arc(c.x, c.y-18, 9, 0, Math.PI*2);
  ctx.fill();
}

function drawCarry() {
  if (player.carry <= 0) return;
  for (let i=0; i<player.carry; i++) {
    const ox = player.x - 14 + (i%2)*16;
    const oy = player.y - 60 - Math.floor(i/2)*10;
    ctx.fillStyle = "rgba(0,0,0,.35)";
    rr(ox, oy, 14, 8, 3); ctx.fill();
    ctx.fillStyle = "rgba(124,60,255,.85)";
    rr(ox+2, oy+2, 10, 4, 2); ctx.fill();
  }
}

function label(x, y, text) {
  ctx.font = "900 14px system-ui";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(0,0,0,.35)";
  rr(x, y, ctx.measureText(text).width + 18, 22, 10);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.86)";
  ctx.fillText(text, x+9, y+3);
}

function drawObjective(st) {
  const pulse = 0.5 + 0.5*Math.sin(performance.now()*0.005);
  const x = st.x + st.w*0.5;
  const y = st.y - 18;

  ctx.fillStyle = `rgba(87,255,147,${0.65 + pulse*0.25})`;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x-14, y-16);
  ctx.lineTo(x-5, y-16);
  ctx.lineTo(x-5, y-34);
  ctx.lineTo(x+5, y-34);
  ctx.lineTo(x+5, y-16);
  ctx.lineTo(x+14, y-16);
  ctx.closePath();
  ctx.fill();
}

function draw() {
  const shakeX = (Math.random()-0.5)*8*cam.shake;
  const shakeY = (Math.random()-0.5)*8*cam.shake;

  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,W,H);
  ctx.setTransform(1,0,0,1,-cam.x+shakeX,-cam.y+shakeY);

  // bg
  ctx.fillStyle = "rgba(0,0,0,.18)";
  ctx.fillRect(0,0,world.w,world.h);

  // room
  ctx.fillStyle = "rgba(255,255,255,.06)";
  rr(room.x, room.y, room.w, room.h, 22);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.lineWidth = 3;
  rr(room.x, room.y, room.w, room.h, 22);
  ctx.stroke();

  // stations
  for (const st of stations) drawStation(st);

  // draw entities by y
  const ents = [
    ...customers.map(c => ({t:"c", y:c.y, r:c})),
    {t:"p", y:player.y, r:player}
  ].sort((a,b)=>a.y-b.y);

  for (const e of ents) {
    if (e.t==="c") drawCustomer(e.r);
    else drawPlayer();
  }

  // labels
  label(crate.x, crate.y-26, "RECORD CRATE");
  label(shelf.x, shelf.y-26, `SHELF ${shelf.stock}/${shelf.stockMax}`);
  label(register.x, register.y-26, "REGISTER");

  // objective
  const target = stations.find(s => s.type === TASKS[taskIndex].target);
  if (target) drawObjective(target);

  // carry
  drawCarry();
}

// ---------- main loop ----------
function loop(t) {
  const dt = Math.min(0.033, (t - last) / 1000);
  last = t;

  // movement
  let vx=0, vy=0;
  if (keys.has("a") || keys.has("arrowleft")) vx -= 1;
  if (keys.has("d") || keys.has("arrowright")) vx += 1;
  if (keys.has("w") || keys.has("arrowup")) vy -= 1;
  if (keys.has("s") || keys.has("arrowdown")) vy += 1;

  if (dragging) {
    const len = Math.hypot(dragVec.x, dragVec.y);
    if (len > 8) {
      vx += dragVec.x / Math.max(70, len);
      vy += dragVec.y / Math.max(70, len);
    }
  }

  const mag = Math.hypot(vx, vy) || 1;
  vx/=mag; vy/=mag;

  if (vx !== 0) player.dir = vx > 0 ? 1 : -1;

  player.x = clamp(player.x + vx*player.speed*dt, room.x+34, room.x+room.w-34);
  player.y = clamp(player.y + vy*player.speed*dt, room.y+90, room.y+room.h-34);

  updateCustomers(dt);
  autoInteract(dt);

  // camera follow
  const targetX = clamp(player.x - W*0.5, 0, world.w - W);
  const targetY = clamp(player.y - H*0.58, 0, world.h - H);
  cam.x = lerp(cam.x, targetX, 0.12);
  cam.y = lerp(cam.y, targetY, 0.12);
  cam.shake = Math.max(0, cam.shake - dt*2.8);

  draw();
  requestAnimationFrame(loop);
}

// ---------- init ----------
if (cashEl) cashEl.textContent = money(cash);
if (xpNowEl) xpNowEl.textContent = String(xp);
if (xpNeedEl) xpNeedEl.textContent = String(xpNeed);
if (xpFill) xpFill.style.width = "0%";

setTask(0);
showToast("Touch screen to start music. Walk to station to auto-use.");
requestAnimationFrame(loop);
