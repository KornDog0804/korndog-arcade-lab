// ======================================
// KornDog Records — Idle Tycoon (v1)
// Walk -> Pickup -> Stock -> Auto-buy
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
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const dist2 = (ax,ay,bx,by)=>{ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; };

function showToast(msg){
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=>toast.classList.remove("show"), 900);
}

function money(n){ return `$${Math.floor(n).toLocaleString()}`; }

// ---------- game state ----------
let cash = 0;
let xp = 0;
let xpNeed = 5;

let last = performance.now();
let keys = new Set();

// “feel like mobile idle games”
let task = "PICKUP"; // PICKUP -> SHELF -> SELL (auto)
setTask("PICKUP");

function setTask(t){
  task = t;
  if (t === "PICKUP"){
    taskIcon.textContent = "📦";
    taskText.textContent = "Pick up records";
  } else if (t === "SHELF"){
    taskIcon.textContent = "🧱";
    taskText.textContent = "Put records on shelf";
  }
}

// ---------- world objects ----------
const player = {
  x: W*0.5,
  y: H*0.72,
  r: 14,
  speed: 155,
  carry: 0,
  carryMax: 4,
};

const crate = { x: W*0.22, y: H*0.40, r: 22 };
const shelf = { x: W*0.72, y: H*0.44, r: 26, stock: 0, stockMax: 12 };
const register = { x: W*0.58, y: H*0.28, r: 24 };

let customerTimer = 0;
let customerInterval = 2.8; // seconds (auto-buy loop)
let autoSaleValue = 6;

// ---------- input (mobile drag + WASD) ----------
let dragging = false;
let dragStart = null;
let dragVec = {x:0,y:0};

canvas.addEventListener("pointerdown", (e)=>{
  dragging = true;
  const rect = canvas.getBoundingClientRect();
  dragStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  dragVec = {x:0,y:0};
});

canvas.addEventListener("pointermove", (e)=>{
  if (!dragging) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  dragVec.x = x - dragStart.x;
  dragVec.y = y - dragStart.y;
});

canvas.addEventListener("pointerup", ()=>{
  dragging = false;
  dragStart = null;
  dragVec = {x:0,y:0};
});

canvas.addEventListener("pointercancel", ()=>{
  dragging = false;
  dragStart = null;
  dragVec = {x:0,y:0};
});

window.addEventListener("keydown", (e)=> keys.add(e.key.toLowerCase()));
window.addEventListener("keyup", (e)=> keys.delete(e.key.toLowerCase()));

// tap station to interact (works great on phone)
canvas.addEventListener("click", (e)=>{
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (W / rect.width);
  const y = (e.clientY - rect.top) * (H / rect.height);

  // if tapped near a station, attempt interact
  if (dist2(x,y,crate.x,crate.y) < (crate.r+26)**2) interact("crate");
  else if (dist2(x,y,shelf.x,shelf.y) < (shelf.r+28)**2) interact("shelf");
  else if (dist2(x,y,register.x,register.y) < (register.r+28)**2) interact("register");
});

function addXP(n=1){
  xp += n;
  if (xp >= xpNeed){
    xp -= xpNeed;
    xpNeed = Math.round(xpNeed * 1.35 + 1);
    showToast("⭐ Level up! (+carry soon)");
    // small progression rewards
    if (player.carryMax < 8) player.carryMax += 1;
    autoSaleValue += 1;
    customerInterval = Math.max(1.5, customerInterval - 0.12);
  }
  xpNowEl.textContent = String(xp);
  xpNeedEl.textContent = String(xpNeed);
  xpFill.style.width = `${Math.round((xp/xpNeed)*100)}%`;
}

function addCash(n){
  cash += n;
  cashEl.textContent = money(cash);
}

// ---------- interactions ----------
function interact(which){
  const near = (obj)=> dist2(player.x,player.y,obj.x,obj.y) <= (obj.r + player.r + 12) ** 2;

  if (which === "crate"){
    if (!near(crate)) return showToast("Get closer to the crate");
    if (player.carry >= player.carryMax) return showToast("Hands full");

    const grab = Math.min(2, player.carryMax - player.carry); // quick pickup feel
    player.carry += grab;
    showToast(`Picked up ${grab} record${grab>1?"s":""}`);
    addXP(1);

    if (player.carry > 0) setTask("SHELF");
    return;
  }

  if (which === "shelf"){
    if (!near(shelf)) return showToast("Get closer to the shelf");
    if (player.carry <= 0) return showToast("You’re carrying nothing");
    if (shelf.stock >= shelf.stockMax) return showToast("Shelf is full");

    const place = Math.min(player.carry, shelf.stockMax - shelf.stock);
    shelf.stock += place;
    player.carry -= place;
    showToast(`Stocked ${place} on shelf`);
    addXP(1);

    if (player.carry === 0) setTask("PICKUP");
    return;
  }

  if (which === "register"){
    if (!near(register)) return showToast("Get closer to the register");
    showToast("Register runs auto-sales when shelf has stock");
  }
}

// ---------- update ----------
function step(dt){
  // movement
  let vx = 0, vy = 0;

  // keyboard
  if (keys.has("a") || keys.has("arrowleft")) vx -= 1;
  if (keys.has("d") || keys.has("arrowright")) vx += 1;
  if (keys.has("w") || keys.has("arrowup")) vy -= 1;
  if (keys.has("s") || keys.has("arrowdown")) vy += 1;

  // drag joystick
  if (dragging){
    const len = Math.hypot(dragVec.x, dragVec.y);
    if (len > 8){
      vx += dragVec.x / Math.max(60, len);
      vy += dragVec.y / Math.max(60, len);
    }
  }

  // normalize
  const mag = Math.hypot(vx, vy) || 1;
  vx /= mag; vy /= mag;

  player.x = clamp(player.x + vx * player.speed * dt, 26, W-26);
  player.y = clamp(player.y + vy * player.speed * dt, 60, H-26);

  // auto customers buying if stock exists
  customerTimer += dt;
  if (customerTimer >= customerInterval){
    customerTimer = 0;
    if (shelf.stock > 0){
      shelf.stock -= 1;
      addCash(autoSaleValue);
      addXP(1);
      showToast(`💸 Sale! +$${autoSaleValue}`);
    }
  }

  // keep HUD cash synced
  cashEl.textContent = money(cash);
}

// ---------- draw ----------
function draw(){
  ctx.clearRect(0,0,W,H);

  // floor grid
  ctx.globalAlpha = 0.10;
  for (let y=80; y<H; y+=36){
    for (let x=0; x<W; x+=36){
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x+10, y+10, 2, 2);
    }
  }
  ctx.globalAlpha = 1;

  // big room panel
  roundRect(18, 86, W-36, H-120, 22, "rgba(0,0,0,.18)", "rgba(255,255,255,.10)");

  // stations
  drawStation(crate.x, crate.y, crate.r, "Crate", `Carry: ${player.carry}/${player.carryMax}`, "rgba(124,60,255,.22)");
  drawStation(shelf.x, shelf.y, shelf.r, "Shelf", `Stock: ${shelf.stock}/${shelf.stockMax}`, "rgba(87,255,147,.18)");
  drawStation(register.x, register.y, register.r, "Register", `Auto: $${autoSaleValue}`, "rgba(255,255,255,.10)");

  // guidance arrow (like your screenshot)
  const target = (task === "PICKUP") ? crate : shelf;
  drawArrow(target.x, target.y - target.r - 22);

  // player
  drawPlayer();

  // carry bubbles
  if (player.carry > 0){
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.beginPath();
    ctx.roundRect(player.x - 20, player.y - 44, 40, 20, 10);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.font = "900 12px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${player.carry}/${player.carryMax}`, player.x, player.y - 34);
  }

  // bottom hint bar inside canvas
  ctx.fillStyle = "rgba(0,0,0,.22)";
  ctx.beginPath();
  ctx.roundRect(24, H-66, W-48, 42, 16);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.78)";
  ctx.font = "800 12px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Tap crate/shelf to interact • Auto-sales happen when shelf has stock", W/2, H-45);
}

function drawPlayer(){
  // shadow
  ctx.fillStyle = "rgba(0,0,0,.22)";
  ctx.beginPath();
  ctx.ellipse(player.x, player.y + 12, 18, 8, 0, 0, Math.PI*2);
  ctx.fill();

  // body
  const grad = ctx.createRadialGradient(player.x-6, player.y-8, 6, player.x, player.y, 24);
  grad.addColorStop(0, "rgba(255,255,255,.90)");
  grad.addColorStop(1, "rgba(255,255,255,.18)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.r, 0, Math.PI*2);
  ctx.fill();

  // hat (kornish)
  ctx.fillStyle = "rgba(124,60,255,.75)";
  ctx.beginPath();
  ctx.roundRect(player.x-14, player.y-20, 28, 10, 6);
  ctx.fill();
}

function drawStation(x,y,r,title,sub,glow){
  // glow
  const g = ctx.createRadialGradient(x,y,2,x,y,r*2.2);
  g.addColorStop(0, glow);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x,y,r*2.0,0,Math.PI*2);
  ctx.fill();

  // base
  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.beginPath();
  ctx.arc(x,y,r,0,Math.PI*2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,.22)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x,y,r-3,0,Math.PI*2);
  ctx.stroke();

  // label
  ctx.fillStyle = "rgba(0,0,0,.30)";
  ctx.beginPath();
  ctx.roundRect(x-56, y+r+10, 112, 34, 12);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.font = "900 12px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(title, x, y+r+14);

  ctx.fillStyle = "rgba(255,255,255,.70)";
  ctx.font = "800 11px system-ui";
  ctx.fillText(sub, x, y+r+28);
}

function drawArrow(x,y){
  ctx.save();
  ctx.translate(x,y);
  const bob = Math.sin(performance.now()*0.004)*6;

  ctx.fillStyle = "rgba(87,255,147,.95)";
  ctx.beginPath();
  ctx.moveTo(0, bob);
  ctx.lineTo(-18, bob-18);
  ctx.lineTo(-6, bob-18);
  ctx.lineTo(-6, bob-40);
  ctx.lineTo(6, bob-40);
  ctx.lineTo(6, bob-18);
  ctx.lineTo(18, bob-18);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function roundRect(x,y,w,h,r,fill,stroke){
  ctx.beginPath();
  ctx.roundRect(x,y,w,h,r);
  if (fill){
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke){
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

// ---------- loop ----------
function loop(t){
  const dt = Math.min(0.033, (t-last)/1000);
  last = t;
  step(dt);
  draw();
  requestAnimationFrame(loop);
}

// init HUD
cashEl.textContent = money(cash);
xpNowEl.textContent = String(xp);
xpNeedEl.textContent = String(xpNeed);
xpFill.style.width = "0%";

showToast("Pick up records to start!");
requestAnimationFrame(loop);
