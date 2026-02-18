// ==============================
// MJ Hype-Konsole – Grundlogik
// ==============================

// ====== CONFIG ======
const CONFIG = {
  // Du trägst später den deutschen Kinostart ein:
  targetDate: new Date("2026-04-23T00:00:00"),

  // Eskalation: Klicks innerhalb Fenster (ms)
  burstWindowMs: 2000,

  // Level-Schwellen basierend auf Burst-Klicks
  levels: [
    { minBurst: 1,  shake: 0, glitch: 0, disco: 0, label: "stabil-ish" },
    { minBurst: 4,  shake: 1, glitch: 1, disco: 0, label: "leicht instabil" },
    { minBurst: 7,  shake: 2, glitch: 1, disco: 1, label: "kritisch hypey" },
    { minBurst: 10, shake: 3, glitch: 1, disco: 1, label: "kurz vor meltdown" },
  ],

  // Meltdown Trigger (Burst)
  meltdownBurst: 12,
  meltdownDurationMs: 3500,
  meltdownCooldownMs: 5500,

  // Thriller Pattern (tempo-invariant)
  thriller: {
    enabled: true,

    // kurz-kurz-kurz-lang
    expectedMultiples: [1, 1, 1, 2],

    // Referenz (nicht zwingend genutzt, aber nice)
    baseMs: 260,

    // pro Intervall erlaubte Abweichung in ms
    toleranceMs: 120,

    // Grenzen, damit es nicht absurd wird
    minBaseMs: 140,
    maxBaseMs: 420,

    // Zeitfenster für die 5 Klicks
    maxTotalWindowMs: 2000,

    // Thriller bleibt so lang aktiv
    activateDurationMs: 6500
  },

  // Facts (Stub)
  facts: [
    "Daily Fact System: noch in Entwicklung (weil ich eigentlich lernen sollte)."
  ],

  // Bilder: Daily Rotation p1..p25 + Spezialbild für Thriller
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

// Long tracks als einzelne Instanzen (stop/seek möglich)
const longTrack = {
  beatit: new Audio(sounds.beatit),
  thrillerbass: new Audio(sounds.thrillerbass),
  thrillermode: new Audio(sounds.thrillermode),
};

// Lautstärken: alles grob gleich, beatit/thrillermode etwas höher
longTrack.beatit.volume = 0.95;
longTrack.thrillerbass.volume = 0.85;
longTrack.thrillermode.volume = 0.95;

let lastBeatItAt = 0;
const BEATIT_COOLDOWN_MS = 6000;
const BEATIT_STING_MS = 2800;

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

  // Thriller pattern attempt (tempo-invariant)
  if (CONFIG.thriller.enabled && !thrillerActive) {
    patternClicks.push(now);
    patternClicks = pruneTimes(patternClicks, now - CONFIG.thriller.maxTotalWindowMs);

    if (matchesThrillerPattern(patternClicks)) {
      activateThrillerMode();
      patternClicks = [];
      return; // nicht gleichzeitig normale Sounds/FX drüberlegen
    }
  }

  // Cooldown: mini reaction, aber kein meltdown
  if (now < meltdownCooldownUntil) {
    quickGlitch();
    mildShake(1);
    setStatus("cooldown…", "inaktiv");

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

  // Normal escalation
  const level = computeLevel(burst);
  applyLevelFX(level);
  setStatus(level.label, thrillerActive ? "aktiv" : "inaktiv");

  // Sounds
  playRandomHypeSound({ volume: 0.75 });

  // BeatIt-Sting bei "kurz vor meltdown"
  if (level.minBurst >= 10) maybePlayBeatItSting(now);

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
  void el.app.offsetWidth; // reflow
  el.app.classList.add(cls);
}

function quickGlitch(){
  if (!el.fx) return;
  el.fx.classList.add("glitch");
  setTimeout(() => el.fx.classList.remove("glitch"), 120);
}

function setDisco(on, fadeMs){
  if (!el.disco) return;
  el.disco.style.transitionDuration = `${fadeMs}ms`;
  el.disco.style.opacity = on ? "0.35" : "0";
}

// ====== MELTDOWN ======
function activateMeltdown(){
  if (meltdownActive) return;

  const now = Date.now();
  meltdownActive = true;
  meltdownCooldownUntil = now + CONFIG.meltdownDurationMs + CONFIG.meltdownCooldownMs;

  setStatus("MELTDOWN", thrillerActive ? "aktiv" : "inaktiv");
  if (el.fx) el.fx.classList.add("meltdown");

  // escalate visuals
  if (el.disco) el.disco.style.opacity = "0.9";
  if (el.confetti) el.confetti.style.opacity = "0.85";
  if (el.noise) el.noise.style.opacity = "0.45";
  if (el.scanlines) el.scanlines.style.opacity = "0.20";
  if (el.glitchLayer) el.glitchLayer.style.opacity = "0.60";

  // big shake pulses
  mildShake(3);
  setTimeout(() => mildShake(3), 260);
  setTimeout(() => mildShake(3), 520);

  // Sound: thriller bass
  stopLongTracks();
  playLongTrack(longTrack.thrillerbass);

  setTimeout(() => {
    meltdownActive = false;
    if (el.fx) el.fx.classList.remove("meltdown");

    // calm down
    if (el.disco) el.disco.style.opacity = "0";
    if (el.confetti) el.confetti.style.opacity = "0";
    if (el.noise) el.noise.style.opacity = "0";
    if (el.scanlines) el.scanlines.style.opacity = "0";
    if (el.glitchLayer) el.glitchLayer.style.opacity = "0";

    stopLongTrack(longTrack.thrillerbass);

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

  // Bild wechseln
  setThrillerImage();

  // stylish dark FX
  if (el.fx) el.fx.classList.add("thriller");
  if (el.noise) el.noise.style.opacity = "0.55";
  if (el.scanlines) el.scanlines.style.opacity = "0.35";
  if (el.disco) el.disco.style.opacity = "0.12";

  quickGlitch();
  mildShake(1);

  // Sound: thrillermode
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

    // Bild zurück
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
  const pool = [sounds.heehee, sounds.hoo, sounds.auw, sounds.oohh, sounds.dow];
  const src = pool[Math.floor(Math.random() * pool.length)];

  // Neue Instanz -> Overlap möglich bei Spam-Klicks (macht’s chaotisch gut)
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

  setTimeout(() => stopLongTrack(longTrack.beatit), BEATIT_STING_MS);

}
