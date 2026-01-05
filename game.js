// ======================================
// KornDog Record Store — Fixed Camera 2D
// Movement + restock + shelves + register
// Full copy/paste game.js
// ======================================

const c = document.getElementById("game");
const ctx = c.getContext("2d");

const xpFill = document.getElementById("xpFill");
const xpText = document.getElementById("xpText");
const cashEl = document.getElementById("cash");

const taskIconEl = document.getElementById("taskIcon");
const taskTextEl = document.getElementById("taskText");
const toastEl = document.getElementById("toast");

const btnSettings = document.getElementById("btnSettings");
const btnCloseSettings = document.getElementById("btnCloseSettings");
const settingsPanel = document.getElementById("settingsPanel");

const btnMusic = document.getElementById("btnMusic");
const btnRestart = document.getElementById("btnRestart");

const W = c.width, H = c.height;

// -------------------- Helpers --------------------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => Math.random() * (b - a) + a;
const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};

let toastTimer = 0;
function toast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  toastTimer = 1.4;
}

// -------------------- AUDIO (original chill loop) --------------------
let audioCtx = null;
let musicOn = false;
let musicTimer = null;

function ensureAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}
function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

function playTone({ type="triangle", freq=440, dur=0.12, vol=0.05, when=0, lp=8000 }) {
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

// SFX
function sfxPickup(){ playTone({type:"square", freq:880, dur:0.05, vol:0.035, lp:6500}); }
function sfxPlace(){ playTone({type:"triangle", freq:520, dur:0.08, vol:0.04, lp:5000}); }
function sfxCash(){
  playTone({type:"square", freq:988, dur:0.06, vol:0.04, lp:7000});
  playTone({type:"square", freq:1175, dur:0.08, vol:0.03, when:0.03, lp:7000});
}

// Original lo-fi-ish shop loop (not copyrighted)
function startMusic() {
  if (musicTimer) return;

  const bpm = 96;
  const stepDur = 60 / bpm / 4; // 16ths
  let step = 0;

  const chord = [57, 60, 64, 60, 57, 60, 64, 67]; // A minor-ish
  const bass  = [45, null, null, null, 43, null, null, null]; // A -> G
  const lead  = [69, null, 67, null, 69, null, 72, null, 71, null, 69, null, 67, null, 64, null];

  musicTimer = setInterval(() => {
    if (!musicOn) return;

    const cn = chord[step % chord.length];
    playTone({ type:"triangle", freq:midiToFreq(cn), dur:stepDur*0.85, vol:0.018, lp:5200 });

    const bn = bass[step % bass.length];
    if (bn != null) playTone({ type:"square", freq:midiToFreq(bn), dur:stepDur*2.8, vol:0.028, lp:2200 });

    const ln = lead[step % lead.length];
    if (ln != null) playTone({ type:"sine", freq:midiToFreq(ln), dur:stepDur*1.1, vol:0.016, lp:4800 });

    step++;
  }, stepDur * 1000);
}

function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}

function toggleMusic(force) {
  ensureAudio();
  musicOn = typeof force === "boolean" ? force : !musicOn;
  if (musicOn) startMusic();
  else stopMusic();
  if (btnMusic) btnMusic.textContent = musicOn ? "⏸ Music" : "▶ Music";
}

// -------------------- UI: settings panel --------------------
function openSettings(open) {
  if (!settingsPanel) return;
  const on = typeof open === "boolean" ? open : !settingsPanel.classList.contains("open");
  settingsPanel.classList.toggle("open", on);
  settingsPanel.setAttribute("aria-hidden", on ? "false" : "true");
}
if (btnSettings) btnSettings.addEventListener("click", () => openSettings(true));
if (btnCloseSettings) btnCloseSettings.addEventListener("click", () => openSettings(false));
if (settingsPanel) settingsPanel.addEventListener("click", (e) => {
  if (e.target === settingsPanel) openSettings(false);
});
if (btnMusic) btnMusic.addEventListener("click", () => toggleMusic());
if (btnRestart) btnRestart.addEventListener("click", () => reset(true));

// -------------------- GAME STATE --------------------
const player = {
  x: W * 0.52,
  y: H * 0.68,
  r: 14,
  speed: 160,
  carry: 0,
  carryMax: 6,
  tx: null, // target x (drag-to-move)
  ty: null, // target y
};

let cash = 0;
let xp = 0;
let xpNeed = 10;

const store = {
  // Stations are circles/rects you can tap OR walk into + tap
  crate:   { x: W*0.22, y: H*0.56, w: 90, h: 56, label:"RECORD CRATE", stock: 9999 },
  register:{ x: W*0.68, y: H*0.70, w: 150, h: 70, label:"REGISTER" },

  shelves: [
    { x: W*0.78, y: H*0.40, w: 140, h: 72, label:"SHELF", cap: 18, stock: 0 },
    { x: W*0.22, y: H*0.34, w: 140, h: 72, label:"SHELF", cap: 18, stock: 0 },
    { x: W*0.50, y: H*0.27, w: 180, h: 72, label:"SHELF", cap: 24, stock: 0 },
  ],
};

const queue = {
  spots: [
    { x: W*0.62, y: H*0.80 },
    { x: W*0.56, y: H*0.84 },
    { x: W*0.50, y: H*0.88 },
    { x: W*0.44, y: H*0.92 },
  ],
  customers: [],
  spawnTimer: 0,
};

const dust = Array.from({length: 26}, (_,i)=>({
  x: rand(0,W), y: rand(0,H), r: rand(0.8,1.8), s: rand(6,14)
}));

let keys = new Set();
let last = 0;

// -------------------- Tasks --------------------
function setTask(icon, text){
  if (taskIconEl) taskIconEl.textContent = icon;
  if (taskTextEl) taskTextEl.textContent = text;
}

function totalShelfStock(){
  return store.shelves.reduce((a,s)=>a+s.stock,0);
}

function updateTask(){
  if (player.carry === 0 && totalShelfStock() === 0) {
    setTask("📦","Pick up records");
    return;
  }
  if (totalShelfStock() === 0 && player.carry > 0) {
    setTask("🧱","Fill the shelves");
    return;
  }
  if (queue.customers.length > 0) {
    setTask("🧾","Check out customers");
    return;
  }
  setTask("✨","Keep stocking to attract customers");
}

// -------------------- HUD --------------------
function syncHUD(){
  if (cashEl) cashEl.textContent = `$${cash}`;
  const pct = clamp((xp / xpNeed) * 100, 0, 100);
  if (xpFill) xpFill.style.width = `${pct}%`;
  if (xpText) xpText.textContent = `${xp}/${xpNeed}`;
  updateTask();
}

function gainXP(n){
  xp += n;
  if (xp >= xpNeed){
    xp = xp - xpNeed;
    xpNeed = Math.floor(xpNeed * 1.15) + 2;
    toast("LEVEL UP! ⭐");
    // reward: increase carry a bit sometimes
    if (player.carryMax < 10 && Math.random() < 0.6) {
      player.carryMax += 1;
      toast(`Carry upgraded: ${player.carryMax}`);
    }
  }
}

// -------------------- Customer system --------------------
function canAttractCustomers(){
  return totalShelfStock() > 0;
}

function spawnCustomer(){
  // Spawn at entrance area (bottom-left-ish) and assign a queue slot
  if (queue.customers.length >= queue.spots.length) return;

  queue.customers.push({
    x: W*0.16 + rand(-10,10),
    y: H*0.92 + rand(-8,8),
    r: 10,
    speed: 70 + rand(-10, 15),
    state: "toQueue",
  });
}

function updateCustomers(dt){
  // spawn pacing
  queue.spawnTimer -= dt;
  if (queue.spawnTimer <= 0){
    queue.spawnTimer = rand(1.3, 2.4);
    if (canAttractCustomers()) spawnCustomer();
  }

  // move them into queue spots
  for (let i=0;i<queue.customers.length;i++){
    const cu = queue.customers[i];
    const spot = queue.spots[i];
    const tx = spot.x, ty = spot.y;

    const dx = tx - cu.x;
    const dy = ty - cu.y;
    const d = Math.hypot(dx, dy);

    if (d > 1){
      const vx = (dx / d) * cu.speed;
      const vy = (dy / d) * cu.speed;
      cu.x += vx * dt;
      cu.y += vy * dt;
    }
  }
}

// -------------------- Interactions --------------------
function nearRect(entity, rect, pad=18){
  const rx = rect.x, ry = rect.y, rw = rect.w, rh = rect.h;
  const cx = clamp(entity.x, rx - rw/2 - pad, rx + rw/2 + pad);
  const cy = clamp(entity.y, ry - rh/2 - pad, ry + rh/2 + pad);
  return dist2(entity.x, entity.y, cx, cy) <= (entity.r + 10) * (entity.r + 10);
}

function interactCrate(){
  if (player.carry >= player.carryMax){
    toast("Bag full.");
    return;
  }
  const take = Math.min(2, player.carryMax - player.carry); // pick up 2 at a time
  player.carry += take;
  sfxPickup();
  toast(`Picked up ${take} record${take>1?"s":""}. (${player.carry}/${player.carryMax})`);
  gainXP(1);
  syncHUD();
}

function interactShelf(shelf){
  if (player.carry <= 0){
    toast("No records to stock.");
    return;
  }
  const space = shelf.cap - shelf.stock;
  if (space <= 0){
    toast("Shelf is full.");
    return;
  }
  const put = Math.min(space, player.carry);
  shelf.stock += put;
  player.carry -= put;
  sfxPlace();
  toast(`Stocked +${put}. Shelf ${shelf.stock}/${shelf.cap}`);
  gainXP(put >= 3 ? 2 : 1);
  syncHUD();
}

function takeFromAnyShelf(){
  // selling consumes stock across shelves (front-to-back)
  for (const s of store.shelves){
    if (s.stock > 0){
      s.stock -= 1;
      return true;
    }
  }
  return false;
}

function interactRegister(){
  if (queue.customers.length === 0){
    toast("No customers in line.");
    return;
  }
  const sold = takeFromAnyShelf();
  if (!sold){
    toast("Out of stock! Restock shelves.");
    return;
  }

  // pay varies a bit
  const pay = Math.floor(rand(18, 38));
  cash += pay;
  sfxCash();
  toast(`Sold 1 record +$${pay}`);

  // remove first customer, shift queue
  queue.customers.shift();

  gainXP(2);
  syncHUD();
}

// Tap detection: if you tap near a station, it interacts.
// Also works if you walk near and tap.
function tryInteractAt(x, y){
  // prefer station you tapped closest to
  const candidates = [];

  // crate
  candidates.push({ type:"crate", d: dist2(x,y, store.crate.x, store.crate.y) });

  // register
  candidates.push({ type:"register", d: dist2(x,y, store.register.x, store.register.y) });

  // shelves
  store.shelves.forEach((s,idx)=>{
    candidates.push({ type:"shelf", idx, d: dist2(x,y, s.x, s.y) });
  });

  candidates.sort((a,b)=>a.d-b.d);
  const best = candidates[0];

  // must be close enough
  if (best.d > 85*85) return false;

  if (best.type === "crate" && nearRect(player, store.crate)) { interactCrate(); return true; }
  if (best.type === "register" && nearRect(player, store.register)) { interactRegister(); return true; }
  if (best.type === "shelf") {
    const s = store.shelves[best.idx];
    if (nearRect(player, s)) { interactShelf(s); return true; }
  }

  // If player isn't close, give guidance
  if (best.type === "crate") toast("Walk to the crate to pick up records.");
  if (best.type === "register") toast("Walk to the register to check out.");
  if (best.type === "shelf") toast("Walk to a shelf to stock it.");
  return true;
}

// -------------------- Movement (WASD + drag-to-move) --------------------
function updatePlayer(dt){
  // keyboard
  const left = keys.has("ArrowLeft") || keys.has("a");
  const right = keys.has("ArrowRight") || keys.has("d");
  const up = keys.has("ArrowUp") || keys.has("w");
  const down = keys.has("ArrowDown") || keys.has("s");

  let vx = 0, vy = 0;
  if (left) vx -= 1;
  if (right) vx += 1;
  if (up) vy -= 1;
  if (down) vy += 1;

  if (vx !== 0 || vy !== 0){
    const len = Math.hypot(vx, vy) || 1;
    vx /= len; vy /= len;
    player.x += vx * player.speed * dt;
    player.y += vy * player.speed * dt;
    player.tx = null; player.ty = null;
  } else if (player.tx != null && player.ty != null){
    // move toward target (mobile drag)
    const dx = player.tx - player.x;
    const dy = player.ty - player.y;
    const d = Math.hypot(dx, dy);
    if (d > 2){
      const sp = player.speed * 0.92;
      player.x += (dx/d) * sp * dt;
      player.y += (dy/d) * sp * dt;
    }
  }

  // bounds (keep inside store)
  const pad = 24;
  player.x = clamp(player.x, pad, W - pad);
  player.y = clamp(player.y, pad + 24, H - pad);
}

// -------------------- World drawing (warm record-store vibe) --------------------
function drawBackground(){
  // subtle vignette + warm floor + walls
  // wall
  const wallGrad = ctx.createLinearGradient(0, 0, 0, H);
  wallGrad.addColorStop(0, "rgba(255,220,170,0.10)");
  wallGrad.addColorStop(0.55, "rgba(0,0,0,0.10)");
  wallGrad.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = wallGrad;
  ctx.fillRect(0, 0, W, H);

  // wood floor zone (lower half)
  const fy = H*0.55;
  const floor = ctx.createLinearGradient(0, fy, 0, H);
  floor.addColorStop(0, "rgba(160,110,60,0.18)");
  floor.addColorStop(1, "rgba(40,25,10,0.35)");
  ctx.fillStyle = floor;
  ctx.fillRect(0, fy, W, H - fy);

  // floor boards
  ctx.globalAlpha = 0.12;
  for (let i=0;i<14;i++){
    const y = fy + i * 16;
    ctx.fillStyle = "rgba(255,255,255,0.20)";
    ctx.fillRect(0, y, W, 1);
  }
  ctx.globalAlpha = 1;

  // sunbeams
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.translate(W*0.78, H*0.12);
  ctx.rotate(-0.52);
  const beam = ctx.createLinearGradient(0, 0, 0, H);
  beam.addColorStop(0, "rgba(255,230,180,0.55)");
  beam.addColorStop(1, "rgba(255,230,180,0)");
  ctx.fillStyle = beam;
  ctx.fillRect(-40, 0, 70, H);
  ctx.fillRect(60, 0, 80, H);
  ctx.restore();
  ctx.globalAlpha = 1;

  // dust motes
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "white";
  for (const p of dust){
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // vignette
  const g = ctx.createRadialGradient(W/2, H/2, 80, W/2, H/2, 520);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = g;
  ctx.fillRect(0,0,W,H);
}

function drawStationBox(x,y,w,h,label,sub){
  // base shadow
  ctx.save();
  ctx.translate(x, y);

  ctx.globalAlpha = 0.28;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.beginPath();
  ctx.roundRect(-w/2+6, -h/2+8, w, h, 14);
  ctx.fill();
  ctx.globalAlpha = 1;

  // glass card
  const card = ctx.createLinearGradient(0, -h/2, 0, h/2);
  card.addColorStop(0, "rgba(255,255,255,0.10)");
  card.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = card;
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(-w/2, -h/2, w, h, 14);
  ctx.fill();
  ctx.stroke();

  // label
  ctx.font = "900 12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.textAlign = "center";
  ctx.fillText(label, 0, -h/2 - 10);

  if (sub){
    ctx.font = "900 12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = "rgba(87,255,147,0.95)";
    ctx.fillText(sub, 0, 6);
  }
  ctx.restore();
}

function drawPlayer(){
  // shadow
  ctx.globalAlpha = 0.30;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.beginPath();
  ctx.ellipse(player.x, player.y + 12, 16, 7, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // body
  const glow = ctx.createRadialGradient(player.x, player.y-6, 2, player.x, player.y-6, 28);
  glow.addColorStop(0, "rgba(124,60,255,0.35)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(player.x, player.y-6, 26, 0, Math.PI*2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.r, 0, Math.PI*2);
  ctx.fill();

  // hat
  ctx.fillStyle = "rgba(124,60,255,0.95)";
  ctx.beginPath();
  ctx.arc(player.x, player.y - 14, 7, 0, Math.PI*2);
  ctx.fill();

  // carry indicator
  if (player.carry > 0){
    ctx.font = "900 12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.textAlign = "center";
    ctx.fillText(`${player.carry}/${player.carryMax}`, player.x, player.y - 28);
  }
}

function drawCustomers(){
  for (let i=0;i<queue.customers.length;i++){
    const cu = queue.customers[i];
    // shadow
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.beginPath();
    ctx.ellipse(cu.x, cu.y + 10, 14, 6, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // body
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.beginPath();
    ctx.arc(cu.x, cu.y, cu.r, 0, Math.PI*2);
    ctx.fill();

    // tiny “want” bubble for first customer
    if (i === 0){
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(cu.x + 14, cu.y - 22, 30, 18, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(87,255,147,0.95)";
      ctx.font = "900 12px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("💿", cu.x + 29, cu.y - 9);
    }
  }
}

function drawWorld(){
  drawBackground();

  // stations
  drawStationBox(store.crate.x, store.crate.y, store.crate.w, store.crate.h, store.crate.label, "");
  // shelves (show stock)
  for (const s of store.shelves){
    drawStationBox(s.x, s.y, s.w, s.h, s.label, `${s.stock}/${s.cap}`);
  }
  drawStationBox(store.register.x, store.register.y, store.register.w, store.register.h, store.register.label, queue.customers.length ? `Queue ${queue.customers.length}` : "");

  // directional arrows when relevant
  ctx.globalAlpha = 0.85;
  ctx.font = "900 18px system-ui";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(87,255,147,0.92)";

  // show arrow to next best station
  if (player.carry === 0 && totalShelfStock() === 0){
    ctx.fillText("⬇", store.crate.x, store.crate.y - 46);
  } else if (totalShelfStock() === 0 && player.carry > 0){
    const s = store.shelves[0];
    ctx.fillText("⬇", s.x, s.y - 46);
  } else if (queue.customers.length > 0){
    ctx.fillText("⬇", store.register.x, store.register.y - 56);
  }
  ctx.globalAlpha = 1;

  // customers + player on top
  drawCustomers();
  drawPlayer();

  // interact hint if near something
  const nearCrate = nearRect(player, store.crate);
  const nearReg = nearRect(player, store.register);
  const nearShelf = store.shelves.find(s => nearRect(player, s));

  ctx.font = "900 12px system-ui";
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.textAlign = "center";

  if (nearCrate) ctx.fillText("Tap crate to pick up", store.crate.x, store.crate.y + 52);
  if (nearShelf) ctx.fillText("Tap shelf to stock", nearShelf.x, nearShelf.y + 52);
  if (nearReg) ctx.fillText("Tap register to sell", store.register.x, store.register.y + 62);
}

// -------------------- Reset / Loop --------------------
function reset(hard){
  // hard restart day
  cash = 0;
  xp = 0;
  xpNeed = 10;

  player.x = W * 0.52;
  player.y = H * 0.68;
  player.tx = null; player.ty = null;
  player.carry = 0;
  player.carryMax = 6;

  store.shelves.forEach((s)=> s.stock = 0);
  queue.customers = [];
  queue.spawnTimer = 1.0;

  toast("New day at KornDog Records.");
  syncHUD();
}

function step(dt){
  // dust drift
  for (const p of dust){
    p.y += p.s * dt;
    p.x += Math.sin((p.y + p.x) * 0.01) * 6 * dt;
    if (p.y > H + 10){ p.y = -10; p.x = rand(0,W); }
    if (p.x < -10) p.x = W + 10;
    if (p.x > W + 10) p.x = -10;
  }

  // toast timer
  if (toastTimer > 0){
    toastTimer -= dt;
    if (toastTimer <= 0 && toastEl) toastEl.classList.remove("show");
  }

  updatePlayer(dt);
  updateCustomers(dt);
  syncHUD();
}

function loop(t){
  const dt = Math.min(0.033, (t - last) / 1000);
  last = t;
  step(dt);
  ctx.clearRect(0,0,W,H);
  drawWorld();
  requestAnimationFrame(loop);
}

// ----------
