// ===============================
// KornDog Arcade — Vinyl Blaster
// Full copy/paste game.js
// ===============================

const c = document.getElementById("game");
const ctx = c.getContext("2d");

const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const waveEl = document.getElementById("wave");
const btnRestart = document.getElementById("btnRestart");
const btnMusic = document.getElementById("btnMusic"); // optional (add in HTML if you want)

if (btnRestart) btnRestart.addEventListener("click", () => reset(true));

const W = c.width, H = c.height;

let keys = new Set();
let score = 0;
let lives = 3;
let wave = 1;

let last = 0;
let cooldown = 0;

// -------------------- AUDIO (ORIGINAL 8-BIT) --------------------
let audioCtx = null;
let musicOn = false;
let musicTimer = null;

function ensureAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  // some browsers start suspended until user gesture
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function playTone({ type = "square", freq = 440, dur = 0.12, vol = 0.08, when = 0, lp = 8000 }) {
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
function sfxShoot() {
  // quick zappy pew
  playTone({ type: "square", freq: 880, dur: 0.06, vol: 0.05, lp: 6500 });
  playTone({ type: "square", freq: 660, dur: 0.07, vol: 0.04, when: 0.01, lp: 6500 });
}

function sfxHit() {
  // tiny “tick” + noise-ish burst feel
  playTone({ type: "triangle", freq: 240, dur: 0.05, vol: 0.06, lp: 4000 });
  playTone({ type: "square", freq: 120, dur: 0.06, vol: 0.035, when: 0.01, lp: 2800 });
}

function sfxExplosion() {
  // punchy thump
  playTone({ type: "sine", freq: 140, dur: 0.10, vol: 0.09, lp: 2200 });
  playTone({ type: "sine", freq: 80, dur: 0.12, vol: 0.07, when: 0.02, lp: 1800 });
}

// Music loop (original)
function startMusic() {
  if (musicTimer) return;

  const bpm = 120;
  const stepDur = 60 / bpm / 4; // 16ths
  let step = 0;

  // ORIGINAL patterns (no copyrighted melodies)
  const lead = [
    76, null, 79, null, 81, null, 79, null,
    76, null, 74, null, 72, null, 74, null
  ];
  const bass = [
    40, null, null, null, 40, null, null, null,
    43, null, null, null, 43, null, null, null
  ];
  const arp = [
    64, 67, 71, 67,
    64, 67, 71, 67,
    62, 66, 69, 66,
    62, 66, 69, 66
  ];

  musicTimer = setInterval(() => {
    if (!musicOn) return;

    const ln = lead[step % lead.length];
    if (ln != null) {
      playTone({ type: "square", freq: midiToFreq(ln), dur: stepDur * 1.5, vol: 0.045, lp: 7200 });
    }

    const bn = bass[step % bass.length];
    if (bn != null) {
      playTone({ type: "square", freq: midiToFreq(bn), dur: stepDur * 2.6, vol: 0.055, lp: 2600 });
    }

    const an = arp[step % arp.length];
    playTone({ type: "triangle", freq: midiToFreq(an), dur: stepDur * 0.65, vol: 0.022, lp: 6200 });

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

// If there is a music button, hook it
if (btnMusic) btnMusic.addEventListener("click", () => toggleMusic());

// -------------------- GAME STATE --------------------
const player = {
  x: W / 2,
  y: H - 54,
  r: 16,
  vx: 0,
};

let bullets = [];
let enemies = [];
let sparks = [];

function rand(min, max) { return Math.random() * (max - min) + min; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function spawnWave(n) {
  enemies = [];
  for (let i = 0; i < n; i++) {
    enemies.push({
      x: rand(24, W - 24),
      y: rand(-H * 0.7, -30),
      r: rand(12, 18),
      vy: rand(55, 95) + wave * 6,
      hp: 1 + Math.floor(wave / 3),
      wob: rand(0.8, 1.6),
      t: rand(0, Math.PI * 2),
    });
  }
}

function pop(x, y, n = 10) {
  for (let i = 0; i < n; i++) {
    sparks.push({
      x, y,
      vx: rand(-120, 120),
      vy: rand(-140, 70),
      life: rand(0.25, 0.55),
    });
  }
}

function drawGlowCircle(x, y, r, inner, outer) {
  const g = ctx.createRadialGradient(x, y, 2, x, y, r * 2.4);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
  ctx.fill();
}

function reset(hard = false) {
  score = hard ? 0 : score;
  lives = 3;
  wave = 1;
  bullets = [];
  sparks = [];
  player.x = W / 2;
  cooldown = 0;
  spawnWave(8);
  syncHUD();
}

function syncHUD() {
  if (scoreEl) scoreEl.textContent = String(score);
  if (livesEl) livesEl.textContent = String(lives);
  if (waveEl) waveEl.textContent = String(wave);
}

function fire() {
  if (cooldown > 0) return;
  cooldown = 0.18;

  bullets.push({ x: player.x, y: player.y - 18, vy: -420, r: 4 });

  // SFX: only after user has interacted at least once
  sfxShoot();
}

// -------------------- UPDATE --------------------
function step(dt) {
  // input
  const left = keys.has("ArrowLeft") || keys.has("a");
  const right = keys.has("ArrowRight") || keys.has("d");

  player.vx = 0;
  if (left) player.vx = -240;
  if (right) player.vx = 240;
  player.x = clamp(player.x + player.vx * dt, 22, W - 22);

  cooldown = Math.max(0, cooldown - dt);

  // bullets
  bullets = bullets.filter(b => (b.y > -20));
  for (const b of bullets) b.y += b.vy * dt;

  // enemies
  for (const e of enemies) {
    e.t += dt * e.wob;
    e.y += e.vy * dt;
    e.x += Math.sin(e.t) * 30 * dt;

    // if it reaches bottom, you take a hit
    if (e.y - e.r > H + 8) {
      e.y = rand(-140, -30);
      e.x = rand(24, W - 24);
      lives -= 1;
      pop(player.x, player.y, 16);
      sfxExplosion();

      if (lives <= 0) {
        reset(true);
        return;
      }
      syncHUD();
    }
  }

  // collisions
  for (const b of bullets) {
    for (const e of enemies) {
      const dx = b.x - e.x;
      const dy = b.y - e.y;
      const rr = (b.r + e.r);
      if (dx * dx + dy * dy <= rr * rr) {
        b.y = -999;
        e.hp -= 1;
        pop(e.x, e.y, 8);
        sfxHit();

        if (e.hp <= 0) {
          score += 10 * wave;
          e.y = rand(-H * 0.7, -30);
          e.x = rand(24, W - 24);
          e.hp = 1 + Math.floor(wave / 3);
          syncHUD();
          sfxExplosion();
        }
      }
    }
  }

  // sparks
  sparks = sparks.filter(s => (s.life > 0));
  for (const s of sparks) {
    s.life -= dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vy += 260 * dt;
  }

  // wave clear (score-based pacing)
  if (score > 0 && score % (120 * wave) === 0) {
    wave += 1;
    spawnWave(7 + wave);
    syncHUD();
    pop(W / 2, H / 3, 30);
    sfxExplosion();
  }
}

// -------------------- DRAW --------------------
function draw() {
  ctx.clearRect(0, 0, W, H);

  // background stars
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 26; i++) {
    const x = (i * 47 + (performance.now() * 0.02)) % W;
    const y = (i * 89 + (performance.now() * 0.03)) % H;
    ctx.fillStyle = "white";
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;

  // player glow + body
  drawGlowCircle(player.x, player.y, player.r, "rgba(60,255,136,.35)", "rgba(0,0,0,0)");
  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
  ctx.fill();

  // bullets
  for (const b of bullets) {
    drawGlowCircle(b.x, b.y, b.r, "rgba(124,60,255,.55)", "rgba(0,0,0,0)");
    ctx.fillStyle = "rgba(180,160,255,.95)";
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // enemies
  for (const e of enemies) {
    drawGlowCircle(e.x, e.y, e.r, "rgba(255,255,255,.18)", "rgba(0,0,0,0)");
    ctx.fillStyle = "rgba(0,0,0,.65)";
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r - 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  // sparks
  ctx.fillStyle = "rgba(60,255,136,.9)";
  for (const s of sparks) {
    ctx.globalAlpha = clamp(s.life * 2, 0, 1);
    ctx.fillRect(s.x, s.y, 3, 3);
  }
  ctx.globalAlpha = 1;

  // subtle vignette
  const g = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, 340);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,.35)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// -------------------- LOOP --------------------
function loop(t) {
  const dt = Math.min(0.033, (t - last) / 1000);
  last = t;
  step(dt);
  draw();
  requestAnimationFrame(loop);
}

// -------------------- INPUT --------------------
window.addEventListener("keydown", (e) => {
  // IMPORTANT: first user gesture can start audio
  ensureAudio();

  if (e.key === " ") { e.preventDefault(); fire(); return; }
  if (e.key.toLowerCase() === "r") { reset(true); return; }
  if (e.key.toLowerCase() === "m") { toggleMusic(); return; } // press M for music
  keys.add(e.key);
});

window.addEventListener("keyup", (e) => keys.delete(e.key));

// mobile: tap left/right + tap top half to shoot
c.addEventListener("pointerdown", (e) => {
  ensureAudio(); // user gesture => unlock audio on mobile

  const rect = c.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (y < rect.height * 0.55) {
    fire();
    return;
  }
  if (x < rect.width * 0.5) keys.add("ArrowLeft");
  else keys.add("ArrowRight");
});

c.addEventListener("pointerup", () => {
  keys.delete("ArrowLeft");
  keys.delete("ArrowRight");
});

c.addEventListener("pointercancel", () => {
  keys.delete("ArrowLeft");
  keys.delete("ArrowRight");
});

// -------------------- START --------------------
reset(true);
requestAnimationFrame(loop);

// Optional: start music automatically AFTER first click if you want.
// Right now: user hits M or the Music button.
