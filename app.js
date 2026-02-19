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

// Long tracks
const longTrack = {
  beatit: new Audio(sounds.beatit),
  thrillerbass: new Audio(sounds.thrillerbass),
  thrillermode: new Audio(sounds.thrillermode),
};

// Browser clamp: Audio.volume ist 0..1.0.
// Wir lassen das auf 1.0 und boosten BeatIt über WebAudio-Gain (siehe unten).
longTrack.beatit.volume = 1.0;
longTrack.thrillerbass.volume = 0.95;
longTrack.thrillermode.volume = 1.0;

// (ALT) Sting-Variablen bleiben drin, aber werden nicht mehr genutzt.
// Du wolltest BeatIt NUR beim Meltdown.
let lastBeatItAt = 0;
const BEATIT_COOLDOWN_MS = 6000;
const BEATIT_STING_MS = 2800;
let beatItStingTimer = null;

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

// ====== WEBAUDIO BOOST (für BeatIt "1.4x") ======
// Audio.volume kann nicht > 1.0, aber WebAudio Gain kann.
// Wir hängen das <audio> Element an eine GainNode und boosten im Meltdown.
let audioCtx = null;
let beatItSource = null;
let beatItGain = null;

function ensureBeatItBoostChain(){
  if (beatItGain) return;

  audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  // Quelle einmalig bauen
  beatItSource = audioCtx.createMediaElementSource(longTrack.beatit);
  beatItGain = audioCtx.createGain();
  beatItGain.gain.value = 1.0;

  beatItSource.connect(beatItGain).connect(audioCtx.destination);
}

function setBeatItBoost(multiplier){
  // multiplier z.B. 1.4 (dein Wunsch)
  ensureBeatItBoostChain();
  // smooth setzen (kleines Ramp, damit es nicht "knackt")
  const now = audioCtx.currentTime;
  beatItGain.gain.cancelScheduledValues(now);
  beatItGain.gain.setValueAtTime(beatItGain.gain.value, now);
  beatItGain.gain.linearRampToValueAtTime(multiplier, now + 0.05);
}

// ====== STATE ======
let sessionHype = 0;
let globalHype = loadGlobalHype();
let clickTimes = [];

let patternClicks = [];
let thrillerActive = false;

let meltdownActive = false;
let meltdownCooldownUntil = 0;

let dailyImageIndex = 0;

// ====== INIT ======
renderCounters();
renderDailyFact();
logLine("• Boot complete. Waiting for hype input…");

startCountdown();

// Stage-Decay: ohne Klick soll der Status/Stufe wieder runtergehen
setInterval(tickStageDecay, 200);

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

  // ❌ BeatIt-Sting aus: du willst BeatIt nur beim Meltdown.
  // if (level.label === "meltdown imminent") maybePlayBeatItSting(now);

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

function noteMeltdownDivisor(){
  return CONFIG.meltdownBurst;
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

function lerp(a,b,t){ return a + (b-a)*t; }

function setStageClass(stage){
  if (!el.fx) return;
  el.fx.classList.remove("stage-0","stage-1","stage-2","stage-3","stage-4");
  el.fx.classList.add(`stage-${stage}`);
}

// ====== STAGE DECAY TICK (damit Level ohne Klick runtergeht) ======
function tickStageDecay(){
  if (meltdownActive || thrillerActive) return;

  const now = Date.now();

  clickTimes = pruneTimes(clickTimes, now - CONFIG.burstWindowMs);
  patternClicks = pruneTimes(patternClicks, now - CONFIG.thriller.maxTotalWindowMs);

  const burst = clickTimes.length;

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

  const t = Math.min(1, burst / noteMeltdownDivisor());
  const expo = Math.pow(t, 2.2);

  const discoOp = lerp(0.0, 0.55, expo);
  const noiseOp = lerp(0.0, 0.45, expo);
  const scanOp  = lerp(0.0, 0.20, expo);

  if (el.disco) el.disco.style.opacity = String(discoOp);
  if (el.noise) el.noise.style.opacity = String(noiseOp);
  if (el.scanlines) el.scanlines.style.opacity = String(scanOp);
  if (el.confetti) el.confetti.style.opacity = burst >= 12 ? "0.25" : "0";
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

  // wichtig: evtl. laufenden BeatIt-Sting-Timer killen, sonst wird BeatIt mitten im Meltdown abgeschnitten
  if (beatItStingTimer) { clearTimeout(beatItStingTimer); beatItStingTimer = null; }

  meltdownCooldownUntil = now + CONFIG.meltdownDurationMs + CONFIG.meltdownCooldownMs;

  setStatus("MELTDOWN", "inaktiv");
  if (el.fx) el.fx.classList.add("meltdown");

  // ✅ BeatIt NUR hier, und "1.4x" loudness via Gain boost
  stopLongTracks();
  // WebAudio-Context muss durch User-Geste "unlocked" sein — der Click ist die Geste.
  ensureBeatItBoostChain();
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(()=>{});
  }
  setBeatItBoost(1.4);
  playLongTrack(longTrack.beatit);

  // Meltdown läuft visuell kürzer, Sound darf weiterlaufen
  setTimeout(() => {
    meltdownActive = false;

    if (el.fx) el.fx.classList.remove("meltdown");
    stopShake();

    // Nach dem Meltdown Boost wieder normalisieren, damit BeatIt danach nicht dauerhaft übersteuert
    // (BeatIt läuft ggf. noch kurz weiter, aber ohne Megaboost)
    try { setBeatItBoost(1.0); } catch(_){}

    setStatus("cooldown…", "inaktiv");
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

  // baseLive: median der "kurzen" Deltas (wir ignorieren die größte Pause)
  const sorted = [...deltas].sort((a,b) => a-b);
  const longest = sorted[sorted.length - 1];
  const shorts = sorted.slice(0, sorted.length - 1);
  const baseLive = shorts[Math.floor(shorts.length / 2)];

  if (baseLive < CONFIG.thriller.minBaseMs || baseLive > CONFIG.thriller.maxBaseMs) return false;

  // Anti-Spam: lange Pause muss echt vorhanden sein (ca. 6x base)
  const longestMultiple = longest / baseLive;
  if (longestMultiple < CONFIG.thriller.minLongestMultiple) return false;
  if (longestMultiple > CONFIG.thriller.maxLongestMultiple) return false;

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

  stopLongTracks();
  playLongTrack(longTrack.thrillermode);

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

// (ALT) Sting-Funktion bleibt “harmlos” drin, wird aber nicht mehr aufgerufen.
// Du kannst sie auch komplett löschen, wenn du willst.
function maybePlayBeatItSting(nowMs){
  if (meltdownActive || thrillerActive) return;
  if (nowMs - lastBeatItAt < BEATIT_COOLDOWN_MS) return;
  lastBeatItAt = nowMs;

  if (beatItStingTimer) {
    clearTimeout(beatItStingTimer);
    beatItStingTimer = null;
  }

  stopLongTrack(longTrack.beatit);
  playLongTrack(longTrack.beatit);

  beatItStingTimer = setTimeout(() => {
    if (!meltdownActive) stopLongTrack(longTrack.beatit);
    beatItStingTimer = null;
  }, BEATIT_STING_MS);
}
