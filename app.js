// ==============================
// MJ Hype-Konsole – Grundlogik (UPGRADED Meltdown + Audio Reliability)
// ==============================

// ====== CONFIG ======
const CONFIG = {
  // Du trägst später den deutschen Kinostart ein:
  targetDate: new Date("2026-04-23T00:00:00"),

  // NEW: Größeres Fenster => Meltdown erreichbar + Stufen “leben” länger
  burstWindowMs: 3200,

  // NEW: klarere Stufen (und spürbarer Ramp)
  // (Du kannst später minBurst feinjustieren, aber so ist es gut erreichbar und staged.)
  levels: [
    { minBurst: 1,  label: "stabil-ish" },
    { minBurst: 6,  label: "leicht instabil" },
    { minBurst: 10, label: "kritisch hypey" },
    { minBurst: 14, label: "sehr kritisch" },
    { minBurst: 17, label: "meltdown imminent" },
  ],

  // NEW: Meltdown später, aber in diesem Fenster erreichbar
  meltdownBurst: 20,

  // NEW: Meltdown darf länger gehen
  meltdownDurationMs: 6500,
  meltdownCooldownMs: 9000,

  // ===== Thriller Pattern (tempo-invariant) =====
  thriller: {
  enabled: true,

  // 8 Klicks => 7 Intervalle
  // Aus deinen Messungen: meistens [1,1,1,2,6,2,2] oder Variationen mit 7er langem Intervall
  expectedMultiples: [1, 1, 1, 2, 6, 2, 2],

  // Toleranz strenger (Spam soll NICHT reichen)
  toleranceMs: 70,

  // Tempo-Grenzen (deine Bases lagen ~230–265ms)
  minBaseMs: 170,
  maxBaseMs: 320,

  // 8 Klicks mit “langem” Intervall -> braucht mehr Gesamtfenster als vorher
  maxTotalWindowMs: 5200,

  // soll 15s komplett laufen
  activateDurationMs: 15000,

  // Anti-Spam / Anti-Zufall: Pattern muss "sauber" sein
  minLongestMultiple: 5.2,  // langes Intervall muss ~>= 5.2x base sein
  maxLongestMultiple: 7.6,  // und <= ~7.6x base
}

    // (Thriller passt du separat an – hier erstmal lassen)
    activateDurationMs: 6500
  },

  facts: [
    "Daily Fact System: noch in Entwicklung (weil ich eigentlich lernen sollte)."
  ],

  images: Array.from({ length: 25 }, (_, i) => `assets/images/p${i + 1}.jpg`),
  thrillerImage: "assets/images/thrillermodepicture.jpg"
};

// ====== DOM ======
const el = {
  days: document.getElementById("days"),
  hours: document.getElementById("hours"),
  minutes: document.getElementById("minutes"),
  seconds: document.getElementById("seconds"),
  statusText: document.getElementById("statusText"),
  thrillerStatus: document.getElementById("thrillerStatus"),
  hypeBtn: document.getElementById("hypeBtn"),
  sessionHype: document.getElementById("sessionHype"),
  globalHype: document.getElementById("globalHype"),
  log: document.getElementById("log"),
  fact: document.getElementById("fact"),
  resetGlobal: document.getElementById("resetGlobal"),
  fx: document.getElementById("fx-overlays"),
  app: document.getElementById("app"),
  noise: document.getElementById("noise"),
  scanlines: document.getElementById("scanlines"),
  disco: document.getElementById("disco"),
  glitchLayer: document.getElementById("glitchLayer"),
  confetti: document.getElementById("confetti"),
  globalHint: document.getElementById("globalHint"),
  dailyImage: document.getElementById("dailyImage"),
};

// ====== AUDIO FILES ======
const sounds = {
  auw: "assets/sounds/auw.mp3",
  beatit: "assets/sounds/beatit.mp3",
  dow: "assets/sounds/dow.mp3",
  heehee: "assets/sounds/heehee.mp3",
  hoo: "assets/sounds/hoo.mp3",
  oohh: "assets/sounds/oohh.mp3",
  thrillerbass: "assets/sounds/thrillerbass.mp3",
  thrillermode: "assets/sounds/thrillermode.mp3",
};

// Long tracks (stop/seek möglich)
const longTrack = {
  beatit: new Audio(sounds.beatit),
  thrillerbass: new Audio(sounds.thrillerbass),
  thrillermode: new Audio(sounds.thrillermode),
};

// Lautstärken: BeatIt & Thrillermode deutlich lauter
longTrack.beatit.volume = 1.0;
longTrack.thrillerbass.volume = 0.9;
longTrack.thrillermode.volume = 1.0;

let lastBeatItAt = 0;
const BEATIT_COOLDOWN_MS = 6000;
const BEATIT_STING_MS = 2800;

// ====== AUDIO POOL (für zuverlässigen Sound pro Klick) ======
const SFX_POOL_SIZE = 5;
const sfxPool = {};
const sfxIndex = {};

function initSfxPool(){
  const keys = ["heehee","hoo","auw","oohh","dow"];
  for (const k of keys){
    sfxPool[k] = [];
    sfxIndex[k] = 0;
    for (let i=0; i<SFX_POOL_SIZE; i++){
      const a = new Audio(sounds[k]);
      a.preload = "auto";
      a.volume = 0.78;
      sfxPool[k].push(a);
    }
  }
}
initSfxPool();

// ====== STATE ======
let sessionHype = 0;
let globalHype = loadGlobalHype();
let clickTimes = [];   // timestamps for burst logic

// Thriller tracking
let patternClicks = [];
let thrillerActive = false;

// Meltdown tracking
let meltdownActive = false;
let meltdownCooldownUntil = 0;

// Daily image state
let dailyImageIndex = 0;

// ====== SHAKE ENGINE (macht Stufen spürbar) ======
// Statt nur CSS shake-1/2/3: echte Amplitude je nach Stage, plus Dauer-Shake im Meltdown
let shakeRAF = null;
let shakeUntil = 0;
let shakeAmp = 0;
let shakeRot = 0;

function startShake(amplitudePx, amplitudeDeg, durationMs){
  shakeAmp = Math.max(shakeAmp, amplitudePx);
  shakeRot = Math.max(shakeRot, amplitudeDeg);
  shakeUntil = Math.max(shakeUntil, Date.now() + durationMs);

  if (!shakeRAF) {
    shakeRAF = requestAnimationFrame(shakeTick);
  }
}

function stopShake(){
  if (shakeRAF) cancelAnimationFrame(shakeRAF);
  shakeRAF = null;
  shakeUntil = 0;
  shakeAmp = 0;
  shakeRot = 0;
  if (el.app) el.app.style.transform = "";
}

function shakeTick(){
  const now = Date.now();
  const alive = now < shakeUntil;

  if (el.app && alive){
    const t = (shakeUntil - now) / 1000;
    const damp = Math.max(0.25, Math.min(1, t)); // leichtes Ausklingen

    const dx = (Math.random() * 2 - 1) * shakeAmp * damp;
    const dy = (Math.random() * 2 - 1) * shakeAmp * damp;
    const dr = (Math.random() * 2 - 1) * shakeRot * damp;

    el.app.style.transform = `translate(${dx}px, ${dy}px) rotate(${dr}deg)`;
    shakeRAF = requestAnimationFrame(shakeTick);
    return;
  }

  // End
  stopShake();
}

// ====== MELTDOWN FX TIMER ======
let meltdownFxTimer = null;
let meltdownStartTs = 0;

// ====== INIT ======
renderCounters();
renderDailyFact();
logLine("• Boot complete. Waiting for hype input…");
startCountdown();

// ====== EVENTS ======
el.hypeBtn.addEventListener("click", () => {
  const now = Date.now();

  // Counters
  sessionHype += 1;
  globalHype += 1;
  saveGlobalHype(globalHype);
  renderCounters();

  // Burst tracking
  clickTimes.push(now);
  clickTimes = pruneTimes(clickTimes, now - CONFIG.burstWindowMs);
  const burst = clickTimes.length;

  // Thriller pattern attempt (nur wenn kein Meltdown)
  if (CONFIG.thriller.enabled && !thrillerActive && !meltdownActive) {
    patternClicks.push(now);
    patternClicks = pruneTimes(patternClicks, now - CONFIG.thriller.maxTotalWindowMs);

    if (matchesThrillerPattern(patternClicks)) {
      activateThrillerMode();
      patternClicks = [];
      return;
    }
  }

  // Cooldown: kein Meltdown, aber mini FX + optional leiser Klicksound
  if (now < meltdownCooldownUntil) {
    quickGlitch();
    startShake(2, 0.2, 140);
    setStatus("cooldown…", "inaktiv");

    // Sound trotzdem: zuverlässig, aber leiser
    playRandomHypeSound({ volume: 0.55 });

    logLine(`• Hype +1 (Burst ${burst}) — cooldown aktiv.`);
    return;
  }

  // Meltdown?
  if (!meltdownActive && burst >= CONFIG.meltdownBurst) {
    activateMeltdown();
    logLine(`• MELTDOWN TRIGGERED (Burst ${burst})`);
    return;
  }

  // Normal escalation: Stage bestimmen
  const level = computeLevel(burst);
  setStatus(level.label, thrillerActive ? "aktiv" : "inaktiv");

  // Stage-FX: je höher, desto mehr Shake + mehr Disco/Noise
  applyStageFX(burst);

  // Sound: JEDER Klick => JEDER Klick ein SFX
  playRandomHypeSound({ volume: 0.78 });

  // BeatIt-Sting kurz vor Meltdown (optional)
  if (level.label === "meltdown imminent") maybePlayBeatItSting(now);

  logLine(`• Hype +1 (Sitzung ${sessionHype}, Global ${globalHype}) — Burst ${burst}.`);
});

el.resetGlobal.addEventListener("click", () => {
  globalHype = 0;
  saveGlobalHype(globalHype);
  renderCounters();
  logLine("• Global Hype Level wurde zurückgesetzt.");
});

// ====== COUNTDOWN ======
function startCountdown(){
  tickCountdown();
  setInterval(tickCountdown, 250);
}

function tickCountdown(){
  const now = new Date();
  const diff = CONFIG.targetDate.getTime() - now.getTime();

  if (diff <= 0){
    el.days.textContent = "0";
    el.hours.textContent = "0";
    el.minutes.textContent = "0";
    el.seconds.textContent = "0";
    setStatus("RELEASED", thrillerActive ? "aktiv" : "inaktiv");
    return;
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / (24 * 3600));
  const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  el.days.textContent = String(days);
  el.hours.textContent = String(hours).padStart(2, "0");
  el.minutes.textContent = String(minutes).padStart(2, "0");
  el.seconds.textContent = String(seconds).padStart(2, "0");
}

// ====== FACTS + DAILY IMAGE ======
function renderDailyFact(){
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  const oneDay = 24 * 60 * 60 * 1000;
  const dayOfYear = Math.floor(diff / oneDay);

  const facts = CONFIG.facts;
  const fact = facts[dayOfYear % facts.length];
  if (el.fact) el.fact.textContent = fact;

  renderDailyImage(dayOfYear);
}

function renderDailyImage(dayOfYear){
  if (!el.dailyImage) return;
  dailyImageIndex = dayOfYear % CONFIG.images.length;
  el.dailyImage.src = CONFIG.images[dailyImageIndex];
}

function setThrillerImage(){
  if (!el.dailyImage) return;
  el.dailyImage.src = CONFIG.thrillerImage;
}

function restoreDailyImage(){
  if (!el.dailyImage) return;
  el.dailyImage.src = CONFIG.images[dailyImageIndex] || CONFIG.images[0];
}

// ====== COUNTERS / STORAGE ======
function renderCounters(){
  if (el.sessionHype) el.sessionHype.textContent = String(sessionHype);
  if (el.globalHype) el.globalHype.textContent = String(globalHype);
  if (el.globalHint) el.globalHint.textContent = "persistent (localStorage)";
}

function loadGlobalHype(){
  const raw = localStorage.getItem("mj_global_hype");
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function saveGlobalHype(val){
  localStorage.setItem("mj_global_hype", String(val));
}

// ====== BURST/LEVEL LOGIC ======
function pruneTimes(arr, cutoff){
  while (arr.length && arr[0] < cutoff) arr.shift();
  return arr;
}

function computeLevel(burst){
  let chosen = CONFIG.levels[0];
  for (const lvl of CONFIG.levels){
    if (burst >= lvl.minBurst) chosen = lvl;
  }
  return chosen;
}

// ====== STAGE FX (spürbar steigend) ======
function applyStageFX(burst){
  // Shake: klar spürbar steigend, am Ende brutal steiler
  // (Burst 1..20)
  const t = Math.min(1, burst / CONFIG.meltdownBurst);

  // “A/B” + am Ende “C” brutaler: exponentiell anziehen
  const expo = Math.pow(t, 2.2);

  const amp = lerp(1.5, 10.0, expo);     // px
  const rot = lerp(0.10, 1.20, expo);    // deg
  const dur = lerp(120, 240, expo);      // ms

  startShake(amp, rot, dur);

  // Glitch häufiger bei hohen Bursts
  if (burst >= 10 && Math.random() < 0.35) quickGlitch();
  if (burst >= 14 && Math.random() < 0.55) quickGlitch();

  // Disco/Noise graduell
  const discoOp = lerp(0.0, 0.55, expo);
  const noiseOp = lerp(0.0, 0.45, expo);
  const scanOp  = lerp(0.0, 0.20, expo);

  if (el.disco) el.disco.style.opacity = String(discoOp);
  if (el.noise) el.noise.style.opacity = String(noiseOp);
  if (el.scanlines) el.scanlines.style.opacity = String(scanOp);

  // Confetti erst später leicht
  if (el.confetti) el.confetti.style.opacity = burst >= 12 ? "0.25" : "0";
}

function lerp(a,b,t){ return a + (b-a)*t; }

// ====== GLITCH ======
function quickGlitch(){
  if (!el.fx) return;
  el.fx.classList.add("glitch");
  setTimeout(() => el.fx.classList.remove("glitch"), 140);
}

// ====== MELTDOWN (ABSOLUTE HYPETRAIN) ======
function activateMeltdown(){
  if (meltdownActive) return;

  const now = Date.now();
  meltdownActive = true;
  meltdownStartTs = now;
  meltdownCooldownUntil = now + CONFIG.meltdownDurationMs + CONFIG.meltdownCooldownMs;

  setStatus("MELTDOWN", thrillerActive ? "aktiv" : "inaktiv");
  if (el.fx) el.fx.classList.add("meltdown");

  // Visuals: MAX
  if (el.disco) {
    el.disco.style.opacity = "1";
    el.disco.style.filter = "blur(8px)";
  }
  if (el.confetti) el.confetti.style.opacity = "1";
  if (el.noise) el.noise.style.opacity = "0.75";
  if (el.scanlines) el.scanlines.style.opacity = "0.40";
  if (el.glitchLayer) el.glitchLayer.style.opacity = "0.95";

  // Disco-Lichter “bewegen”: Rotation + Hue-Shift während Meltdown
  if (meltdownFxTimer) clearInterval(meltdownFxTimer);
  let rot = 0;
  let hue = 0;

  meltdownFxTimer = setInterval(() => {
    // Dauer-Shake (stark)
    startShake(16, 1.8, 220);

    // Pulsierendes Glitch/Noise
    if (Math.random() < 0.75) quickGlitch();
    if (el.noise) el.noise.style.opacity = (Math.random() * 0.25 + 0.60).toFixed(2);
    if (el.glitchLayer) el.glitchLayer.style.opacity = (Math.random() * 0.25 + 0.70).toFixed(2);

    // “Rainbow moving lights”
    rot = (rot + 7) % 360;
    hue = (hue + 12) % 360;

    if (el.disco) {
      el.disco.style.transform = `rotate(${rot}deg) scale(1.03)`;
      el.disco.style.filter = `blur(10px) hue-rotate(${hue}deg) saturate(1.2)`;
      el.disco.style.opacity = (Math.random() > 0.5 ? "1" : "0.88");
    }
  }, 120);

  // Sound: Beat It komplett (~13s) + keine Overlays
  stopLongTracks();
  playLongTrack(longTrack.beatit);

  // Wir stoppen BeatIt NICHT nach 6.5s – soll weiterlaufen.
  setTimeout(() => {
    meltdownActive = false;

    if (meltdownFxTimer) {
      clearInterval(meltdownFxTimer);
      meltdownFxTimer = null;
    }

    if (el.fx) el.fx.classList.remove("meltdown");

    // runterfahren der visuals, BeatIt darf weiter laufen
    if (el.disco) {
      el.disco.style.opacity = "0";
      el.disco.style.transform = "";
      el.disco.style.filter = "blur(10px)";
    }
    if (el.confetti) el.confetti.style.opacity = "0";
    if (el.noise) el.noise.style.opacity = "0";
    if (el.scanlines) el.scanlines.style.opacity = "0";
    if (el.glitchLayer) el.glitchLayer.style.opacity = "0";

    stopShake();

    setStatus("cooldown…", thrillerActive ? "aktiv" : "inaktiv");
    logLine("• Meltdown beendet. Bitte weiterlernen (angeblich).");
  }, CONFIG.meltdownDurationMs);
}

// ====== THRILLER PATTERN (tempo-invariant) ======
function matchesThrillerPattern(clicks){
  const expected = CONFIG.thriller.expectedMultiples;
  const neededClicks = expected.length + 1;
  if (clicks.length < neededClicks) return false;

  const slice = clicks.slice(-neededClicks);

  const deltas = [];
  for (let i = 1; i < slice.length; i++){
    deltas.push(slice[i] - slice[i-1]);
  }

  // baseLive = median(deltas)
  const sorted = [...deltas].sort((a,b) => a-b);
  const baseLive = sorted[Math.floor(sorted.length / 2)];

  if (baseLive < CONFIG.thriller.minBaseMs || baseLive > CONFIG.thriller.maxBaseMs) return false;

  for (let i = 0; i < expected.length; i++){
    const target = expected[i] * baseLive;
    if (Math.abs(deltas[i] - target) > CONFIG.thriller.toleranceMs) return false;
  }

  return true;
}

// ====== THRILLER MODE ======
function activateThrillerMode(){
  thrillerActive = true;
  if (el.thrillerStatus) el.thrillerStatus.textContent = "aktiv";
  logLine("• THRILLER MODE ACTIVATED (Secret Protocol).");

  setThrillerImage();

  if (el.fx) el.fx.classList.add("thriller");
  if (el.noise) el.noise.style.opacity = "0.55";
  if (el.scanlines) el.scanlines.style.opacity = "0.35";
  if (el.disco) el.disco.style.opacity = "0.12";

  quickGlitch();
  startShake(3, 0.25, 220);

  stopLongTracks();
  playLongTrack(longTrack.thrillermode);

  setTimeout(() => {
    thrillerActive = false;
    if (el.thrillerStatus) el.thrillerStatus.textContent = "inaktiv";

    if (el.fx) el.fx.classList.remove("thriller");
    if (el.noise) el.noise.style.opacity = "0";
    if (el.scanlines) el.scanlines.style.opacity = "0";
    if (el.disco) el.disco.style.opacity = "0";

    stopLongTrack(longTrack.thrillermode);

    restoreDailyImage();
    logLine("• Thriller Mode beendet.");
  }, CONFIG.thriller.activateDurationMs);
}

// ====== STATUS / LOG ======
function setStatus(status, thriller){
  if (el.statusText) el.statusText.textContent = status;
  if (el.thrillerStatus) el.thrillerStatus.textContent = thriller;
}

function logLine(text){
  if (!el.log) return;
  const div = document.createElement("div");
  div.className = "logLine";
  div.textContent = text;
  el.log.appendChild(div);

  while (el.log.children.length > 14) {
    el.log.removeChild(el.log.firstChild);
  }
  el.log.scrollTop = el.log.scrollHeight;
}

// ====== SOUND HELPERS ======
function playRandomHypeSound(opts = {}){
  // IMMER ein Sound: per Pool
  const poolKeys = ["heehee","hoo","auw","oohh","dow"];
  const key = poolKeys[Math.floor(Math.random() * poolKeys.length)];

  const idx = sfxIndex[key];
  const a = sfxPool[key][idx];

  sfxIndex[key] = (idx + 1) % SFX_POOL_SIZE;

  const vol = typeof opts.volume === "number" ? opts.volume : 0.78;
  a.volume = vol;

  try{
    a.currentTime = 0;
  }catch(_){}

  a.play().catch(()=>{});
}

function stopLongTracks(){
  stopLongTrack(longTrack.beatit);
  stopLongTrack(longTrack.thrillerbass);
  stopLongTrack(longTrack.thrillermode);
}

function playLongTrack(aud){
  try{
    aud.currentTime = 0;
    aud.play().catch(()=>{});
  }catch(_){}
}

function stopLongTrack(aud){
  try{
    aud.pause();
    aud.currentTime = 0;
  }catch(_){}
}

function maybePlayBeatItSting(nowMs){
  if (nowMs - lastBeatItAt < BEATIT_COOLDOWN_MS) return;
  lastBeatItAt = nowMs;

  stopLongTrack(longTrack.beatit);
  playLongTrack(longTrack.beatit);

  setTimeout(() => stopLongTrack(longTrack.beatit), BEATIT_STING_MS);
}



