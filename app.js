// ==============================
// MJ Hype-Konsole – Grundlogik
// ==============================

// ====== CONFIG ======
const CONFIG = {
  // Countdown Ziel: Datum/Time setzen (lokale Zeit)
  targetDate: new Date("2026-12-31T00:00:00"),

  // NEW: etwas größeres Fenster => Stufen wirken bewusster
  burstWindowMs: 2600,

  // NEW: langsamerer Ramp-up (mehr Klicks pro Stage)
  levels: [
    { minBurst: 1,  shake: 0, glitch: 0, disco: 0, label: "stabil-ish" },
    { minBurst: 6,  shake: 1, glitch: 1, disco: 0, label: "leicht instabil" },
    { minBurst: 10, shake: 2, glitch: 1, disco: 1, label: "kritisch hypey" },
    { minBurst: 14, shake: 3, glitch: 1, disco: 1, label: "sehr kritisch" },
    { minBurst: 18, shake: 3, glitch: 1, disco: 1, label: "meltdown imminent" },
  ],

  // NEW: mehr Klicks bis Meltdown + länger + längerer Cooldown
  meltdownBurst: 22,
  meltdownDurationMs: 6000,
  meltdownCooldownMs: 9000,

  // ===== Thriller Pattern (tempo-invariant) =====
  thriller: {
    enabled: true,

    expectedMultiples: [1, 1, 1, 2],
    baseMs: 260,
    toleranceMs: 120,

    minBaseMs: 140,
    maxBaseMs: 420,

    maxTotalWindowMs: 2000,
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

// NEW: lauter wie gewünscht
longTrack.beatit.volume = 1.0;
longTrack.thrillerbass.volume = 0.95;
longTrack.thrillermode.volume = 1.0;

let lastBeatItAt = 0;
const BEATIT_COOLDOWN_MS = 7000;
const BEATIT_STING_MS = 3000;

// ====== STATE ======
let sessionHype = 0;
let globalHype = loadGlobalHype();
let clickTimes = [];

let patternClicks = [];
let thrillerActive = false;

let meltdownActive = false;
let meltdownCooldownUntil = 0;

// Daily image state
let dailyImageIndex = 0;

// NEW: Timer für “Meltdown-Puls”
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

  // Thriller Pattern (nur wenn kein Meltdown)
  if (CONFIG.thriller.enabled && !thrillerActive && !meltdownActive) {
    patternClicks.push(now);
    patternClicks = pruneTimes(patternClicks, now - CONFIG.thriller.maxTotalWindowMs);

    if (matchesThrillerPattern(patternClicks)) {
      activateThrillerMode();
      patternClicks = [];
      return;
    }
  }

  // Cooldown: nur mini FX
  if (now < meltdownCooldownUntil) {
    quickGlitch();
    mildShake(1);
    setStatus("cooldown…", "inaktiv");

    // Wenn BeatIt gerade läuft (Meltdown), dann nicht drüberrandomizen
    if (!isAudioPlaying(longTrack.beatit)) {
      playRandomHypeSound({ volume: 0.55 });
    }

    logLine(`• Hype +1 (Burst ${burst}) — cooldown aktiv.`);
    return;
  }

  // Meltdown?
  if (!meltdownActive && burst >= CONFIG.meltdownBurst) {
    activateMeltdown();
    logLine(`• MELTDOWN TRIGGERED (Burst ${burst})`);
    return;
  }

  // Normal escalation
  const level = computeLevel(burst);
  applyLevelFX(level);
  setStatus(level.label, thrillerActive ? "aktiv" : "inaktiv");

  playRandomHypeSound({ volume: 0.78 });

  // BeatIt “Warn-Sting” kurz vor Meltdown
  if (level.label === "meltdown imminent") maybePlayBeatItSting(now);

  logLine(`• Hype +1 (Sitzung ${sessionHype}, Global ${globalHype}) — Burst ${burst} → Level ${levelIndexFor(level)}.`);
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

function levelIndexFor(level){
  return CONFIG.levels.indexOf(level);
}

// ====== FX ======
function applyLevelFX(level){
  clearShakeClasses();
  if (level.glitch) quickGlitch();
  if (level.shake) mildShake(level.shake);
  setDisco(!!level.disco, 220);
}

function clearShakeClasses(){
  if (!el.app) return;
  el.app.classList.remove("shake-1","shake-2","shake-3");
}

function mildShake(intensity){
  if (!el.app) return;
  const cls = `shake-${Math.min(3, Math.max(1, intensity))}`;
  el.app.classList.remove(cls);
  void el.app.offsetWidth;
  el.app.classList.add(cls);
}

function quickGlitch(){
  if (!el.fx) return;
  el.fx.classList.add("glitch");
  setTimeout(() => el.fx.classList.remove("glitch"), 140);
}

function setDisco(on, fadeMs){
  if (!el.disco) return;
  el.disco.style.transitionDuration = `${fadeMs}ms`;
  el.disco.style.opacity = on ? "0.40" : "0";
}

// ====== MELTDOWN (UPGRADED) ======
function activateMeltdown(){
  if (meltdownActive) return;

  const now = Date.now();
  meltdownActive = true;
  meltdownCooldownUntil = now + CONFIG.meltdownDurationMs + CONFIG.meltdownCooldownMs;

  setStatus("MELTDOWN", thrillerActive ? "aktiv" : "inaktiv");
  if (el.fx) el.fx.classList.add("meltdown");

  // Impact beim Eintritt
  quickGlitch();
  mildShake(3);

  // Visuell deutlich mehr
  if (el.disco) el.disco.style.opacity = "1";
  if (el.confetti) el.confetti.style.opacity = "1";
  if (el.noise) el.noise.style.opacity = "0.70";
  if (el.scanlines) el.scanlines.style.opacity = "0.35";
  if (el.glitchLayer) el.glitchLayer.style.opacity = "0.85";

  // Pulsierende Eskalation während Meltdown
  if (meltdownFxTimer) clearInterval(meltdownFxTimer);
  meltdownFxTimer = setInterval(() => {
    mildShake(3);
    quickGlitch();
    if (el.disco) el.disco.style.opacity = (Math.random() > 0.5) ? "1" : "0.85";
    if (el.glitchLayer) el.glitchLayer.style.opacity = (Math.random() > 0.5) ? "0.95" : "0.75";
  }, 280);

  // Sound: BeatIt beim Eintritt — volle Länge laufen lassen
  stopLongTracks();
  playLongTrack(longTrack.beatit);

  setTimeout(() => {
    meltdownActive = false;

    if (meltdownFxTimer) {
      clearInterval(meltdownFxTimer);
      meltdownFxTimer = null;
    }

    if (el.fx) el.fx.classList.remove("meltdown");

    // runterfahren
    if (el.disco) el.disco.style.opacity = "0";
    if (el.confetti) el.confetti.style.opacity = "0";
    if (el.noise) el.noise.style.opacity = "0";
    if (el.scanlines) el.scanlines.style.opacity = "0";
    if (el.glitchLayer) el.glitchLayer.style.opacity = "0";

    // BeatIt NICHT stoppen (du wolltest ~13s “voll”)
    setStatus("cooldown…", thrillerActive ? "aktiv" : "inaktiv");
    logLine("• Meltdown beendet. Bitte weiterlernen (angeblich).");
  }, CONFIG.meltdownDurationMs);
}

// ====== THRILLER PATTERN ======
function matchesThrillerPattern(clicks){
  const expected = CONFIG.thriller.expectedMultiples;
  const neededClicks = expected.length + 1;
  if (clicks.length < neededClicks) return false;

  const slice = clicks.slice(-neededClicks);

  const deltas = [];
  for (let i = 1; i < slice.length; i++){
    deltas.push(slice[i] - slice[i-1]);
  }

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
  if (el.noise) el.noise.style.opacity = "0.60";
  if (el.scanlines) el.scanlines.style.opacity = "0.40";
  if (el.disco) el.disco.style.opacity = "0.15";

  quickGlitch();
  mildShake(1);

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

  while (el.log.children.length > 14) el.log.removeChild(el.log.firstChild);
  el.log.scrollTop = el.log.scrollHeight;
}

// ====== SOUND HELPERS ======
function playRandomHypeSound(opts = {}){
  const pool = [sounds.heehee, sounds.hoo, sounds.auw, sounds.oohh, sounds.dow];
  const src = pool[Math.floor(Math.random() * pool.length)];

  const a = new Audio(src);
  a.volume = typeof opts.volume === "number" ? opts.volume : 0.75;
  a.currentTime = 0;
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

  setTimeout(() => {
    // Sting beenden, damit Meltdown-Trigger später wieder “Impact” hat
    stopLongTrack(longTrack.beatit);
  }, BEATIT_STING_MS);
}

function isAudioPlaying(aud){
  try{
    return aud && !aud.paused && aud.currentTime > 0 && !aud.ended;
  }catch(_){
    return false;
  }
}
