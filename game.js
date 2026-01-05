// =============================================
// KornDog Record Store — Plain Netlify (Three.js)
// Fixed front camera • move • stock • checkout
// Full copy/paste game.js (ES module)
// =============================================

import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const canvas = document.getElementById("game");

// HUD
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

// ---------- Helpers ----------
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const rand = (a,b)=>Math.random()*(b-a)+a;

let toastTimer = 0;
function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  toastTimer = 1.35;
}

// ---------- Audio (original, safe) ----------
let audioCtx = null;
let musicOn = false;
let musicTimer = null;

function ensureAudio(){
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return null;
  if(!audioCtx) audioCtx = new AC();
  if(audioCtx.state === "suspended") audioCtx.resume().catch(()=>{});
  return audioCtx;
}
function midiToFreq(m){ return 440 * Math.pow(2,(m-69)/12); }

function playTone({type="triangle", freq=440, dur=0.12, vol=0.05, when=0, lp=8000}){
  const ac = ensureAudio(); if(!ac) return;
  const t0 = ac.currentTime + when;

  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);

  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  const f = ac.createBiquadFilter();
  f.type="lowpass";
  f.frequency.setValueAtTime(lp, t0);

  osc.connect(f); f.connect(g); g.connect(ac.destination);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

function sfxPickup(){ playTone({type:"square", freq:880, dur:0.05, vol:0.035, lp:6500}); }
function sfxPlace(){ playTone({type:"triangle", freq:520, dur:0.08, vol:0.04, lp:5000}); }
function sfxCash(){
  playTone({type:"square", freq:988, dur:0.06, vol:0.04, lp:7000});
  playTone({type:"square", freq:1175, dur:0.08, vol:0.03, when:0.03, lp:7000});
}

function startMusic(){
  if(musicTimer) return;
  const bpm = 96;
  const stepDur = 60/bpm/4;
  let step = 0;

  // Original lo-fi loop (safe)
  const chord = [57, 60, 64, 60, 57, 60, 64, 67];
  const bass  = [45, null, null, null, 43, null, null, null];
  const lead  = [69, null, 67, null, 69, null, 72, null, 71, null, 69, null, 67, null, 64, null];

  musicTimer = setInterval(()=>{
    if(!musicOn) return;

    const cn = chord[step % chord.length];
    playTone({type:"triangle", freq:midiToFreq(cn), dur:stepDur*0.85, vol:0.018, lp:5200});

    const bn = bass[step % bass.length];
    if(bn != null) playTone({type:"square", freq:midiToFreq(bn), dur:stepDur*2.8, vol:0.028, lp:2200});

    const ln = lead[step % lead.length];
    if(ln != null) playTone({type:"sine", freq:midiToFreq(ln), dur:stepDur*1.1, vol:0.016, lp:4800});

    step++;
  }, stepDur*1000);
}

function stopMusic(){
  if(musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}

function toggleMusic(force){
  ensureAudio();
  musicOn = typeof force === "boolean" ? force : !musicOn;
  if(musicOn) startMusic(); else stopMusic();
  btnMusic.textContent = musicOn ? "⏸ Music" : "▶ Music";
}

// ---------- Settings panel ----------
function openSettings(open){
  const on = typeof open === "boolean" ? open : !settingsPanel.classList.contains("open");
  settingsPanel.classList.toggle("open", on);
  settingsPanel.setAttribute("aria-hidden", on ? "false" : "true");
}

btnSettings.addEventListener("click", ()=>openSettings(true));
btnCloseSettings.addEventListener("click", ()=>openSettings(false));
settingsPanel.addEventListener("click",(e)=>{ if(e.target === settingsPanel) openSettings(false); });
btnMusic.addEventListener("click", ()=>toggleMusic());
btnRestart.addEventListener("click", ()=>reset(true));

// ---------- Game state ----------
const state = {
  cash: 0,
  xp: 0,
  xpNeed: 10,
  carry: 0,
  carryMax: 6,
  shelves: [
    { stock: 0, cap: 18 },
    { stock: 0, cap: 18 },
    { stock: 0, cap: 24 },
  ],
  customers: [],
  spawnTimer: 1.0,
};

function totalShelfStock(){
  return state.shelves.reduce((a,s)=>a+s.stock,0);
}

function setTask(icon, text){
  taskIconEl.textContent = icon;
  taskTextEl.textContent = text;
}

function updateTask(){
  if(state.carry === 0 && totalShelfStock() === 0){ setTask("📦","Pick up records"); return; }
  if(totalShelfStock() === 0 && state.carry > 0){ setTask("🧱","Fill the shelves"); return; }
  if(state.customers.length > 0){ setTask("🧾","Check out customers"); return; }
  setTask("✨","Keep stocking to attract customers");
}

function syncHUD(){
  cashEl.textContent = `$${state.cash}`;
  const pct = clamp((state.xp/state.xpNeed)*100, 0, 100);
  xpFill.style.width = `${pct}%`;
  xpText.textContent = `${state.xp}/${state.xpNeed}`;
  updateTask();
}

function gainXP(n){
  state.xp += n;
  if(state.xp >= state.xpNeed){
    state.xp -= state.xpNeed;
    state.xpNeed = Math.floor(state.xpNeed*1.15)+2;
    toast("LEVEL UP! ⭐");
    if(state.carryMax < 10 && Math.random() < 0.65){
      state.carryMax += 1;
      toast(`Carry upgraded: ${state.carryMax}`);
    }
  }
}

// ---------- Three.js scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

const scene = new THREE.Scene();

// Camera: fixed “front of store”
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
camera.position.set(0, 10.5, 18.5);   // front + elevated
camera.lookAt(0, 0.6, -4.5);          // toward back

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.55));

const key = new THREE.DirectionalLight(0xffffff, 0.85);
key.position.set(8, 14, 10);
scene.add(key);

const neon1 = new THREE.PointLight(0x7c3cff, 0.9, 60);
neon1.position.set(-7, 6, -5);
scene.add(neon1);

const neon2 = new THREE.PointLight(0x57ff93, 0.8, 60);
neon2.position.set(7, 6, -7);
scene.add(neon2);

// Materials
const matFloor = new THREE.MeshStandardMaterial({ color:0x140b24, roughness:0.95, metalness:0.0 });
const matWall  = new THREE.MeshStandardMaterial({ color:0x0b1020, roughness:1.0, metalness:0.0 });
const matGlass = new THREE.MeshStandardMaterial({ color:0xffffff, roughness:0.25, metalness:0.15, transparent:true, opacity:0.22 });

const matCrate = new THREE.MeshStandardMaterial({ color:0x57ff93, roughness:0.55, metalness:0.05, emissive:0x0a2a18, emissiveIntensity:0.4 });
const matRegister = new THREE.MeshStandardMaterial({ color:0x7c3cff, roughness:0.55, metalness:0.05, emissive:0x200a44, emissiveIntensity:0.35 });
const matShelf = new THREE.MeshStandardMaterial({ color:0x1b1b1b, roughness:0.85, metalness:0.05 });
const matPlayer = new THREE.MeshStandardMaterial({ color:0xffffff, roughness:0.35, metalness:0.05, emissive:0x101010, emissiveIntensity:0.2 });
const matCust = new THREE.MeshStandardMaterial({ color:0xffffff, roughness:0.55, metalness:0.0, transparent:true, opacity:0.85 });

// Store bounds / ground
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 26), matFloor);
floor.rotation.x = -Math.PI/2;
floor.position.set(0, 0, -4);
floor.name = "floor";
scene.add(floor);

// Back wall
const backWall = new THREE.Mesh(new THREE.BoxGeometry(20, 6, 0.5), matWall);
backWall.position.set(0, 3, -17);
scene.add(backWall);

// Side walls
const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 26), matWall);
leftWall.position.set(-10, 3, -4);
scene.add(leftWall);

const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 26), matWall);
rightWall.position.set(10, 3, -4);
scene.add(rightWall);

// Soft “glass” overlays (adds depth)
const glassPanel = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), matGlass);
glassPanel.position.set(0, 4.5, 4.8);
scene.add(glassPanel);

// Stations (positions chosen so camera sees everything)
const station = {
  crate: makeBox("crate", -6.5, 0.7, -6.0, 2.8, 1.4, 2.0, matCrate),
  register: makeBox("register", 6.2, 0.8, -10.2, 4.2, 1.6, 2.4, matRegister),
  shelves: [
    makeShelf("shelf0", -6.2, 0.9, -13.8, 4.4, 1.8, 1.6),
    makeShelf("shelf1",  0.0, 0.9, -13.8, 5.2, 1.8, 1.6),
    makeShelf("shelf2",  6.2, 0.9, -13.8, 4.4, 1.8, 1.6),
  ],
};

// Labels as little “signs”
makeSign("CRATE", station.crate.position.x, 2.5, station.crate.position.z, 0x57ff93);
makeSign("REGISTER", station.register.position.x, 2.6, station.register.position.z, 0x7c3cff);
makeSign("SHELVES", 0.0, 2.8, -15.8, 0xffffff);

// Player
const player = {
  pos: new THREE.Vector3(0, 0, -6.5),
  vel: new THREE.Vector3(),
  target: null, // Vector3
  speed: 6.2,
};

const playerMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 1.25, 18), matPlayer);
playerMesh.position.copy(player.pos).add(new THREE.Vector3(0, 0.62, 0));
playerMesh.name = "player";
scene.add(playerMesh);

const playerCap = new THREE.Mesh(new THREE.SphereGeometry(0.40, 16, 16), new THREE.MeshStandardMaterial({
  color:0x7c3cff, roughness:0.35, metalness:0.05, emissive:0x220a44, emissiveIntensity:0.35
}));
playerCap.position.copy(playerMesh.position).add(new THREE.Vector3(0, 0.55, 0));
scene.add(playerCap);

// Customer queue spots (3D positions)
const queueSpots = [
  new THREE.Vector3(5.1, 0, -8.0),
  new THREE.Vector3(4.1, 0, -7.2),
  new THREE.Vector3(3.1, 0, -6.4),
  new THREE.Vector3(2.1, 0, -5.6),
];

// Customer meshes container
const customerGroup = new THREE.Group();
scene.add(customerGroup);

// ---------- Build helpers ----------
function makeBox(name, x,y,z, w,h,d, mat){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  m.position.set(x,y,z);
  m.name = name;
  scene.add(m);
  return m;
}

function makeShelf(name, x,y,z, w,h,d){
  const base = makeBox(name, x,y,z, w,h,d, matShelf);
  // front lip
  const lip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, 0.25), new THREE.MeshStandardMaterial({ color:0x2a2a2a, roughness:0.7 }));
  lip.position.set(x, y + h/2 - 0.15, z + d/2 - 0.12);
  scene.add(lip);
  return base;
}

function makeSign(text, x,y,z, color){
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 0.9), new THREE.MeshStandardMaterial({
    color:0x000000, transparent:true, opacity:0.35, roughness:0.2, metalness:0.0
  }));
  sign.position.set(x,y,z + 1.0);
  sign.rotation.y = 0;
  scene.add(sign);

  // Glow strip
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 0.08), new THREE.MeshStandardMaterial({
    color, emissive:color, emissiveIntensity:0.9, transparent:true, opacity:0.65
  }));
  glow.position.set(x, y - 0.48, z + 1.01);
  scene.add(glow);

  // No canvas text to keep simple; the sign is visual vibe. Task bar handles the words.
}

// ---------- Interactions ----------
function canAttractCustomers(){
  return totalShelfStock() > 0;
}

function spawnCustomer(){
  if(state.customers.length >= queueSpots.length) return;

  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.50, 1.05, 16), matCust);
  mesh.position.set(-7.8 + rand(-0.3,0.3), 0.55, -2.0 + rand(-0.4,0.4));
  mesh.name = "customer";
  customerGroup.add(mesh);

  state.customers.push({
    mesh,
    speed: rand(1.4, 2.1),
  });
}

function updateCustomers(dt){
  state.spawnTimer -= dt;
  if(state.spawnTimer <= 0){
    state.spawnTimer = rand(1.4, 2.6);
    if(canAttractCustomers()) spawnCustomer();
  }

  // Move each customer to their queue spot
  for(let i=0;i<state.customers.length;i++){
    const cu = state.customers[i];
    const target = queueSpots[i];
    const p = cu.mesh.position;

    const tx = target.x, tz = target.z;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);

    if(d > 0.02){
      p.x += (dx/d) * cu.speed * dt;
      p.z += (dz/d) * cu.speed * dt;
    }
  }
}

function interactCrate(){
  if(state.carry >= state.carryMax){ toast("Bag full."); return; }
  const take = Math.min(2, state.carryMax - state.carry);
  state.carry += take;
  sfxPickup();
  toast(`Picked up ${take} record${take>1?"s":""}. (${state.carry}/${state.carryMax})`);
  gainXP(1);
  syncHUD();
}

function interactShelf(index){
  if(state.carry <= 0){ toast("No records to stock."); return; }
  const shelf = state.shelves[index];
  const space = shelf.cap - shelf.stock;
  if(space <= 0){ toast("Shelf is full."); return; }

  const put = Math.min(space, state.carry);
  shelf.stock += put;
  state.carry -= put;
  sfxPlace();
  toast(`Stocked +${put}. Shelf ${shelf.stock}/${shelf.cap}`);
  gainXP(put >= 3 ? 2 : 1);
  syncHUD();
}

function takeFromAnyShelf(){
  for(const s of state.shelves){
    if(s.stock > 0){ s.stock -= 1; return true; }
  }
  return false;
}

function interactRegister(){
  if(state.customers.length === 0){ toast("No customers in line."); return; }

  const sold = takeFromAnyShelf();
  if(!sold){ toast("Out of stock! Restock shelves."); return; }

  const pay = Math.floor(rand(18, 38));
  state.cash += pay;
  sfxCash();
  toast(`Sold 1 record +$${pay}`);

  // remove first customer mesh
  const first = state.customers.shift();
  if(first?.mesh){
    customerGroup.remove(first.mesh);
    first.mesh.geometry.dispose();
    // material reused, don't dispose matCust
  }

  gainXP(2);
  syncHUD();
}

// ---------- Proximity check ----------
function near(mesh, maxDist=2.3){
  const p = player.pos;
  const m = mesh.position;
  const dx = p.x - m.x;
  const dz = p.z - m.z;
  return (dx*dx + dz*dz) <= (maxDist*maxDist);
}

// ---------- Visual shelf stock bars ----------
const stockBars = station.shelves.map((shelfMesh, i)=>{
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.12, 0.3),
    new THREE.MeshStandardMaterial({ color:0x57ff93, emissive:0x57ff93, emissiveIntensity:0.35 })
  );
  bar.position.set(shelfMesh.position.x, shelfMesh.position.y + 1.15, shelfMesh.position.z + 0.95);
  scene.add(bar);
  return bar;
});

function updateStockBars(){
  for(let i=0;i<stockBars.length;i++){
    const shelf = state.shelves[i];
    const pct = shelf.cap ? (shelf.stock / shelf.cap) : 0;
    stockBars[i].scale.x = clamp(pct * 6.0, 0.2, 6.0);
  }
}

// ---------- Input ----------
const keys = new Set();
window.addEventListener("keydown",(e)=>{
  ensureAudio();
  keys.add(e.key.toLowerCase());
  if(e.key.toLowerCase()==="m") toggleMusic();
});
window.addEventListener("keyup",(e)=>keys.delete(e.key.toLowerCase()));

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function setPointerFromEvent(e){
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  pointer.x = x * 2 - 1;
  pointer.y = -(y * 2 - 1);
}

function raycast(objects){
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(objects, true);
}

function setMoveTarget(point){
  // clamp inside floor bounds
  const tx = clamp(point.x, -8.8, 8.8);
  const tz = clamp(point.z, -15.8, 4.2);
  player.target = new THREE.Vector3(tx, 0, tz);
}

function attemptInteract(meshName){
  if(meshName === "crate"){
    if(near(station.crate)) interactCrate();
    else toast("Walk to the crate.");
    return;
  }
  if(meshName === "register"){
    if(near(station.register)) interactRegister();
    else toast("Walk to the register.");
    return;
  }
  if(meshName.startsWith("shelf")){
    const idx = parseInt(meshName.replace("shelf",""), 10);
    if(Number.isFinite(idx)){
      if(near(station.shelves[idx])) interactShelf(idx);
      else toast("Walk to a shelf.");
    }
  }
}

canvas.addEventListener("pointerdown",(e)=>{
  ensureAudio();
  canvas.setPointerCapture(e.pointerId);

  setPointerFromEvent(e);

  // Check station clicks first
  const hits = raycast([station.crate, station.register, ...station.shelves, floor]);
  if(!hits.length) return;

  const first = hits[0].object;
  const name = first.name || first.parent?.name || "";

  if(name && name !== "floor"){
    attemptInteract(name);
    return;
  }

  // Move target on floor click
  const floorHit = hits.find(h=> (h.object.name === "floor"));
  if(floorHit) setMoveTarget(floorHit.point);
});

canvas.addEventListener("pointermove",(e)=>{
  // optional: drag to set target
  if(e.buttons !== 1) return;
  setPointerFromEvent(e);
  const hits = raycast([floor]);
  if(hits[0]) setMoveTarget(hits[0].point);
});

// ---------- Movement / update ----------
function updatePlayer(dt){
  let vx=0, vz=0;
  const left = keys.has("arrowleft") || keys.has("a");
  const right= keys.has("arrowright")|| keys.has("d");
  const up   = keys.has("arrowup")   || keys.has("w");
  const down = keys.has("arrowdown") || keys.has("s");

  if(left) vx -= 1;
  if(right)vx += 1;
  if(up)   vz -= 1;
  if(down) vz += 1;

  const usingKeys = (vx!==0 || vz!==0);

  if(usingKeys){
    const len = Math.hypot(vx,vz) || 1;
    vx/=len; vz/=len;
    player.pos.x += vx * player.speed * dt;
    player.pos.z += vz * player.speed * dt;
    player.target = null;
  } else if(player.target){
    const dx = player.target.x - player.pos.x;
    const dz = player.target.z - player.pos.z;
    const d = Math.hypot(dx,dz);
    if(d > 0.08){
      const sp = player.speed * 0.88;
      player.pos.x += (dx/d) * sp * dt;
      player.pos.z += (dz/d) * sp * dt;
    }
  }

  player.pos.x = clamp(player.pos.x, -8.8, 8.8);
  player.pos.z = clamp(player.pos.z, -15.8, 4.2);

  playerMesh.position.set(player.pos.x, 0.62, player.pos.z);
  playerCap.position.set(player.pos.x, 1.17, player.pos.z);
}

// ---------- Loop ----------
let last = performance.now();

function resize(){
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(2, Math.floor(rect.width));
  const h = Math.max(2, Math.floor(rect.height));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize, { passive:true });
resize();

// ---------- Reset ----------
function reset(){
  state.cash = 0;
  state.xp = 0;
  state.xpNeed = 10;
  state.carry = 0;
  state.carryMax = 6;

  state.shelves[0].stock = 0;
  state.shelves[1].stock = 0;
  state.shelves[2].stock = 0;

  // remove customers
  for(const cu of state.customers){
    customerGroup.remove(cu.mesh);
    cu.mesh.geometry.dispose();
  }
  state.customers = [];
  state.spawnTimer = 1.0;

  player.pos.set(0,0,-6.5);
  player.target = null;

  toast("New day at KornDog Records.");
  syncHUD();
  updateStockBars();
}
reset();

// ---------- Main loop ----------
function animate(t){
  const dt = Math.min(0.033, (t - last)/1000);
  last = t;

  // toast timer
  if(toastTimer > 0){
    toastTimer -= dt;
    if(toastTimer <= 0) toastEl.classList.remove("show");
  }

  updatePlayer(dt);
  updateCustomers(dt);
  updateStockBars();

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// start HUD
syncHUD();
