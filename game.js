// ======================================
// KornDog Records — Idle Tycoon (V2)
// Better visuals + customers + real stations
// Full copy/paste game.js
// ======================================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const cashEl = document.getElementById("cash");
const xpFill = document.getElementById("xpFill");
const xpNowEl = document.getElementById("xpNow");
const xpNeedEl = document.getElementById("xpNeed");
const taskText = document.getElementById("taskText");
const taskIcon = document.getElementById("taskIcon");
const toast = document.getElementById("toast");

const W = canvas.width;
const H = canvas.height;

// ---------- helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("show"), 900);
}

function money(n) { return `$${Math.floor(n).toLocaleString()}`; }

// ---------- progression ----------
let cash = 0;
let xp = 0;
let xpNeed = 5;

// task chain like idle games
const TASKS = [
  { icon: "📦", text: "Pick up records", need: 1 },
  { icon: "🧱", text: "Stock the shelf", need: 1 },
  { icon: "🧾", text: "Sell at the register", need: 1 },
  { icon: "📦", text: "Pick up more records", need: 2 },
  { icon: "🧱", text: "Fill the shelf", need: 2 },
];
let taskIndex = 0;
let taskProgress = 0;

function setTask(i) {
  taskIndex = clamp(i, 0, TASKS.length - 1);
  taskProgress = 0;
  taskIcon.textContent = TASKS[taskIndex].icon;
  taskText.textContent = TASKS[taskIndex].text;
}

function bumpTask(n = 1) {
  taskProgress += n;
  if (taskProgress >= TASKS[taskIndex].need) {
    setTask(taskIndex + 1);
    addXP(1);
    showToast("⭐ Objective complete!");
  }
}

// ---------- game state ----------
let last = performance.now();
let keys = new Set();

// camera follows player
const cam = { x: 0, y: 0, shake: 0 };

// mobile joystick
let dragging = false;
let dragStart = null;
let dragVec = { x: 0, y: 0 };

canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  const rect = canvas.getBoundingClientRect();
  dragStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  dragVec = { x: 0, y: 0 };
});
canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  dragVec.x = x - dragStart.x;
  dragVec.y = y - dragStart.y;
});
canvas.addEventListener("pointerup", () => { dragging = false; dragStart = null; dragVec = { x: 0, y: 0 }; });
canvas.addEventListener("pointercancel", () => { dragging = false; dragStart = null; dragVec = { x: 0, y: 0 }; });

window.addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

// ---------- world (bigger than canvas) ----------
const world = { w: 980, h: 980 };

// room bounds
const room = { x: 120, y: 160, w: 740, h: 640 };

// stations (rects feel more “real”)
const crate = { x: room.x + 120, y: room.y + 170, w: 74, h: 54, type: "crate" };
const shelf = { x: room.x + 520, y: room.y + 160, w: 130, h: 78, type: "shelf", stock: 0, stockMax: 18 };
const register = { x: room.x + 420, y: room.y + 420, w: 160, h: 70, type: "register", line: 0 };

const stations = [crate, shelf, register];

const player = {
  x: room.x + 260,
  y: room.y + 480,
  speed: 210,
  carry: 0,
  carryMax: 6,
  dir: 1, // 1 right, -1 left
};

// customers
let customers = [];
let customerSpawn = 0;
let customerInterval = 2.6;
let saleValue = 7;

// ---------- hud ----------
function addCash(n) {
  cash += n;
  cashEl.textContent = money(cash);
}

function addXP(n = 1) {
  xp += n;
  if (xp >= xpNeed) {
    xp -= xpNeed;
    xpNeed = Math.round(xpNeed * 1.35 + 1);
    showToast("🔥 Level up!");
    if (player.carryMax < 10) player.carryMax += 1;
    saleValue += 1;
    customerInterval = Math.max(1.5, customerInterval - 0.12);
  }
  xpNowEl.textContent = String(xp);
  xpNeedEl.textContent = String(xpNeed);
  xpFill.style.width = `${Math.round((xp / xpNeed) * 100)}%`;
}

// ---------- interactions ----------
function nearRect(p, r, pad = 18) {
  const cx = clamp(p.x, r.x - pad, r.x + r.w + pad);
  const cy = clamp(p.y, r.y - pad, r.y + r.h + pad);
  return dist2(p.x, p.y, cx, cy) < (28 * 28);
}

function interact(st) {
  if (!nearRect(player, st)) return;

  if (st.type === "crate") {
    if (player.carry >= player.carryMax) return showToast("Hands full");
    const grab = Math.min(3, player.carryMax - player.carry);
    player.carry += grab;
    showToast(`Picked up ${grab} record${grab > 1 ? "s" : ""}`);
    bumpTask(1);
    return;
  }

  if (st.type === "shelf") {
    if (player.carry <= 0) return showToast("Nothing to stock");
    if (shelf.stock >= shelf.stockMax) return showToast("Shelf full");
    const place = Math.min(player.carry, shelf.stockMax - shelf.stock);
    shelf.stock += place;
    player.carry -= place;
    showToast(`Stocked ${place}`);
    bumpTask(1);
    return;
  }

  if (st.type === "register") {
    // "manual" sale if stock exists (feels like the early game)
    if (shelf.stock <= 0) return showToast("No stock to sell");
    shelf.stock -= 1;
    addCash(saleValue);
    addXP(1);
    bumpTask(1);
    cam.shake = 1;
    showToast(`💸 Sale +$${saleValue}`);
    return;
  }
}

// tap stations
canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (W / rect.width);
  const my = (e.clientY - rect.top) * (H / rect.height);
  const wx = mx + cam.x;
  const wy = my + cam.y;

  for (const st of stations) {
    if (wx >= st.x - 8 && wx <= st.x + st.w + 8 && wy >= st.y - 8 && wy <= st.y + st.h + 8) {
      interact(st);
      return;
    }
  }
});

// ---------- AI customers ----------
function spawnCustomer() {
  const c = {
    x: room.x + 40,
    y: room.y + room.h - 60,
    vx: 0,
    vy: 0,
    state: "toShelf", // toShelf -> toRegister -> leave
    t: 0,
  };
  customers.push(c);
}

function moveTo(c, tx, ty, dt) {
  const dx = tx - c.x, dy = ty - c.y;
  const d = Math.hypot(dx, dy) || 1;
  const sp = 130;
  c.x += (dx / d) * sp * dt;
  c.y += (dy / d) * sp * dt;
  return d < 10;
}

function updateCustomers(dt) {
  customerSpawn += dt;
  if (customerSpawn >= customerInterval) {
    customerSpawn = 0;
    // only spawn if there is stock potential or player is active
    if (customers.length < 5) spawnCustomer();
  }

  for (const c of customers) {
    if (c.state === "toShelf") {
      const reached = moveTo(c, shelf.x + shelf.w * 0.5, shelf.y + shelf.h + 30, dt);
      if (reached) {
        c.state = "toRegister";
      }
    } else if (c.state === "toRegister") {
      const reached = moveTo(c, register.x + register.w * 0.5, register.y + register.h + 26, dt);
      if (reached) {
        // buy if stock
        if (shelf.stock > 0) {
          shelf.stock -= 1;
          addCash(saleValue);
          addXP(1);
          cam.shake = 1;
        }
        c.state = "leave";
      }
    } else if (c.state === "leave") {
      const reached = moveTo(c, room.x - 40, room.y + room.h - 40, dt);
      if (reached) c._dead = true;
    }
  }

  customers = customers.filter(c => !c._dead);
}

// ---------- movement + camera ----------
function step(dt) {
  // input
  let vx = 0, vy = 0;
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
  vx /= mag; vy /= mag;

  if (vx !== 0) player.dir = vx > 0 ? 1 : -1;

  player.x = clamp(player.x + vx * player.speed * dt, room.x + 30, room.x + room.w - 30);
  player.y = clamp(player.y + vy * player.speed * dt, room.y + 70, room.y + room.h - 30);

  updateCustomers(dt);

  // camera follow
  const targetX = clamp(player.x - W * 0.5, 0, world.w - W);
  const targetY = clamp(player.y - H * 0.55, 0, world.h - H);

  cam.x = lerp(cam.x, targetX, 0.10);
  cam.y = lerp(cam.y, targetY, 0.10);

  // shake
  cam.shake = Math.max(0, cam.shake - dt * 2.8);
}

// ---------- draw ----------
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function draw() {
  // camera transform
  const shakeX = (Math.random() - 0.5) * 8 * cam.shake;
  const shakeY = (Math.random() - 0.5) * 8 * cam.shake;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);

  ctx.setTransform(1, 0, 0, 1, -cam.x + shakeX, -cam.y + shakeY);

  // background
  ctx.fillStyle = "rgba(0,0,0,.18)";
  ctx.fillRect(0, 0, world.w, world.h);

  // room floor tiles
  ctx.fillStyle = "rgba(255,255,255,.06)";
  rr(room.x, room.y, room.w, room.h, 22);
  ctx.fill();

  // subtle tile grid
  ctx.globalAlpha = 0.18;
  for (let y = room.y + 20; y < room.y + room.h - 20; y += 44) {
    for (let x = room.x + 20; x < room.x + room.w - 20; x += 44) {
      ctx.fillStyle = "rgba(255,255,255,.07)";
      ctx.fillRect(x, y, 2, 2);
    }
  }
  ctx.globalAlpha = 1;

  // walls
  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.lineWidth = 3;
  rr(room.x, room.y, room.w, room.h, 22);
  ctx.stroke();

  // draw stations
  for (const st of stations) drawStation(st);

  // customers (behind player if higher y)
  const entities = [
    ...customers.map(c => ({ type: "cust", y: c.y, ref: c })),
    { type: "player", y: player.y, ref: player }
  ].sort((a, b) => a.y - b.y);

  for (const e of entities) {
    if (e.type === "cust") drawCustomer(e.ref);
    else drawPlayer();
  }

  // objective arrow + glow
  const target = (TASKS[taskIndex].text.includes("Pick")) ? crate
                : (TASKS[taskIndex].text.includes("Stock")) ? shelf
                : register;

  drawObjective(target);

  // station labels
  drawLabels();

  // carry stack
  drawCarry();
}

function drawStation(st) {
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004);
  const isTarget =
    (TASKS[taskIndex].text.includes("Pick") && st.type === "crate") ||
    (TASKS[taskIndex].text.includes("Stock") && st.type === "shelf") ||
    (TASKS[taskIndex].text.includes("Sell") && st.type === "register");

  // glow highlight
  if (isTarget) {
    ctx.fillStyle = `rgba(87,255,147,${0.12 + pulse * 0.12})`;
    rr(st.x - 10, st.y - 10, st.w + 20, st.h + 20, 18);
    ctx.fill();
  }

  // base
  ctx.fillStyle = "rgba(0,0,0,.38)";
  rr(st.x, st.y, st.w, st.h, 14);
  ctx.fill();

  // top plate / accents
  ctx.fillStyle = st.type === "crate" ? "rgba(124,60,255,.55)"
              : st.type === "shelf" ? "rgba(87,255,147,.42)"
              : "rgba(255,255,255,.18)";
  rr(st.x + 8, st.y + 8, st.w - 16, 16, 10);
  ctx.fill();

  // outline
  ctx.strokeStyle = "rgba(255,255,255,.18)";
  ctx.lineWidth = 2;
  rr(st.x, st.y, st.w, st.h, 14);
  ctx.stroke();

  // shelf stock indicator
  if (st.type === "shelf") {
    ctx.fillStyle = "rgba(0,0,0,.30)";
    rr(st.x + 10, st.y + st.h - 22, st.w - 20, 14, 8);
    ctx.fill();

    const pct = st.stock / st.stockMax;
    ctx.fillStyle = "rgba(87,255,147,.80)";
    rr(st.x + 10, st.y + st.h - 22, (st.w - 20) * pct, 14, 8);
    ctx.fill();
  }
}

function drawPlayer() {
  // shadow
  ctx.fillStyle = "rgba(0,0,0,.25)";
  ctx.beginPath();
  ctx.ellipse(player.x, player.y + 16, 20, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // body (tiny character)
  // legs
  ctx.fillStyle = "rgba(255,255,255,.16)";
  rr(player.x - 8, player.y + 6, 6, 10, 3);
  ctx.fill();
  rr(player.x + 2, player.y + 6, 6, 10, 3);
  ctx.fill();

  // torso
  ctx.fillStyle = "rgba(255,255,255,.85)";
  rr(player.x - 12, player.y - 10, 24, 20, 8);
  ctx.fill();

  // head
  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.beginPath();
  ctx.arc(player.x, player.y - 18, 10, 0, Math.PI * 2);
  ctx.fill();

  // hat (KornDog vibe)
  ctx.fillStyle = "rgba(124,60,255,.85)";
  rr(player.x - 12, player.y - 32, 24, 8, 4);
  ctx.fill();

  // face direction
  ctx.fillStyle = "rgba(0,0,0,.30)";
  const ex = player.x + player.dir * 4;
  ctx.beginPath();
  ctx.arc(ex, player.y - 20, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawCustomer(c) {
  // shadow
  ctx.fillStyle = "rgba(0,0,0,.22)";
  ctx.beginPath();
  ctx.ellipse(c.x, c.y + 16, 18, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // body
  ctx.fillStyle = "rgba(255,255,255,.70)";
  rr(c.x - 11, c.y - 10, 22, 22, 10);
  ctx.fill();

  // head
  ctx.fillStyle = "rgba(255,255,255,.80)";
  ctx.beginPath();
  ctx.arc(c.x, c.y - 18, 9, 0, Math.PI * 2);
  ctx.fill();
}

function drawObjective(st) {
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.005);
  const x = st.x + st.w * 0.5;
  const y = st.y - 18;

  // arrow
  ctx.fillStyle = `rgba(87,255,147,${0.65 + pulse * 0.25})`;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - 14, y - 16);
  ctx.lineTo(x - 5, y - 16);
  ctx.lineTo(x - 5, y - 34);
  ctx.lineTo(x + 5, y - 34);
  ctx.lineTo(x + 5, y - 16);
  ctx.lineTo(x + 14, y - 16);
  ctx.closePath();
  ctx.fill();
}

function drawLabels() {
  ctx.font = "900 14px system-ui";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  // Crate label
  label(crate.x, crate.y - 26, "RECORD CRATE");
  // Shelf label
  label(shelf.x, shelf.y - 26, `SHELF ${shelf.stock}/${shelf.stockMax}`);
  // Register label
  label(register.x, register.y - 26, "REGISTER");
}

function label(x, y, text) {
  ctx.fillStyle = "rgba(0,0,0,.35)";
  rr(x, y, ctx.measureText(text).width + 18, 22, 10);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,.86)";
  ctx.fillText(text, x + 9, y + 3);
}

function drawCarry() {
  if (player.carry <= 0) return;
  // little record stack above head
  for (let i = 0; i < player.carry; i++) {
    const ox = player.x - 14 + (i % 2) * 16;
    const oy = player.y - 60 - Math.floor(i / 2) * 10;
    ctx.fillStyle = "rgba(0,0,0,.35)";
    rr(ox, oy, 14, 8, 3);
    ctx.fill();
    ctx.fillStyle = "rgba(124,60,255,.85)";
    rr(ox + 2, oy + 2, 10, 4, 2);
    ctx.fill();
  }
}

// ---------- loop ----------
function loop(t) {
  const dt = Math.min(0.033, (t - last) / 1000);
  last = t;

  // movement
  let vx = 0, vy = 0;
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
  vx /= mag; vy /= mag;

  if (vx !== 0) player.dir = vx > 0 ? 1 : -1;

  player.x = clamp(player.x + vx * player.speed * dt, room.x + 34, room.x + room.w - 34);
  player.y = clamp(player.y + vy * player.speed * dt, room.y + 90, room.y + room.h - 34);

  updateCustomers(dt);

  // camera follow
  const targetX = clamp(player.x - W * 0.5, 0, world.w - W);
  const targetY = clamp(player.y - H * 0.58, 0, world.h - H);
  cam.x = lerp(cam.x, targetX, 0.12);
  cam.y = lerp(cam.y, targetY, 0.12);
  cam.shake = Math.max(0, cam.shake - dt * 2.8);

  draw();
  requestAnimationFrame(loop);
}

// init
cashEl.textContent = money(cash);
xpNowEl.textContent = String(xp);
xpNeedEl.textContent = String(xpNeed);
xpFill.style.width = "0%";

setTask(0);
showToast("Tap the crate / shelf / register to play.");
requestAnimationFrame(loop);
