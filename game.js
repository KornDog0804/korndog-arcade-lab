import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const canvas = document.getElementById("game");

// HUD
const xpFill = document.getElementById("xpFill");
const xpText = document.getElementById("xpText");
const cashEl = document.getElementById("cash");
const toastEl = document.getElementById("toast");

const actionBubble = document.getElementById("actionBubble");
const actionIcon = document.getElementById("actionIcon");
const actionText = document.getElementById("actionText");
const bigArrow = document.getElementById("bigArrow");
const infinityHelp = document.getElementById("infinityHelp");

// Settings
const btnSettings = document.getElementById("btnSettings");
const btnCloseSettings = document.getElementById("btnCloseSettings");
const settingsPanel = document.getElementById("settingsPanel");
const btnMusic = document.getElementById("btnMusic");
const btnRestart = document.getElementById("btnRestart");

// Helpers
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const rand = (a,b)=>Math.random()*(b-a)+a;

let toastTimer=0;
function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  toastTimer = 1.25;
}

// ---------- Audio ----------
let audioCtx=null, musicOn=false, musicTimer=null;
function ensureAudio(){
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return null;
  if(!audioCtx) audioCtx = new AC();
  if(audioCtx.state==="suspended") audioCtx.resume().catch(()=>{});
  return audioCtx;
}
function midiToFreq(m){ return 440 * Math.pow(2,(m-69)/12); }
function playTone({type="triangle", freq=440, dur=0.12, vol=0.05, when=0, lp=8000}){
  const ac=ensureAudio(); if(!ac) return;
  const t0=ac.currentTime+when;
  const osc=ac.createOscillator(); osc.type=type; osc.frequency.setValueAtTime(freq,t0);
  const g=ac.createGain();
  g.gain.setValueAtTime(0.0001,t0);
  g.gain.linearRampToValueAtTime(vol,t0+0.01);
  g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
  const f=ac.createBiquadFilter(); f.type="lowpass"; f.frequency.setValueAtTime(lp,t0);
  osc.connect(f); f.connect(g); g.connect(ac.destination);
  osc.start(t0); osc.stop(t0+dur+0.02);
}
function sfxPickup(){ playTone({type:"square", freq:880, dur:0.05, vol:0.035, lp:6500}); }
function sfxPlace(){ playTone({type:"triangle", freq:520, dur:0.08, vol:0.04, lp:5000}); }
function sfxCash(){
  playTone({type:"square", freq:988, dur:0.06, vol:0.04, lp:7000});
  playTone({type:"square", freq:1175, dur:0.08, vol:0.03, when:0.03, lp:7000});
}
function startMusic(){
  if(musicTimer) return;
  const bpm=96, stepDur=60/bpm/4;
  let step=0;
  const chord=[57,60,64,60,57,60,64,67];
  const bass=[45,null,null,null,43,null,null,null];
  const lead=[69,null,67,null,69,null,72,null,71,null,69,null,67,null,64,null];
  musicTimer=setInterval(()=>{
    if(!musicOn) return;
    playTone({type:"triangle", freq:midiToFreq(chord[step%chord.length]), dur:stepDur*0.85, vol:0.018, lp:5200});
    const bn=bass[step%bass.length];
    if(bn!=null) playTone({type:"square", freq:midiToFreq(bn), dur:stepDur*2.8, vol:0.028, lp:2200});
    const ln=lead[step%lead.length];
    if(ln!=null) playTone({type:"sine", freq:midiToFreq(ln), dur:stepDur*1.1, vol:0.016, lp:4800});
    step++;
  }, stepDur*1000);
}
function stopMusic(){ if(musicTimer) clearInterval(musicTimer); musicTimer=null; }
function toggleMusic(force){
  ensureAudio();
  musicOn = typeof force==="boolean" ? force : !musicOn;
  if(musicOn) startMusic(); else stopMusic();
  btnMusic.textContent = musicOn ? "⏸ Music" : "▶ Music";
}

// Settings panel
function openSettings(open){
  const on = typeof open==="boolean" ? open : !settingsPanel.classList.contains("open");
  settingsPanel.classList.toggle("open", on);
  settingsPanel.setAttribute("aria-hidden", on ? "false" : "true");
}
btnSettings.addEventListener("click", ()=>openSettings(true));
btnCloseSettings.addEventListener("click", ()=>openSettings(false));
settingsPanel.addEventListener("click",(e)=>{ if(e.target===settingsPanel) openSettings(false); });
btnMusic.addEventListener("click", ()=>toggleMusic());
btnRestart.addEventListener("click", ()=>reset());

// ---------- Game state ----------
const state = {
  cash:0,
  xp:0,
  xpNeed:5,
  carry:0,
  carryMax:4,
  shelves:[
    {stock:0, cap:6},
    {stock:0, cap:6},
    {stock:0, cap:8},
  ],
  customers:[],
  spawnTimer:1.0,
};

const totalShelfStock = ()=>state.shelves.reduce((a,s)=>a+s.stock,0);
function syncHUD(){
  cashEl.textContent = `$${state.cash}`;
  const pct = clamp((state.xp/state.xpNeed)*100,0,100);
  xpFill.style.width = `${pct}%`;
  xpText.textContent = `${state.xp}/${state.xpNeed}`;
}
function gainXP(n){
  state.xp += n;
  if(state.xp >= state.xpNeed){
    state.xp -= state.xpNeed;
    state.xpNeed = Math.floor(state.xpNeed*1.35)+1;
    toast("LEVEL UP! ⭐");
    if(state.carryMax < 10 && Math.random() < 0.7){
      state.carryMax += 1;
      toast(`Carry +1 (now ${state.carryMax})`);
    }
  }
  syncHUD();
}

// ---------- Scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();

// Ortho camera (tycoon feel)
const camera = new THREE.OrthographicCamera(-8, 8, 12, -12, 0.1, 200);
camera.position.set(14, 18, 14);
camera.lookAt(0, 0, 0);

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const sun = new THREE.DirectionalLight(0xffffff, 0.85);
sun.position.set(20, 30, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(1024,1024);
sun.shadow.camera.left = -25;
sun.shadow.camera.right = 25;
sun.shadow.camera.top = 25;
sun.shadow.camera.bottom = -25;
scene.add(sun);

// Materials
const matTileA = new THREE.MeshLambertMaterial({ color: 0xdaf0ff });
const matTileB = new THREE.MeshLambertMaterial({ color: 0xc7e3ff });
const matShelf = new THREE.MeshLambertMaterial({ color: 0xead7c6 });
const matShelfTop = new THREE.MeshLambertMaterial({ color: 0xf3e6dc });
const matCrate = new THREE.MeshLambertMaterial({ color: 0x57ff93 });
const matRegister = new THREE.MeshLambertMaterial({ color: 0x7c3cff });
const matPlayer = new THREE.MeshLambertMaterial({ color: 0xff4d4d });
const matCap = new THREE.MeshLambertMaterial({ color: 0xff2f2f });
const matCustomer = new THREE.MeshLambertMaterial({ color: 0xffffff });

// Floor tiles
const floorGroup = new THREE.Group();
scene.add(floorGroup);

const tileSize = 2;
const tilesX = 8;
const tilesZ = 10;

for(let x=0; x<tilesX; x++){
  for(let z=0; z<tilesZ; z++){
    const tile = new THREE.Mesh(
      new THREE.BoxGeometry(tileSize, 0.2, tileSize),
      ((x+z)%2===0) ? matTileA : matTileB
    );
    tile.position.set((x - tilesX/2)*tileSize + tileSize/2, -0.1, (z - tilesZ/2)*tileSize + tileSize/2);
    tile.receiveShadow = true;
    tile.name = "floor";
    floorGroup.add(tile);
  }
}

// Walls
const wallMat = new THREE.MeshLambertMaterial({ color: 0xf7f7f7 });
const wall1 = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 22), wallMat);
wall1.position.set(9.5, 2, 0);
wall1.castShadow = true; wall1.receiveShadow=true;
scene.add(wall1);

const wall2 = new THREE.Mesh(new THREE.BoxGeometry(22, 4, 2), wallMat);
wall2.position.set(0, 2, -11.5);
wall2.castShadow = true; wall2.receiveShadow=true;
scene.add(wall2);

// Stations
function box(name,x,y,z,w,h,d,mat){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  m.position.set(x,y,z);
  m.castShadow=true;
  m.receiveShadow=true;
  m.name=name;
  scene.add(m);
  return m;
}

const crate = box("crate", -6.5, 0.6, 6.5, 2.2, 1.2, 2.2, matCrate);
const register = box("register", 6.2, 0.7, 5.2, 3.2, 1.4, 2.2, matRegister);

const shelfMeshes = [
  box("shelf0", -6.0, 0.7, -8.6, 4.2, 1.4, 1.6, matShelf),
  box("shelf1",  0.0, 0.7, -8.6, 4.8, 1.4, 1.6, matShelf),
  box("shelf2",  6.0, 0.7, -8.6, 4.2, 1.4, 1.6, matShelf),
];
shelfMeshes.forEach(s=>{
  const top = new THREE.Mesh(new THREE.BoxGeometry(s.geometry.parameters.width, 0.25, s.geometry.parameters.depth), matShelfTop);
  top.position.set(s.position.x, s.position.y + 0.85, s.position.z);
  top.castShadow=true; top.receiveShadow=true;
  scene.add(top);
});

// Player
const player = {
  pos: new THREE.Vector3(0,0,2),
  target: null,
  speed: 6.5,
};

const playerBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.8, 6, 12), matPlayer);
playerBody.position.set(player.pos.x, 0.95, player.pos.z);
playerBody.castShadow=true;
scene.add(playerBody);

const playerHat = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 16), matCap);
playerHat.position.set(player.pos.x, 1.55, player.pos.z);
playerHat.castShadow=true;
scene.add(playerHat);

// Customers + queue
const customerGroup = new THREE.Group();
scene.add(customerGroup);

const queueSpots = [
  new THREE.Vector3(4.9,0,3.6),
  new THREE.Vector3(3.9,0,2.8),
  new THREE.Vector3(2.9,0,2.0),
  new THREE.Vector3(1.9,0,1.2),
];

function spawnCustomer(){
  if(state.customers.length >= queueSpots.length) return;
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.7, 5, 10), matCustomer);
  mesh.position.set(-8.0 + rand(-0.4,0.4), 0.85, 9.2 + rand(-0.4,0.4));
  mesh.castShadow=true;
  customerGroup.add(mesh);
  state.customers.push({ mesh, speed: rand(2.2, 2.8) });
}

function canAttractCustomers(){ return totalShelfStock() > 0; }

function updateCustomers(dt){
  state.spawnTimer -= dt;
  if(state.spawnTimer <= 0){
    state.spawnTimer = rand(1.2, 2.2);
    if(canAttractCustomers()) spawnCustomer();
  }

  for(let i=0;i<state.customers.length;i++){
    const cu = state.customers[i];
    const tgt = queueSpots[i];
    const p = cu.mesh.position;

    const dx = tgt.x - p.x;
    const dz = tgt.z - p.z;
    const d = Math.hypot(dx,dz);
    if(d > 0.03){
      p.x += (dx/d) * cu.speed * dt;
      p.z += (dz/d) * cu.speed * dt;
    }
  }
}

// Shelf “record stacks”
const stacks = shelfMeshes.map((s,i)=>{
  const g = new THREE.Group();
  g.position.set(s.position.x, s.position.y + 1.05, s.position.z + 0.4);
  scene.add(g);
  return g;
});

function rebuildStacks(){
  stacks.forEach((g,i)=>{
    while(g.children.length) g.remove(g.children[0]);
    const n = state.shelves[i].stock;
    for(let k=0;k<n;k++){
      const piece = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28,0.28,0.18,16),
        new THREE.MeshLambertMaterial({ color:0x7c3cff })
      );
      piece.position.set((k%4)*0.35 - 0.5, Math.floor(k/4)*0.2, 0);
      piece.castShadow=true;
      g.add(piece);
    }
  });
}

// Proximity + interactions
function near(obj, dist=2.05){
  const dx = player.pos.x - obj.position.x;
  const dz = player.pos.z - obj.position.z;
  return (dx*dx + dz*dz) <= dist*dist;
}

function interactCrate(){
  if(state.carry >= state.carryMax){ toast("Bag full."); return; }
  const take = Math.min(2, state.carryMax - state.carry);
  state.carry += take;
  sfxPickup();
  gainXP(1);
  toast(`Picked up ${take} record${take>1?"s":""}`);
}
function interactShelf(idx){
  if(state.carry <= 0){ toast("No records to stock."); return; }
  const shelf = state.shelves[idx];
  const space = shelf.cap - shelf.stock;
  if(space <= 0){ toast("Shelf full."); return; }
  const put = Math.min(space, state.carry);
  shelf.stock += put;
  state.carry -= put;
  sfxPlace();
  gainXP(put>=3 ? 2 : 1);
  rebuildStacks();
  toast(`Stocked +${put}`);
}
function takeFromAnyShelf(){
  for(const s of state.shelves){
    if(s.stock>0){ s.stock -= 1; return true; }
  }
  return false;
}
function interactRegister(){
  if(state.customers.length === 0){ toast("No customers."); return; }
  if(!takeFromAnyShelf()){ toast("Out of stock."); return; }

  const pay = Math.floor(rand(14, 28));
  state.cash += pay;
  sfxCash();
  gainXP(2);
  rebuildStacks();

  const first = state.customers.shift();
  customerGroup.remove(first.mesh);
  first.mesh.geometry.dispose();

  toast(`+$${pay}`);
}

// ---------- AUTO-INTERACT (walk into zone) ----------
let autoCooldown = 0;
function autoInteract(dt){
  autoCooldown -= dt;
  if(autoCooldown > 0) return;

  // Priority: register (if customers), shelf (if carrying), crate (if empty)
  if(near(register) && state.customers.length > 0){
    interactRegister();
    autoCooldown = 0.35;
    return;
  }

  // If carrying, stock nearest shelf with space
  if(state.carry > 0){
    let best = -1;
    let bestD = 999;
    for(let i=0;i<shelfMeshes.length;i++){
      const s = shelfMeshes[i];
      const hasSpace = state.shelves[i].stock < state.shelves[i].cap;
      if(!hasSpace) continue;
      const dx = player.pos.x - s.position.x;
      const dz = player.pos.z - s.position.z;
      const d = dx*dx + dz*dz;
      if(d < bestD){ bestD = d; best = i; }
    }
    if(best !== -1 && near(shelfMeshes[best], 2.1)){
      interactShelf(best);
      autoCooldown = 0.35;
      return;
    }
  }

  // If empty AND shelves empty, crate
  if(state.carry === 0 && totalShelfStock() === 0 && near(crate)){
    interactCrate();
    autoCooldown = 0.35;
  }
}

// ---------- Big UI bubble + arrow logic ----------
function showAction(icon, text){
  actionIcon.textContent = icon;
  actionText.textContent = text;
  actionBubble.classList.add("show");
}
function hideAction(){ actionBubble.classList.remove("show"); }

// Make arrow point to target station in screen-space
function pointArrowTo(obj){
  const v = obj.position.clone();
  v.y += 1.2;
  v.project(camera);

  const x = (v.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-v.y * 0.5 + 0.5) * window.innerHeight;

  bigArrow.style.left = `${Math.round(x)}px`;
  bigArrow.style.top = `${Math.round(y - 70)}px`;
  bigArrow.classList.add("show");
}

function updateGuides(){
  // Hide infinity help once player moved once
  if(playerHasMoved && infinityHelp) infinityHelp.style.display = "none";

  const anySpace = state.shelves.some((s)=>s.stock < s.cap);

  if(state.carry === 0 && totalShelfStock() === 0){
    showAction("💿","Pick up records");
    pointArrowTo(crate);
    return;
  }

  if(state.carry > 0 && anySpace){
    showAction("📚","Put record on shelf");
    // point to nearest shelf
    let best = shelfMeshes[0], bestD = 999;
    for(const s of shelfMeshes){
      const dx = player.pos.x - s.position.x;
      const dz = player.pos.z - s.position.z;
      const d = dx*dx + dz*dz;
      if(d<bestD){ bestD=d; best=s; }
    }
    pointArrowTo(best);
    return;
  }

  if(state.customers.length > 0){
    showAction("🧾","Check out customers");
    pointArrowTo(register);
    return;
  }

  hideAction();
  bigArrow.classList.remove("show");
}

// ---------- Movement (Infinity / tap anywhere to walk) ----------
const keys = new Set();
window.addEventListener("keydown",(e)=>{ ensureAudio(); keys.add(e.key.toLowerCase()); });
window.addEventListener("keyup",(e)=>keys.delete(e.key.toLowerCase()));

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function setPointer(e){
  const r = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left)/r.width)*2-1;
  pointer.y = -(((e.clientY - r.top)/r.height)*2-1);
}
function raycast(objs){
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(objs, true);
}

// IMPORTANT: floor tiles only for walking raycast
const floorTiles = floorGroup.children;

// tap-to-walk
let playerHasMoved = false;
canvas.addEventListener("pointerdown",(e)=>{
  ensureAudio();
  setPointer(e);

  // Walk target from floor hit (ONLY floor tiles)
  const hits = raycast(floorTiles);
  if(!hits.length) return;

  const hit = hits[0];
  player.target = new THREE.Vector3(
    clamp(hit.point.x, -8.5, 8.5),
    0,
    clamp(hit.point.z, -10.5, 10.5)
  );
});

function updatePlayer(dt){
  let vx=0, vz=0;

  // keyboard still works
  const left = keys.has("arrowleft") || keys.has("a");
  const right= keys.has("arrowright")|| keys.has("d");
  const up   = keys.has("arrowup")   || keys.has("w");
  const down = keys.has("arrowdown") || keys.has("s");

  if(left) vx -= 1;
  if(right)vx += 1;
  if(up)   vz -= 1;
  if(down) vz += 1;

  const usingKeys = (Math.hypot(vx,vz) > 0.05);

  if(usingKeys){
    const len = Math.hypot(vx,vz)||1;
    vx/=len; vz/=len;
    player.pos.x += vx * player.speed * dt;
    player.pos.z += vz * player.speed * dt;
    player.target = null;
    playerHasMoved = true;
  } else if(player.target){
    const dx = player.target.x - player.pos.x;
    const dz = player.target.z - player.pos.z;
    const d = Math.hypot(dx,dz);
    if(d > 0.08){
      player.pos.x += (dx/d) * player.speed * dt;
      player.pos.z += (dz/d) * player.speed * dt;
      playerHasMoved = true;
    }
  }

  player.pos.x = clamp(player.pos.x, -8.5, 8.5);
  player.pos.z = clamp(player.pos.z, -10.5, 10.5);

  playerBody.position.set(player.pos.x, 0.95, player.pos.z);
  playerHat.position.set(player.pos.x, 1.55, player.pos.z);
}

// Resize
function resize(){
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(2, Math.floor(rect.width));
  const h = Math.max(2, Math.floor(rect.height));
  renderer.setSize(w,h,false);

  const aspect = w/h;
  const zoom = 10.5;
  camera.left = -zoom*aspect;
  camera.right = zoom*aspect;
  camera.top = zoom;
  camera.bottom = -zoom;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize, {passive:true});
resize();

// Reset
function reset(){
  state.cash=0; state.xp=0; state.xpNeed=5;
  state.carry=0; state.carryMax=4;

  state.shelves[0].stock=0;
  state.shelves[1].stock=0;
  state.shelves[2].stock=0;

  for(const cu of state.customers){
    customerGroup.remove(cu.mesh);
    cu.mesh.geometry.dispose();
  }
  state.customers = [];
  state.spawnTimer = 1.0;

  player.pos.set(0,0,2);
  player.target = null;

  playerHasMoved = false;
  if(infinityHelp) infinityHelp.style.display = "flex";

  rebuildStacks();
  syncHUD();
  toast("New day.");
}
reset();

// Main loop
let last = performance.now();
function animate(t){
  const dt = Math.min(0.033, (t-last)/1000);
  last = t;

  if(toastTimer>0){
    toastTimer -= dt;
    if(toastTimer<=0) toastEl.classList.remove("show");
  }

  updatePlayer(dt);
  updateCustomers(dt);
  autoInteract(dt);
  updateGuides();
  syncHUD();

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
