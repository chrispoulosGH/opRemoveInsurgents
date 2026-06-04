import { useEffect, useRef, useState, useCallback } from 'react';

// ── F-22 Raptor — Combat Air Patrol ───────────────────────────────────────────

const START_LAT   = 34.80;
const START_LON   = 70.60;
const START_ALT_M = 4800;   // 15 750 ft
const START_HDG   = 90;     // east into the mountains
const START_SPD   = 380;    // knots
const MIN_ALT_M   = 200;
const MAX_SPD     = 800;
const MIN_SPD     = 120;

const ESRI_SAT   = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ARCGIS_TRN = 'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer';
const HUD_G = '#00FF41';

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const fmtHdg = h => ((Math.round(h) % 360 + 360) % 360).toString().padStart(3, '0');

function timestamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── HUD Canvas Drawing ────────────────────────────────────────────────────────
function drawHUD(canvas, f) {
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

  // ── Pitch ladder (rotates with roll) ──────────────────────────────────────
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
      ctx.moveTo(32, 0); ctx.lineTo(140, 0);
      ctx.stroke();
      continue;
    }
    const is10 = deg % 10 === 0;
    const half = is10 ? 58 : 30;
    const gap  = 14;
    const nd   = deg > 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(-half, y); ctx.lineTo(-gap, y);
    ctx.moveTo(gap, y);  ctx.lineTo(half, y);
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
  // bank pointer triangle
  const bA  = (f.roll - 90) * Math.PI / 180;
  const bCx = Math.cos(bA), bCy = Math.sin(bA);
  const px  = -bCy, py = bCx;
  ctx.beginPath();
  ctx.moveTo(bCx * (BAR - 3), bCy * (BAR - 3));
  ctx.lineTo(bCx * (BAR - 16) + px * 6, bCy * (BAR - 16) + py * 6);
  ctx.lineTo(bCx * (BAR - 16) - px * 6, bCy * (BAR - 16) - py * 6);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // ── Flight path marker (velocity vector) ─────────────────────────────────
  const fpOff = -(f.fpa - f.pitch) * PPD;
  const fpY   = cy + fpOff * Math.cos(f.roll * Math.PI / 180);
  const FPR   = 12;
  ctx.beginPath(); ctx.arc(cx, fpY, FPR, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + FPR, fpY); ctx.lineTo(cx + FPR + 14, fpY);
  ctx.moveTo(cx - FPR, fpY); ctx.lineTo(cx - FPR - 14, fpY);
  ctx.moveTo(cx, fpY + FPR); ctx.lineTo(cx, fpY + FPR + 10);
  ctx.stroke();

  // ── Boresight / waterline ─────────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(cx - 38, cy); ctx.lineTo(cx - 12, cy);
  ctx.moveTo(cx + 12, cy); ctx.lineTo(cx + 38, cy);
  ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy - 3);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.stroke();

  // ── Airspeed box (left) ───────────────────────────────────────────────────
  const AX = 62;
  ctx.strokeRect(AX - 48, cy - 18, 96, 36);
  ctx.font = 'bold 20px "Courier New",monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(spd, AX, cy - 1);
  ctx.font = 'bold 10px "Courier New",monospace';
  ctx.fillText('KIAS', AX, cy + 21);
  ctx.fillText(`M ${f.mach.toFixed(2)}`, AX, cy + 38);

  // ── Altitude box (right) ──────────────────────────────────────────────────
  const RX = W - 68;
  ctx.strokeRect(RX - 54, cy - 18, 108, 36);
  ctx.font = 'bold 20px "Courier New",monospace';
  ctx.fillText(altFt.toLocaleString(), RX, cy - 1);
  ctx.font = 'bold 10px "Courier New",monospace';
  ctx.fillText('FT MSL', RX, cy + 21);
  ctx.fillText(`${vsFpm >= 0 ? '+' : ''}${vsFpm} FPM`, RX, cy + 38);

  // ── Heading box (top centre) ──────────────────────────────────────────────
  const HBH = 26, HBW = 172;
  ctx.strokeRect(cx - HBW / 2, 12, HBW, HBH);
  ctx.font = 'bold 16px "Courier New",monospace';
  ctx.fillText(`${fmtHdg(f.heading)}°`, cx, 12 + HBH / 2);
  // tick marks below box
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

  // ── Low-altitude warning ──────────────────────────────────────────────────
  if (altFt < 1500) {
    ctx.fillStyle = '#FF3030';
    ctx.font = 'bold 15px "Courier New",monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('▲  PULL UP  —  LOW ALTITUDE  ▲', cx, H - 52);
  }
}

// ── Briefing ──────────────────────────────────────────────────────────────────
const NARRATION_5 =
  'Agent. You are at the controls of an F-22 Raptor, combat loaded and on station. ' +
  'You are operating over the Hindu Kush — the same airspace as our ground operations. ' +
  'Your mission: combat air patrol. Hold the sector and demonstrate air superiority. ' +
  'Move your mouse away from screen centre to control pitch and roll. ' +
  'Hold W to increase throttle. Hold S to decrease throttle. ' +
  'Press Space bar to level wings in an emergency. ' +
  'The aircraft responds to your inputs. Keep it in the air. Good hunting.';

function Level5Briefing({ onReady }) {
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
    const u = new SpeechSynthesisUtterance(NARRATION_5);
    u.rate = 0.92; u.pitch = 0.88; u.volume = 0.9;
    if (female) u.voice = female;
    u.onboundary = e => { if (e.name === 'word') setSubtitle(NARRATION_5.slice(0, e.charIndex + e.charLength)); };
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
        <div style={{ fontSize: '.65rem', color: 'var(--cyan)', letterSpacing: '.18em' }}>██ TOP SECRET — EYES ONLY</div>
        <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#fff', letterSpacing: '.14em' }}>OPERATION CROSSBOW</div>
        <div style={{ fontSize: '.62rem', color: 'var(--t-ghost)', letterSpacing: '.1em' }}>LEVEL 5 — AIR SUPERIORITY</div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
        {/* F-22 silhouette / mission art placeholder */}
        <div style={{
          width: '55vw', border: '1px solid rgba(0,212,255,.25)', padding: '2.5rem',
          display: 'flex', flexDirection: 'column', gap: '1.6rem',
        }}>
          <div style={{ fontSize: '.5rem', color: 'var(--t-ghost)', letterSpacing: '.22em' }}>
            PLATFORM BRIEFING — F-22A RAPTOR
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fff', letterSpacing: '.1em', lineHeight: 1.2 }}>
            COMBAT AIR PATROL<br />HINDU KUSH AO
          </div>
          {[
            ['PLATFORM',  'F-22A RAPTOR', 'var(--cyan)'],
            ['AO',        'HINDU KUSH / NANGARHAR', 'rgba(255,255,255,.7)'],
            ['ALTITUDE',  '15 750 FT MSL', 'var(--amber)'],
            ['SPEED',     '380 KIAS / M 0.57', 'var(--amber)'],
            ['CONTROLS',  'MOUSE — PITCH / ROLL', 'var(--cyan)'],
            ['THROTTLE',  'W = INCREASE  /  S = DECREASE', 'var(--cyan)'],
            ['EMERGENCY', 'SPACEBAR — LEVEL WINGS', '#FF8800'],
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
export default function Level5Game({ playerName, onPlayAgain }) {
  const containerRef  = useRef(null);
  const viewerRef     = useRef(null);
  const hudCanvasRef  = useRef(null);
  const boardRef      = useRef(null);

  // All mutable flight state lives in a ref to avoid React re-renders at 60fps
  const flightRef = useRef({
    lat: START_LAT, lon: START_LON, altM: START_ALT_M,
    heading: START_HDG, pitch: 0, roll: 0,
    speed: START_SPD, vSpeed: 0, gForce: 1.0, mach: 0.57, fpa: 0,
  });

  const mouseRef = useRef({ nx: 0, ny: 0 });  // normalised -1..1
  const keysRef  = useRef({ w: false, s: false, space: false });
  const rafRef   = useRef(null);

  const [briefing, setBriefing] = useState(true);
  const [crashed,  setCrashed]  = useState(false);
  const [log,      setLog]      = useState([
    { ts: timestamp(), msg: 'LEVEL 5 — F-22 COMBAT AIR PATROL', cls: 'warn' },
    { ts: timestamp(), msg: 'Platform: F-22A Raptor. AO: Hindu Kush.', cls: 'info' },
    { ts: timestamp(), msg: 'Mouse controls pitch and roll.', cls: '' },
    { ts: timestamp(), msg: 'W / S to adjust throttle. SPACE levels wings.', cls: '' },
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
      imageryProvider:      false,
      baseLayerPicker:      false, geocoder: false, homeButton: false,
      sceneModePicker:      false, navigationHelpButton: false,
      animation:            false, timeline: false,
      fullscreenButton:     false, infoBox: false, selectionIndicator: false,
      creditContainer:      creditDiv,
    });

    viewer.imageryLayers.addImageryProvider(
      new C.UrlTemplateImageryProvider({ url: ESRI_SAT, maximumLevel: 23 })
    );
    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.scene.fog.enabled = true;
    viewer.scene.fog.density = 0.00008;

    // Disable all Cesium mouse navigation — we drive the camera ourselves
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
    return () => { if (!viewer.isDestroyed()) viewer.destroy(); };
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
      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp')    keysRef.current.w     = true;
      if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown')   keysRef.current.s     = true;
      if (e.key === ' ')                                              keysRef.current.space = true;
    };
    const onUp = e => {
      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp')    keysRef.current.w     = false;
      if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown')   keysRef.current.s     = false;
      if (e.key === ' ')                                              keysRef.current.space = false;
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup',   onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, []);

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
      if (k.w) f.speed = Math.min(f.speed + 30 * dt, MAX_SPD);
      if (k.s) f.speed = Math.max(f.speed - 25 * dt, MIN_SPD);

      // ── Stick inputs from mouse (dead-zone applied) ───────────────────────
      const DZ = 0.06;
      const dz = v => {
        const s = Math.sign(v), a = Math.abs(v);
        return a < DZ ? 0 : s * (a - DZ) / (1 - DZ);
      };
      const rollStick  =  dz(m.nx);   // +1 = roll right
      const pitchStick = -dz(m.ny);   // +1 = nose up (inverted Y)

      // SPACE = emergency wings-level / pitch recover
      if (k.space) { f.roll *= 0.88; f.pitch *= 0.92; }

      // ── Roll & pitch update ───────────────────────────────────────────────
      f.roll  = clamp(f.roll  + rollStick  * 95 * dt, -85, 85);
      f.pitch = clamp(f.pitch + pitchStick * 42 * dt, -60, 70);

      // Gentle pitch auto-trim toward 0 when no input
      if (Math.abs(pitchStick) < 0.01) f.pitch *= (1 - 0.8 * dt);

      // ── Coordinated turn (roll → heading rate) ────────────────────────────
      const speedMs  = f.speed * 0.5144;
      const turnRate = (9.81 * Math.tan(f.roll * Math.PI / 180)) / speedMs; // rad/s
      f.heading = ((f.heading + turnRate * dt * 180 / Math.PI) + 360) % 360;

      // ── Flight path angle & altitude ──────────────────────────────────────
      const targetFpa = f.pitch * 0.85;
      f.fpa    = f.fpa + (targetFpa - f.fpa) * 3.5 * dt;
      f.vSpeed = speedMs * Math.sin(f.fpa * Math.PI / 180); // m/s
      f.altM   = Math.max(MIN_ALT_M, f.altM + f.vSpeed * dt);

      // ── Position ──────────────────────────────────────────────────────────
      const gs     = speedMs * Math.cos(f.fpa * Math.PI / 180);
      const hdgRad = f.heading * Math.PI / 180;
      f.lat += gs * dt * Math.cos(hdgRad) / 111320;
      f.lon += gs * dt * Math.sin(hdgRad) / (111320 * Math.cos(f.lat * Math.PI / 180));

      // ── Derived values ────────────────────────────────────────────────────
      f.mach   = f.speed / 661.5;
      const gL = Math.max(1, 1 / Math.max(0.01, Math.cos(f.roll * Math.PI / 180)));
      f.gForce = f.gForce + (gL - f.gForce) * 6 * dt;

      // ── Crash detection ───────────────────────────────────────────────────
      if (f.altM <= MIN_ALT_M + 5) {
        setCrashed(true);
        addLog('⚠ TERRAIN IMPACT — AIRCRAFT LOST', 'warn');
        return;
      }

      // ── Cesium camera (cockpit view) ──────────────────────────────────────
      viewer.camera.setView({
        destination:  C.Cartesian3.fromDegrees(f.lon, f.lat, f.altM + 3),
        orientation: {
          heading: C.Math.toRadians(f.heading),
          pitch:   C.Math.toRadians(f.pitch),
          roll:    C.Math.toRadians(f.roll),
        },
      });

      // ── HUD ───────────────────────────────────────────────────────────────
      const hud = hudCanvasRef.current;
      if (hud) {
        if (hud.width !== hud.offsetWidth || hud.height !== hud.offsetHeight) {
          hud.width  = hud.offsetWidth  || window.innerWidth;
          hud.height = hud.offsetHeight || window.innerHeight;
        }
        drawHUD(hud, { ...f });
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [briefing, addLog]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="game-wrap">
      {briefing && <Level5Briefing onReady={() => setBriefing(false)} />}

      <div className="hud">
        <div className="hud-brand">
          TACT/CMD
          <span>LEVEL 5 — AIR SUPERIORITY</span>
        </div>
        <div className="hud-stats">
          <div className="hud-stat">
            <span className="hud-stat-label">Platform</span>
            <span className="hud-stat-value">F-22A RAPTOR</span>
          </div>
          <div className="hud-stat">
            <span className="hud-stat-label">AO</span>
            <span className="hud-stat-value">HINDU KUSH</span>
          </div>
          <div className="hud-stat">
            <span className="hud-stat-label">Mission</span>
            <span className="hud-stat-value">OP-CROSSBOW</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.2rem' }}>
          <div className="hud-player">AGENT <strong>{playerName}</strong></div>
          <div className="hud-connection"><div className="dot-online" />SECURE LINK ACTIVE</div>
        </div>
      </div>

      <div className="game-body">

        {/* Left sidebar — controls & instruments */}
        <div className="sidebar">
          <div className="panel">
            <div className="panel-title accent">// Flight Controls</div>
            {[
              ['Mouse',  'Pitch / Roll'],
              ['W / ↑',  'Throttle Up'],
              ['S / ↓',  'Throttle Down'],
              ['Space',  'Level Wings'],
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
              ['○⊕',   'Flight path marker'],
              ['⊕',    'Boresight (aircraft datum)'],
              ['━━',   'Pitch ladder'],
              ['▲',    'Bank angle pointer'],
              ['KIAS', 'Airspeed (knots)'],
              ['M',    'Mach number'],
              ['FT',   'Altitude (feet)'],
              ['FPM',  'Vertical speed'],
              ['G',    'G-force'],
              ['THR',  'Throttle %'],
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

        {/* 3D Cesium cockpit view */}
        <div
          ref={boardRef}
          className="board-area"
          style={{ padding: 0, overflow: 'hidden', position: 'relative', alignItems: 'stretch', cursor: 'none' }}
        >
          <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

          {/* HUD canvas overlay */}
          <canvas
            ref={hudCanvasRef}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              pointerEvents: 'none', zIndex: 15,
            }}
          />

          {/* Mouse centre indicator */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 6, height: 6, borderRadius: '50%',
            border: '1px solid rgba(0,255,65,.4)',
            pointerEvents: 'none', zIndex: 16,
          }} />

          {/* Crash overlay */}
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
