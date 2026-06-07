import { useEffect, useRef, useState, useCallback } from 'react';

// ── F-22 Raptor — Tehran Overflight / OP-NIGHTFALL ────────────────────────────

const START_LAT   = 35.72;   // western outskirts of Tehran
const START_LON   = 50.82;   // ~55 km west of city centre
const START_ALT_M = 9144;    // 30 000 ft
const START_HDG   = 90;      // heading east — city spreads out ahead
const START_SPD   = 420;
const MIN_ALT_M   = 1500;    // Tehran ~1 200 m MSL
const MAX_SPD     = 750;
const MIN_SPD     = 200;

const ESRI_SAT   = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ARCGIS_TRN = 'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer';
const HUD_G      = '#00FF41';

// Iranian government targets — laser-tagged green from cockpit
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

// IRGC HQ target (index 4 in GOV_TARGETS)
const IRGC = { lat: 35.7700, lon: 51.3900 };

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

// ── HUD Canvas Drawing ────────────────────────────────────────────────────────
// targets = [{name, sx, sy, destroyed, selected}]
function drawHUD(canvas, f, targets = [], weaponLine = '', selectedName = '') {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  ctx.clearRect(0, 0, W, H);

  const altFt = Math.round(f.altM * 3.28084);
  const vsFpm = Math.round(f.vSpeed * 196.85);
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
      ctx.stroke();
      continue;
    }
    const is10 = deg % 10 === 0;
    const half = is10 ? 58 : 30;
    const gap  = 14;
    const nd   = deg > 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(-half, y); ctx.lineTo(-gap, y);
    ctx.moveTo(gap, y);   ctx.lineTo(half, y);
    ctx.stroke();
    if (is10) {
      ctx.beginPath();
      ctx.moveTo(-half, y); ctx.lineTo(-half, y + nd * 8);
      ctx.moveTo( half, y); ctx.lineTo( half, y + nd * 8);
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
    const a  = (d - 90) * Math.PI / 180;
    const tl = d === 0 ? 14 : Math.abs(d) % 30 === 0 ? 11 : Math.abs(d) === 45 ? 9 : 6;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * BAR, Math.sin(a) * BAR);
    ctx.lineTo(Math.cos(a) * (BAR - tl), Math.sin(a) * (BAR - tl));
    ctx.stroke();
  });
  const bA  = (f.roll - 90) * Math.PI / 180;
  const bCx = Math.cos(bA), bCy = Math.sin(bA);
  const px  = -bCy, py = bCx;
  ctx.beginPath();
  ctx.moveTo(bCx * (BAR - 3), bCy * (BAR - 3));
  ctx.lineTo(bCx * (BAR - 16) + px * 6, bCy * (BAR - 16) + py * 6);
  ctx.lineTo(bCx * (BAR - 16) - px * 6, bCy * (BAR - 16) - py * 6);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // ── Flight path marker ────────────────────────────────────────────────────
  const fpOff = -(f.fpa - f.pitch) * PPD;
  const fpY   = cy + fpOff * Math.cos(f.roll * Math.PI / 180);
  const FPR   = 12;
  ctx.beginPath(); ctx.arc(cx, fpY, FPR, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + FPR, fpY); ctx.lineTo(cx + FPR + 14, fpY);
  ctx.moveTo(cx - FPR, fpY); ctx.lineTo(cx - FPR - 14, fpY);
  ctx.moveTo(cx, fpY + FPR); ctx.lineTo(cx, fpY + FPR + 10);
  ctx.stroke();

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
  ctx.fillText(`${vsFpm >= 0 ? '+' : ''}${vsFpm} FPM`, RX, cy + 38);

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

  // ── G-meter ───────────────────────────────────────────────────────────────
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.font = 'bold 12px "Courier New",monospace';
  ctx.fillText(`${f.gForce.toFixed(1)} G`, 14, H - 14);

  // ── Throttle ──────────────────────────────────────────────────────────────
  const tPct = Math.round((f.speed - MIN_SPD) / (MAX_SPD - MIN_SPD) * 100);
  ctx.textAlign = 'right';
  ctx.fillText(`THR ${tPct}%`, W - 14, H - 14);

  // ── Weapon / target status (bottom-left, two lines) ──────────────────────
  ctx.font = 'bold 11px "Courier New",monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  if (selectedName) {
    ctx.fillStyle = '#FF2020';
    ctx.fillText(`TGT: ${selectedName}`, 14, H - 30);
  }
  if (weaponLine) {
    ctx.fillStyle = '#FF8C00';
    ctx.fillText(weaponLine, 14, H - 14);
  } else {
    ctx.fillStyle = '#FF2020';
    ctx.fillText('◉ JASSM — ARMED  [SPC]', 14, H - 14);
  }

  // ── Gov target HUD tags ───────────────────────────────────────────────────
  const BW = 88, BH = 22, BL = 10;
  ctx.lineWidth = 1.2;
  targets.forEach(({ name, sx, sy, destroyed, selected }) => {
    if (sx < -BW || sx > W + BW || sy < -BH || sy > H + BH) return;
    const col = destroyed ? '#555555' : selected ? '#FF2020' : '#00BFFF';
    ctx.strokeStyle = col;
    ctx.fillStyle   = col;
    const x0 = sx - BW / 2, x1 = sx + BW / 2;
    const y0 = sy - BH / 2, y1 = sy + BH / 2;
    ctx.beginPath();
    ctx.moveTo(x0,       y0 + BL); ctx.lineTo(x0, y0); ctx.lineTo(x0 + BL, y0);
    ctx.moveTo(x1 - BL,  y0);      ctx.lineTo(x1, y0); ctx.lineTo(x1,      y0 + BL);
    ctx.moveTo(x0,       y1 - BL); ctx.lineTo(x0, y1); ctx.lineTo(x0 + BL, y1);
    ctx.moveTo(x1 - BL,  y1);      ctx.lineTo(x1, y1); ctx.lineTo(x1,      y1 - BL);
    ctx.stroke();
    if (destroyed) {
      // X through the box
      ctx.beginPath();
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      ctx.moveTo(x1, y0); ctx.lineTo(x0, y1);
      ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(sx, sy, 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.font = 'bold 9px "Courier New",monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(destroyed ? `${name} ✕` : name, sx, y0 - 3);
  });

  // ── Low-altitude warning ──────────────────────────────────────────────────
  if (altFt < 8000) {
    ctx.fillStyle = '#FF3030';
    ctx.font = 'bold 15px "Courier New",monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('▲  PULL UP  —  LOW ALTITUDE  ▲', cx, H - 52);
  }
}

// ── Reusable MOAB explosion (Level 3/4 identical sequence) ───────────────────
function triggerMoabExplosion(viewer, C, lat, lon, onLog, targetName) {
  const GROUND_ALT = 1220;
  const t0 = Date.now();
  let elapsedS = 0;
  const onPreUpdate = () => { elapsedS = (Date.now() - t0) / 1000; };
  viewer.scene.preUpdate.addEventListener(onPreUpdate);

  const flashDiv = document.createElement('div');
  flashDiv.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:.95;z-index:9999;pointer-events:none;transition:opacity 1.8s ease-out';
  document.body.appendChild(flashDiv);
  requestAnimationFrame(() => { flashDiv.style.opacity = '0'; });
  setTimeout(() => flashDiv.remove(), 2100);

  const scorchPos = C.Cartesian3.fromDegrees(lon, lat);
  const SCORCH_DUR = 3.5;
  const scorchEnt = viewer.entities.add({
    position: scorchPos,
    ellipse: {
      semiMajorAxis: new C.CallbackProperty(() => Math.min(elapsedS / SCORCH_DUR, 1) * 330, false),
      semiMinorAxis: new C.CallbackProperty(() => Math.min(elapsedS / SCORCH_DUR, 1) * 290, false),
      material:      new C.ColorMaterialProperty(C.Color.fromCssColorString('#120400').withAlpha(0.92)),
      heightReference: C.HeightReference.CLAMP_TO_GROUND,
    },
  });
  setTimeout(() => {
    if (viewer.isDestroyed()) return;
    viewer.entities.remove(scorchEnt);
    viewer.entities.add({
      position: scorchPos,
      ellipse: {
        semiMajorAxis: 330, semiMinorAxis: 290,
        material: new C.ColorMaterialProperty(C.Color.fromCssColorString('#120400').withAlpha(0.92)),
        heightReference: C.HeightReference.CLAMP_TO_GROUND,
      },
    });
  }, SCORCH_DUR * 1000 + 100);

  const SW_SPEED = 600, SW_MAX_R = 8000;
  const swColor  = new C.Color(0.72, 0.72, 0.72, 0.38);
  const getSwR   = () => Math.min(SW_SPEED * elapsedS, SW_MAX_R);
  const getSwCol = () => { swColor.alpha = Math.max(0, 0.38 * (1 - getSwR() / SW_MAX_R)); return swColor; };
  const swEnt = viewer.entities.add({
    position: C.Cartesian3.fromDegrees(lon, lat),
    ellipse: {
      semiMajorAxis: new C.CallbackProperty(getSwR, false),
      semiMinorAxis: new C.CallbackProperty(getSwR, false),
      material:      new C.ColorMaterialProperty(new C.CallbackProperty(getSwCol, false)),
      heightReference: C.HeightReference.CLAMP_TO_GROUND,
    },
  });
  setTimeout(() => { if (!viewer.isDestroyed()) viewer.entities.remove(swEnt); },
    (SW_MAX_R / SW_SPEED + 0.5) * 1000);

  const mdlColor = new C.Color(1, 1, 1, 1);
  const getScale = () => {
    if (elapsedS < 2)  return (1 - Math.pow(1 - elapsedS / 2, 2)) * 10;
    if (elapsedS < 12) return 10 + (1 - Math.pow(1 - (elapsedS - 2) / 10, 3)) * 15;
    return 25 + 9 * Math.log(1 + (elapsedS - 12) / 10);
  };
  const getColor = () => {
    const fadeIn  = Math.min(1, elapsedS / 0.5);
    const fadeOut = elapsedS < 25 ? 1 : Math.max(0, 1 - (elapsedS - 25) / 10);
    mdlColor.alpha = fadeIn * fadeOut;
    return mdlColor;
  };
  const modelEnt = viewer.entities.add({
    position:    C.Cartesian3.fromDegrees(lon, lat, GROUND_ALT),
    orientation: C.Transforms.headingPitchRollQuaternion(
      C.Cartesian3.fromDegrees(lon, lat, GROUND_ALT),
      new C.HeadingPitchRoll(0, 0, 0),
    ),
    model: {
      uri: '/layered_explosion_as_solid.glb',
      scale: new C.CallbackProperty(getScale, false),
      minimumPixelSize: 32, maximumScale: 50000,
      color: new C.CallbackProperty(getColor, false),
      colorBlendMode: C.ColorBlendMode.HIGHLIGHT,
    },
  });

  setTimeout(() => {
    const concuss = document.createElement('div');
    concuss.style.cssText = 'position:fixed;inset:0;background:rgba(220,225,255,0.25);pointer-events:none;z-index:9998;transition:opacity 0.9s ease-out';
    document.body.appendChild(concuss);
    requestAnimationFrame(() => { concuss.style.opacity = '0'; });
    setTimeout(() => concuss.remove(), 1100);
  }, 2500);

  setTimeout(() => {
    if (viewer.isDestroyed()) return;
    viewer.scene.preUpdate.removeEventListener(onPreUpdate);
    viewer.entities.remove(modelEnt);
  }, 35000);

  onLog('⚠ DETONATION CONFIRMED', 'warn');
  onLog(`${targetName} — DESTROYED`, 'warn');
}

// ── Briefing ──────────────────────────────────────────────────────────────────
const NARRATION_6 =
  'Agent. You are at the controls of an F-22 Raptor over the Iranian capital. ' +
  'Below you is Tehran — a city of eight million people at the foot of the Alborz mountains. ' +
  'You are flying a strategic overflight at fourteen thousand feet. ' +
  'The aircraft responds slowly at altitude — inputs are heavy, stability is high. ' +
  'Mouse controls pitch and roll. W increases throttle. S decreases throttle. ' +
  'Spacebar levels wings. Stay in the air. Good hunting.';

function Level6Briefing({ onReady }) {
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
    const female = voices.find(v =>
      /female|woman|zira|samantha|karen|victoria|moira|fiona|veena|susan|heather|allison/i.test(v.name)
    ) ?? null;
    const u = new SpeechSynthesisUtterance(NARRATION_6);
    u.rate = 0.92; u.pitch = 0.88; u.volume = 0.9;
    if (female) u.voice = female;
    u.onboundary = e => { if (e.name === 'word') setSubtitle(NARRATION_6.slice(0, e.charIndex + e.charLength)); };
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
        <div style={{ fontSize: '.65rem', color: 'var(--cyan)', letterSpacing: '.18em' }}>██ EYES ONLY — NO DISTRIBUTION</div>
        <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#fff', letterSpacing: '.14em' }}>OPERATION NIGHTFALL</div>
        <div style={{ fontSize: '.62rem', color: 'var(--t-ghost)', letterSpacing: '.1em' }}>LEVEL 6 — STRATEGIC OVERFLIGHT</div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
        <div style={{
          width: '55vw', border: '1px solid rgba(0,212,255,.25)', padding: '2.5rem',
          display: 'flex', flexDirection: 'column', gap: '1.6rem',
        }}>
          <div style={{ fontSize: '.5rem', color: 'var(--t-ghost)', letterSpacing: '.22em' }}>
            PLATFORM BRIEFING — F-22A RAPTOR / CALLSIGN PHANTOM ZERO ONE
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fff', letterSpacing: '.1em', lineHeight: 1.2 }}>
            STRATEGIC OVERFLIGHT<br />TEHRAN AO
          </div>
          {[
            ['PLATFORM',  'F-22A RAPTOR',                   'var(--cyan)'],
            ['AO',        'TEHRAN METROPOLITAN AREA, IRN',  'rgba(255,255,255,.7)'],
            ['ALTITUDE',  '30 000 FT MSL',                  'var(--amber)'],
            ['SPEED',     '420 KIAS',                       'var(--amber)'],
            ['CONTROLS',  'MOUSE — PITCH / ROLL',           'var(--cyan)'],
            ['THROTTLE',  'W = INCREASE  /  S = DECREASE',  'var(--cyan)'],
            ['EMERGENCY', 'SPACEBAR — LEVEL WINGS',         '#FF8800'],
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
  const containerRef = useRef(null);
  const viewerRef    = useRef(null);
  const hudCanvasRef = useRef(null);
  const boardRef     = useRef(null);

  const flightRef = useRef({
    lat: START_LAT, lon: START_LON, altM: START_ALT_M,
    heading: START_HDG, pitch: 0, roll: 0,
    speed: START_SPD, vSpeed: 0, gForce: 1.0, mach: 0.57, fpa: 0,
  });

  const mouseRef        = useRef({ nx: 0, ny: 0 });
  const keysRef         = useRef({ w: false, s: false, l: false }); // l = level wings
  const rafRef          = useRef(null);
  const moabRef         = useRef('ready');
  const impactTimeRef   = useRef(null);
  const explosionRef    = useRef(null);
  const explodeStartRef = useRef(null);
  const audioCtxRef     = useRef(null);
  const engineSrcRef    = useRef(null);
  const engineGainRef   = useRef(null);
  const selectedIdxRef  = useRef(0);
  const destroyedRef    = useRef(new Set());
  const missileRef      = useRef(null);       // { missileEnt, t0, dur, targetIdx }

  const [briefing,   setBriefing]  = useState(true);
  const [crashed,    setCrashed]   = useState(false);
  const [moabState,  setMoabState] = useState('ready');
  const [log,      setLog]      = useState([
    { ts: timestamp(), msg: 'LEVEL 6 — TEHRAN OVERFLIGHT', cls: 'warn' },
    { ts: timestamp(), msg: 'Platform: F-22A Raptor. AO: Tehran.', cls: 'info' },
    { ts: timestamp(), msg: 'Inputs are heavy — aircraft stabilises automatically.', cls: '' },
    { ts: timestamp(), msg: 'Mouse controls pitch and roll.', cls: '' },
  ]);
  const logEndRef = useRef(null);

  const addLog = useCallback((msg, cls = '') => {
    setLog(prev => [...prev, { ts: timestamp(), msg, cls }].slice(-80));
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  // ── Cesium init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !window.Cesium) return;
    const C = window.Cesium;

    const creditDiv = document.createElement('div');
    creditDiv.style.display = 'none';

    const viewer = new C.Viewer(containerRef.current, {
      imageryProvider:     false,
      baseLayerPicker:     false, geocoder: false, homeButton: false,
      sceneModePicker:     false, navigationHelpButton: false,
      animation:           false, timeline: false,
      fullscreenButton:    false, infoBox: false, selectionIndicator: false,
      creditContainer:     creditDiv,
    });

    viewer.imageryLayers.addImageryProvider(
      new C.UrlTemplateImageryProvider({ url: ESRI_SAT, maximumLevel: 23 })
    );

    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.scene.fog.enabled  = true;
    viewer.scene.fog.density  = 0.00008;

    // Government target positions are projected to 2D in the animation loop
    // and drawn directly on the HUD canvas — no 3D entities needed.

    // Preload explosion GLB so GPU has it before detonation (same as Level 3/4)
    viewer.entities.add({
      position: C.Cartesian3.fromDegrees(0, 0, 1e7),
      model: { uri: '/layered_explosion_as_solid.glb', scale: 0.001 },
    });

    const ctrl = viewer.scene.screenSpaceCameraController;
    ctrl.enableRotate = ctrl.enableTranslate = ctrl.enableZoom = false;
    ctrl.enableTilt   = ctrl.enableLook      = false;

    C.ArcGISTiledElevationTerrainProvider.fromUrl(ARCGIS_TRN).then(tp => {
      if (!viewer.isDestroyed()) {
        viewer.terrainProvider = tp;
        addLog('Terrain loaded.', 'info');
      }
    }).catch(() => {});

    viewerRef.current = viewer;

    // ── Camera update — runs inside Cesium's own render pipeline ────────────
    // Putting setView here (not in rAF) eliminates the one-frame lag between
    // our physics update and Cesium's render that causes jitter.
    const BEHIND = 800, ABOVE = 220;
    const LOOK_DOWN = Math.atan2(ABOVE, BEHIND);
    const _cockpitPos = new C.Cartesian3();

    const onPreUpdate = () => {
      if (viewer.isDestroyed()) return;
      const ms = missileRef.current;
      if (ms) {
        const nose = ms.getNose();
        C.Cartesian3.multiplyByScalar(ms.dir, -BEHIND, ms._camBehind);
        C.Ellipsoid.WGS84.geodeticSurfaceNormal(nose, ms._camUp);
        C.Cartesian3.multiplyByScalar(ms._camUp, ABOVE, ms._camAbove);
        C.Cartesian3.add(nose, ms._camBehind, ms._camTmp);
        C.Cartesian3.add(ms._camTmp, ms._camAbove, ms._camPos);
        viewer.camera.setView({
          destination: ms._camPos,
          orientation: { heading: ms.bearing, pitch: ms.divePitch - LOOK_DOWN, roll: 0 },
        });
      } else {
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
      }
    };

    viewer.scene.preUpdate.addEventListener(onPreUpdate);

    return () => {
      viewer.scene.preUpdate.removeEventListener(onPreUpdate);
      if (!viewer.isDestroyed()) viewer.destroy();
    };
  }, []); // eslint-disable-line

  // ── Mouse tracking ──────────────────────────────────────────────────────────
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const onMove = e => {
      const r  = board.getBoundingClientRect();
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
      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp')   keysRef.current.w = true;
      if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') keysRef.current.s = true;
      if (e.key === 'l' || e.key === 'L')                          keysRef.current.l = true;

      // Tab — cycle selected target
      if (e.key === 'Tab') {
        e.preventDefault();
        const next = (selectedIdxRef.current + 1) % GOV_TARGETS.length;
        selectedIdxRef.current = next;
        addLog(`TARGET: ${GOV_TARGETS[next].name}`, 'info');
      }

      // Space — launch JASSM cruise missile
      if (e.key === ' ') {
        e.preventDefault();
        if (!missileRef.current) {
          const f   = flightRef.current;
          const idx = selectedIdxRef.current;
          const tgt = GOV_TARGETS[idx];
          const C   = window.Cesium;
          const v   = viewerRef.current;
          if (!v || v.isDestroyed()) return;

          const DUR     = 14000;
          const t0      = Date.now();
          const startC3 = C.Cartesian3.fromDegrees(f.lon, f.lat, f.altM);
          const endC3   = C.Cartesian3.fromDegrees(tgt.lon, tgt.lat, 1400);

          // Normalised direction — constant throughout straight-line flight
          const rawDir  = C.Cartesian3.subtract(endC3, startC3, new C.Cartesian3());
          const dir     = C.Cartesian3.normalize(rawDir, new C.Cartesian3());

          // Pre-allocate all scratch vectors — reused every frame, zero GC pressure
          const _noseOut   = new C.Cartesian3();
          const _camBehind = new C.Cartesian3();
          const _camUp     = new C.Cartesian3();
          const _camAbove  = new C.Cartesian3();
          const _camTmp    = new C.Cartesian3();
          const _camPos    = new C.Cartesian3();

          const getNose = () => C.Cartesian3.lerp(
            startC3, endC3, Math.min((Date.now() - t0) / DUR, 0.999), _noseOut
          );

          // Fixed orientation — heading/pitch from launch point toward target
          const dLonRad = (tgt.lon - f.lon) * Math.PI / 180;
          const lat1r   = f.lat * Math.PI / 180;
          const lat2r   = tgt.lat * Math.PI / 180;
          const bearing = Math.atan2(
            Math.sin(dLonRad) * Math.cos(lat2r),
            Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLonRad)
          );
          const groundM = distKm(f.lat, f.lon, tgt.lat, tgt.lon) * 1000;
          const divePitch = Math.atan2(1400 - f.altM, groundM); // negative = nose down
          // Model's nose is along local +X; Cesium places +X = East at heading 0.
          // Subtract π/2 so +X rotates onto the flight bearing.
          const orientation = C.Transforms.headingPitchRollQuaternion(
            startC3,
            new C.HeadingPitchRoll(bearing + Math.PI / 2, divePitch, 0),
          );

          // ── Tomahawk model — scale 65→5 as progress 0→1 ──────────────────
          const missileEnt = v.entities.add({
            position:    new C.CallbackProperty(getNose, false),
            orientation: orientation,
            model: {
              uri:              '/tomahawk.glb',
              scale:            new C.CallbackProperty(() => {
                const p = Math.min((Date.now() - t0) / DUR, 1);
                return 65 - 60 * p;            // 65 at launch → 5 at impact
              }, false),
              minimumPixelSize: 24,
              maximumScale:     200,
            },
          });

          missileRef.current = {
            missileEnt,
            t0, dur: DUR, targetIdx: idx,
            getNose, dir, bearing, divePitch,
            _camBehind, _camUp, _camAbove, _camTmp, _camPos,
          };
          addLog(`JASSM AWAY — TARGET: ${tgt.name}`, 'warn');
          addLog('IMPACT IN 14 SECONDS.', 'warn');
        }
      }

      // B — direct MOAB on IRGC HQ (legacy)
      if ((e.key === 'b' || e.key === 'B') && moabRef.current === 'ready') {
        const f = flightRef.current;
        const dist = distKm(f.lat, f.lon, IRGC.lat, IRGC.lon);
        if (dist < 35) {
          moabRef.current = 'away';
          setMoabState('away');
          impactTimeRef.current = Date.now() + 8000;
          addLog('MOAB RELEASED — TARGET: IRGC HQ', 'warn');
        } else {
          addLog(`IRGC HQ OUT OF RANGE — ${Math.round(dist)} km`, 'warn');
        }
      }
    };
    const onUp = e => {
      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp')   keysRef.current.w = false;
      if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') keysRef.current.s = false;
      if (e.key === 'l' || e.key === 'L')                          keysRef.current.l = false;
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup',   onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, []);

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

    // ── Turbine hum: two detuned sawtooths + subtle beating ─────────────────
    const freqs = [48, 52, 96, 102, 144];
    const oscGain = ctx.createGain();
    oscGain.gain.value = 0.18;
    const oscLp = ctx.createBiquadFilter();
    oscLp.type = 'lowpass'; oscLp.frequency.value = 320; oscLp.Q.value = 1.2;
    oscGain.connect(oscLp); oscLp.connect(master);

    const oscs = freqs.map(f => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(oscGain);
      o.start();
      return o;
    });

    // ── Broadband air-rush noise, heavy low-pass for cabin muffling ──────────
    const SR = ctx.sampleRate;
    const nBuf = ctx.createBuffer(1, SR * 3, SR);
    const nd   = nBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = nBuf; noise.loop = true;

    const nLp = ctx.createBiquadFilter();
    nLp.type = 'lowpass'; nLp.frequency.value = 280; nLp.Q.value = 0.8;
    const nGain = ctx.createGain();
    nGain.gain.value = 0.12;
    noise.connect(nLp); nLp.connect(nGain); nGain.connect(master);
    noise.start();

    // ── Low body resonance (the seat-of-the-pants vibration feel) ───────────
    const sub = ctx.createOscillator();
    sub.type = 'sine'; sub.frequency.value = 28;
    const subG = ctx.createGain(); subG.gain.value = 0.06;
    sub.connect(subG); subG.connect(master);
    sub.start();

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
      const k = keysRef.current;

      // ── Throttle ──────────────────────────────────────────────────────────
      if (k.w) f.speed = Math.min(f.speed + 20 * dt, MAX_SPD);
      if (k.s) f.speed = Math.max(f.speed - 15 * dt, MIN_SPD);


      // ── Heavy / stable controls ───────────────────────────────────────────
      const DZ = 0.12;
      const dz = v => { const s = Math.sign(v), a = Math.abs(v); return a < DZ ? 0 : s * (a - DZ) / (1 - DZ); };
      const rollStick  =  dz(m.nx);
      const pitchStick = -dz(m.ny);

      if (k.l) { f.roll *= 0.80; f.pitch *= 0.85; }

      f.roll  = clamp(f.roll  + rollStick  * 10 * dt, -30, 30);
      if (Math.abs(rollStick)  < 0.01) f.roll  *= (1 - 3.5 * dt);

      f.pitch = clamp(f.pitch + pitchStick *  7 * dt, -8, 12);
      if (Math.abs(pitchStick) < 0.01) f.pitch *= (1 - 4.0 * dt);

      // ── Coordinated turn ──────────────────────────────────────────────────
      const speedMs  = f.speed * 0.5144;
      const turnRate = (9.81 * Math.tan(f.roll * Math.PI / 180)) / speedMs;
      f.heading = ((f.heading + turnRate * dt * 180 / Math.PI) + 360) % 360;

      // ── Flight path & altitude ────────────────────────────────────────────
      const targetFpa = f.pitch * 0.85;
      f.fpa    = f.fpa + (targetFpa - f.fpa) * 3.5 * dt;
      f.vSpeed = speedMs * Math.sin(f.fpa * Math.PI / 180);
      f.altM   = Math.max(MIN_ALT_M, f.altM + f.vSpeed * dt);

      // ── Position ──────────────────────────────────────────────────────────
      const gs     = speedMs * Math.cos(f.fpa * Math.PI / 180);
      const hdgRad = f.heading * Math.PI / 180;
      f.lat += gs * dt * Math.cos(hdgRad) / 111320;
      f.lon += gs * dt * Math.sin(hdgRad) / (111320 * Math.cos(f.lat * Math.PI / 180));

      // ── Derived ───────────────────────────────────────────────────────────
      f.mach   = f.speed / 661.5;
      const gL = Math.max(1, 1 / Math.max(0.01, Math.cos(f.roll * Math.PI / 180)));
      f.gForce = f.gForce + (gL - f.gForce) * 6 * dt;

      // ── Crash ─────────────────────────────────────────────────────────────
      if (f.altM <= MIN_ALT_M + 5) {
        setCrashed(true);
        addLog('⚠ TERRAIN IMPACT — AIRCRAFT LOST', 'warn');
        return;
      }

      // Camera is set in scene.preUpdate (Cesium init) — perfectly sync'd with render

      // ── B-key MOAB on IRGC ────────────────────────────────────────────────
      if (moabRef.current === 'away' && Date.now() >= impactTimeRef.current) {
        moabRef.current = 'detonated';
        setMoabState('detonated');
        destroyedRef.current.add(GOV_TARGETS.findIndex(t => t.name === 'IRGC HEADQUARTERS'));
        triggerMoabExplosion(viewer, C, IRGC.lat, IRGC.lon, addLog, 'IRGC HEADQUARTERS');
      }

      // ── JASSM cruise missile progress ────────────────────────────────────
      if (missileRef.current) {
        const { missileEnt, t0, dur, targetIdx } = missileRef.current;

        if (Date.now() - t0 >= dur) {
          viewer.entities.remove(missileEnt);
          missileRef.current = null;
          destroyedRef.current.add(targetIdx);
          const tgt = GOV_TARGETS[targetIdx];
          triggerMoabExplosion(viewer, C, tgt.lat, tgt.lon, addLog, tgt.name);
        }
      }

      // ── HUD + gov target tags ─────────────────────────────────────────────
      const hud = hudCanvasRef.current;
      if (hud) {
        if (hud.width !== hud.offsetWidth || hud.height !== hud.offsetHeight) {
          hud.width  = hud.offsetWidth  || window.innerWidth;
          hud.height = hud.offsetHeight || window.innerHeight;
        }
        const selIdx  = selectedIdxRef.current;
        const selName = GOV_TARGETS[selIdx].name;

        // Weapon status line
        let weaponLine = '';
        if (missileRef.current) {
          const rem = Math.max(0, Math.ceil((missileRef.current.t0 + missileRef.current.dur - Date.now()) / 1000));
          weaponLine = `JASSM AWAY — IMPACT IN ${rem}s`;
        } else if (moabRef.current === 'away') {
          const rem = Math.max(0, Math.ceil((impactTimeRef.current - Date.now()) / 1000));
          weaponLine = `MOAB AWAY — IMPACT IN ${rem}s`;
        } else if (moabRef.current === 'detonated') {
          weaponLine = Math.floor(Date.now() / 400) % 2 === 0 ? '✕ IRGC HQ — DESTROYED' : '';
        }

        const targets = GOV_TARGETS.reduce((acc, t, i) => {
          const world = C.Cartesian3.fromDegrees(t.lon, t.lat, 1300);
          const sc    = viewer.scene.cartesianToCanvasCoordinates(world);
          if (sc) acc.push({
            name: t.name, sx: sc.x, sy: sc.y,
            selected:  i === selIdx,
            destroyed: destroyedRef.current.has(i),
          });
          return acc;
        }, []);

        drawHUD(hud, { ...f }, targets, weaponLine, selName);
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [briefing, addLog]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="game-wrap">
      {briefing && <Level6Briefing onReady={() => setBriefing(false)} />}

      <div className="hud">
        <div className="hud-brand">
          TACT/CMD
          <span>LEVEL 6 — STRATEGIC OVERFLIGHT</span>
        </div>
        <div className="hud-stats">
          <div className="hud-stat">
            <span className="hud-stat-label">Platform</span>
            <span className="hud-stat-value">F-22A RAPTOR</span>
          </div>
          <div className="hud-stat">
            <span className="hud-stat-label">AO</span>
            <span className="hud-stat-value">TEHRAN</span>
          </div>
          <div className="hud-stat">
            <span className="hud-stat-label">Mission</span>
            <span className="hud-stat-value">OP-NIGHTFALL</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.2rem' }}>
          <div className="hud-player">AGENT <strong>{playerName}</strong></div>
          <div className="hud-connection"><div className="dot-online" />SECURE LINK ACTIVE</div>
        </div>
      </div>

      <div className="game-body">

        <div className="sidebar">
          <div className="panel">
            <div className="panel-title accent">// Flight Controls</div>
            {[
              ['Mouse', 'Pitch / Roll'],
              ['W / ↑', 'Throttle Up'],
              ['S / ↓', 'Throttle Down'],
              ['L',     'Level Wings'],
              ['Tab',   'Cycle Target'],
              ['Space', 'Launch JASSM'],
              ['B',     'MOAB — IRGC HQ'],
            ].map(([k, v]) => (
              <div className="intel-row" key={k}>
                <span className="intel-key" style={{ color: 'var(--cyan)' }}>{k}</span>
                <span className="intel-val">{v}</span>
              </div>
            ))}
          </div>

          <div className="panel">
            <div className="panel-title accent">// HUD Legend</div>
            {[
              ['○⊕',  'Flight path marker'],
              ['⊕',   'Boresight'],
              ['━━',  'Pitch ladder'],
              ['▲',   'Bank angle pointer'],
              ['KIAS','Airspeed (knots)'],
              ['M',   'Mach number'],
              ['FT',  'Altitude (feet)'],
              ['FPM', 'Vertical speed'],
              ['G',   'G-force'],
              ['THR', 'Throttle %'],
            ].map(([k, v]) => (
              <div className="intel-row" key={k} style={{ paddingTop: '.12rem', paddingBottom: '.12rem' }}>
                <span className="intel-key" style={{ minWidth: '3rem', color: 'var(--amber)' }}>{k}</span>
                <span className="intel-val" style={{ fontSize: '.58rem' }}>{v}</span>
              </div>
            ))}
          </div>

          <button className="btn-secondary" style={{ marginTop: 'auto' }} onClick={onPlayAgain}>
            ← Return to Missions
          </button>
        </div>

        <div
          ref={boardRef}
          className="board-area"
          style={{ padding: 0, overflow: 'hidden', position: 'relative', alignItems: 'stretch', cursor: 'none' }}
        >
          <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

          <canvas
            ref={hudCanvasRef}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              pointerEvents: 'none', zIndex: 15,
            }}
          />

          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 6, height: 6, borderRadius: '50%',
            border: '1px solid rgba(0,255,65,.4)',
            pointerEvents: 'none', zIndex: 16,
          }} />

          {crashed && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', zIndex: 20,
              background: 'rgba(0,0,0,.78)',
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '2.4rem', fontWeight: 700,
                color: '#FF2020', letterSpacing: '.2em', textAlign: 'center',
                textShadow: '0 0 30px rgba(255,32,32,.8)',
                animation: 'pulse 1.2s ease-in-out infinite',
              }}>
                AIRCRAFT LOST
              </div>
              <div style={{
                marginTop: '1rem', fontFamily: 'var(--font-mono)',
                fontSize: '.9rem', color: '#FF6060', letterSpacing: '.15em',
              }}>
                TERRAIN IMPACT — EJECTION FAILED
              </div>
              <button
                className="btn-secondary"
                style={{ marginTop: '2rem', color: 'var(--cyan)', borderColor: 'rgba(0,212,255,.4)' }}
                onClick={onPlayAgain}
              >
                ← Return to Missions
              </button>
            </div>
          )}
        </div>

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
