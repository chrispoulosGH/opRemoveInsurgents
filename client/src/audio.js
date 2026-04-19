/**
 * Synthesized audio effects for Tactical Command.
 * All sounds are generated via Web Audio API — no external files required.
 */

/**
 * Low-pitched whoosh for missile launch — pure filtered noise, no oscillators.
 * Sounds like a heavy object tearing through air, distinct from the blast.
 */
export function playMissileLaunch() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const sr  = ctx.sampleRate;
    const now = ctx.currentTime;
    const dur = 1.1;

    // White noise buffer
    const buf  = ctx.createBuffer(1, Math.floor(sr * dur), sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buf;

    // Low-pass filter sweeps downward: air-tear start → deep tail
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, now);
    lp.frequency.exponentialRampToValueAtTime(80, now + dur);
    lp.Q.value = 2.5;   // slight resonance adds the "whooo" character

    // Amplitude: sharp punch in, long tail out
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0,    now);
    gain.gain.linearRampToValueAtTime(2.2, now + 0.03);  // fast attack
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    src.connect(lp);
    lp.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);

    setTimeout(() => ctx.close(), (dur + 0.3) * 1000);
  } catch (e) {
    console.warn('Missile launch audio failed:', e);
  }
}

/**
 * Cache voices as soon as the browser has them.
 * getVoices() returns [] on first call — voiceschanged fires once they load.
 */
let cachedVoices = [];
function loadVoices() {
  cachedVoices = window.speechSynthesis.getVoices();
}
loadVoices();
if (typeof window !== 'undefined') {
  window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
}

function pickFemaleVoice() {
  return cachedVoices.find(v =>
    /female|woman|zira|samantha|karen|victoria|moira|fiona|veena|susan|heather|allison/i.test(v.name)
  ) ?? null;
}

/**
 * Shared helper — speak text in a female voice.
 * Returns a Promise that resolves when the utterance finishes (or on error).
 * Falls back to a timed resolve so a silent browser never hangs the caller.
 */
function speakFemale(text) {
  return new Promise(resolve => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };

    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate   = 1.05;
      utter.pitch  = 1.6;
      utter.volume = 0.9;
      const female = pickFemaleVoice();
      if (female) utter.voice = female;
      utter.onend   = finish;
      utter.onerror = finish;
      window.speechSynthesis.speak(utter);
      // Safety net: resolve after estimated duration + 600ms buffer
      // so a browser that never fires onend doesn't block the game.
      const fallbackMs = Math.max(2000, text.length * 75 + 600);
      setTimeout(finish, fallbackMs);
    } catch (e) {
      console.warn('Speech failed:', e);
      finish();
    }
  });
}

/**
 * Speak "Target N lit" when a target cell is marked.
 * @param {number} n  — target number (1-based)
 */
export function playTargetLit(n) {
  speakFemale(`Target ${n} lit`);
}

/**
 * Speak "Target N unlit" when a target cell is unmarked.
 * @param {number} n  — target number (1-based)
 */
export function playTargetUnlit(n) {
  speakFemale(`Target ${n} unlit`);
}

/**
 * Speak "Deploying drone N" in a female voice.
 * @param {number} n  — drone number (1-based)
 */
export function playDroneDeployed(n) {
  speakFemale(`Deploying drone ${n}`);
}

/**
 * Speak "Drones depleted" when the drone limit is reached.
 */
export function playDronesDepleted() {
  speakFemale('Drones depleted');
}

/**
 * Speak "Deploying strike force" — returns a Promise that resolves when done.
 */
export function playDeployingStrikeForce() {
  return speakFemale('Deploying strike force');
}

// Real scream clips served from /public/sfx/
const SCREAM_URLS = [
  '/sfx/scream1.mp3',   // man screaming
  '/sfx/scream2.mp3',   // man screaming aaaah
  '/sfx/scream3.mp3',   // agonizing male scream
  '/sfx/scream4.mp3',   // screams man no no
  '/sfx/scream5.mp3',   // exaggerated goofy scream
];

const ALLAHU_URLS = [
  '/sfx/allahu1.mp3',
  '/sfx/allahu2.mp3',
];

function playClip(url, { rate = 1, volume = 0.25 } = {}) {
  try {
    const audio = new Audio(url);
    audio.playbackRate = rate;
    audio.volume = volume;
    audio.play().catch(() => {});
  } catch (e) {
    console.warn('Audio playback failed:', e);
  }
}

/**
 * Play overlapping panicked screams mixed with Allahu Akbar yells,
 * staggered across durationMs with randomised pitch and volume per voice.
 *
 * @param {number} durationMs  - total playback window in milliseconds
 */
export function playPanicScreams(durationMs = 7000) {
  // Scream voices staggered across the window
  const screamOffsets = [0, 0.55, 1.2, 1.9, 2.7, 3.5, 4.3, 5.1, 5.9, 6.5];
  screamOffsets.forEach(offset => {
    if (offset * 1000 >= durationMs) return;
    setTimeout(() => {
      const url = SCREAM_URLS[Math.floor(Math.random() * SCREAM_URLS.length)];
      playClip(url, {
        rate:   0.72 + Math.random() * 0.46,  // pitch variety across men
        volume: 0.18 + Math.random() * 0.14,  // quiet → sounds distant
      });
    }, offset * 1000);
  });

  // Allahu Akbar: one yell near the start, one randomly mid-sequence
  const allahuOffsets = [
    0.3,
    1.5 + Math.random() * 3.0,   // somewhere between 1.5s and 4.5s
  ];
  allahuOffsets.forEach(offset => {
    if (offset * 1000 >= durationMs) return;
    setTimeout(() => {
      const url = ALLAHU_URLS[Math.floor(Math.random() * ALLAHU_URLS.length)];
      playClip(url, { rate: 1.0, volume: 0.28 });
    }, offset * 1000);
  });
}
