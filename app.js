// ==============================
// MJ Hype-Konsole – Grundlogik (FIXED Thriller Pattern + Meltdown Priority)
// ==============================

// ====== CONFIG ======
const CONFIG = {
  // Deutscher Kinostart (hast du schon eingetragen)
  targetDate: new Date("2026-04-23T00:00:00"),

  // Größeres Fenster => Stufen leben länger + Burst ist "machbar"
  burstWindowMs: 3800,

  // Stufen (spürbarer Ramp)
  levels: [
    { minBurst: 1,  label: "stabil-ish" },
    { minBurst: 6,  label: "leicht instabil" },
    { minBurst: 10, label: "kritisch hypey" },
    { minBurst: 14, label: "sehr kritisch" },
    { minBurst: 16, label: "meltdown imminent" }
  ],

  // Meltdown früher/erreichbarer als vorher
  meltdownBurst: 18,
  meltdownDurationMs: 6500,
  meltdownCooldownMs: 9000,

  // ===== Thriller Pattern (tempo-invariant) =====
  thriller: {
    enabled: true,

    // 8 Klicks => 7 Intervalle
    expectedMultiples: [1, 1, 1, 2, 6, 2, 2],

    // strenger: Spam soll nicht reichen
    toleranceMs: 70,

    // Tempo-Grenzen (deine Bases lagen grob 230–265ms)
    minBaseMs: 170,
    maxBaseMs: 320,

    // 8 Klicks inkl. langer Pause -> größeres Gesamtfenster
    maxTotalWindowMs: 5200,

    // Sound soll komplett laufen (15s)
    activateDurationMs: 15000,

    // Anti-Spam: es MUSS eine echte "lange Pause" geben (ca. 6x base)
    minLongestMultiple: 5.2,
    maxLongestMultiple: 7.6
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

// Lautstärken (macht später Feintuning leicht)
longTrack.beatit.volume = 1.0;
longTrack.thrillerbass.volume = 0.9;
longTrack.thrillermode.volume = 1.0;

let lastBeatItAt = 0;
const BEATIT_COOLDOWN_MS = 6000;
const BEATIT_STING_MS = 2800;

// ====== AUDIO POOL (zuverlässiger SFX pro Klick) ======
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
let clickTimes = [];

let patternClicks = [];
let thrillerActive = false;

let meltdownActive = false;
let meltdownCooldownUntil = 0;

let dailyImageIndex = 0;

// ====== SHAKE ENGINE ======
let shakeRAF = null;
let shakeUntil = 0;
let shakeAmp = 0;
let shakeRot = 0;

function startShake(amplitudePx, amplitudeDeg, durationMs){
  shakeAmp = Math.max(shakeAmp, amplitudePx);
  shakeRot = Math.max(shakeRot, amplitudeDeg);
  shakeUntil = Math.max(shakeUntil, Date.now() + durationMs);

  if (!shakeRAF) shakeRAF = requestAnimationFrame(shakeTick);
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
    const damp = Math.max(0.25, Math.min(1, t));

    const dx = (Math.random() * 2 - 1) * shakeAmp * damp;
    const dy = (Math.random() * 2 - 1) * shakeAmp * damp;
    const dr = (Math.random() * 2 - 1) * shakeRot * damp;

    el.app.style.transform = `translate(${dx}px, ${dy}px) rotate(${dr}deg)`;
    shakeRAF = requestAnimationFrame(shakeTick);
    return;
  }

  stopShake();
}

// ====== MELTDOWN FX TIMER ======
let meltdownFxTimer = null;

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

  const nearMeltdown = burst >= (CONFIG.meltdownBurst - 2);

  // Cooldown
  if (now < meltdownCooldownUntil) {
    quickGlitch();
    startShake(2, 0.2, 140);
    setStatus("cooldown…", "inaktiv");
    playRandomHypeSound({ volume: 0.55 });
    logLine(`• Hype +1 (Burst ${burst}) — cooldown aktiv.`);
    return;
  }

  // ✅ Meltdown PRIORITÄT: bevor Thriller irgendwas macht
  if (!meltdownActive && burst >= CONFIG.meltdownBurst) {
    activateMeltdown();
    logLine(`• MELTDOWN TRIGGERED (Burst ${burst})`);
    return;
  }

  // ✅ Thriller nur, wenn NICHT nearMeltdown (sonst klaut Thriller den Meltdown)
  if (!nearMeltdown && CONFIG.thriller.enabled && !thrillerActive && !meltdownActive) {
    patternClicks.push(now);
    patternClicks = pruneTimes(patternClicks, now - CONFIG.thriller.maxTotalWindowMs);

    if (matchesThrillerPattern(patternClicks)) {
      activateThrillerMode();
      patternClicks = [];
      return;
    }
  }

  // Normal escalation
  const level = computeLevel(burst);
  setStatus(level.label, thrillerActive ? "aktiv" : "inaktiv");

  applyStageFX(burst);

  playRandomHypeSound({ volume: 0.78 });

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
    setStatus("RELEASED", thrillerActive ? "aktiv" : additionallyThrillerText());
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

function additionallyThrillerText(){
  return thrillerActive ? "aktiv" : "inaktiv";
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

// ====== STAGE FX ======
function applyStageFX(burst){
  const stage =
  burst >= 16 ? 4 :
  burst >= 14 ? 3 :
  burst >= 10 ? 2 :
  burst >= 6  ? 1 : 0;

setStageClass(stage);
  const t = Math.min(1, burst / noteMeltdownDivisor());
  const expo = Math.pow(t, 2.2);

  const amp = lerp(1.5, 10.0, expo);
  const rot = lerp(0.10, 1.20, expo);
  const dur = lerp(120, 240, expo);
  startShake(amp, rot, dur);

  if (burst >= 10 && Math.random() < 0.35) quickGlitch();
  if (burst >= 14 && Math.random() < 0.55) quickGlitch();

  const discoOp = lerp(0.0, 0.55, expo);
  const noiseOp = lerp(0.0, 0.45, expo);
  const scanOp  = lerp(0.0, 0.20, expo);

  if (el.disco) el.disco.style.opacity = String(discoOp);
  if (el.noise) el.noise.style.opacity = String(noiseOp);
  if (el.scanlines) el.scanlines.style.opacity = String(scanOp);

  if (el.confetti) el.confetti.style.opacity = burst >= 12 ? "0.25" : "0";
}

function noteMeltdownDivisor(){
  return CONFIG.meltdownBurst;
}

function lerp(a,b,t){ return a + (b-a)*t; }

// ====== GLITCH ======
function quickGlitch(){
  if (!el.fx) return;
  el.fx.classList.add("glitch");
  setTimeout(() => el.fx.classList.remove("glitch"), 140);
}

// ====== MELTDOWN ======
function activateMeltdown(){
  if (meltdownActive) return;

  const now = Date.now();
  meltdownActive = true;
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

  // Rainbow moving lights via JS transform/hue
  if (meltdownFxTimer) clearInterval(meltdownFxTimer);
  let rot = 0;
  let hue = 0;

  meltdownFxTimer = setInterval(() => {
    startShake(16, 1.8, 220);

    if (Math.random() < 0.75) quickGlitch();
    if (el.noise) el.noise.style.opacity = (Math.random() * 0.25 + 0.60).toFixed(2);
    if (el.glitchLayer) el.glitchLayer.style.opacity = (Math.random() * 0.25 + 0.70).toFixed(2);

    rot = (rot + 7) % 360;
    hue = (hue + 12) % 360;

    if (el.disco) {
      el.disco.style.transform = `rotate(${rot}deg) scale(1.03)`;
      el.disco.style.filter = `blur(10px) hue-rotate(${hue}deg) saturate(1.2)`;
      el.disco.style.opacity = (Math.random() > 0.5 ? "1" : "0.88");
    }
  }, 120);

  // Sound: Beat It komplett (nicht nach 6.5s stoppen)
  stopLongTracks();
  playLongTrack(longTrack.beatit);

  setTimeout(() => {
    meltdownActive = false;

    if (meltdownFxTimer) {
      clearInterval(meltdownFxTimer);
      meltdownFxTimer = null;
    }

    if (el.fx) el.fx.classList.remove("meltdown");

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

// ====== THRILLER PATTERN (ANTI-SPAM) ======
function matchesThrillerPattern(clicks){
  const exp = CONFIG.thriller.expectedMultiples;
  const neededClicks = exp.length + 1; // 8 clicks
  if (clicks.length < neededClicks) return false;

  const slice = clicks.slice(-neededClicks);

  const deltas = [];
  for (let i = 1; i < slice.length; i++){
    deltas.push(slice[i] - slice[i-1]);
  }

  // base = median(delta/multiple) (robuster als median(deltas))
  const baseCandidates = deltas.map((d, i) => d / exp[i]).sort((a,b) => a-b);
  const base = baseCandidates[Math.floor(baseCandidates.length / 2)];

  if (base < CONFIG.thriller.minBaseMs || base > CONFIG.thriller.maxBaseMs) return false;

  // Anti-Spam: längstes Intervall muss "wirklich lang" sein (~6x base)
  let maxD = -Infinity;
  for (const d of deltas) maxD = Math.max(maxD, d);
  const longestMultiple = maxD / base;

  if (longestMultiple < CONFIG.thriller.minLongestMultiple) return false;
  if (longestMultiple > CONFIG.thriller.maxLongestMultiple) return false;

  // Toleranz-Check
  for (let i = 0; i < exp.length; i++){
    const target = exp[i] * base;
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

    // nach 15s stoppen (Sound läuft voll)
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

// ====== STAGE CLASSES (CSS Visual Ramp) ======
function setStageClass(stage){
  if (!el.fx) return;
  el.fx.classList.remove("stage-0","stage-1","stage-2","stage-3","stage-4");
  el.fx.classList.add(`stage-${stage}`);
}

// ====== SOUND HELPERS ======
function playRandomHypeSound(opts = {}){
  const poolKeys = ["heehee","hoo","auw","oohh","dow"];
  const key = poolKeys[Math.floor(Math.random() * poolKeys.length)];

  const idx = sfxIndex[key];
  const a = sfxPool[key][idx];
  sfxIndex[key] = (idx + 1) % SFX_POOL_SIZE;

  const vol = typeof opts.volume === "number" ? opts.volume : 0.78;
  a.volume = vol;

  try { a.currentTime = 0; } catch(_){}
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








