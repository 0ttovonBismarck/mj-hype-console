// ==============================
// MJ Hype-Konsole – app.js
// (Meltdown PRIORITY + Stage Decay + Thriller Pattern (8 Klicks) + Audio Fallbacks + BeatIt Boost im Meltdown)
// ==============================

// ====== CONFIG ======
const CONFIG = {
  // Deutscher Kinostart:
  targetDate: new Date("2026-04-23T00:00:00"),

  // Burst-Logik
  burstWindowMs: 3800,

  // Stufen (spürbarer Ramp)
  levels: [
    { minBurst: 1,  label: "stabil-ish" },
    { minBurst: 6,  label: "leicht instabil" },
    { minBurst: 10, label: "kritisch hypey" },
    { minBurst: 14, label: "sehr kritisch" },
    { minBurst: 16, label: "meltdown imminent" },
  ],

  // Meltdown
  meltdownBurst: 18,
  meltdownDurationMs: 13000,   // visuelle Phase (Sound darf weiterlaufen)
  meltdownCooldownMs: 9000,

  // ===== Thriller Pattern (tempo-invariant) =====
  thriller: {
    enabled: true,

    // 8 Klicks => 7 Intervalle
    expectedMultiples: [1, 1, 1, 2, 6, 2, 2],

    // strenger: Spam soll nicht reichen
    toleranceMs: 220,

    // Tempo-Grenzen (deine Bases lagen grob 230–265ms)
    minBaseMs: 140,
    maxBaseMs: 500,

    // 8 Klicks inkl. langer Pause -> größeres Gesamtfenster
    maxTotalWindowMs: 6001,

    // Sound soll komplett laufen (15s)
    activateDurationMs: 15000,

    // Anti-Spam: es MUSS eine echte "lange Pause" geben (ca. 6x base)
    minLongestMultiple: 2.6,
    maxLongestMultiple: 7.2,
  },

  // Global Hype Tier (abhängig vom globalen Hype)
  hypeTiers: [
    { min: 0,    label: "Casual Fan" },
    { min: 100,  label: "Moonwalker" },
    { min: 300,  label: "Dangerous" },
    { min: 700,  label: "King of Pop Territory" },
    { min: 1500, label: "Global Takeover" }
  ],

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
  hypeTier: document.getElementById("hypeTier"),

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

  countdownNote: document.getElementById("countdownNote"),
  toast: document.getElementById("toast"),
};

// ====== AUDIO (Fallbacks, weil GitHub Upload gerne doppelte Endungen macht) ======
const SOUND_CANDIDATES = {
  // SFX
  auw: ["assets/sounds/auw.mp3", "assets/sounds/auw.mp3.mp3"],
  dow: ["assets/sounds/dow.mp3", "assets/sounds/dow.mp3.mp3"],
  heehee: ["assets/sounds/heehee.mp3", "assets/sounds/heehee.mp3.mp3"],
  hoo: ["assets/sounds/hoo.mp3", "assets/sounds/hoo.mp3.mp3"],
  oohh: ["assets/sounds/oohh.mp3", "assets/sounds/oohh.mp3.mp3"],

  // Long tracks
  beatit: ["assets/sounds/beatit.mp3", "assets/sounds/beatit.m4a", "assets/sounds/beatit.mp3.m4a"],
  thrillerbass: ["assets/sounds/thrillerbass.mp3", "assets/sounds/thrillerbass.mp3.mp3"],
  thrillermode: ["assets/sounds/thrillermode.mp3", "assets/sounds/thrillermode.m4a", "assets/sounds/thrillermode.mp3.m4a"],
};

function createAudioWithFallback(urls){
  const a = new Audio(urls[0]);
  a.preload = "auto";
  let idx = 0;
  a.addEventListener("error", () => {
    idx += 1;
    if (idx < urls.length) {
      a.src = urls[idx];
      a.load();
    }
  });
  return a;
}

// Long tracks
const longTrack = {
  beatit: createAudioWithFallback(SOUND_CANDIDATES.beatit),
  thrillerbass: createAudioWithFallback(SOUND_CANDIDATES.thrillerbass),
  thrillermode: createAudioWithFallback(SOUND_CANDIDATES.thrillermode),
};

// HTMLAudio volume max = 1.0. Für "BeatIt lauter als 1.0" nutzen wir WebAudio Gain.
longTrack.beatit.volume = 1.0;
longTrack.thrillerbass.volume = 0.95;
longTrack.thrillermode.volume = 1.0;

// WebAudio Booster für BeatIt im Meltdown (dein Wunsch: 1.4x)
const BEATIT_BOOST_GAIN = 1.4;
let beatItBoost = null; // { ctx, source, gain }

function ensureBeatItBoostChain(){
  if (beatItBoost) return beatItBoost;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;

  const ctx = new AudioCtx();
  const source = ctx.createMediaElementSource(longTrack.beatit);
  const gain = ctx.createGain();
  gain.gain.value = BEATIT_BOOST_GAIN;

  source.connect(gain).connect(ctx.destination);
  beatItBoost = { ctx, source, gain };
  return beatItBoost;
}

// SFX Pool (zuverlässiger "1 Klick = 1 Sound")
const SFX_POOL_SIZE = 5;
const sfxPool = {};
const sfxIndex = {};

function initSfxPool(){
  const keys = ["heehee","hoo","auw","oohh","dow"];
  for (const k of keys){
    sfxPool[k] = [];
    sfxIndex[k] = 0;
    const urls = SOUND_CANDIDATES[k];
    for (let i=0; i<SFX_POOL_SIZE; i++){
      const a = createAudioWithFallback(urls);
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

// ====== TOAST ======
let toastTimer = null;

function showToast(text, ms = 2400){
  if (!el.toast) return;
  el.toast.textContent = text;
  el.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.classList.remove("show");
  }, ms);
}

// ====== INIT ======
renderCounters();
renderDailyFact();
logLine("• Boot complete. Waiting for hype input…");
startCountdown();

// Stage-Decay: ohne Klick soll die Stufe wieder runtergehen
setInterval(tickStageDecay, 200);

// ====== EVENTS ======
if (el.hypeBtn){
  el.hypeBtn.addEventListener("click", () => {
    const now = Date.now();

    // Counters
    sessionHype += 1;
    globalHype += 1;
    saveGlobalHype(globalHype);
    renderCounters();

    // Relationship mini-event
    if (sessionHype === 100){
      showToast("Achtung: Cassy übertreibt es wieder komplett.");
      logLine("• Session-Event: Cassy im Hype-Modus (100).");
    }

    // Burst tracking
    clickTimes.push(now);
    clickTimes = pruneTimes(clickTimes, now - CONFIG.burstWindowMs);
    const burst = clickTimes.length;
    const nearMeltdown = burst >= (CONFIG.meltdownBurst);

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

      logLine(`• PatternClicks=${patternClicks.length} | Burst=${burst}`);

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

    // Immer SFX pro Klick
    playRandomHypeSound({ volume: 0.78 });

    logLine(`• Hype +1 (Sitzung ${sessionHype}, Global ${globalHype}) — Burst ${burst}.`);
  });
}

if (el.resetGlobal){
  el.resetGlobal.addEventListener("click", () => {
    globalHype = 0;
    saveGlobalHype(globalHype);
    renderCounters();
    logLine("• Global Hype Level wurde zurückgesetzt.");
  });
}

// ====== COUNTDOWN ======
function startCountdown(){
  tickCountdown();
  setInterval(tickCountdown, 250);
}

function tickCountdown(){
  if (!el.days) return;

  const now = new Date();
  const diff = CONFIG.targetDate.getTime() - now.getTime();

  if (diff <= 0){
    el.days.textContent = "0";
    el.hours.textContent = "0";
    el.minutes.textContent = "0";
    el.seconds.textContent = "0";
    if (el.countdownNote) el.countdownNote.textContent = "Heute. Und ja: komplett verdient.";
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

  if (el.countdownNote){
    el.countdownNote.textContent = `${days} Tage – und das Warten hat ein Ende.`;
  }
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

  if (el.hypeTier) el.hypeTier.textContent = computeHypeTier(globalHype);
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

function computeHypeTier(val){
  let tier = CONFIG.hypeTiers[0].label;
  for (const t of CONFIG.hypeTiers){
    if (val >= t.min) tier = t.label;
  }
  return tier;
}

// ====== STAGE FX ======
function applyStageFX(burst){
  const stage =
    burst >= 16 ? 4 :
    burst >= 14 ? 3 :
    burst >= 10 ? 2 :
    burst >= 6  ? 1 : 0;

  setStageClass(stage);

  const t = Math.min(1, burst / CONFIG.meltdownBurst);
  const expo = Math.pow(t, 2.2);

  const amp = lerp(1.5, 10.0, expo);
  const rot = lerp(0.10, 1.20, expo);
  const dur = lerp(120, 240, expo);
  startShake(amp, rot, dur);

  if (burst >= 10 && Math.random() < 0.35) quickGlitch();
  if (burst >= 14 && Math.random() < 0.55) quickGlitch();

  // Falls du die Opacities nicht nur über CSS-Stage-Klassen regeln willst:
  const discoOp = lerp(0.0, 0.55, expo);
  const noiseOp = lerp(0.0, 0.45, expo);
  const scanOp  = lerp(0.0, 0.20, expo);

  if (el.disco) el.disco.style.opacity = String(discoOp);
  if (el.noise) el.noise.style.opacity = String(noiseOp);
  if (el.scanlines) el.scanlines.style.opacity = String(scanOp);

  if (el.confetti) el.confetti.style.opacity = burst >= 12 ? "0.25" : "0";
}

function setStageClass(stage){
  if (!el.fx) return;
  el.fx.classList.remove("stage-0","stage-1","stage-2","stage-3","stage-4");
  el.fx.classList.add(`stage-${stage}`);
}

function lerp(a,b,t){ return a + (b-a)*t; }

// ====== STAGE DECAY TICK ======
function tickStageDecay(){
  if (meltdownActive || thrillerActive) return;

  const now = Date.now();

  clickTimes = pruneTimes(clickTimes, now - CONFIG.burstWindowMs);

  const burst = clickTimes.length;

  // visuals ohne Shake-Anstoß
  applyStageVisualsOnly(burst);

  if (now < meltdownCooldownUntil){
    setStatus("cooldown…", "inaktiv");
  } else {
    const level = computeLevel(burst);
    setStatus(level.label, "inaktiv");
  }
}

function applyStageVisualsOnly(burst){
  const stage =
    burst >= 16 ? 4 :
    burst >= 14 ? 3 :
    burst >= 10 ? 2 :
    burst >= 6  ? 1 : 0;

  setStageClass(stage);

  const t = Math.min(1, burst / CONFIG.meltdownBurst);
  const expo = Math.pow(t, 2.2);

  const discoOp = lerp(0.0, 0.55, expo);
  const noiseOp = lerp(0.0, 0.45, expo);
  const scanOp  = lerp(0.0, 0.20, expo);

  if (el.disco) el.disco.style.opacity = String(discoOp);
  if (el.noise) el.noise.style.opacity = String(noiseOp);
  if (el.scanlines) el.scanlines.style.opacity = String(scanOp);
  if (el.confetti) el.confetti.style.opacity = burst >= 12 ? "0.25" : "0";

  if (burst < 6 && !shakeRAF) {
    if (el.app) el.app.style.transform = "";
  }
}

// ====== GLITCH ======
function quickGlitch(){
  if (!el.fx) return;
  el.fx.classList.add("glitch");
  setTimeout(() => el.fx.classList.remove("glitch"), 140);
}

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

// ====== MELTDOWN ======
function activateMeltdown(){
  if (meltdownActive) return;

  const now = Date.now();
  meltdownActive = true;
  meltdownCooldownUntil = now + CONFIG.meltdownDurationMs + CONFIG.meltdownCooldownMs;

  setStatus("MELTDOWN", "inaktiv");
  if (el.fx) el.fx.classList.add("meltdown");

  // BeatIt NUR im echten Meltdown. Komplett laufen lassen (~13s).
  stopLongTracks();

  const chain = ensureBeatItBoostChain();
  if (chain && chain.ctx && chain.ctx.state === "suspended") {
    chain.ctx.resume().catch(()=>{});
  }
  if (chain && chain.gain) chain.gain.gain.value = BEATIT_BOOST_GAIN;

  playLongTrack(longTrack.beatit);

  // Start-Kick
  quickGlitch();
  startShake(14, 1.4, 420);

  setTimeout(() => {
    meltdownActive = false;

    if (el.fx) el.fx.classList.remove("meltdown");
    stopShake();

    setStatus("cooldown…", "inaktiv");
    logLine("• Meltdown beendet. Bitte jetzt etwas Sinnvolles tun :)");
  }, CONFIG.meltdownDurationMs);
}

// ====== THRILLER PATTERN ======
function matchesThrillerPattern(clicks){
  // 8 Klicks => 7 Intervalle
  const needed = 8;
  if (clicks.length < needed) return false;

  const slice = clicks.slice(-needed);

  const deltas = [];
  for (let i = 1; i < slice.length; i++){
    deltas.push(slice[i] - slice[i-1]);
  }

  // Base = Median der 3 kleinsten Intervalle (robust gegen Ausreißer)
  const sorted = [...deltas].sort((a,b)=>a-b);
  const base = sorted[1]; // median of 3 smallest: [a,b,c] => b

  // Tempo-Sanity: verhindert Zufall bei ultra langsamen/ultra schnellen Klicks
  if (base < 130 || base > 520) return false;

  // Long pause = größtes Delta
  const longest = sorted[sorted.length - 1];
  const longIndex = deltas.indexOf(longest);

  // Long pause muss "deutlich länger" sein (aber nicht 6× exakt)
  const longMult = longest / base;
  if (longMult < 2.4 || longMult > 6.8) return false;

  // Long pause soll ungefähr "in der Mitte" sitzen (nicht ganz am Anfang/Ende)
  // Erlaubt Index 3,4,5 (also nach 4.–6. Klick)
  if (longIndex < 3 || longIndex > 5) return false;

  // Helper: ratio checks (menschlich toleranter als ms-genauigkeit)
  const ratio = (x) => x / base;
  const isShort = (x) => ratio(x) >= 0.65 && ratio(x) <= 1.45;   // "kurz"
  const isMed   = (x) => ratio(x) >= 1.35 && ratio(x) <= 2.80;   // "medium"

  // 1) Die ersten drei sollen kurz sein (das verhindert Random-Trigger massiv)
  if (!isShort(deltas[0])) return false;
  if (!isShort(deltas[1])) return false;
  if (!isShort(deltas[2])) return false;

  // 2) Vor der Long-Pause soll ein Medium sitzen (das "2×" Feeling)
  // Je nachdem wo die Long-Pause liegt, prüfen wir das Delta direkt davor.
  const beforeLong = deltas[longIndex - 1];
  if (!isMed(beforeLong)) return false;

  // 3) Nach der Long-Pause sollen zwei Mediums folgen (das "ta-ta" danach)
  // Wir nehmen die zwei Deltas direkt nach der Long-Pause (falls vorhanden).
  const after1 = deltas[longIndex + 1];
  const after2 = deltas[longIndex + 2];

  // Wenn longIndex zu spät ist, fehlt after2 => dann fail (bewusst: verhindert Zufall)
  if (after1 == null || after2 == null) return false;

  if (!isMed(after1)) return false;
  if (!isMed(after2)) return false;

  return true;
}


// ====== THRILLER MODE ======
function activateThrillerMode(){
  thrillerActive = true;
  if (el.thrillerStatus) el.thrillerStatus.textContent = "aktiv";
  logLine("• THRILLER MODE ACTIVATED (Secret Protocol).");

  setThrillerImage();
  if (el.fx) el.fx.classList.add("thriller");

  stopLongTracks();
  playLongTrack(longTrack.thrillermode);

  // kleines Extra: kurzer "thrillerbass" bump am Start
  try {
    const bump = createAudioWithFallback(SOUND_CANDIDATES.thrillerbass);
    bump.volume = 0.9;
    bump.play().catch(()=>{});
  } catch(_) {}

  setTimeout(() => {
    thrillerActive = false;
    if (el.thrillerStatus) el.thrillerStatus.textContent = "inaktiv";
    if (el.fx) el.fx.classList.remove("thriller");

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
  const poolKeys = ["heehee","hoo","auw","oohh","dow"];
  const key = poolKeys[Math.floor(Math.random() * poolKeys.length)];

  const idx = sfxIndex[key];
  const a = sfxPool[key][idx];
  sfxIndex[key] = (idx + 1) % SFX_POOL_SIZE;

  a.volume = (typeof opts.volume === "number") ? opts.volume : 0.78;

  try{ a.currentTime = 0; }catch(_){}
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















