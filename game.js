// ======================================
// KornDog Record Store — Retro Zelda Feel
// Plain Netlify (no build tools)
// Pixel-perfect tile engine + collisions + auto interactions
// Touch: finger-tracking movement (no joystick)
// Controller: Gamepad API support (Shield-friendly)
// ======================================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: true });

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

// -------------------- Helpers --------------------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => Math.random() * (b - a) + a;

let toastTimer = 0;
function toast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  toastTimer = 1.25;
}

// -------------------- AUDIO (same vibe) --------------------
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

function sfxPickup(){ playTone({type:"square", freq:880, dur:0.05, vol:0.04, lp:6500}); }
function sfxPlace(){ playTone({type:"triangle", freq:520, dur:0.08, vol:0.045, lp:5000}); }
function sfxCash(){
  playTone({type:"square", freq:988, dur:0.06, vol:0.045, lp:7000});
  playTone({type:"square", freq:1175, dur:0.08, vol:0.035, when:0.03, lp:7000});
}

function startMusic() {
  if (musicTimer) return;
  const bpm = 96;
  const stepDur = 60 / bpm / 4;
  let step = 0;

  const chord = [57, 60, 64, 60, 57, 60, 64, 67];
  const bass  = [45, null, null, null, 43, null, null, null];
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
  if (musicOn) startMusic(); else stopMusic();
  if (btnMusic) btnMusic.textContent = musicOn ? "⏸ Music" : "▶ Music";
}

// -------------------- UI: settings --------------------
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

// -------------------- Pixel Engine Setup --------------------
// Internal resolution (SNES-ish) 320x192, scaled up with nearest-neighbor
const V_W = 320;
const V_H = 192;
const TILE = 16;
const MAP_W = V_W / TILE; // 20
const MAP_H = V_H / TILE; // 12

// Offscreen buffer for crisp pixel rendering
const buf = document.createElement("canvas");
buf.width = V_W;
buf.height = V_H;
const b = buf.getContext("2d");
b.imageSmoothingEnabled = false;
ctx.imageSmoothingEnabled = false;

// Main canvas scales to fit screen
function resize() {
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener("resize", resize);
resize();

// -------------------- Map (placeholder but Zelda-feel) --------------------
// Tile IDs (we draw them procedurally)
const T = {
  VOID: 0,
  FLOOR: 1,
  RUG: 2,
  WALL: 3,
  COUNTER: 4,
  SHELF_BASE: 5,
  SHELF_TOP: 6,      // drawn "in front" layer
  CRATE: 7,
  REGISTER: 8,
  PLANT: 9,
};

// Collision tiles block movement
function isSolid(tileId) {
  return (
    tileId === T.WALL ||
    tileId === T.COUNTER ||
    tileId === T.SHELF_BASE ||
    tileId === T.CRATE ||
    tileId === T.REGISTER
  );
}

// Build a simple shop layout
const map = [];
for (let y = 0; y < MAP_H; y++) {
  for (let x = 0; x < MAP_W; x++) {
    let id = T.FLOOR;

    // walls border
    if (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1) id = T.WALL;

    // rug area
    if (x >= 4 && x <= 15 && y >= 6 && y <= 10) id = T.RUG;

    map.push(id);
  }
}

// Helpers
function idx(x, y) { return y * MAP_W + x; }
function getTile(x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return T.WALL;
  return map[idx(x, y)];
}
function setTile(x, y, id) { map[idx(x, y)] = id; }

// Place counters / shelves / stations
// Top counter row
for (let x = 12; x <= 18; x++) setTile(x, 2, T.COUNTER);
for (let x = 12; x <= 18; x++) setTile(x, 3, T.COUNTER);

// Register (bottom-right-ish)
setTile(16, 8, T.REGISTER);
setTile(17, 8, T.REGISTER);

// Crate (upper-left-ish)
setTile(3, 6, T.CRATE);
setTile(3, 7, T.CRATE);

// Shelves (three)
function placeShelf(cx, cy, wTiles) {
  const half = Math.floor(wTiles / 2);
  for (let x = cx - half; x <= cx + half; x++) {
    setTile(x, cy, T.SHELF_BASE);      // collision body
    // top/front lip rendered in front layer:
    setTile(x, cy + 1, getTile(x, cy + 1)); // keep floor on base layer
  }
  // store shelf top spans in a list for front-layer drawing:
  shelves.push({ x: cx - half, y: cy, w: wTiles, cap: wTiles * 6, stock: 0 });
}
const shelves = [];
placeShelf(6, 4, 5);
placeShelf(10, 4, 5);
placeShelf(14, 4, 5);

// Some plants (non-solid)
setTile(2, 2, T.PLANT);
setTile(18, 10, T.PLANT);

// -------------------- Stations / Zones (tile rectangles) --------------------
function rectTiles(x, y, w, h) { return { x, y, w, h }; }

// "Zones" are where auto-interactions happen (NOT collision)
const zones = {
  crate: rectTiles(3, 6, 1, 2),
  register: rectTiles(16, 8, 2, 1),
  shelves: shelves.map((s) => rectTiles(s.x, s.y, s.w, 1)),
};

// -------------------- Game State --------------------
const player = {
  x: 7 * TILE + 8,
  y: 9 * TILE + 8,
  r: 6,              // collision radius in pixels
  speed: 92,         // px/s
  carry: 0,
  carryMax: 6,
  dir: "down",
};

let cash = 0;
let xp = 0;
let xpNeed = 10;

// Auto-interact cooldown so it doesn't spam
let autoCooldown = 0;

// Customers
const queue = {
  spots: [
    { x: 16 * TILE + 8, y: 10 * TILE + 8 },
    { x: 15 * TILE + 8, y: 10 * TILE + 8 },
    { x: 14 * TILE + 8, y: 10 * TILE + 8 },
  ],
  customers: [],
  spawnTimer: 1.2,
};

function totalShelfStock() {
  return shelves.reduce((a, s) => a + s.stock, 0);
}

// -------------------- HUD / Tasks --------------------
function setTask(icon, text) {
  if (taskIconEl) taskIconEl.textContent = icon;
  if (taskTextEl) taskTextEl.textContent = text;
}
function updateTask() {
  if (player.carry === 0 && totalShelfStock() === 0) { setTask("📦", "Pick up records"); return; }
  if (player.carry > 0 && totalShelfStock() === 0) { setTask("🧱", "Stock shelves"); return; }
  if (queue.customers.length > 0) { setTask("🧾", "Check out customers"); return; }
  setTask("✨", "Stock shelves to attract customers");
}

function syncHUD() {
  if (cashEl) cashEl.textContent = `$${cash}`;
  const pct = clamp((xp / xpNeed) * 100, 0, 100);
  if (xpFill) xpFill.style.width = `${pct}%`;
  if (xpText) xpText.textContent = `${xp}/${xpNeed}`;
  updateTask();
}
function gainXP(n) {
  xp += n;
  if (xp >= xpNeed) {
    xp = xp - xpNeed;
    xpNeed = Math.floor(xpNeed * 1.15) + 2;
    toast("LEVEL UP! ⭐");
    if (player.carryMax < 10 && Math.random() < 0.7) {
      player.carryMax += 1;
      toast(`Carry upgraded: ${player.carryMax}`);
    }
  }
}

// -------------------- Controls --------------------
// Keyboard
const keys = new Set();
window.addEventListener("keydown", (e) => {
  keys.add(e.key);
  // unlock audio on any user interaction
  if (e.key === " " || e.key === "Enter") ensureAudio();
});
window.addEventListener("keyup", (e) => keys.delete(e.key));

// Touch / Pointer: finger-tracking movement (no joystick)
// While finger is down, player moves toward finger position (world coords).
let pointerDown = false;
let pointerX = 0;
let pointerY = 0;

function canvasToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const nx = (clientX - rect.left) / rect.width;
  const ny = (clientY - rect.top) / rect.height;
  return { x: nx * V_W, y: ny * V_H };
}

canvas.addEventListener("pointerdown", (e) => {
  pointerDown = true;
  const w = canvasToWorld(e.clientX, e.clientY);
  pointerX = w.x;
  pointerY = w.y;
  canvas.setPointerCapture(e.pointerId);
  ensureAudio();
});

canvas.addEventListener("pointermove", (e) => {
  if (!pointerDown) return;
  const w = canvasToWorld(e.clientX, e.clientY);
  pointerX = w.x;
  pointerY = w.y;
});

canvas.addEventListener("pointerup", () => {
  pointerDown = false;
});

canvas.addEventListener("pointercancel", () => {
  pointerDown = false;
});

// Gamepad (Shield controller)
function readGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = pads && pads[0];
  if (!gp) return { vx: 0, vy: 0, action: false };

  // left stick
  let ax = gp.axes?.[0] ?? 0;
  let ay = gp.axes?.[1] ?? 0;

  // deadzone
  const dz = 0.18;
  if (Math.abs(ax) < dz) ax = 0;
  if (Math.abs(ay) < dz) ay = 0;

  // d-pad overrides stick if pressed
  const dUp = gp.buttons?.[12]?.pressed;
  const dDown = gp.buttons?.[13]?.pressed;
  const dLeft = gp.buttons?.[14]?.pressed;
  const dRight = gp.buttons?.[15]?.pressed;

  if (dLeft) ax = -1;
  if (dRight) ax = 1;
  if (dUp) ay = -1;
  if (dDown) ay = 1;

  // "A" for action (not required since we auto-interact, but kept)
  const action = gp.buttons?.[0]?.pressed;

  return { vx: ax, vy: ay, action };
}

// -------------------- Interactions (AUTO on proximity) --------------------
function inZone(px, py, z) {
  const x = Math.floor(px / TILE);
  const y = Math.floor(py / TILE);
  return (x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h);
}

function interactCrateAuto() {
  if (player.carry >= player.carryMax) return false;
  const take = Math.min(2, player.carryMax - player.carry);
  player.carry += take;
  sfxPickup();
  toast(`Picked up ${take} record${take > 1 ? "s" : ""}. (${player.carry}/${player.carryMax})`);
  gainXP(1);
  syncHUD();
  return true;
}

function interactShelfAuto(shelf) {
  if (player.carry <= 0) return false;
  const space = shelf.cap - shelf.stock;
  if (space <= 0) return false;
  const put = Math.min(space, player.carry);
  shelf.stock += put;
  player.carry -= put;
  sfxPlace();
  toast(`Stocked +${put}. (${shelf.stock}/${shelf.cap})`);
  gainXP(put >= 3 ? 2 : 1);
  syncHUD();
  return true;
}

function interactRegisterAuto() {
  if (queue.customers.length === 0) return false;
  const first = queue.customers[0];
  if (!first.hasItem) return false;

  const pay = Math.floor(rand(18, 38));
  cash += pay;
  sfxCash();
  toast(`Sold 1 record +$${pay}`);
  queue.customers.shift();
  gainXP(2);
  syncHUD();
  return true;
}

// -------------------- Customer AI (Zelda shop vibe) --------------------
// Customer flow: spawn -> go to shelf -> grab record (decrement shelf) -> go to register queue
function canAttractCustomers() {
  return totalShelfStock() > 0;
}

function spawnCustomer() {
  if (queue.customers.length >= queue.spots.length) return;

  // Pick a shelf that has stock
  const stocked = shelves.filter(s => s.stock > 0);
  if (stocked.length === 0) return;
  const targetShelf = stocked[Math.floor(Math.random() * stocked.length)];

  queue.customers.push({
    x: 2 * TILE + 8,
    y: 10 * TILE + 8,
    r: 6,
    speed: 58 + rand(-6, 10),
    state: "toShelf",
    shelf: targetShelf,
    hasItem: false,
  });
}

function moveToward(ent, tx, ty, dt) {
  const dx = tx - ent.x;
  const dy = ty - ent.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) return true;
  ent.x += (dx / d) * ent.speed * dt;
  ent.y += (dy / d) * ent.speed * dt;
  return d < 2;
}

function updateCustomers(dt) {
  queue.spawnTimer -= dt;
  if (queue.spawnTimer <= 0) {
    queue.spawnTimer = rand(1.2, 2.2);
    if (canAttractCustomers()) spawnCustomer();
  }

  for (let i = 0; i < queue.customers.length; i++) {
    const cu = queue.customers[i];

    if (cu.state === "toShelf") {
      // walk to shelf front
      const sx = (cu.shelf.x + Math.floor(cu.shelf.w / 2)) * TILE + 8;
      const sy = (cu.shelf.y + 1) * TILE + 8; // stand just below shelf
      const arrived = moveToward(cu, sx, sy, dt);
      if (arrived) {
        // grab record from shelf
        if (cu.shelf.stock > 0) {
          cu.shelf.stock -= 1;
          cu.hasItem = true;
          cu.state = "toRegister";
          sfxPickup();
        } else {
          // shelf empty; pick a new shelf or leave
          const stocked = shelves.filter(s => s.stock > 0);
          if (stocked.length) cu.shelf = stocked[Math.floor(Math.random() * stocked.length)];
          else cu.state = "leave";
        }
      }
    } else if (cu.state === "toRegister") {
      const spot = queue.spots[i] || queue.spots[queue.spots.length - 1];
      moveToward(cu, spot.x, spot.y, dt);
      // stays queued until player checks them out at register zone (auto)
    } else if (cu.state === "leave") {
      moveToward(cu, -20, cu.y, dt);
    }
  }
}

// -------------------- Collision --------------------
function circleVsTile(cx, cy, r, tx, ty) {
  const rx = tx * TILE;
  const ry = ty * TILE;
  const closestX = clamp(cx, rx, rx + TILE);
  const closestY = clamp(cy, ry, ry + TILE);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return (dx * dx + dy * dy) < (r * r);
}

function resolveCollisions(ent) {
  const minX = Math.floor((ent.x - ent.r) / TILE) - 1;
  const maxX = Math.floor((ent.x + ent.r) / TILE) + 1;
  const minY = Math.floor((ent.y - ent.r) / TILE) - 1;
  const maxY = Math.floor((ent.y + ent.r) / TILE) + 1;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const t = getTile(x, y);
      if (!isSolid(t)) continue;

      if (circleVsTile(ent.x, ent.y, ent.r, x, y)) {
        // Push out along smallest axis
        const rx = x * TILE;
        const ry = y * TILE;
        const left = ent.x - rx;
        const right = (rx + TILE) - ent.x;
        const top = ent.y - ry;
        const bottom = (ry + TILE) - ent.y;

        const min = Math.min(left, right, top, bottom);
        if (min === left) ent.x = rx - ent.r;
        else if (min === right) ent.x = rx + TILE + ent.r;
        else if (min === top) ent.y = ry - ent.r;
        else ent.y = ry + TILE + ent.r;
      }
    }
  }

  // keep in bounds
  ent.x = clamp(ent.x, TILE + ent.r, V_W - TILE - ent.r);
  ent.y = clamp(ent.y, TILE + ent.r, V_H - TILE - ent.r);
}

// -------------------- Movement --------------------
function updatePlayer(dt) {
  // Keyboard vector
  const left = keys.has("ArrowLeft") || keys.has("a");
  const right = keys.has("ArrowRight") || keys.has("d");
  const up = keys.has("ArrowUp") || keys.has("w");
  const down = keys.has("ArrowDown") || keys.has("s");

  let vx = 0, vy = 0;
  if (left) vx -= 1;
  if (right) vx += 1;
  if (up) vy -= 1;
  if (down) vy += 1;

  // Gamepad overrides if used
  const gp = readGamepad();
  if (Math.abs(gp.vx) > 0 || Math.abs(gp.vy) > 0) {
    vx = gp.vx;
    vy = gp.vy;
  }

  // Touch finger-tracking (only if no keyboard/gamepad input)
  if (pointerDown && vx === 0 && vy === 0) {
    const dx = pointerX - player.x;
    const dy = pointerY - player.y;
    const d = Math.hypot(dx, dy);
    if (d > 3) {
      vx = dx / d;
      vy = dy / d;
    }
  }

  // normalize
  const len = Math.hypot(vx, vy);
  if (len > 0) {
    vx /= len; vy /= len;
    player.x += vx * player.speed * dt;
    player.y += vy * player.speed * dt;

    // direction for sprite
    if (Math.abs(vx) > Math.abs(vy)) player.dir = vx > 0 ? "right" : "left";
    else player.dir = vy > 0 ? "down" : "up";
  }

  resolveCollisions(player);
}

// -------------------- Auto interactions --------------------
function autoInteract(dt) {
  autoCooldown -= dt;
  if (autoCooldown > 0) return;

  // 1) Crate pickup
  if (inZone(player.x, player.y, zones.crate)) {
    if (interactCrateAuto()) { autoCooldown = 0.25; return; }
  }

  // 2) Shelves stock
  for (let i = 0; i < zones.shelves.length; i++) {
    const z = zones.shelves[i];
    if (inZone(player.x, player.y, z)) {
      if (interactShelfAuto(shelves[i])) { autoCooldown = 0.25; return; }
    }
  }

  // 3) Register checkout
  if (inZone(player.x, player.y, zones.register)) {
    if (interactRegisterAuto()) { autoCooldown = 0.25; return; }
  }
}

// -------------------- Pixel Art: Procedural Tiles/Sprites --------------------
function drawTile(id, x, y) {
  // x,y in pixels
  // We draw in chunky 1px (since buffer is low-res, it looks pixel-ish).
  // Tile "palette"
  const col = {
    floorA: "#a9bfd1",
    floorB: "#95aec3",
    rugA: "#3a1a66",
    rugB: "#2a114c",
    wallA: "#d8d2cc",
    wallB: "#c9c2bb",
    counterA: "#bdb6af",
    counterB: "#a8a19a",
    shadow: "rgba(0,0,0,0.18)",
    shelfA: "#8b6a4a",
    shelfB: "#6f533b",
    crateA: "#6c3bb8",
    crateB: "#4c2a86",
    regA: "#3b3b3b",
    regB: "#2a2a2a",
    plantA: "#3bb86b",
    plantB: "#2a8a50",
  };

  // base
  if (id === T.FLOOR) {
    const c1 = ((x / TILE + y / TILE) % 2 === 0) ? col.floorA : col.floorB;
    b.fillStyle = c1;
    b.fillRect(x, y, TILE, TILE);
    // tiny speckle
    b.fillStyle = "rgba(255,255,255,0.08)";
    b.fillRect(x + 3, y + 4, 1, 1);
    b.fillRect(x + 11, y + 9, 1, 1);
    return;
  }

  if (id === T.RUG) {
    const c1 = ((x / TILE + y / TILE) % 2 === 0) ? col.rugA : col.rugB;
    b.fillStyle = c1;
    b.fillRect(x, y, TILE, TILE);
    b.fillStyle = "rgba(87,255,147,0.14)";
    b.fillRect(x + 2, y + 2, TILE - 4, 1);
    b.fillRect(x + 2, y + TILE - 3, TILE - 4, 1);
    return;
  }

  if (id === T.WALL) {
    b.fillStyle = col.wallA;
    b.fillRect(x, y, TILE, TILE);
    b.fillStyle = col.wallB;
    b.fillRect(x, y + 10, TILE, 6);
    b.fillStyle = "rgba(0,0,0,0.10)";
    b.fillRect(x, y, TILE, 1);
    return;
  }

  if (id === T.COUNTER) {
    b.fillStyle = col.counterA;
    b.fillRect(x, y, TILE, TILE);
    b.fillStyle = col.counterB;
    b.fillRect(x, y + 9, TILE, 7);
    b.fillStyle = col.shadow;
    b.fillRect(x, y + 15, TILE, 1);
    return;
  }

  if (id === T.SHELF_BASE) {
    b.fillStyle = col.shelfA;
    b.fillRect(x, y, TILE, TILE);
    b.fillStyle = col.shelfB;
    b.fillRect(x, y + 9, TILE, 7);
    // little "spines"
    b.fillStyle = "rgba(255,255,255,0.18)";
    b.fillRect(x + 3, y + 3, 2, 5);
    b.fillRect(x + 7, y + 3, 2, 5);
    b.fillRect(x + 11, y + 3, 2, 5);
    return;
  }

  if (id === T.CRATE) {
    b.fillStyle = col.crateA;
    b.fillRect(x, y, TILE, TILE);
    b.fillStyle = col.crateB;
    b.fillRect(x, y + 9, TILE, 7);
    b.fillStyle = "rgba(255,255,255,0.22)";
    b.fillRect(x + 3, y + 4, 10, 2);
    b.fillStyle = "rgba(0,0,0,0.18)";
    b.fillRect(x + 2, y + 12, 12, 1);
    return;
  }

  if (id === T.REGISTER) {
    b.fillStyle = col.regA;
    b.fillRect(x, y, TILE, TILE);
    b.fillStyle = col.regB;
    b.fillRect(x, y + 9, TILE, 7);
    // tiny screen
    b.fillStyle = "rgba(87,255,147,0.45)";
    b.fillRect(x + 4, y + 3, 8, 4);
    return;
  }

  if (id === T.PLANT) {
    // floor base behind it
    const base = ((x / TILE + y / TILE) % 2 === 0) ? col.floorA : col.floorB;
    b.fillStyle = base;
    b.fillRect(x, y, TILE, TILE);
    // pot
    b.fillStyle = "#a56b5a";
    b.fillRect(x + 5, y + 10, 6, 5);
    b.fillStyle = "#804b3e";
    b.fillRect(x + 5, y + 14, 6, 1);
    // leaves
    b.fillStyle = col.plantA;
    b.fillRect(x + 7, y + 4, 2, 6);
    b.fillRect(x + 6, y + 6, 1, 3);
    b.fillRect(x + 9, y + 6, 1, 3);
    b.fillStyle = col.plantB;
    b.fillRect(x + 7, y + 8, 2, 2);
    return;
  }

  // VOID fallback
  b.fillStyle = "#000";
  b.fillRect(x, y, TILE, TILE);
}

function drawSpriteShadow(x, y) {
  b.fillStyle = "rgba(0,0,0,0.25)";
  b.fillRect(Math.floor(x - 6), Math.floor(y + 5), 12, 3);
}

function drawPlayer() {
  const x = Math.floor(player.x);
  const y = Math.floor(player.y);

  drawSpriteShadow(x, y);

  // body
  b.fillStyle = "#e9e6ff";
  b.fillRect(x - 4, y - 6, 8, 10);

  // hat / hair
  b.fillStyle = "#6e3cff";
  b.fillRect(x - 4, y - 8, 8, 2);

  // face pixel
  b.fillStyle = "rgba(0,0,0,0.35)";
  if (player.dir === "down") b.fillRect(x - 1, y - 2, 1, 1);
  if (player.dir === "up") b.fillRect(x - 1, y - 5, 1, 1);
  if (player.dir === "left") b.fillRect(x - 3, y - 3, 1, 1);
  if (player.dir === "right") b.fillRect(x + 2, y - 3, 1, 1);

  // carry bubble
  if (player.carry > 0) {
    b.fillStyle = "rgba(0,0,0,0.55)";
    b.fillRect(x - 10, y - 18, 20, 10);
    b.fillStyle = "rgba(87,255,147,0.90)";
    b.font = "bold 8px system-ui";
    b.textAlign = "center";
    b.fillText(`${player.carry}/${player.carryMax}`, x, y - 10);
  }
}

function drawCustomer(cu, isFirst) {
  const x = Math.floor(cu.x);
  const y = Math.floor(cu.y);

  drawSpriteShadow(x, y);

  // body
  b.fillStyle = "#fff";
  b.fillRect(x - 4, y - 6, 8, 10);

  // hair
  b.fillStyle = "#222";
  b.fillRect(x - 4, y - 8, 8, 2);

  // item bubble if first in line
  if (isFirst && cu.hasItem) {
    b.fillStyle = "rgba(0,0,0,0.55)";
    b.fillRect(x + 7, y - 14, 10, 10);
    b.fillStyle = "rgba(87,255,147,0.90)";
    b.fillRect(x + 11, y - 11, 2, 2);
  }
}

// Draw shelf tops IN FRONT of sprites (Zelda layering trick)
function drawShelfFrontLips() {
  for (const s of shelves) {
    for (let i = 0; i < s.w; i++) {
      const px = (s.x + i) * TILE;
      const py = (s.y) * TILE;
      // front lip at bottom edge of shelf tile
      b.fillStyle = "rgba(0,0,0,0.18)";
      b.fillRect(px, py + 15, TILE, 1);
      b.fillStyle = "rgba(255,255,255,0.14)";
      b.fillRect(px, py + 9, TILE, 1);

      // tiny "stock lights" based on stock
      const ratio = s.cap ? (s.stock / s.cap) : 0;
      if (ratio > 0) {
        const glow = ratio > 0.5 ? "rgba(87,255,147,0.55)" : "rgba(87,255,147,0.28)";
        b.fillStyle = glow;
        b.fillRect(px + 7, py + 2, 2, 2);
      }
    }
  }
}

// -------------------- Draw World --------------------
function drawWorld() {
  // base tiles
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      drawTile(getTile(x, y), x * TILE, y * TILE);
    }
  }

  // Overlays (labels)
  // Crate arrow + label
  b.font = "bold 8px system-ui";
  b.textAlign = "center";
  b.fillStyle = "rgba(255,255,255,0.75)";
  b.fillText("CRATE", zones.crate.x * TILE + 8, zones.crate.y * TILE - 4);

  // Register label
  b.fillText("REGISTER", zones.register.x * TILE + 16, zones.register.y * TILE - 4);

  // Shelves stock numbers (tiny)
  for (let i = 0; i < shelves.length; i++) {
    const s = shelves[i];
    b.fillStyle = "rgba(255,255,255,0.70)";
    b.fillText(`${s.stock}/${s.cap}`, (s.x + Math.floor(s.w/2)) * TILE + 8, s.y * TILE - 4);
  }

  // Characters (customers behind shelf lips)
  for (let i = 0; i < queue.customers.length; i++) {
    drawCustomer(queue.customers[i], i === 0);
  }

  drawPlayer();

  // Shelf lips in front (so player can't "hide inside" shelves—only behind top edge visually)
  drawShelfFrontLips();

  // Simple vignette
  const g = b.createRadialGradient(V_W/2, V_H/2, 40, V_W/2, V_H/2, 200);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.30)");
  b.fillStyle = g;
  b.fillRect(0, 0, V_W, V_H);
}

// -------------------- Reset / Loop --------------------
function reset() {
  cash = 0;
  xp = 0;
  xpNeed = 10;
  player.x = 7 * TILE + 8;
  player.y = 9 * TILE + 8;
  player.carry = 0;
  player.carryMax = 6;
  for (const s of shelves) s.stock = 0;
  queue.customers = [];
  queue.spawnTimer = 1.2;
  autoCooldown = 0;

  toast("New day at KornDog Records.");
  syncHUD();
}

function step(dt) {
  // toast timer
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0 && toastEl) toastEl.classList.remove("show");
  }

  updatePlayer(dt);
  updateCustomers(dt);
  autoInteract(dt);
  syncHUD();
}

function render() {
  // clear buffer
  b.clearRect(0, 0, V_W, V_H);
  drawWorld();

  // draw buffer to screen (nearest-neighbor)
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Fit + keep aspect
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const sw = rect.width * dpr;
  const sh = rect.height * dpr;

  const scale = Math.floor(Math.min(sw / V_W, sh / V_H)); // integer scale = crisp
  const drawW = V_W * Math.max(1, scale);
  const drawH = V_H * Math.max(1, scale);
  const ox = Math.floor((sw - drawW) / 2);
  const oy = Math.floor((sh - drawH) / 2);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(buf, 0, 0, V_W, V_H, ox, oy, drawW, drawH);

  // subtle background fill around letterbox
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  if (oy > 0) {
    ctx.fillRect(0, 0, sw, oy);
    ctx.fillRect(0, oy + drawH, sw, sh - (oy + drawH));
  }
  if (ox > 0) {
    ctx.fillRect(0, 0, ox, sh);
    ctx.fillRect(ox + drawW, 0, sw - (ox + drawW), sh);
  }
}

let last = performance.now();
function loop(t) {
  const dt = Math.min(0.033, (t - last) / 1000);
  last = t;
  step(dt);
  render();
  requestAnimationFrame(loop);
}

// -------------------- Boot --------------------
reset();
requestAnimationFrame(loop);
