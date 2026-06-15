import { useEffect, useRef, useState, useCallback } from 'react';
import { speakReport } from '../audio';

// ── B-1B Lancer — Tehran Strike / OP-IRON FIST ───────────────────────────────
// Autopilot orbits Tehran at 30 000 ft. Player selects targets (Tab) and
// launches JASSM missiles (Space), then guides them to the target via mouse.

// Start 75 miles (120 km) north of first target, heading south — city visible from distance
const FIRST_TGT_LAT = 35.7050;
const FIRST_TGT_LON = 51.4200;
// Start position requested by user: 36°09'56.05"N, 51°20'12.51"E at 15,000 ft
const START_LAT   = 36 + 9/60 + 56.05/3600;   // 36.16556944°N
const START_LON   = 51 + 20/60 + 12.51/3600;  // 51.33680833°E
const START_ALT_M = Math.round(15000 * 0.3048); // 15000 ft → metres (~4572 m)
const START_HDG   = 180;        // south — first target dead ahead
const START_SPD   = 304;        // knots (~350 mph — slow loiter so missile streaks ahead

const ORBIT_LAT   = 35.69;      // Tehran city centre
const ORBIT_LON   = 51.39;
const ORBIT_R_M   = 14000;      // 14 km orbit radius

const MISSILE_SPD = 600;        // m/s supersonic strike speed — visibly streaks ahead of plane
const HIT_RADIUS  = 800;        // metres — 3D hit bubble on target

const ESRI_SAT    = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ARCGIS_TRN  = 'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer';
const HUD_G       = '#00FF41';
const TEHRAN_MSL  = 1220;       // Tehran ground elevation (m MSL)
// Toggle to disable missile decommissioning (SAM / connection lost) for testing.

const GOV_TARGETS = [
  { name: 'PRESIDENTIAL COMPLEX',   lat: 35.7050, lon: 51.4200 },
  { name: 'MAJLIS — PARLIAMENT',    lat: 35.6786, lon: 51.4228 },
  { name: 'MIN. FOREIGN AFFAIRS',   lat: 35.6998, lon: 51.4153 },
  { name: 'SUPREME LEADER HQ',      lat: 35.7396, lon: 51.4181 },
  { name: 'IRGC HEADQUARTERS',      lat: 35.7700, lon: 51.3900 },
  { name: 'MIN. OF DEFENCE',        lat: 35.7140, lon: 51.3980 },
  { name: 'NATIONAL SECURITY HQ',   lat: 35.7060, lon: 51.4190 },
  { name: 'TEHRAN MUNICIPALITY',    lat: 35.6960, lon: 51.4217 },
  { name: 'INTELLIGENCE MINISTRY',  lat: 35.7128, lon: 51.4055 },
  { name: 'SAADABAD PALACE',        lat: 35.8028, lon: 51.4064 },
];

// ── Blast audio — exact same URLs and pattern as Level 3/4 ───────────────────
const BLAST_SOUND = [
  'https://archive.org/download/ExplosionSounds/Explosion%2B2.mp3',
  'https://archive.org/download/ExplosionSounds/Bomb%2BExplosion.mp3',
];
let _blastAudio = null;

function primeBlastAudio() {
  if (_blastAudio) return;
  _blastAudio = new Audio(BLAST_SOUND[0]);
  _blastAudio.preload = 'auto';
  _blastAudio.load();
}

function playBlastSound() {
  if (_blastAudio) {
    _blastAudio.currentTime = 0;
    _blastAudio.volume = 1.0;
    _blastAudio.play().catch(() => {
      const b = new Audio(BLAST_SOUND[1]);
      b.volume = 1.0;
      b.play().catch(() => {});
    });
  }
}

function distKm(lat1, lon1, lat2, lon2) {
  const dlat = (lat2 - lat1) * 111.32;
  const dlon = (lon2 - lon1) * 111.32 * Math.cos(lat1 * Math.PI / 180);
  return Math.sqrt(dlat * dlat + dlon * dlon);
}

const clamp  = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const fmtHdg = h => ((Math.round(h) % 360 + 360) % 360).toString().padStart(3, '0');

function timestamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── Reusable MOAB explosion (identical to Level 3/4) ─────────────────────────
// groundAlt = MSL metres at the target — sampled from terrain before calling
// silent=true: visuals only (no flash, no sound, no log) — used for secondary viewers
function triggerMoabExplosion(viewer, C, lat, lon, onLog, targetName, containerEl = null, groundAlt = TEHRAN_MSL, silent = false) {
  const H  = (h) => groundAlt + h;
  const t0 = Date.now();

  if (!silent) {
    // ── Screen flash ────────────────────────────────────────────────────────
    const flashDiv = document.createElement('div');
    // Hold at full white for 1.5 s (covers the cloud's texture-load white phase),
    // then fade over 3 s so the orange/red cloud is revealed cleanly.
    flashDiv.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:.95;z-index:9999;pointer-events:none;transition:opacity 3s ease-out';
    document.body.appendChild(flashDiv);
    setTimeout(() => { flashDiv.style.opacity = '0'; }, 1500);
    setTimeout(() => flashDiv.remove(), 5000);

    onLog('⚠ DETONATION CONFIRMED', 'warn');
    onLog(`${targetName} — DESTROYED`, 'warn');
  }

  // ── Ground scorch ─────────────────────────────────────────────────────────
  const SCORCH_DUR = 3.5;
  const scorchPos  = C.Cartesian3.fromDegrees(lon, lat);
  const scorchMat  = new C.ColorMaterialProperty(C.Color.fromCssColorString('#120400').withAlpha(0.92));
  const scorchEnt  = viewer.entities.add({
    position: scorchPos,
    ellipse: {
      semiMajorAxis: new C.CallbackProperty(() => Math.min(elapsedS / SCORCH_DUR, 1) * 330, false),
      semiMinorAxis: new C.CallbackProperty(() => Math.min(elapsedS / SCORCH_DUR, 1) * 290, false),
      material:      scorchMat,
      heightReference: C.HeightReference.CLAMP_TO_GROUND,
    },
  });
  setTimeout(() => {
    if (viewer.isDestroyed()) return;
    viewer.entities.remove(scorchEnt);
    viewer.entities.add({
      position: scorchPos,
      ellipse: { semiMajorAxis: 330, semiMinorAxis: 290, material: scorchMat, heightReference: C.HeightReference.CLAMP_TO_GROUND },
    });
  }, (SCORCH_DUR + 0.3) * 1000);

  // ── Pressure wave + blast sound (exact Level 3/4 pattern) ─────────────────
  const detNadir  = C.Cartesian3.fromDegrees(lon, lat, 0);
  const camCarto  = C.Cartographic.fromCartesian(viewer.camera.position);
  const camNadir  = C.Cartesian3.fromRadians(camCarto.longitude, camCarto.latitude, 0);
  const horizDist = C.Cartesian3.distance(camNadir, detNadir);
  const SW_SPEED  = 600, SW_MAX_R = 8000;
  const soundDelay = Math.min(Math.max(horizDist / SW_SPEED, 1.5), 8.0) * 1000;
  const SW_ACC    = (SW_SPEED * 0.2) / (SW_MAX_R / SW_SPEED);
  const swColor   = new C.Color(0.72, 0.72, 0.72, 0.38);
  const getSwRadius = () => Math.min(SW_SPEED * elapsedS + 0.5 * SW_ACC * elapsedS * elapsedS, SW_MAX_R);
  const getSwColor  = () => { swColor.alpha = Math.max(0, 0.38 * (1 - getSwRadius() / SW_MAX_R)); return swColor; };
  const swEnt = viewer.entities.add({
    position: C.Cartesian3.fromDegrees(lon, lat),
    ellipse: {
      semiMajorAxis:      new C.CallbackProperty(getSwRadius, false),
      semiMinorAxis:      new C.CallbackProperty(getSwRadius, false),
      material:           new C.ColorMaterialProperty(new C.CallbackProperty(getSwColor, false)),
      heightReference:    C.HeightReference.CLAMP_TO_GROUND,
      classificationType: C.ClassificationType.TERRAIN,
    },
  });
  setTimeout(() => { if (!viewer.isDestroyed()) viewer.entities.remove(swEnt); },
    (SW_MAX_R / SW_SPEED + 0.5) * 1000);

  // Blast sound + concussion + cockpit shake when wave arrives (main viewer only)
  if (!silent) setTimeout(() => {
    playBlastSound();
    const concuss = document.createElement('div');
    concuss.style.cssText = 'position:fixed;inset:0;background:rgba(220,225,255,0.25);pointer-events:none;z-index:9998;transition:opacity 0.9s ease-out';
    document.body.appendChild(concuss);
    requestAnimationFrame(() => { concuss.style.opacity = '0'; });
    setTimeout(() => concuss.remove(), 1100);
    if (containerEl) {
      const t0s = Date.now(), DUR = 1800;
      const shake = () => {
        const e = Date.now() - t0s;
        if (e >= DUR) { containerEl.style.transform = ''; return; }
        const d = 1 - e / DUR, t = e / 1000;
        containerEl.style.transform = `translate(${Math.sin(t*28)*8*d}px,${Math.cos(t*22)*8*d}px)`;
        requestAnimationFrame(shake);
      };
      shake();
    }
  }, soundDelay);

  // ── Elapsed timer + mushroom cloud (identical to Level 3/4) ───────────────
  let elapsedS = 0;
  const onPreUpdate = () => { elapsedS = (Date.now() - t0) / 1000; };
  viewer.scene.preUpdate.addEventListener(onPreUpdate);

  const mdlColor = new C.Color(1, 1, 1, 1);
  const getScale = () => {
    if (elapsedS < 2)  return (1 - Math.pow(1 - elapsedS / 2, 2)) * 10;
    if (elapsedS < 12) return 10 + (1 - Math.pow(1 - (elapsedS - 2) / 10, 3)) * 15;
    return 25 + 9 * Math.log(1 + (elapsedS - 12) / 10);
  };
  const getColor = () => {
    // No fade-in — start fully opaque so the model never flashes white
    const fadeOut = elapsedS < 25 ? 1 : Math.max(0, 1 - (elapsedS - 25) / 10);
    mdlColor.alpha = fadeOut;
    return mdlColor;
  };

  // Delay 1 s — flash holds opaque until 1.5 s, so textures finish loading
  // behind the white screen; cloud is revealed already orange/red.
  let modelEnt = null;
  const modelTimer = setTimeout(() => {
    if (viewer.isDestroyed()) return;
    modelEnt = viewer.entities.add({
      position:    C.Cartesian3.fromDegrees(lon, lat, H(0)),
      orientation: C.Transforms.headingPitchRollQuaternion(
        C.Cartesian3.fromDegrees(lon, lat, H(0)),
        new C.HeadingPitchRoll(0, 0, 0),
      ),
      model: {
        uri:              '/layered_explosion_as_solid.glb',
        scale:            new C.CallbackProperty(getScale, false),
        minimumPixelSize: 32,
        maximumScale:     50000,
        color:            new C.CallbackProperty(getColor, false),
        colorBlendMode:   C.ColorBlendMode.HIGHLIGHT,
      },
    });
  }, 1000);

  setTimeout(() => {
    clearTimeout(modelTimer);
    if (viewer.isDestroyed()) return;
    viewer.scene.preUpdate.removeEventListener(onPreUpdate);
    if (modelEnt) viewer.entities.remove(modelEnt);
  }, 35000);
}

// ── HUD Canvas Drawing ────────────────────────────────────────────────────────
// targets = [{name, sx, sy, destroyed, selected}]
function drawHUD(canvas, f, targets = [], missileActive = false, distToTarget = null, selectedName = '', groundH = null) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  ctx.clearRect(0, 0, W, H);

  const altFt = Math.round(f.altM * 3.28084);
  const spd   = Math.round(f.speed);

  ctx.strokeStyle = HUD_G;
  ctx.fillStyle   = HUD_G;
  ctx.lineWidth   = 1.5;

  const PPD  = 22;
  const CLIP = Math.min(cx, cy) * 0.72;

  // ── Pitch ladder ──────────────────────────────────────────────────────────
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-f.roll * Math.PI / 180);
  ctx.beginPath(); ctx.arc(0, 0, CLIP, 0, Math.PI * 2); ctx.clip();
  ctx.font = 'bold 11px "Courier New",monospace';
  ctx.textBaseline = 'middle';
  for (let deg = -80; deg <= 80; deg += 5) {
    const y = -(deg - f.pitch) * PPD;
    if (Math.abs(y) > CLIP + 20) continue;
    if (deg === 0) {
      ctx.beginPath();
      ctx.moveTo(-140, 0); ctx.lineTo(-32, 0);
      ctx.moveTo(32, 0);   ctx.lineTo(140, 0);
      ctx.stroke(); continue;
    }
    const is10 = deg % 10 === 0, half = is10 ? 58 : 30, gap = 14, nd = deg > 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(-half, y); ctx.lineTo(-gap, y);
    ctx.moveTo(gap, y);   ctx.lineTo(half, y);
    ctx.stroke();
    if (is10) {
      ctx.beginPath();
      ctx.moveTo(-half, y); ctx.lineTo(-half, y + nd * 8);
      ctx.moveTo(half, y);  ctx.lineTo(half,  y + nd * 8);
      ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(Math.abs(deg), -half - 5, y);
      ctx.textAlign = 'left';  ctx.fillText(Math.abs(deg),  half + 5, y);
    }
  }
  ctx.restore();

  // ── Bank angle arc ────────────────────────────────────────────────────────
  const BAR = CLIP * 0.90;
  ctx.save(); ctx.translate(cx, cy);
  [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60].forEach(d => {
    const a = (d - 90) * Math.PI / 180;
    const tl = d === 0 ? 14 : Math.abs(d) % 30 === 0 ? 11 : Math.abs(d) === 45 ? 9 : 6;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * BAR, Math.sin(a) * BAR);
    ctx.lineTo(Math.cos(a) * (BAR - tl), Math.sin(a) * (BAR - tl));
    ctx.stroke();
  });
  const bA = (f.roll - 90) * Math.PI / 180;
  const bCx = Math.cos(bA), bCy = Math.sin(bA), px = -bCy, py = bCx;
  ctx.beginPath();
  ctx.moveTo(bCx * (BAR - 3), bCy * (BAR - 3));
  ctx.lineTo(bCx * (BAR - 16) + px * 6, bCy * (BAR - 16) + py * 6);
  ctx.lineTo(bCx * (BAR - 16) - px * 6, bCy * (BAR - 16) - py * 6);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // ── Boresight ─────────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(cx - 38, cy); ctx.lineTo(cx - 12, cy);
  ctx.moveTo(cx + 12, cy); ctx.lineTo(cx + 38, cy);
  ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy - 3);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.stroke();

  // ── Airspeed box ──────────────────────────────────────────────────────────
  const AX = 62;
  ctx.strokeRect(AX - 48, cy - 18, 96, 36);
  ctx.font = 'bold 20px "Courier New",monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(spd, AX, cy - 1);
  ctx.font = 'bold 10px "Courier New",monospace';
  ctx.fillText('KIAS', AX, cy + 21);
  ctx.fillText(`M ${f.mach.toFixed(2)}`, AX, cy + 38);

  // ── Altitude box ──────────────────────────────────────────────────────────
  const RX = W - 68;
  ctx.strokeRect(RX - 54, cy - 18, 108, 36);
  ctx.font = 'bold 20px "Courier New",monospace';
  ctx.fillText(altFt.toLocaleString(), RX, cy - 1);
  ctx.font = 'bold 10px "Courier New",monospace';
  ctx.fillText('FT MSL', RX, cy + 21);
  ctx.fillText('AUTOPILOT', RX, cy + 38);

  // ── Heading box ───────────────────────────────────────────────────────────
  const HBH = 26, HBW = 172;
  ctx.strokeRect(cx - HBW / 2, 12, HBW, HBH);
  ctx.font = 'bold 16px "Courier New",monospace';
  ctx.fillText(`${fmtHdg(f.heading)}°`, cx, 12 + HBH / 2);
  ctx.lineWidth = 1;
  for (let i = -30; i <= 30; i += 5) {
    const tx = cx + i * 3.2;
    ctx.beginPath(); ctx.moveTo(tx, 38); ctx.lineTo(tx, 38 + (i % 10 === 0 ? 7 : 4)); ctx.stroke();
  }
  ctx.lineWidth = 1.5;

  // ── Weapon / missile status (bottom-left) ─────────────────────────────────
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.font = 'bold 11px "Courier New",monospace';
  if (selectedName) {
    ctx.fillStyle = '#FF2020';
    ctx.fillText(`TGT: ${selectedName}`, 14, H - 30);
  }
  if (missileActive && distToTarget !== null) {
    ctx.fillStyle = '#FF8C00';
    ctx.fillText(`JASSM AWAY  —  ${distToTarget < 1 ? Math.round(distToTarget * 1000) + 'm' : distToTarget.toFixed(1) + 'km'}  TO TARGET`, 14, H - 14);
  } else {
    ctx.fillStyle = '#FF2020';
    ctx.fillText('◉ JASSM ARMED  [SPC]', 14, H - 14);
  }

  // ── Autopilot / Ceiling tag (top-left) ───────────────────────────────────
  ctx.fillStyle = 'rgba(0,255,65,.6)';
  ctx.font = 'bold 11px "Courier New",monospace';
  ctx.textBaseline = 'top';
  ctx.fillText('SEAL LEVEL CEILING 10000 FT   TERRAIN CEILING 2000 FT', 14, 14);

  // ── Target HUD tags ───────────────────────────────────────────────────────
  const BW = 88, BH = 22, BL = 10;
  ctx.lineWidth = 1.2;
  targets.forEach(({ name, sx, sy, destroyed, selected }) => {
    if (sx < -BW || sx > W + BW || sy < -BH || sy > H + BH) return;
    const col = destroyed ? '#555555' : selected ? '#FF2020' : '#00BFFF';
    ctx.strokeStyle = col; ctx.fillStyle = col;
    const x0 = sx - BW / 2, x1 = sx + BW / 2, y0 = sy - BH / 2, y1 = sy + BH / 2;
    ctx.beginPath();
    ctx.moveTo(x0,      y0 + BL); ctx.lineTo(x0, y0); ctx.lineTo(x0 + BL, y0);
    ctx.moveTo(x1 - BL, y0);      ctx.lineTo(x1, y0); ctx.lineTo(x1,      y0 + BL);
    ctx.moveTo(x0,      y1 - BL); ctx.lineTo(x0, y1); ctx.lineTo(x0 + BL, y1);
    ctx.moveTo(x1 - BL, y1);      ctx.lineTo(x1, y1); ctx.lineTo(x1,      y1 - BL);
    ctx.stroke();
    if (destroyed) {
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      ctx.moveTo(x1, y0); ctx.lineTo(x0, y1); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(sx, sy, 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.font = 'bold 9px "Courier New",monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(destroyed ? `${name} ✕` : name, sx, y0 - 3);
  });

  
}

// ── Briefing ──────────────────────────────────────────────────────────────────
const buildNarration6 = (name) =>
  `Commander ${name}. By direct order of President Trump, you are to annihilate all traces of Iran's oppressive Islamic rule. ` +
  'You are aboard a B-1B Lancer inbound from the Caspian Sea, heading south toward Tehran. ' +
  'Ten high-value government targets have been pre-selected. ' +
  'You will remotely guide cruise missiles through the Alborz mountain passes toward their objectives in the city. ' +
  'Stay low. Avoid detection. The enemy\'s missile defense systems are active. ' +
  'Use Tab to cycle targets. Press Space to launch. Guide with your mouse. ' +
  `Leave nothing standing. Good hunting, Commander ${name}.`;

function Level6Briefing({ onReady, playerName }) {
  const [subtitle,  setSubtitle]  = useState('');
  const [countdown, setCountdown] = useState(3);
  const [showGo,    setShowGo]    = useState(false);
  const [phase,     setPhase]     = useState('narrate');
  const [gone,      setGone]      = useState(false);

  const skip = useCallback(() => {
    window.speechSynthesis?.cancel();
    setGone(true);
    setTimeout(onReady, 420);
  }, [onReady]);

  useEffect(() => {
    if (!window.speechSynthesis) { setPhase('countdown'); return; }
    const voices = window.speechSynthesis.getVoices();
    const male = voices.find(v =>
      /male|man|david|mark|daniel|alex|fred|bruce|tom|james|eric|guy|reed|junior|ralph/i.test(v.name)
    ) ?? voices.find(v => !/female|woman|zira|samantha|karen|victoria|moira|fiona|veena|susan|heather|allison/i.test(v.name)) ?? null;
    const narration = buildNarration6(playerName);
    const u = new SpeechSynthesisUtterance(narration);
    u.rate = 0.88; u.pitch = 0.75; u.volume = 0.9;
    if (male) u.voice = male;
    u.onboundary = e => { if (e.name === 'word') setSubtitle(narration.slice(0, e.charIndex + e.charLength)); };
    u.onend = () => setPhase('countdown');
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    return () => window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) { setShowGo(true); setTimeout(skip, 1200); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown, skip]);

  return (
    <div onClick={skip} style={{
      position: 'fixed', inset: 0, zIndex: 200, background: '#020c14',
      display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-mono)',
      opacity: gone ? 0 : 1, transition: 'opacity .42s', cursor: 'pointer',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '.6rem 1.4rem', borderBottom: '1px solid rgba(0,212,255,.15)',
        background: 'rgba(0,0,0,.5)',
      }}>
        <div style={{ fontSize: '.65rem', color: 'var(--cyan)', letterSpacing: '.18em' }}>██ EYES ONLY</div>
        <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#fff', letterSpacing: '.14em' }}>OPERATION IRON FIST</div>
        <div style={{ fontSize: '.62rem', color: 'var(--t-ghost)', letterSpacing: '.1em' }}>LEVEL 6 — STRATEGIC STRIKE</div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
        <div style={{
          width: '55vw', border: '1px solid rgba(0,212,255,.25)', padding: '2.5rem',
          display: 'flex', flexDirection: 'column', gap: '1.6rem',
        }}>
          <div style={{ fontSize: '.5rem', color: 'var(--t-ghost)', letterSpacing: '.22em' }}>
            WEAPONS OFFICER BRIEFING — B-1B LANCER / OP-IRON FIST
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fff', letterSpacing: '.1em', lineHeight: 1.2 }}>
            ELIMINATE IRAN'S<br />ISLAMIC REGIME — 10 TARGETS
          </div>
          {[
            ['PLATFORM',  'B-1B LANCER — INBOUND SOUTH',      'var(--cyan)'],
            ['INGRESS',   'CASPIAN SEA → ALBORZ MTN PASS',    'rgba(255,255,255,.7)'],
            ['AO',        'TEHRAN METROPOLITAN AREA, IRN',     'rgba(255,255,255,.7)'],
            ['AUTHORITY', 'DIRECT ORDER — PRESIDENT TRUMP',   '#FF2020'],
            ['THREAT',    'ACTIVE SAM NETWORKS — STAY LOW',   'var(--amber)'],
            ['Tab',       'CYCLE TARGETS',                    '#00FF88'],
            ['Space',     'LAUNCH CRUISE MISSILE',            '#FF2020'],
            ['Mouse',     'GUIDE MISSILE THROUGH MOUNTAINS',  'var(--cyan)'],
            ['OBJECTIVE', 'DESTROY ALL 10 GOV TARGETS',       '#FF2020'],
          ].map(([k, v, col]) => (
            <div key={k} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              borderBottom: '1px solid rgba(255,255,255,.05)', paddingBottom: '.4rem',
            }}>
              <span style={{ fontSize: '.58rem', color: 'var(--t-ghost)', letterSpacing: '.14em' }}>{k}</span>
              <span style={{ fontSize: '.75rem', fontWeight: 700, color: col, letterSpacing: '.06em' }}>{v}</span>
            </div>
          ))}
          {phase === 'countdown' && (
            <div style={{
              textAlign: 'center', fontSize: showGo ? '2.2rem' : '1.8rem', fontWeight: 700,
              color: showGo ? '#00FF88' : 'var(--cyan)',
              textShadow: showGo ? '0 0 24px rgba(0,255,136,.8)' : '0 0 16px rgba(0,212,255,.6)',
              letterSpacing: '.15em',
            }}>
              {showGo ? 'GO' : countdown}
            </div>
          )}
        </div>
      </div>
      <div style={{
        minHeight: '2.8rem', padding: '.55rem 1.4rem', borderTop: '1px solid rgba(0,212,255,.12)',
        background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: '1rem',
      }}>
        <div style={{
          flex: 1, fontSize: '.65rem', color: 'rgba(255,255,255,.75)',
          letterSpacing: '.04em', lineHeight: 1.5, fontStyle: subtitle ? 'normal' : 'italic',
        }}>
          {subtitle || 'Awaiting audio briefing...'}
        </div>
        <div style={{ fontSize: '.58rem', color: 'var(--t-ghost)', letterSpacing: '.1em', whiteSpace: 'nowrap' }}>
          CLICK TO SKIP
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Level6Game({ playerName, onPlayAgain }) {
  const containerRef    = useRef(null);   // main Cesium viewer
  const pipContainerRef = useRef(null);   // PIP Cesium viewer
  const viewerRef       = useRef(null);
  const pipViewerRef    = useRef(null);
  const hudCanvasRef    = useRef(null);
  const boardRef        = useRef(null);

  const targetCamContainerRef = useRef(null);
  const targetCamRef          = useRef(null);

  // Autopilot flight state
  const flightRef = useRef({
    lat: START_LAT, lon: START_LON, altM: START_ALT_M,
    heading: START_HDG, pitch: 0, roll: 0,
    speed: START_SPD, vSpeed: 0, gForce: 1.0, mach: 0.79, fpa: 0,
  });

  // Mouse tracks to steer missile (when active) or is idle
  const mouseRef       = useRef({ nx: 0, ny: 0 });
  const rafRef         = useRef(null);
  const selectedIdxRef = useRef(0);
  const destroyedRef   = useRef(new Set());

  // missileRef: entity + targeting info
  // missileStateRef: live physics state for the guided missile
  const missileRef         = useRef(null);
  const missileStateRef    = useRef(null);
  const msViolationRef     = useRef({ start: null, graceUntil: null, intercepting: false });
  const rafFrameCountRef   = useRef(0);
  // pendingLaunchRef removed: immediate launch on confirm (second Space)
  const periodicAnnounceRef = useRef(null);
  const awaitLaunchConfirmRef = useRef(false);

  const audioCtxRef    = useRef(null);
  const engineGainRef  = useRef(null);
  const pipHudCanvasRef  = useRef(null);   // HUD overlay drawn on top of PIP Cesium canvas
  const tcamHudCanvasRef = useRef(null);   // HUD overlay drawn on top of target cam canvas

  const [briefing,        setBriefing]        = useState(true);
  const [missileActive,   setMissileActive]   = useState(false);
  const [missileEverFired, setMissileEverFired] = useState(false);
  const [missionComplete,  setMissionComplete]  = useState(false);
  const [chaseConnLost,    setChaseConnLost]    = useState(false);
  const [showAlborz,       setShowAlborz]       = useState(false);
  const [log,             setLog]             = useState([
    { ts: timestamp(), msg: 'LEVEL 6 — OP-IRON FIST / TEHRAN STRIKE', cls: 'warn' },
    { ts: timestamp(), msg: 'Autopilot engaged. 30 000 ft / 600 mph.', cls: 'info' },
    { ts: timestamp(), msg: 'Tab: cycle targets  |  Space: launch JASSM', cls: '' },
    { ts: timestamp(), msg: 'Mouse steers the missile after launch.', cls: '' },
  ]);
  const logEndRef = useRef(null);

  const addLog = useCallback((msg, cls = '') => {
    setLog(prev => [...prev, { ts: timestamp(), msg, cls }].slice(-80));
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  // ── Main Cesium viewer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !window.Cesium) return;
    const C = window.Cesium;
    const creditDiv = document.createElement('div');
    creditDiv.style.display = 'none';

    const viewer = new C.Viewer(containerRef.current, {
      imageryProvider: false, baseLayerPicker: false, geocoder: false,
      homeButton: false, sceneModePicker: false, navigationHelpButton: false,
      animation: false, timeline: false, fullscreenButton: false,
      infoBox: false, selectionIndicator: false, creditContainer: creditDiv,
    });

    // Increase parallel tile requests globally (Cesium default is 6)
    C.RequestScheduler.maximumRequestsPerServer = 18;

    viewer.imageryLayers.addImageryProvider(
      new C.UrlTemplateImageryProvider({ url: ESRI_SAT, maximumLevel: 19 })
    );
    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.scene.globe.maximumScreenSpaceError = 2;   // keep at 2 — accurate getHeight() for collision
    viewer.scene.globe.tileCacheSize           = 500;
    viewer.scene.fog.enabled  = true;
    viewer.scene.fog.density  = 0.00012; // slightly denser = fewer far tiles needed

    const ctrl = viewer.scene.screenSpaceCameraController;
    ctrl.enableRotate = ctrl.enableTranslate = ctrl.enableZoom = false;
    ctrl.enableTilt   = ctrl.enableLook      = false;

    C.ArcGISTiledElevationTerrainProvider.fromUrl(ARCGIS_TRN).then(tp => {
      if (!viewer.isDestroyed()) viewer.terrainProvider = tp;
    }).catch(() => {});

    // Prime blast audio — same as Level 3/4
    primeBlastAudio();

    // Preload explosion GLB
    viewer.entities.add({
      position: C.Cartesian3.fromDegrees(0, 0, 1e7),
      model: { uri: '/layered_explosion_as_solid.glb', scale: 0.001 },
    });


    // Cockpit camera — preUpdate fires only when viewer.render() is called by rAF loop
    const _cockpitPos = new C.Cartesian3();
    const onPreUpdate = () => {
      if (viewer.isDestroyed()) return;
      const f = flightRef.current;
      C.Cartesian3.fromDegrees(f.lon, f.lat, f.altM + 3, C.Ellipsoid.WGS84, _cockpitPos);
      viewer.camera.setView({
        destination: _cockpitPos,
        orientation: {
          heading: C.Math.toRadians(f.heading),
          pitch:   C.Math.toRadians(f.pitch),
          roll:    C.Math.toRadians(f.roll),
        },
      });
    };
    viewer.useDefaultRenderLoop = false;  // rAF loop drives all three viewers at 80/10/10
    viewer.scene.preUpdate.addEventListener(onPreUpdate);

    viewerRef.current = viewer;
    return () => {
      viewer.scene.preUpdate.removeEventListener(onPreUpdate);
      if (!viewer.isDestroyed()) viewer.destroy();
    };
  }, []); // eslint-disable-line

  // ── PIP Cesium viewer (missile chase cam) ────────────────────────────────────
  useEffect(() => {
    if (!pipContainerRef.current || !window.Cesium) return;
    const C = window.Cesium;
    const creditDiv = document.createElement('div');
    creditDiv.style.display = 'none';

    const pip = new C.Viewer(pipContainerRef.current, {
      imageryProvider: false, baseLayerPicker: false, geocoder: false,
      homeButton: false, sceneModePicker: false, navigationHelpButton: false,
      animation: false, timeline: false, fullscreenButton: false,
      infoBox: false, selectionIndicator: false, creditContainer: creditDiv,
    });

    pip.imageryLayers.addImageryProvider(
      new C.UrlTemplateImageryProvider({ url: ESRI_SAT, maximumLevel: 17 })
    );
    pip.useDefaultRenderLoop = false;   // driven manually at 20fps from main viewer
    pip.scene.globe.depthTestAgainstTerrain = true;
    pip.scene.globe.maximumScreenSpaceError = 12;
    pip.scene.globe.tileCacheSize           = 150;
    pip.scene.fog.enabled = false;

    const pipCtrl = pip.scene.screenSpaceCameraController;
    pipCtrl.enableRotate = pipCtrl.enableTranslate = pipCtrl.enableZoom = false;
    pipCtrl.enableTilt   = pipCtrl.enableLook      = false;

    C.ArcGISTiledElevationTerrainProvider.fromUrl(ARCGIS_TRN).then(tp => {
      if (!pip.isDestroyed()) pip.terrainProvider = tp;
    }).catch(() => {});

    // Chase cam: camera sits on a straight line extending backward from missile's axis.
    // Camera position: point 3 on a line defined by (front → back → camera).
    // Camera looks back along that same line toward the missile's rear profile.
    const _pipNose    = new C.Cartesian3();
    const _pipUp      = new C.Cartesian3();
    const _pipFrame   = new C.Matrix4();
    const _pipCamPos  = new C.Cartesian3();
    const BEHIND = 420, ABOVE = 90;
    // Use a small fixed pitch offset (0.1 rad ≈ 5.7°) so the camera sits directly
    // behind the missile and looks slightly down. This enforces the requested
    // "10% pitch" feel as a small fixed downward angle for the chase cam.
    const PITCH_OFFSET = 0.1;

    const onPipPreUpdate = () => {
      if (pip.isDestroyed()) return;
      const ms = missileStateRef.current;
      if (!ms) return;

      // Missile nose in ECEF
      C.Cartesian3.fromDegrees(ms.lon, ms.lat, ms.alt, C.Ellipsoid.WGS84, _pipNose);

      // Local ENU frame at missile position
      C.Transforms.eastNorthUpToFixedFrame(_pipNose, C.Ellipsoid.WGS84, _pipFrame);

      // Full 3D forward vector along missile velocity (heading + pitch)
      const hdgRad  = ms.heading * Math.PI / 180;
      const pitchRad = ms.pitch  * Math.PI / 180;
      const sinH = Math.sin(hdgRad), cosH = Math.cos(hdgRad);
      const cosP = Math.cos(pitchRad), sinP = Math.sin(pitchRad);
      // ENU components of the velocity unit vector
      const fwdE = sinH * cosP, fwdN = cosH * cosP, fwdU = sinP;
      // Convert to ECEF using ENU matrix columns
      const fwdX = fwdE * _pipFrame[0] + fwdN * _pipFrame[4] + fwdU * _pipFrame[8];
      const fwdY = fwdE * _pipFrame[1] + fwdN * _pipFrame[5] + fwdU * _pipFrame[9];
      const fwdZ = fwdE * _pipFrame[2] + fwdN * _pipFrame[6] + fwdU * _pipFrame[10];

      // Up vector at missile position
      C.Ellipsoid.WGS84.geodeticSurfaceNormal(_pipNose, _pipUp);

      // Camera = missile_nose - forward*BEHIND + up*ABOVE
      _pipCamPos.x = _pipNose.x - fwdX * BEHIND + _pipUp.x * ABOVE;
      _pipCamPos.y = _pipNose.y - fwdY * BEHIND + _pipUp.y * ABOVE;
      _pipCamPos.z = _pipNose.z - fwdZ * BEHIND + _pipUp.z * ABOVE;

      // Camera looks along missile trajectory; roll matches missile bank.
      // Apply the fixed small pitch offset so the camera sits just behind and
      // slightly above the missile nose, looking forward with a subtle nose-down view.
      pip.camera.setView({
        destination: _pipCamPos,
        orientation: {
          heading: hdgRad,
          pitch:   pitchRad - PITCH_OFFSET,
          roll:    (ms.roll || 0) * Math.PI / 180,
        },
      });
    };
    pip.scene.preUpdate.addEventListener(onPipPreUpdate);


    pipViewerRef.current = pip;
    return () => {
      pip.scene.preUpdate.removeEventListener(onPipPreUpdate);
      if (!pip.isDestroyed()) pip.destroy();
    };
  }, []); // eslint-disable-line

  // ── Target camera — 200 yd, 45° elevation, NE of selected target ────────────
  useEffect(() => {
    if (!targetCamContainerRef.current || !window.Cesium) return;
    const C = window.Cesium;
    const creditDiv = document.createElement('div');
    creditDiv.style.display = 'none';

    const tcam = new C.Viewer(targetCamContainerRef.current, {
      imageryProvider: false, baseLayerPicker: false, geocoder: false,
      homeButton: false, sceneModePicker: false, navigationHelpButton: false,
      animation: false, timeline: false, fullscreenButton: false,
      infoBox: false, selectionIndicator: false, creditContainer: creditDiv,
    });
    tcam.imageryLayers.addImageryProvider(
      new C.UrlTemplateImageryProvider({ url: ESRI_SAT, maximumLevel: 17 })
    );
    tcam.useDefaultRenderLoop = false;   // driven manually at 20fps from main viewer
    tcam.scene.globe.depthTestAgainstTerrain = false;
    tcam.scene.globe.maximumScreenSpaceError = 12;
    tcam.scene.globe.tileCacheSize           = 150;
    tcam.scene.fog.enabled = false;
    const tc = tcam.scene.screenSpaceCameraController;
    tc.enableRotate = tc.enableTranslate = tc.enableZoom = false;
    tc.enableTilt   = tc.enableLook      = false;

    C.ArcGISTiledElevationTerrainProvider.fromUrl(ARCGIS_TRN).then(tp => {
      if (!tcam.isDestroyed()) tcam.terrainProvider = tp;
    }).catch(() => {});

    // Camera tracks currently selected target — 1 mile slant range, 10° elevation from NE
    const SLANT   = 1609.344;
    const HORIZ   = SLANT * Math.cos(C.Math.toRadians(10));   // ~1585 m horizontal
    const VERT    = SLANT * Math.sin(C.Math.toRadians(10));   //  ~279 m vertical
    const TCAM_ORI = { heading: C.Math.toRadians(225), pitch: C.Math.toRadians(-10), roll: 0 };
    const _tcamPos = new C.Cartesian3();

    // Globe-on-black holding position (shown while tiles load — identical look to chase cam)
    const GLOBE_ORI = { heading: 0, pitch: C.Math.toRadians(-90), roll: 0 };
    tcam.camera.setView({
      destination: C.Cartesian3.fromDegrees(51.4064, 32.0, 2500000),
      orientation: GLOBE_ORI,
    });

    // Switch to close-up target view once tiles have loaded (or 8 s fallback)
    let tcamReady = false;
    const activateTcam = () => {
      if (tcamReady || tcam.isDestroyed()) return;
      tcamReady = true;
      tcam.scene.globe.tileLoadProgressEvent.removeEventListener(onTcamTileProgress);
    };
    const onTcamTileProgress = (remaining) => { if (remaining === 0) activateTcam(); };
    tcam.scene.globe.tileLoadProgressEvent.addEventListener(onTcamTileProgress);
    const tcamFallback = setTimeout(activateTcam, 8000);

    const onTcamPreUpdate = () => {
      if (tcam.isDestroyed()) return;
      if (!tcamReady) {
        // Hold the globe view while loading
        tcam.camera.setView({
          destination: C.Cartesian3.fromDegrees(51.4064, 32.0, 2500000),
          orientation: GLOBE_ORI,
        });
        return;
      }
      const tgt = GOV_TARGETS[selectedIdxRef.current ?? 0];
      const gnd = Math.max(
        tcam.scene.globe.getHeight(C.Cartographic.fromDegrees(tgt.lon, tgt.lat)) ?? TEHRAN_MSL,
        TEHRAN_MSL
      );
      const camLat = tgt.lat + HORIZ / 111320;
      const camLon = tgt.lon + HORIZ / (111320 * Math.cos(tgt.lat * Math.PI / 180));
      C.Cartesian3.fromDegrees(camLon, camLat, gnd + VERT, C.Ellipsoid.WGS84, _tcamPos);
      tcam.camera.setView({ destination: _tcamPos, orientation: TCAM_ORI });
    };
    tcam.scene.preUpdate.addEventListener(onTcamPreUpdate);

    targetCamRef.current = tcam;
    return () => {
      clearTimeout(tcamFallback);
      tcam.scene.preUpdate.removeEventListener(onTcamPreUpdate);
      tcam.scene.globe.tileLoadProgressEvent.removeEventListener(onTcamTileProgress);
      if (!tcam.isDestroyed()) tcam.destroy();
    };
  }, []); // eslint-disable-line

  // ── Mouse tracking ──────────────────────────────────────────────────────────
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const onMove = e => {
      const r = board.getBoundingClientRect();
      const cx = r.width / 2, cy = r.height / 2;
      mouseRef.current = {
        nx: clamp((e.clientX - r.left - cx) / cx, -1, 1),
        ny: clamp((e.clientY - r.top  - cy) / cy, -1, 1),
      };
    };
    board.addEventListener('mousemove', onMove);
    return () => board.removeEventListener('mousemove', onMove);
  }, []);

  // ── Keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onDown = e => {
      // Tab — cycle selected target
      if (e.key === 'Tab') {
        e.preventDefault();
        if (missileRef.current) return; // no switching while missile in flight
        const next = (selectedIdxRef.current + 1) % GOV_TARGETS.length;
        // Skip already-destroyed targets
        let tries = 0;
        let idx = next;
        while (destroyedRef.current.has(idx) && tries < GOV_TARGETS.length) {
          idx = (idx + 1) % GOV_TARGETS.length;
          tries++;
        }
        selectedIdxRef.current = idx;
        addLog(`TARGET: ${GOV_TARGETS[idx].name}`, 'info');
      }

      // Space — launch JASSM (two-step: first press readies PIP, second confirms launch)
      if (e.key === ' ') {
        e.preventDefault();
        if (missileRef.current) return;
        // prevent rapid double-press while awaiting confirmation
        if (awaitLaunchConfirmRef.current === true && missileRef.current == null) {
          // allow proceed to confirmation/launch
        }
        const idx = selectedIdxRef.current;
        if (destroyedRef.current.has(idx)) {
          addLog('TARGET ALREADY DESTROYED — SELECT NEW TARGET', 'warn');
          return;
        }
        const tgt = GOV_TARGETS[idx];
        const f   = flightRef.current;
        const C   = window.Cesium;
        const v   = viewerRef.current;
        if (!v || v.isDestroyed()) return;
        // If this is the first space press, ready the PIP chase view and await confirmation
        const pipV = pipViewerRef.current;
        if (!awaitLaunchConfirmRef.current) {
          awaitLaunchConfirmRef.current = true;
          try {
            if (pipV && !pipV.isDestroyed()) {
              const camDest = C.Cartesian3.fromDegrees(f.lon - 0.0008, f.lat, f.altM + 200, C.Ellipsoid.WGS84);
              pipV.camera.setView({ destination: camDest, orientation: { heading: f.heading * Math.PI / 180, pitch: -0.6, roll: 0 } });
            }
          } catch (e) {}
          addLog('CHASE VIEW READY — press Space again to confirm launch', 'info');
          return;
        }

        // Second press confirms launch: create missile immediately
        awaitLaunchConfirmRef.current = false;
        addLog('LAUNCH CONFIRMED — Missile away', 'info');
          // Initial missile state: launch from aircraft position, heading toward target
          const dLonRad = (tgt.lon - f.lon) * Math.PI / 180;
          const lat1r   = f.lat * Math.PI / 180;
          const lat2r   = tgt.lat * Math.PI / 180;
          const bearingRad = Math.atan2(
            Math.sin(dLonRad) * Math.cos(lat2r),
            Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLonRad)
          );
          const bearingDeg = ((bearingRad * 180 / Math.PI) + 360) % 360;

          missileStateRef.current = {
            lat: f.lat, lon: f.lon, alt: f.altM,
            heading: bearingDeg,
            pitch: -20, // initial dive at -20°
            roll:  0,
            speed: MISSILE_SPD,
          };

          const _mPos  = new C.Cartesian3();
          const _mHPR  = new C.HeadingPitchRoll();
          const _mQuat = new C.Quaternion();

          const getMissilePos = () => {
            const ms = missileStateRef.current;
            if (!ms) return _mPos;
            return C.Cartesian3.fromDegrees(ms.lon, ms.lat, ms.alt, C.Ellipsoid.WGS84, _mPos);
          };

          const makeOrientationCb = () => new C.CallbackProperty(() => {
            const ms = missileStateRef.current;
            if (!ms) return null;
            _mHPR.heading = ms.heading * Math.PI / 180 + Math.PI / 2;
            _mHPR.pitch   = ms.pitch   * Math.PI / 180;
            _mHPR.roll    = (ms.roll || 0) * Math.PI / 180;
            return C.Transforms.headingPitchRollQuaternion(
              C.Cartesian3.fromDegrees(ms.lon, ms.lat, ms.alt),
              _mHPR, C.Ellipsoid.WGS84, undefined, _mQuat
            );
          }, false);

          const modelDef = {
            uri: '/tomahawk.glb',
            scale: 20,
            minimumPixelSize: 24,
            maximumScale: 100,
          };

          const missileEnt = v.entities.add({
            position:    new C.CallbackProperty(getMissilePos, false),
            orientation: makeOrientationCb(),
            model:       modelDef,
          });

          const pip = pipViewerRef.current;
          const pipMissileEnt = (pip && !pip.isDestroyed()) ? pip.entities.add({
            position:    new C.CallbackProperty(getMissilePos, false),
            orientation: makeOrientationCb(),
            model:       modelDef,
          }) : null;

          const tcamV = targetCamRef.current;
          const tcamMissileEnt = (tcamV && !tcamV.isDestroyed()) ? tcamV.entities.add({
            position:    new C.CallbackProperty(getMissilePos, false),
            orientation: makeOrientationCb(),
            model:       modelDef,
          }) : null;

          missileRef.current = { missileEnt, pipMissileEnt, tcamMissileEnt, targetIdx: idx };
          setMissileActive(true);
          setMissileEverFired(true);
          setChaseConnLost(false);
          awaitLaunchConfirmRef.current = false;
          msViolationRef.current = { start: null, graceUntil: Date.now() + 30000, intercepting: false };
          addLog(`JASSM AWAY — TARGET: ${tgt.name}`, 'warn');
          addLog('MOUSE TO GUIDE MISSILE.', '');
        }
    };
    window.addEventListener('keydown', onDown);
    return () => { window.removeEventListener('keydown', onDown); };
  }, [addLog]);

  // ── Jet engine audio — synthesised cockpit drone ────────────────────────────
  useEffect(() => {
    if (briefing) return;
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    if (ctx.state === 'suspended') ctx.resume();

    const master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    engineGainRef.current = master;

    const freqs = [48, 52, 96, 102, 144];
    const oscGain = ctx.createGain(); oscGain.gain.value = 0.18;
    const oscLp   = ctx.createBiquadFilter();
    oscLp.type = 'lowpass'; oscLp.frequency.value = 320; oscLp.Q.value = 1.2;
    oscGain.connect(oscLp); oscLp.connect(master);
    const oscs = freqs.map(f => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      o.connect(oscGain); o.start(); return o;
    });

    const SR = ctx.sampleRate;
    const nBuf = ctx.createBuffer(1, SR * 3, SR);
    const nd   = nBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = nBuf; noise.loop = true;
    const nLp = ctx.createBiquadFilter();
    nLp.type = 'lowpass'; nLp.frequency.value = 280; nLp.Q.value = 0.8;
    const nGain = ctx.createGain(); nGain.gain.value = 0.12;
    noise.connect(nLp); nLp.connect(nGain); nGain.connect(master);
    noise.start();

    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 28;
    const subG = ctx.createGain(); subG.gain.value = 0.06;
    sub.connect(subG); subG.connect(master); sub.start();

    return () => {
      oscs.forEach(o => { try { o.stop(); } catch {} });
      try { noise.stop(); sub.stop(); } catch {}
      ctx.close();
    };
  }, [briefing]);

  // ── Animation loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (briefing) return;
    let lastTime = null;

    const animate = time => {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      const C = window.Cesium;

      const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0.016;
      lastTime = time;

      const f = flightRef.current;
      const m = mouseRef.current;

      // ── Autopilot: hold station at START coordinates (no movement)
      f.speed  = START_SPD;
      f.altM   = START_ALT_M;
      f.pitch  = 0; f.roll = 0; f.vSpeed = 0;
      f.mach   = f.speed / 661.5;
      f.gForce = 1.0;
      // Lock lat/lon to start point so aircraft remains on station
      f.lat = START_LAT;
      f.lon = START_LON;
      // Keep heading fixed (start heading)
      f.heading = START_HDG;

      // ── Missile physics (60fps) + SAM / hit / terrain checks ─────────────
      if (missileRef.current && missileStateRef.current) {
        const ms = missileStateRef.current;
        const DZ = 0.06;
        const dz = v => { const s = Math.sign(v), a = Math.abs(v); return a < DZ ? 0 : s * (a - DZ) / (1 - DZ); };
        ms.heading = ((ms.heading + dz(m.nx) * 70 * dt) + 360) % 360;
        ms.pitch   = clamp(ms.pitch + (-dz(m.ny)) * 30 * dt, -60, 40);
        ms.roll    = ms.roll + (-dz(m.nx) * 55 - ms.roll) * 5 * dt;
        const mHdgRad = ms.heading * Math.PI / 180;
        ms.lat += ms.speed * dt * Math.cos(mHdgRad) / 111320;
        ms.lon += ms.speed * dt * Math.sin(mHdgRad) / (111320 * Math.cos(ms.lat * Math.PI / 180));
        ms.alt  = ms.alt + ms.speed * Math.sin(ms.pitch * Math.PI / 180) * dt;

        // ── SAM intercept: any condition held for ≥3 continuous seconds ────────────
        // • >3000 ft AGL anywhere
        // • >10000 ft MSL anywhere
        // • >500 ft AGL within 5 miles of target
        try {
          const now = Date.now();
          if (msViolationRef.current.graceUntil && now < msViolationRef.current.graceUntil) {
            msViolationRef.current.start = null;
          } else if (!msViolationRef.current.intercepting) {
            const terrainCarto2 = C.Cartographic.fromDegrees(ms.lon, ms.lat);
            const groundH2      = viewer.scene.globe.getHeight(terrainCarto2) ?? TEHRAN_MSL;
            const aglM          = ms.alt - groundH2;
            const overAGL       = aglM > 3000 * 0.3048;
            const overMSL       = ms.alt > 10000 * 0.3048;
            const tgtRef        = GOV_TARGETS[missileRef.current.targetIdx];
            const distToTgtM    = distKm(ms.lat, ms.lon, tgtRef.lat, tgtRef.lon) * 1000;
            const nearTarget    = distToTgtM <= 5 * 1609.344;
            const overTargetAGL = nearTarget && aglM > 500 * 0.3048;
            if (overAGL || overMSL || overTargetAGL) {
              if (!msViolationRef.current.start) {
                msViolationRef.current.start = now;
              } else if (now - msViolationRef.current.start >= 3000) {
                msViolationRef.current.intercepting = true;
                addLog('⚠ SAM LOCK — INCOMING MISSILE DETECTED', 'bad');

                // Step 1 — voice alert
                try { speakReport('Incoming SAM detected'); } catch (e) {}

                // Step 2 — alarm beeps ~1.4s after voice starts
                setTimeout(() => {
                  try {
                    const actx = new (window.AudioContext || window.webkitAudioContext)();
                    [0, 0.32, 0.64, 0.96, 1.28].forEach(t => {
                      const osc = actx.createOscillator();
                      const g   = actx.createGain();
                      osc.connect(g); g.connect(actx.destination);
                      osc.frequency.value = 1100;
                      g.gain.setValueAtTime(0.65, actx.currentTime + t);
                      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + t + 0.26);
                      osc.start(actx.currentTime + t);
                      osc.stop(actx.currentTime + t + 0.28);
                    });
                    setTimeout(() => { try { actx.close(); } catch (_) {} }, 2500);
                  } catch (e) {}
                }, 1400);

                // Step 3 — clear missile + Connection Lost after alarm finishes
                setTimeout(() => {
                  if (periodicAnnounceRef.current) { clearInterval(periodicAnnounceRef.current); periodicAnnounceRef.current = null; }
                  const mref = missileRef.current;
                  if (mref) {
                    try { viewer.entities.remove(mref.missileEnt); } catch (_) {}
                    const _pip = pipViewerRef.current;
                    if (mref.pipMissileEnt && _pip && !_pip.isDestroyed()) { try { _pip.entities.remove(mref.pipMissileEnt); } catch (_) {} }
                    const _tc = targetCamRef.current;
                    if (mref.tcamMissileEnt && _tc && !_tc.isDestroyed()) { try { _tc.entities.remove(mref.tcamMissileEnt); } catch (_) {} }
                  }
                  missileRef.current      = null;
                  missileStateRef.current = null;
                  msViolationRef.current  = { start: null, graceUntil: null, intercepting: false };
                  setMissileActive(false);
                  setChaseConnLost(true);
                }, 3800);
              }
            } else {
              msViolationRef.current.start = null;
            }
          }
        } catch (e) {}


        const { missileEnt, pipMissileEnt, tcamMissileEnt, targetIdx } = missileRef.current;
        const tgt = GOV_TARGETS[targetIdx];

        const clearMissile = () => {
          viewer.entities.remove(missileEnt);
          const pip = pipViewerRef.current;
          if (pipMissileEnt && pip && !pip.isDestroyed()) pip.entities.remove(pipMissileEnt);
          const tcamV2 = targetCamRef.current;
          if (tcamMissileEnt && tcamV2 && !tcamV2.isDestroyed()) tcamV2.entities.remove(tcamMissileEnt);
          missileRef.current      = null;
          missileStateRef.current = null;
          msViolationRef.current.start = null;
          msViolationRef.current.graceUntil = null;
          setMissileActive(false);
        };

        // Hit detection — horizontal proximity + near-ground altitude at target
        const distH  = distKm(ms.lat, ms.lon, tgt.lat, tgt.lon) * 1000;
        const tgtGndCarto = C.Cartographic.fromDegrees(tgt.lon, tgt.lat);
        const groundAtTgt = viewer.scene.globe.getHeight(tgtGndCarto) ?? TEHRAN_MSL;
        const aglAtTgt    = ms.alt - groundAtTgt;

        if (distH < 350 && aglAtTgt > -30 && aglAtTgt < 60) {
          // ── HIT ────────────────────────────────────────────────────────────
          clearMissile();
          destroyedRef.current.add(targetIdx);
          triggerMoabExplosion(viewer, C, tgt.lat, tgt.lon, addLog, tgt.name, containerRef.current, groundAtTgt);
          const _pip = pipViewerRef.current;
          if (_pip && !_pip.isDestroyed()) triggerMoabExplosion(_pip, C, tgt.lat, tgt.lon, addLog, tgt.name, null, groundAtTgt, true);
          const _tc = targetCamRef.current;
          if (_tc && !_tc.isDestroyed()) triggerMoabExplosion(_tc, C, tgt.lat, tgt.lon, addLog, tgt.name, null, groundAtTgt, true);
          setTimeout(() => setChaseConnLost(true), 800);
          if (destroyedRef.current.size >= GOV_TARGETS.length) {
            setTimeout(() => setMissionComplete(true), 3000);
          }
        } else {
          // ── TERRAIN COLLISION — sample actual ground height ────────────────
          const terrainCarto = C.Cartographic.fromDegrees(ms.lon, ms.lat);
          const groundH = viewer.scene.globe.getHeight(terrainCarto);
          if (groundH !== undefined && ms.alt <= groundH + 8) {
            const terrG = viewer.scene.globe.getHeight(terrainCarto) ?? TEHRAN_MSL;
            triggerMoabExplosion(viewer, C, ms.lat, ms.lon, addLog, 'TERRAIN', containerRef.current, terrG);
            const _pip2 = pipViewerRef.current;
            if (_pip2 && !_pip2.isDestroyed()) triggerMoabExplosion(_pip2, C, ms.lat, ms.lon, addLog, 'TERRAIN', null, terrG, true);
            const _tc2 = targetCamRef.current;
            if (_tc2 && !_tc2.isDestroyed()) triggerMoabExplosion(_tc2, C, ms.lat, ms.lon, addLog, 'TERRAIN', null, terrG, true);
            clearMissile();
            setTimeout(() => setChaseConnLost(true), 800);
            addLog('TERRAIN IMPACT — MISSILE LOST', 'warn');
          }
        }
      }

      // ── HUD ───────────────────────────────────────────────────────────────
      const hud = hudCanvasRef.current;
      if (hud) {
        if (hud.width !== hud.offsetWidth || hud.height !== hud.offsetHeight) {
          hud.width  = hud.offsetWidth  || window.innerWidth;
          hud.height = hud.offsetHeight || window.innerHeight;
        }
        const selIdx  = selectedIdxRef.current;
        const selName = GOV_TARGETS[selIdx].name;
        let distToTarget = null;
        if (missileStateRef.current) {
          const ms  = missileStateRef.current;
          const tgt = GOV_TARGETS[missileRef.current?.targetIdx ?? selIdx];
          distToTarget = distKm(ms.lat, ms.lon, tgt.lat, tgt.lon);
        }
        const targets = GOV_TARGETS.reduce((acc, t, i) => {
          const world = C.Cartesian3.fromDegrees(t.lon, t.lat, 1300);
          const sc    = viewer.scene.cartesianToCanvasCoordinates(world);
          if (sc) acc.push({ name: t.name, sx: sc.x, sy: sc.y, selected: i === selIdx, destroyed: destroyedRef.current.has(i) });
          return acc;
        }, []);
        const flightCarto = C.Cartographic.fromDegrees(f.lon, f.lat);
        const groundH = viewer.scene.globe.getHeight(flightCarto) ?? TEHRAN_MSL;
        drawHUD(hud, { ...f }, targets, !!missileRef.current, distToTarget, selName, groundH);
      }

      // ── PIP HUD — target bracket + distance in missile chase window ────────
      const pipHud = pipHudCanvasRef.current;
      const pip    = pipViewerRef.current;
      if (pipHud && pip && !pip.isDestroyed() && missileRef.current) {
        // Match canvas pixel size to Cesium's PIP canvas
        const pipCanvas = pip.canvas;
        if (pipHud.width  !== pipCanvas.width)  pipHud.width  = pipCanvas.width;
        if (pipHud.height !== pipCanvas.height) pipHud.height = pipCanvas.height;

        const phCtx = pipHud.getContext('2d');
        const PW = pipHud.width, PH = pipHud.height;
        phCtx.clearRect(0, 0, PW, PH);

        // Project selected target into PIP camera space using actual terrain elevation
        const selTgt    = GOV_TARGETS[selectedIdxRef.current];
        const tgtGndH   = pip.scene.globe.getHeight(C.Cartographic.fromDegrees(selTgt.lon, selTgt.lat)) ?? TEHRAN_MSL;
        const tgtWorld  = C.Cartesian3.fromDegrees(selTgt.lon, selTgt.lat, tgtGndH + 50);
        const tgtScreen = pip.scene.cartesianToCanvasCoordinates(tgtWorld);

        const distToPip = missileStateRef.current
          ? distKm(missileStateRef.current.lat, missileStateRef.current.lon, selTgt.lat, selTgt.lon)
          : null;

        if (tgtScreen && tgtScreen.x >= 0 && tgtScreen.x <= PW && tgtScreen.y >= 0 && tgtScreen.y <= PH) {
          // Target is on screen — draw targeting bracket
          const { x, y } = tgtScreen;
          const BW = 56, BH = 56, BL = 14;
          const pulse = 0.55 + 0.45 * Math.sin(Date.now() / 180);

          phCtx.strokeStyle = '#FF2020';
          phCtx.lineWidth   = 2;
          phCtx.beginPath();
          phCtx.moveTo(x - BW/2,        y - BH/2 + BL); phCtx.lineTo(x - BW/2, y - BH/2); phCtx.lineTo(x - BW/2 + BL, y - BH/2);
          phCtx.moveTo(x + BW/2 - BL,   y - BH/2);       phCtx.lineTo(x + BW/2, y - BH/2); phCtx.lineTo(x + BW/2,      y - BH/2 + BL);
          phCtx.moveTo(x - BW/2,        y + BH/2 - BL); phCtx.lineTo(x - BW/2, y + BH/2); phCtx.lineTo(x - BW/2 + BL, y + BH/2);
          phCtx.moveTo(x + BW/2 - BL,   y + BH/2);       phCtx.lineTo(x + BW/2, y + BH/2); phCtx.lineTo(x + BW/2,      y + BH/2 - BL);
          phCtx.stroke();

          // Pulsing centre dot
          phCtx.fillStyle = `rgba(255,32,32,${pulse})`;
          phCtx.beginPath(); phCtx.arc(x, y, 4, 0, Math.PI * 2); phCtx.fill();

          // Distance label below bracket
          if (distToPip !== null) {
            phCtx.fillStyle = '#FF2020';
            phCtx.font      = 'bold 11px "Courier New",monospace';
            phCtx.textAlign = 'center'; phCtx.textBaseline = 'top';
            phCtx.fillText(
              distToPip < 1 ? `${Math.round(distToPip * 1000)} m` : `${distToPip.toFixed(1)} km`,
              x, y + BH / 2 + 4
            );
          }
        } else {
          // Target off-screen — draw edge arrow pointing toward it
          const ms    = missileStateRef.current;
          const dxKm  = (selTgt.lon - ms.lon) * 111.32 * Math.cos(ms.lat * Math.PI / 180);
          const dyKm  = (selTgt.lat - ms.lat) * 111.32;
          const angle = Math.atan2(-dyKm, dxKm); // screen: y flipped
          const cx2   = PW / 2 + Math.cos(angle) * PW * 0.4;
          const cy2   = PH / 2 + Math.sin(angle) * PH * 0.38;
          const AR    = 14;
          phCtx.save();
          phCtx.translate(cx2, cy2); phCtx.rotate(angle - Math.PI / 2);
          phCtx.fillStyle = '#FF2020';
          phCtx.beginPath();
          phCtx.moveTo(0, -AR); phCtx.lineTo(-AR * 0.6, AR * 0.6); phCtx.lineTo(AR * 0.6, AR * 0.6);
          phCtx.closePath(); phCtx.fill();
          phCtx.restore();
          if (distToPip !== null) {
            phCtx.fillStyle = '#FF2020';
            phCtx.font      = 'bold 10px "Courier New",monospace';
            phCtx.textAlign = 'center'; phCtx.textBaseline = 'middle';
            phCtx.fillText(distToPip < 1 ? `${Math.round(distToPip * 1000)} m` : `${distToPip.toFixed(1)} km`, cx2, cy2 + AR + 8);
          }
        }

        // Crosshair centre reference
        phCtx.strokeStyle = 'rgba(255,255,255,.25)';
        phCtx.lineWidth   = 1;
        phCtx.beginPath();
        phCtx.moveTo(PW/2 - 12, PH/2); phCtx.lineTo(PW/2 + 12, PH/2);
        phCtx.moveTo(PW/2, PH/2 - 12); phCtx.lineTo(PW/2, PH/2 + 12);
        phCtx.stroke();

        // Missile heading + elevation readouts
        const ms2 = missileStateRef.current;
        if (ms2) {
          const hdgStr = ((Math.round(ms2.heading) % 360 + 360) % 360).toString().padStart(3, '0') + '°';
          // Compute above-ground altitude (AGL) using PIP globe height at missile position
          let groundH = TEHRAN_MSL;
          try {
            const cart = C.Cartographic.fromDegrees(ms2.lon, ms2.lat);
            const gh = pip.scene.globe.getHeight(cart);
            if (gh !== undefined && gh !== null) groundH = gh;
          } catch (e) {}
          const aglFt = Math.round(Math.max(0, ms2.alt - groundH) * 3.28084).toLocaleString();
          const mslFt = Math.round(ms2.alt * 3.28084).toLocaleString();
          const pitStr = (ms2.pitch >= 0 ? '+' : '') + Math.round(ms2.pitch) + '°';

          phCtx.font      = 'bold 12px "Courier New",monospace';
          phCtx.fillStyle = HUD_G;
          phCtx.textBaseline = 'top';

          // Heading — top centre
          phCtx.textAlign = 'center';
          phCtx.fillText(`HDG  ${hdgStr}`, PW / 2, 6);

          // Pitch — top left
          phCtx.textAlign = 'left';
          phCtx.fillText(`ELEV  ${pitStr}`, 6, 6);

          // Small Heading HUD (top-right)
          try {
            const boxW = 96, boxH = 44;
            const bx = PW - boxW - 8, by = 8;
            phCtx.fillStyle = 'rgba(0,0,0,0.85)';
            phCtx.fillRect(bx, by, boxW, boxH);
            phCtx.strokeStyle = 'rgba(255,255,255,0.08)'; phCtx.lineWidth = 1; phCtx.strokeRect(bx, by, boxW, boxH);
            phCtx.fillStyle = '#FFFFFF';
            phCtx.font = 'bold 18px "Courier New",monospace';
            phCtx.textAlign = 'center'; phCtx.textBaseline = 'middle';
            phCtx.fillText(hdgStr, bx + boxW / 2, by + boxH * 0.42);
            phCtx.font = '10px "Courier New",monospace';
            phCtx.fillText('HDG', bx + boxW / 2, by + boxH * 0.82);
            // Cardinal indicator
            const cardIdx = Math.floor(((ms2.heading + 22.5) % 360) / 45) & 7;
            const cardinals = ['N','NE','E','SE','S','SW','W','NW'];
            phCtx.font = 'bold 12px "Courier New",monospace';
            phCtx.fillText(cardinals[cardIdx], bx + boxW - 14, by + 12);
          } catch (e) {}

          // Bottom-centre box showing real-time MSL / AGL for the chaser
          try {
            const boxW = Math.min(260, PW - 12);
            const boxH = 48;
            const bx = (PW - boxW) / 2;
            const by = PH - boxH - 8;
            phCtx.fillStyle = 'rgba(0,0,0,0.85)';
            phCtx.fillRect(bx, by, boxW, boxH);
            phCtx.strokeStyle = 'rgba(255,255,255,0.06)'; phCtx.lineWidth = 1; phCtx.strokeRect(bx, by, boxW, boxH);
            phCtx.fillStyle = '#FFFFFF';
            phCtx.font = 'bold 16px "Courier New",monospace';
            phCtx.textAlign = 'center'; phCtx.textBaseline = 'middle';
            phCtx.fillText(`${mslFt} FT MSL`, PW / 2, by + boxH * 0.33);
            phCtx.font = 'bold 14px "Courier New",monospace';
            phCtx.fillText(`${aglFt} FT AGL`, PW / 2, by + boxH * 0.70);
          } catch (e) {}

          // Bottom-left box — missile speed in MPH
          try {
            const mph    = Math.round(ms2.speed * 2.23694);
            const boxW = 110, boxH = 44;
            const bx = 8, by = PH - boxH - 8;
            phCtx.fillStyle = 'rgba(0,0,0,0.85)';
            phCtx.fillRect(bx, by, boxW, boxH);
            phCtx.strokeStyle = 'rgba(255,255,255,0.08)'; phCtx.lineWidth = 1; phCtx.strokeRect(bx, by, boxW, boxH);
            phCtx.fillStyle = HUD_G;
            phCtx.font = '10px "Courier New",monospace';
            phCtx.textAlign = 'center'; phCtx.textBaseline = 'middle';
            phCtx.fillText('SPEED', bx + boxW / 2, by + boxH * 0.30);
            phCtx.fillStyle = '#FFFFFF';
            phCtx.font = 'bold 16px "Courier New",monospace';
            phCtx.fillText(`${mph} MPH`, bx + boxW / 2, by + boxH * 0.68);
          } catch (e) {}

          // Bottom-right box — missile-to-target distance
          if (distToPip !== null) {
            try {
              const distStr = distToPip < 1
                ? `${Math.round(distToPip * 1000)} M`
                : `${(distToPip * 0.621371).toFixed(1)} MI`;
              const boxW = 110, boxH = 44;
              const bx = PW - boxW - 8, by = PH - boxH - 8;
              phCtx.fillStyle = 'rgba(0,0,0,0.85)';
              phCtx.fillRect(bx, by, boxW, boxH);
              phCtx.strokeStyle = 'rgba(255,32,32,0.4)'; phCtx.lineWidth = 1; phCtx.strokeRect(bx, by, boxW, boxH);
              phCtx.fillStyle = '#FF4444';
              phCtx.font = '10px "Courier New",monospace';
              phCtx.textAlign = 'center'; phCtx.textBaseline = 'middle';
              phCtx.fillText('MSL → TGT', bx + boxW / 2, by + boxH * 0.30);
              phCtx.fillStyle = '#FFFFFF';
              phCtx.font = 'bold 16px "Courier New",monospace';
              phCtx.fillText(distStr, bx + boxW / 2, by + boxH * 0.68);
            } catch (e) {}
          }
        }
      } else if (pipHud && !missileRef.current) {
        // Clear PIP HUD when no missile
        const phCtx = pipHud.getContext('2d');
        phCtx.clearRect(0, 0, pipHud.width, pipHud.height);
      }

      // ── Target cam HUD — target marker ──────────────────────────────────────
      const tcamHud = tcamHudCanvasRef.current;
      const tcamV   = targetCamRef.current;
      if (tcamHud && tcamV && !tcamV.isDestroyed()) {
        const tcCanvas = tcamV.canvas;
        if (tcamHud.width  !== tcCanvas.width)  tcamHud.width  = tcCanvas.width;
        if (tcamHud.height !== tcCanvas.height) tcamHud.height = tcCanvas.height;
        const tc = tcamHud.getContext('2d');
        const TW = tcamHud.width, TH = tcamHud.height;
        tc.clearRect(0, 0, TW, TH);

        const selTgt   = GOV_TARGETS[selectedIdxRef.current ?? 0];
        const tgtGndH  = tcamV.scene.globe.getHeight(
          C.Cartographic.fromDegrees(selTgt.lon, selTgt.lat)
        ) ?? TEHRAN_MSL;
        const tgtWorld  = C.Cartesian3.fromDegrees(selTgt.lon, selTgt.lat, tgtGndH + 50);
        const tgtScreen = tcamV.scene.cartesianToCanvasCoordinates(tgtWorld);

        if (tgtScreen && tgtScreen.x >= 0 && tgtScreen.x <= TW && tgtScreen.y >= 0 && tgtScreen.y <= TH) {
          const { x, y } = tgtScreen;
          const BW = 56, BH = 56, BL = 14;
          const pulse = 0.55 + 0.45 * Math.sin(Date.now() / 180);
          tc.strokeStyle = '#00D4FF';
          tc.lineWidth   = 2;
          tc.beginPath();
          tc.moveTo(x - BW/2,       y - BH/2 + BL); tc.lineTo(x - BW/2,  y - BH/2); tc.lineTo(x - BW/2 + BL, y - BH/2);
          tc.moveTo(x + BW/2 - BL,  y - BH/2);      tc.lineTo(x + BW/2,  y - BH/2); tc.lineTo(x + BW/2,      y - BH/2 + BL);
          tc.moveTo(x - BW/2,       y + BH/2 - BL); tc.lineTo(x - BW/2,  y + BH/2); tc.lineTo(x - BW/2 + BL, y + BH/2);
          tc.moveTo(x + BW/2 - BL,  y + BH/2);      tc.lineTo(x + BW/2,  y + BH/2); tc.lineTo(x + BW/2,      y + BH/2 - BL);
          tc.stroke();
          tc.fillStyle = `rgba(0,212,255,${pulse})`;
          tc.beginPath(); tc.arc(x, y, 4, 0, Math.PI * 2); tc.fill();
          // Target name below bracket
          tc.fillStyle = '#00D4FF';
          tc.font      = 'bold 11px "Courier New",monospace';
          tc.textAlign = 'center'; tc.textBaseline = 'top';
          tc.fillText(selTgt.name, x, y + BH / 2 + 4);
        }
      }

      // ── 80 / 10 / 10 viewer rendering ────────────────────────────────────
      // Chase cam gets 8 of every 10 rAF frames; main cockpit and target cam
      // each get 1, staggered so no two heavy renders happen in the same frame.
      const fc = (rafFrameCountRef.current = (rafFrameCountRef.current + 1) % 10);
      if (fc < 8) {                                      // chase cam  80 %
        const pip2 = pipViewerRef.current;
        if (pip2 && !pip2.isDestroyed()) pip2.render();
      } else if (fc === 8) {                             // main view  10 %
        if (!viewer.isDestroyed()) viewer.render();
      } else {                                           // target cam 10 %
        const tcam2 = targetCamRef.current;
        if (tcam2 && !tcam2.isDestroyed()) tcam2.render();
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [briefing, addLog]);

  // ── Render ──────────────────────────────────────────────────────────────────
  const targetsRemaining = GOV_TARGETS.length - destroyedRef.current.size;

  return (
    <div className="game-wrap">
      {briefing && <Level6Briefing playerName={playerName} onReady={() => setBriefing(false)} />}

      <div className="hud">
        <div className="hud-brand">TACT/CMD <span>LEVEL 6 — STRATEGIC STRIKE</span></div>
        <div className="hud-stats">
          <div className="hud-stat"><span className="hud-stat-label">Platform</span><span className="hud-stat-value">B-1B LANCER</span></div>
          <div className="hud-stat"><span className="hud-stat-label">AO</span><span className="hud-stat-value">TEHRAN</span></div>
          <div className="hud-stat"><span className="hud-stat-label">Targets</span><span className="hud-stat-value" style={{ color: targetsRemaining > 0 ? '#FF2020' : '#00FF88' }}>{targetsRemaining} REMAINING</span></div>
          <div className="hud-stat"><span className="hud-stat-label">Missile</span><span className="hud-stat-value" style={{ color: missileActive ? '#FF8C00' : '#00FF88' }}>{missileActive ? 'AWAY' : 'ARMED'}</span></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.2rem' }}>
          <div className="hud-player">COMMANDER <strong>{playerName}</strong></div>
          <div className="hud-connection"><div className="dot-online" />SECURE LINK ACTIVE</div>
        </div>
      </div>

      <div className="game-body">

        {/* Left sidebar */}
        <div className="sidebar">
          <div className="panel">
            <div className="panel-title accent">// Weapon Controls</div>
            {[
              ['Tab',   'Cycle Target'],
              ['Space', 'Launch JASSM'],
              ['Mouse', 'Steer Missile'],
            ].map(([k, v]) => (
              <div className="intel-row" key={k}>
                <span className="intel-key" style={{ color: k === 'Space' ? '#FF2020' : 'var(--cyan)' }}>{k}</span>
                <span className="intel-val">{v}</span>
              </div>
            ))}
          </div>

          <div className="panel">
            <div className="panel-title accent">// Targets</div>
            {GOV_TARGETS.map((t, i) => (
              <div className="intel-row" key={i} style={{ paddingTop: '.1rem', paddingBottom: '.1rem' }}>
                <span style={{
                  fontSize: '.55rem', fontWeight: 700,
                  color: destroyedRef.current.has(i) ? '#555' :
                         i === selectedIdxRef.current ? '#FF2020' : 'rgba(255,255,255,.45)',
                  textDecoration: destroyedRef.current.has(i) ? 'line-through' : 'none',
                }}>
                  {destroyedRef.current.has(i) ? '✕' : i === selectedIdxRef.current ? '▶' : '○'} {t.name}
                </span>
              </div>
            ))}
          </div>

          <button
            className="btn-secondary"
            style={{ marginTop: 'auto', color: showAlborz ? '#00FF88' : 'var(--cyan)', borderColor: showAlborz ? 'rgba(0,255,136,.5)' : undefined }}
            onClick={() => setShowAlborz(v => !v)}
          >
            {showAlborz ? '✕ HIDE FLIGHT PATH' : '▶ MISSILE FLIGHT PATH'}
          </button>

          <button className="btn-secondary" style={{ marginTop: '.5rem' }} onClick={onPlayAgain}>
            ← Return to Missions
          </button>
        </div>

        {/* Main 3D cockpit view */}
        <div ref={boardRef} className="board-area"
          style={{ padding: 0, overflow: 'hidden', position: 'relative', alignItems: 'stretch', cursor: 'crosshair' }}>

          <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

          {/* HUD canvas overlay */}
          <canvas ref={hudCanvasRef} style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: 15,
          }} />

          {/* Target cam — 200 yd NE at 45°, top-left */}
          <div style={{
            position: 'absolute', top: 16, left: 16,
            width: (missileActive || missileEverFired) ? '48%' : '24%', aspectRatio: '16/9',
            transition: 'width .35s ease, border-color .3s',
            border: '2px solid rgba(0,212,255,.45)',
            zIndex: 30, overflow: 'hidden',
          }}>
            <div ref={targetCamContainerRef} style={{ position: 'absolute', inset: 0 }} />
            <canvas ref={tcamHudCanvasRef} style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              pointerEvents: 'none', zIndex: 37,
            }} />
            <div style={{
              position: 'absolute', top: 4, left: 6, zIndex: 35,
              fontFamily: 'var(--font-mono)', fontSize: '.5rem', fontWeight: 700,
              color: 'rgba(0,212,255,.7)', letterSpacing: '.12em',
            }}>
              TARGET CAM — {GOV_TARGETS[selectedIdxRef.current]?.name ?? ''}
            </div>
          </div>

          {/* PIP window — missile chase view, top-right */}
          <div style={{
            position: 'absolute', top: 16, right: 16,
            width: (missileActive || missileEverFired) ? '48%' : '24%', aspectRatio: '16/9',
            transition: 'width .35s ease',
            border: `2px solid ${missileActive ? 'rgba(255,140,0,.85)' : 'rgba(0,255,65,.25)'}`,
            zIndex: 30, overflow: 'hidden',
            boxShadow: missileActive ? '0 0 16px rgba(255,140,0,.35)' : 'none',
            transition: 'border-color .3s, box-shadow .3s',
          }}>
            <div ref={pipContainerRef} style={{ position: 'absolute', inset: 0 }} />
            {/* HUD overlay — target bracket drawn by animation loop */}
            <canvas ref={pipHudCanvasRef} style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              pointerEvents: 'none', zIndex: 37,
            }} />
            {/* Connection-lost overlay — appears ~0.8s after detonation */}
            {chaseConnLost && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 40,
                background: 'rgba(0,0,0,0.92)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: '.7rem', fontWeight: 700,
                  color: '#FF2020', letterSpacing: '.2em', textTransform: 'uppercase',
                  animation: 'pulse-red 1.2s ease-in-out infinite',
                }}>⚠ CONNECTION LOST</div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: '.45rem',
                  color: 'rgba(255,32,32,.55)', letterSpacing: '.15em',
                }}>FEED TERMINATED</div>
              </div>
            )}
            {/* PIP label */}
            <div style={{
              position: 'absolute', top: 4, left: 6, zIndex: 35,
              fontFamily: 'var(--font-mono)', fontSize: '.5rem', fontWeight: 700,
              color: missileActive ? '#FF8C00' : 'rgba(0,255,65,.4)',
              letterSpacing: '.12em',
            }}>
              {missileActive ? '◉ JASSM CAM' : 'MISSILE CAM'}
            </div>
            {!missileActive && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,.45)',
                fontFamily: 'var(--font-mono)', fontSize: '.55rem',
                color: 'rgba(0,255,65,.35)', letterSpacing: '.1em', zIndex: 34,
              }}>
                STANDBY
              </div>
            )}
            {/* Crosshair overlay when missile active */}
            {missileActive && (
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 36, pointerEvents: 'none' }}>
                <line x1="50%" y1="30%" x2="50%" y2="70%" stroke="rgba(255,140,0,.5)" strokeWidth="1" />
                <line x1="30%" y1="50%" x2="70%" y2="50%" stroke="rgba(255,140,0,.5)" strokeWidth="1" />
                <circle cx="50%" cy="50%" r="8" fill="none" stroke="rgba(255,140,0,.6)" strokeWidth="1" />
              </svg>
            )}
          </div>

          {/* Mission complete overlay */}
          {missionComplete && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', zIndex: 50,
              background: 'rgba(0,0,0,.82)',
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '2.2rem', fontWeight: 700,
                color: '#00FF88', letterSpacing: '.2em', textAlign: 'center',
                textShadow: '0 0 30px rgba(0,255,136,.8)',
              }}>
                MISSION COMPLETE
              </div>
              <div style={{ marginTop: '.8rem', fontFamily: 'var(--font-mono)', fontSize: '.9rem', color: '#00FF88', letterSpacing: '.15em' }}>
                ALL TARGETS ELIMINATED
              </div>
              <button className="btn-secondary"
                style={{ marginTop: '2rem', color: 'var(--cyan)', borderColor: 'rgba(0,212,255,.4)' }}
                onClick={onPlayAgain}>
                ← Return to Missions
              </button>
            </div>
          )}

          {/* Alborz flight path — bottom-left, same size as top screens */}
          {showAlborz && (
            <div style={{
              position: 'absolute', bottom: 16, left: 16,
              width: (missileActive || missileEverFired) ? '48%' : '24%',
              aspectRatio: '16/9',
              transition: 'width .35s ease',
              border: '2px solid rgba(0,212,255,.45)',
              zIndex: 30, overflow: 'hidden',
              background: '#000',
            }}>
              <img
                src="/ALBORZ Path.png"
                alt="Alborz missile flight path"
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
              />
              <div style={{
                position: 'absolute', top: 4, left: 6, zIndex: 35,
                fontFamily: 'var(--font-mono)', fontSize: '.5rem', fontWeight: 700,
                color: 'rgba(0,212,255,.7)', letterSpacing: '.12em',
              }}>
                ALBORZ PASS — FLIGHT PATH
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar — mission log */}
        <div className="sidebar">
          <div className="panel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="panel-title">// Mission Log</div>
            <div className="log-list" style={{ flex: 1 }}>
              {log.map((entry, i) => (
                <div key={i} className="log-entry">
                  <span className="log-ts">{entry.ts}</span>
                  <span className={`log-msg ${entry.cls}`}>{entry.msg}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
