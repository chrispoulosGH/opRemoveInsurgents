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

// ── Web Speech API voice ──────────────────────────────────────────────────────

let cachedVoices = [];
function loadVoices() { cachedVoices = window.speechSynthesis.getVoices(); }
loadVoices();
if (typeof window !== 'undefined') {
  window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
}

function speakFemale(text) {
  return new Promise(resolve => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    try {
      window.speechSynthesis.cancel(); // clear any queued utterances
      const utter  = new SpeechSynthesisUtterance(text);
      utter.rate   = 0.92;
      utter.pitch  = 0.88;
      utter.volume = 0.9;
      const female = cachedVoices.find(v =>
        /female|woman|zira|samantha|karen|victoria|moira|fiona|veena|susan|heather|allison/i.test(v.name)
      ) ?? null;
      if (female) utter.voice = female;
      utter.onend   = finish;
      utter.onerror = finish;
      window.speechSynthesis.speak(utter);
      setTimeout(finish, Math.max(2000, text.length * 75 + 600));
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

export function playMaxTargetsLit() {
  speakFemale('Maximum number of targets are lit');
}

export function speakReport(text) {
  speakFemale(text);
}

/**
 * Speak "Deploying strike force" — returns a Promise that resolves when done.
 */
export function playDeployingStrikeForce() {
  return speakFemale('Deploying strike force');
}

/**
 * Play real gunfire audio — heavy machine gun burst layered with AR-15 fire.
 * Files served from /public/sfx/.
 */
export function playGunfire() {
  // Main burst: heavy machine gun (~3.3 s)
  playClip('/sfx/gunfire_mg.mp3',   { volume: 0.55 });
  // Secondary layer: AR-15 rapid fire (~4.6 s), slight delay for realism
  setTimeout(() => playClip('/sfx/gunfire_ar15.mp3', { volume: 0.35 }), 180);
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

function speakArabic(text, delayMs = 0) {
  setTimeout(() => {
    try {
      const utter   = new SpeechSynthesisUtterance(text);
      utter.lang    = 'ar-SA';
      utter.rate    = 0.82 + Math.random() * 0.3;
      utter.pitch   = 0.55 + Math.random() * 0.25;
      utter.volume  = 0.9;
      const arVoice = cachedVoices.find(v => /^ar/i.test(v.lang)) ?? null;
      if (arVoice) utter.voice = arVoice;
      window.speechSynthesis.speak(utter);
    } catch (e) { /* silent */ }
  }, delayMs);
}

/**
 * Firefight chaos for Level 2 — screams, Allahu Akbar yells, and Bismillah cries
 * layered across the firefight duration.
 */
export function playFirefightChaos(durationMs = 4000) {
  // Screams delayed 2 s after attack starts, then staggered
  [0, 0.35, 0.85, 1.5, 2.2, 3.0].forEach(offset => {
    const t = 2.0 + offset;
    if (t * 1000 >= durationMs) return;
    setTimeout(() => {
      const url = SCREAM_URLS[Math.floor(Math.random() * SCREAM_URLS.length)];
      playClip(url, { rate: 0.75 + Math.random() * 0.4, volume: 0.22 + Math.random() * 0.13 });
    }, t * 1000);
  });

  // Allahu Akbar clips — all delayed 2 s
  [0.15, 1.1, 2.6].forEach(offset => {
    const t = 2.0 + offset;
    if (t * 1000 >= durationMs) return;
    setTimeout(() => {
      const url = ALLAHU_URLS[Math.floor(Math.random() * ALLAHU_URLS.length)];
      playClip(url, { rate: 0.95 + Math.random() * 0.15, volume: 0.38 });
    }, t * 1000);
  });

  // Allahu Akbar speech — delayed 2 s
  speakArabic('الله أكبر', 2000);
  speakArabic('الله أكبر', 3800);
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
