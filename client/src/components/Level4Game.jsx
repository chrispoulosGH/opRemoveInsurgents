import { useEffect, useRef, useCallback, useState } from 'react';
import { speakReport } from '../audio';

// ── Formation flyby — 10 jets, V formation, rigid-body barrel roll ────────────

function drawJet(ctx, x, y, size, scaleY, rotation = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(1, scaleY);
  ctx.beginPath();
  ctx.moveTo( size * .55,  0);
  ctx.lineTo(-size * .18, -size * .07);
  ctx.lineTo(-size * .52, -size * .10);
  ctx.lineTo(-size * .52,  size * .10);
  ctx.lineTo(-size * .18,  size * .07);
  ctx.closePath();
  ctx.fillStyle = '#1e2d3a'; ctx.strokeStyle = '#0a1520'; ctx.lineWidth = 0.8;
  ctx.fill(); ctx.stroke();
  ctx.beginPath(); // top wing
  ctx.moveTo( size * .10, -size * .07); ctx.lineTo(-size * .20, -size * .38);
  ctx.lineTo(-size * .35, -size * .38); ctx.lineTo(-size * .30, -size * .07);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); // bottom wing
  ctx.moveTo( size * .10,  size * .07); ctx.lineTo(-size * .20,  size * .38);
  ctx.lineTo(-size * .35,  size * .38); ctx.lineTo(-size * .30,  size * .07);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); // tail fin
  ctx.moveTo(-size * .30, -size * .06); ctx.lineTo(-size * .50, -size * .22);
  ctx.lineTo(-size * .50, -size * .06);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function MissionFlyby({ viewerRef }) {
  const canvasRef     = useRef(null);
  const boomFiredRef  = useRef(false);
  const boom2FiredRef = useRef(false);
  const jetAudioRef   = useRef(null);
  if (!jetAudioRef.current) {
    const a = new Audio('/sfx/jet-engine.mp3');
    a.volume = 0.9;
    a.loop   = true;
    jetAudioRef.current = a;
  }
  useEffect(() => {
    const viewer = viewerRef?.current;
    if (!viewer || viewer.isDestroyed() || !window.Cesium) return;
    const C = window.Cesium;

    const jetAudio = jetAudioRef.current;
    jetAudio.currentTime = 0;
    jetAudio.play().catch(() => {});

    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    const ctx = canvas.getContext('2d');

    // Flight path: east → west at low altitude through the AO (Hormuz area)
    const FLY_LAT   = 27.200;  // tuned to land at vertical screen centre
    const LON_START = 56.550;  // well off right edge
    const LON_END   = 55.950;  // well off left edge
    const LON_RANGE = LON_START - LON_END;
    const AGL       = 380;    // metres above ground
    const TOTAL     = 17000;
    const ROLL_S    = 6500;   // roll starts 6.5 s in
    const ROLL_D    = 3500;   // full 360° over 3.5 s

    // V formation [dLon trailing, dLat lateral]
    const FORM = [
      [0,       0],
      [0.0006, +0.00045], [0.0006, -0.00045],
      [0.0012, +0.00090], [0.0012, -0.00090],
      [0.0018, +0.00135], [0.0018, -0.00135],
      [0.0024, +0.00180], [0.0024, -0.00180],
      [0.0012,  0],
    ];

    // Sample terrain along flight path
    const N_S = 12;
    let terrH = new Array(N_S).fill(2083);
    const terrPts = Array.from({ length: N_S }, (_, i) =>
      C.Cartographic.fromDegrees(LON_START - LON_RANGE * (i / (N_S - 1)), FLY_LAT)
    );
    C.sampleTerrainMostDetailed(viewer.terrainProvider, terrPts)
      .then(pts => { terrH = pts.map(p => p.height ?? 2083); })
      .catch(() => {});

    const interpH = (lon) => {
      const t  = (LON_START - lon) / LON_RANGE;
      const fi = Math.max(0, Math.min(t * (N_S - 1), N_S - 1.001));
      const i0 = Math.floor(fi), f = fi - i0;
      return terrH[i0] * (1 - f) + terrH[Math.min(i0 + 1, N_S - 1)] * f;
    };

    // Project world position → canvas pixel
    const toScreen = (cart) =>
      viewer.scene.cartesianToCanvasCoordinates
        ? viewer.scene.cartesianToCanvasCoordinates(cart)
        : C.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, cart);

    const LON_MID  = (LON_START + LON_END) / 2;
    const LON_MID2 = LON_MID - LON_RANGE * 0.09; // ~1.5s after first boom
    const playSonicBoom = () => {
      const a = new Audio('/sfx/rocket-launch-deep.mp3');
      a.volume = 1.0;
      a.play().catch(() => {});
    };

    const contrails = FORM.map(() => []);
    const t0 = Date.now();
    let raf;

    const frame = () => {
      const elapsed = Date.now() - t0;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (elapsed > TOTAL + 1000) { jetAudio.pause(); return; }

      const progress = Math.min(elapsed / TOTAL, 1);
      const leadLon  = LON_START - LON_RANGE * progress;
      const leadAlt  = interpH(leadLon) + AGL;

      if (!boomFiredRef.current && leadLon <= LON_MID) {
        boomFiredRef.current = true;
        playSonicBoom();
      }
      if (!boom2FiredRef.current && leadLon <= LON_MID2) {
        boom2FiredRef.current = true;
        playSonicBoom();
      }

      // Rigid-body barrel roll
      const rp    = Math.max(0, Math.min((elapsed - ROLL_S) / ROLL_D, 1));
      const angle = rp * Math.PI * 2;

      const jetData = FORM.map(([dLon, dLat]) => {
        const dLat_m = dLat * 111320;
        const jLon   = leadLon + dLon;
        const jLat   = FLY_LAT + (dLat_m * Math.cos(angle)) / 111320;
        const jAlt   = leadAlt + dLat_m * Math.sin(angle);
        const pos    = C.Cartesian3.fromDegrees(jLon, jLat, jAlt);
        const screen = toScreen(pos);
        if (!screen) return null;
        const dist    = C.Cartesian3.distance(viewer.camera.position, pos);
        const size    = Math.max(4, Math.min(30, 20000 / dist));
        const ahead   = toScreen(C.Cartesian3.fromDegrees(jLon - 0.0008, jLat, jAlt));
        const heading = ahead
          ? Math.atan2(ahead.y - screen.y, ahead.x - screen.x)
          : Math.PI;
        return { screen, size, heading, dist };
      });

      jetData
        .map((d, i) => d ? { ...d, i } : null)
        .filter(Boolean)
        .sort((a, b) => b.dist - a.dist)
        .forEach(({ i, screen, size, heading }) => {
          const { x: sx, y: sy } = screen;

          contrails[i].push({ x: sx, y: sy });
          if (contrails[i].length > 50) contrails[i].shift();
          contrails[i].forEach((pt, ci) => {
            const f = ci / contrails[i].length;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, size * 0.12 * f, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(210,235,255,${f * 0.22})`;
            ctx.fill();
          });

          const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, size * 0.9);
          g.addColorStop(0,  'rgba(160,220,255,.85)');
          g.addColorStop(.5, 'rgba(80,140,255,.2)');
          g.addColorStop(1,  'rgba(0,0,0,0)');
          ctx.beginPath(); ctx.arc(sx, sy, size * 0.9, 0, Math.PI * 2);
          ctx.fillStyle = g; ctx.fill();

          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(heading);
          drawJet(ctx, 0, 0, size, Math.cos(angle) || 0.001, 0);
          ctx.restore();
        });

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); jetAudio.pause(); };
  }, [viewerRef]);

  return (
    <canvas ref={canvasRef} style={{
      position: 'absolute', inset: 0, width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: 22,
    }} />
  );
}

// Fly camera out to see all targets then trigger the jet flyby
function triggerFlyby(viewer, onReady) {
  if (!viewer || viewer.isDestroyed() || !window.Cesium) return;
  const C = window.Cesium;
  const lats = TARGETS.map(t => t.lat), lons = TARGETS.map(t => t.lon);
  const cLat = (Math.max(...lats) + Math.min(...lats)) / 2;
  const cLon = (Math.max(...lons) + Math.min(...lons)) / 2;
  viewer.camera.flyTo({
    destination: C.Cartesian3.fromDegrees(cLon, cLat - 0.18, 22000),
    orientation: { heading: 0, pitch: C.Math.toRadians(-28), roll: 0 },
    duration: 3.2,
    complete: onReady,
  });
}

const CENTER_LAT = 27 + 10/60 + 11.28/3600;  // 27°10′11.28″N — target AO
const CENTER_LON = 56 + 15/60 + 55.88/3600;  // 56°15′55.88″E — target AO

// Single docking area — MOAB must land within 200 yards (182.88 m) for a kill
const TARGETS = [
  { id: 1, lat: 27.169800, lon: 56.265522, radius: 182.88 },
];

// Starting view — full globe, western hemisphere. Player must navigate to the target.
const INIT_ALT   = 20_600_000; // 20 600 km — full globe altitude
const INIT_START_LAT =  30.0;  // centred on North America
const INIT_START_LON = -90.0;
const ESRI_SAT   = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ARCGIS_TRN = 'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer';
const BLAST_SOUND = [
  'https://archive.org/download/ExplosionSounds/Explosion%2B2.mp3',
  'https://archive.org/download/ExplosionSounds/Bomb%2BExplosion.mp3',
];

// Preloaded at component mount — avoids fetch latency at detonation
let _blastAudio = null;
function primeBlastAudio() {
  if (_blastAudio) return;
  _blastAudio = new Audio(BLAST_SOUND[0]);
  _blastAudio.preload = 'auto';
  _blastAudio.load();
}

function timestamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
  } else {
    const a = new Audio(BLAST_SOUND[0]);
    a.volume = 1.0;
    a.play().catch(() => {
      const b = new Audio(BLAST_SOUND[1]);
      b.volume = 1.0;
      b.play().catch(() => {});
    });
  }
}

// ── Place PT-91M tank at arbitrary lat/lon, terrain-aligned ──────────────────
function placeTankAt(viewer, lat, lon, tp, addLog) {
  if (!viewer || viewer.isDestroyed() || !window.Cesium) return;
  const C = window.Cesium;
  const GUN_D  = 0.000055;
  const REAR_D = 0.000040;
  const SIDE_D = 0.000025;
  const pts = [
    C.Cartographic.fromDegrees(lon, lat),
    C.Cartographic.fromDegrees(lon, lat + GUN_D),
    C.Cartographic.fromDegrees(lon, lat - REAR_D),
    C.Cartographic.fromDegrees(lon + SIDE_D, lat),
    C.Cartographic.fromDegrees(lon - SIDE_D, lat),
  ];
  C.sampleTerrainMostDetailed(tp, pts)
    .then(([cPt, gunPt, rearPt, ePt, wPt]) => {
      if (viewer.isDestroyed()) return;
      const cH = cPt.height ?? 2083, gunH = gunPt.height ?? cH;
      const rearH = rearPt.height ?? cH;
      const eH = ePt.height ?? cH,  wH = wPt.height ?? cH;
      const gunDist = GUN_D * 111320, rearDist = REAR_D * 111320;
      const totalDist = gunDist + rearDist;
      const groundH = (gunH * rearDist + rearH * gunDist) / totalDist;
      const dhdN = (gunH - rearH) / totalDist;
      const dhdE = (eH - wH) / (2 * SIDE_D * 111320 * Math.cos(lat * Math.PI / 180));
      const pitch = Math.atan(dhdN), roll = -Math.atan(dhdE);
      const position    = C.Cartesian3.fromDegrees(lon, lat, groundH);
      const orientation = C.Transforms.headingPitchRollQuaternion(
        position, new C.HeadingPitchRoll(0, pitch, roll),
      );
      addLog(`Tank placed ${lat.toFixed(4)}°N ${lon.toFixed(4)}°E | ${Math.round(groundH)} m | pitch ${(pitch*180/Math.PI).toFixed(1)}°`, 'info');
      viewer.entities.add({ position, orientation, model: { uri: '/malaysian_pt-91m_pendekar.glb', scale: 1 } });
    })
    .catch(() => {
      if (viewer.isDestroyed()) return;
      viewer.entities.add({
        position: C.Cartesian3.fromDegrees(lon, lat),
        model: { uri: '/malaysian_pt-91m_pendekar.glb', scale: 1, heightReference: window.Cesium.HeightReference.CLAMP_TO_GROUND },
      });
      addLog(`Tank placed (CLAMP fallback) ${lat.toFixed(4)}°N ${lon.toFixed(4)}°E`, 'warn');
    });
}

// ── Explosion: 3-D GLB model animated via scale ──────────────────────────────
function detonateStrike(viewer, lat, lon, groundAlt, addLog, onHit) {
  if (!viewer || viewer.isDestroyed() || !window.Cesium) return;
  const C  = window.Cesium;
  const H  = (h) => groundAlt + h;
  const t0 = Date.now();

  // ── Screen flash (CSS — zero Cesium overhead) ─────────────────────────────
  const flashDiv = document.createElement('div');
  flashDiv.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:.95;z-index:9999;pointer-events:none;transition:opacity 1.8s ease-out';
  document.body.appendChild(flashDiv);
  requestAnimationFrame(() => { flashDiv.style.opacity = '0'; });
  setTimeout(() => flashDiv.remove(), 2100);

  onHit && onHit(lat, lon);

  addLog('★ STRIKE DETONATED', 'warn');
  setTimeout(() => addLog('Blast radius expanding — 300 m lethal radius.', 'info'), 700);
  setTimeout(() => addLog('Mushroom cloud ascending.', 'info'), 4000);

  // ── Ground scorch — grows as the fireball sweeps over it ─────────────────
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
      ellipse: {
        semiMajorAxis: 330, semiMinorAxis: 290,
        material: scorchMat,
        heightReference: C.HeightReference.CLAMP_TO_GROUND,
      },
    });
  }, (SCORCH_DUR + 0.3) * 1000);

  // ── Pressure wave — expands outward at SW_SPEED m/s, triggers blast when it reaches camera ──
  const detNadir  = C.Cartesian3.fromDegrees(lon, lat, 0);
  const camCarto  = C.Cartographic.fromCartesian(viewer.camera.position);
  const camNadir  = C.Cartesian3.fromRadians(camCarto.longitude, camCarto.latitude, 0);
  const horizDist = C.Cartesian3.distance(camNadir, detNadir);

  const SW_SPEED   = 600;
  const SW_MAX_R   = 8000;
  const soundDelay = Math.min(Math.max(horizDist / SW_SPEED, 1.5), 8.0) * 1000;

  const SW_ACC      = (SW_SPEED * 0.2) / (SW_MAX_R / SW_SPEED);
  const swColor     = new C.Color(0.72, 0.72, 0.72, 0.38);
  const getSwRadius = () => Math.min(SW_SPEED * elapsedS + 0.5 * SW_ACC * elapsedS * elapsedS, SW_MAX_R);
  const getSwColor  = () => {
    swColor.alpha = Math.max(0, 0.38 * (1 - getSwRadius() / SW_MAX_R));
    return swColor;
  };

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
  setTimeout(() => {
    if (!viewer.isDestroyed()) viewer.entities.remove(swEnt);
  }, (SW_MAX_R / SW_SPEED + 0.5) * 1000);

  setTimeout(() => {
    playBlastSound();
    const concuss = document.createElement('div');
    concuss.style.cssText = 'position:fixed;inset:0;background:rgba(220,225,255,0.25);pointer-events:none;z-index:9998;transition:opacity 0.9s ease-out';
    document.body.appendChild(concuss);
    requestAnimationFrame(() => { concuss.style.opacity = '0'; });
    setTimeout(() => concuss.remove(), 1100);
  }, soundDelay);

  // ── Single shared elapsed value — computed once per preUpdate tick ────────
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
    const fadeIn  = Math.min(1, elapsedS / 0.5);
    const fadeOut = elapsedS < 25 ? 1 : Math.max(0, 1 - (elapsedS - 25) / 10);
    mdlColor.alpha = fadeIn * fadeOut;
    return mdlColor;
  };

  const modelEnt = viewer.entities.add({
    position: C.Cartesian3.fromDegrees(lon, lat, H(0)),
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

  setTimeout(() => {
    if (!viewer.isDestroyed()) {
      viewer.scene.preUpdate.removeEventListener(onPreUpdate);
      viewer.entities.remove(modelEnt);
    }
  }, 35000);
}

// ─────────────────────────────────────────────────────────────────────────────

const BRIEF_IMAGES = [
  { src: '/SOH_1.png', label: 'DOCKING AREA — AERIAL RECON' },
];

const buildNarration4 = (name) =>
  `Commander ${name}. Be advised. ` +
  'Oil tankers and barges are under sustained attack from high-speed armed boats. ' +
  'Multiple vessels have been hit. ' +
  'During the previous hostage extraction, our team secured photographs from inside the compound. ' +
  'Among them were images of what appears to be a speedboat docking and staging area. ' +
  'Unfortunately the photos carry no geolocation data — we do not know where this facility is. ' +
  'That is your problem to solve. ' +
  'Study the image carefully. Find the area. ' +
  'You have one MOAB. Locate the docking facility and eliminate it. ' +
  'Strike radius is two hundred yards. ' +
  'You have three minutes. The clock starts when you close this briefing. ' +
  `Do not waste time. Good hunting, Commander ${name}.`;

function Level4Briefing({ onReady, playerName }) {
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
    const narration = buildNarration4(playerName);
    const u = new SpeechSynthesisUtterance(narration);
    u.rate   = 0.92;
    u.pitch  = 0.88;
    u.volume = 0.9;
    if (female) u.voice = female;
    u.onboundary = (e) => {
      if (e.name === 'word') setSubtitle(narration.slice(0, e.charIndex + e.charLength));
    };
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
    <div
      onClick={skip}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: '#020c14',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'var(--font-mono)',
        opacity: gone ? 0 : 1, transition: 'opacity .42s',
        cursor: 'pointer',
      }}
    >
      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '.6rem 1.4rem', borderBottom: '1px solid rgba(0,212,255,.15)',
        background: 'rgba(0,0,0,.5)',
      }}>
        <div style={{ fontSize: '.65rem', color: 'var(--cyan)', letterSpacing: '.18em' }}>
          ██ CLASSIFIED — EYES ONLY
        </div>
        <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#fff', letterSpacing: '.14em' }}>
          OPERATION IRONCLAD
        </div>
        <div style={{ fontSize: '.62rem', color: 'var(--t-ghost)', letterSpacing: '.1em' }}>
          LEVEL 4 — MARITIME STRIKE
        </div>
      </div>

      {/* Body: images top, intel right */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Recon image — centred, fills available width */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#000', borderRight: '1px solid rgba(0,212,255,.12)',
          padding: '1.5vw',
        }}>
          {BRIEF_IMAGES.map((img, i) => (
            <div key={i} style={{
              width: '62vw', height: '46vw', maxHeight: '70vh', position: 'relative', flexShrink: 0,
              border: '1px solid rgba(0,212,255,.35)',
            }}>
              <img src={img.src} alt={img.label} style={{
                width: '100%', height: '100%', objectFit: 'cover',
                display: 'block', opacity: 0.88,
                filter: 'brightness(.9) contrast(1.08)',
              }} />
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.08) 2px,rgba(0,0,0,.08) 4px)',
              }} />
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                padding: '.4rem .7rem',
                background: 'linear-gradient(transparent, rgba(0,0,0,.88))',
                fontSize: '.58rem', letterSpacing: '.16em', color: 'var(--cyan)',
              }}>
                ▶ {img.label}
              </div>
              {[['0 auto auto 0','tl'],['0 0 auto auto','tr'],
                ['auto auto 0 0','bl'],['auto 0 0 auto','br']].map(([ins, k]) => (
                <div key={k} style={{
                  position: 'absolute', inset: ins, width: 16, height: 16, margin: 6,
                  borderTop:    k[0]==='t' ? '2px solid rgba(0,212,255,.6)' : 'none',
                  borderBottom: k[0]==='b' ? '2px solid rgba(0,212,255,.6)' : 'none',
                  borderLeft:   k[1]==='l' ? '2px solid rgba(0,212,255,.6)' : 'none',
                  borderRight:  k[1]==='r' ? '2px solid rgba(0,212,255,.6)' : 'none',
                }} />
              ))}
            </div>
          ))}
        </div>

        {/* Intel / mission panel */}
        <div style={{
          width: '360px', padding: '1.6rem 1.4rem', display: 'flex',
          flexDirection: 'column', gap: '1rem', overflowY: 'auto',
          borderLeft: '1px solid rgba(0,212,255,.08)',
        }}>
          <div>
            <div style={{ fontSize: '.55rem', color: 'var(--t-ghost)', letterSpacing: '.2em', marginBottom: '.3rem' }}>
              PHOTOS SECURED — PREVIOUS RAID — NO GEO DATA
            </div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fff', letterSpacing: '.1em', lineHeight: 1.2 }}>
              ELIMINATE<br />SPEEDBOAT THREAT
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(0,212,255,.2)', paddingTop: '.9rem' }}>
            {[
              ['TARGET',        'DOCKING AREA', 'var(--amber)'],
              ['ORDNANCE',      '1 × MOAB',     'var(--amber)'],
              ['TIME LIMIT',    '03:00',         '#FF4444'],
              ['STRIKE RADIUS', '200 YD',        'var(--cyan)'],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                padding: '.35rem 0', borderBottom: '1px solid rgba(255,255,255,.04)',
              }}>
                <span style={{ fontSize: '.6rem', color: 'var(--t-ghost)', letterSpacing: '.12em' }}>{label}</span>
                <span style={{ fontSize: '.95rem', fontWeight: 700, color: col }}>{val}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: '.62rem', color: 'var(--t-dim)', lineHeight: 2, letterSpacing: '.04em' }}>
            PHOTOGRAPHS OF THE DOCKING AREA WERE SECURED DURING THE PREVIOUS HOSTAGE RAID.
            THE IMAGES CARRY NO GEOLOCATION DATA. YOU MUST IDENTIFY THE LOCATION YOURSELF.
            <span style={{ color: 'var(--amber)', display: 'block', marginTop: '.5rem' }}>
              ⚠ YOU HAVE ONE MOAB. ONE CHANCE. DO NOT MISS.
            </span>
            <span style={{ color: 'var(--cyan)', display: 'block', marginTop: '.5rem' }}>
              NAVIGATE TO THE TARGET AREA USING PAN AND ZOOM. STUDY THE RECON IMAGE.
            </span>
          </div>

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

      {/* Subtitle bar */}
      <div style={{
        minHeight: '2.8rem', padding: '.55rem 1.4rem',
        borderTop: '1px solid rgba(0,212,255,.12)',
        background: 'rgba(0,0,0,.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
      }}>
        <div style={{
          flex: 1, fontSize: '.65rem', color: 'rgba(255,255,255,.75)',
          letterSpacing: '.04em', lineHeight: 1.5,
          fontStyle: subtitle ? 'normal' : 'italic',
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

const fmtTime = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

function CountdownClock({ onExpire, onMinute, active }) {
  const [timeLeft, setTimeLeft] = useState(180);

  useEffect(() => {
    if (!active || timeLeft <= 0) return;
    const id = setTimeout(() => {
      const next = timeLeft - 1;
      if (next % 60 === 0 && next > 0) onMinute(next / 60);
      if (next <= 0) onExpire();
      setTimeLeft(next);
    }, 1000);
    return () => clearTimeout(id);
  }, [timeLeft, active, onExpire, onMinute]);

  if (!active) return null;
  return (
    <div style={{
      position: 'absolute', top: '18px', left: '50%', transform: 'translateX(-50%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      pointerEvents: 'none', zIndex: 15,
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontWeight: 700,
        fontSize: timeLeft <= 60 ? '7rem' : '6.5rem',
        lineHeight: 1, letterSpacing: '.08em',
        color: timeLeft <= 60 ? '#FF3030' : timeLeft <= 120 ? '#FF8800' : 'var(--cyan)',
        textShadow: timeLeft <= 60
          ? '0 0 40px rgba(255,48,48,.9), 0 0 80px rgba(255,48,48,.5)'
          : timeLeft <= 120 ? '0 0 30px rgba(255,136,0,.8)'
          : '0 0 24px rgba(0,212,255,.6)',
        animation: timeLeft <= 30 ? 'pulse .6s ease-in-out infinite' : 'none',
      }}>
        {fmtTime(timeLeft)}
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '.65rem',
        letterSpacing: '.22em', color: 'rgba(255,255,255,.35)', marginTop: '.15rem',
      }}>
        TIME REMAINING
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Level4Game({ playerName, onPlayAgain, onMissionComplete }) {
  const containerRef       = useRef(null);
  const viewerRef          = useRef(null);
  const targetRef          = useRef(null);
  const strikeActive       = useRef(false);
  const tankModeRef        = useRef(false);
  const terrainProviderRef = useRef(null);
  const pendingMarkerRef   = useRef(null);
  const destroyedRef       = useRef(new Set());
  const bombsDroppedRef    = useRef(0);

  const [hasTarget,      setHasTarget]      = useState(false);
  const [bombsLeft,      setBombsLeft]      = useState(1);
  const [ventVisible,    setVentVisible]    = useState([false]);
  const [ventPositions,  setVentPositions]  = useState(() => {
    const cx = Math.max(0, (window.innerWidth  - 560) / 2);
    const cy = Math.max(0, (window.innerHeight - 420) / 2);
    return [{ x: cx, y: cy }];
  });
  const dragRef = useRef(null);
  const [strikeInProg,   setStrikeInProg]   = useState(false);
  const crosshairHRef  = useRef(null);
  const crosshairVRef  = useRef(null);
  const coordDisplayRef = useRef(null);
  const camAltRef      = useRef(null);
  const camLatRef      = useRef(null);
  const camLonRef      = useRef(null);
  const [tankMode,       setTankModeState]  = useState(false);
  const [pendingTank,    setPendingTank]    = useState(null);
  const [placedTankList,      setPlacedTankList]      = useState([]);
  const [missionAccomplished, setMissionAccomplished] = useState(false);
  const [failReason,          setFailReason]          = useState(null);
  const [showFlyby,           setShowFlyby]           = useState(false);
  const [briefing,            setBriefing]            = useState(true);
  const [log,      setLog]      = useState([
    { ts: timestamp(), msg: 'LEVEL 4 — MARITIME STRIKE — LOCATION UNKNOWN', cls: 'warn' },
    { ts: timestamp(), msg: 'Photos from hostage raid — no geo data. Find the area.', cls: 'info' },
    { ts: timestamp(), msg: '3D satellite imagery online. Navigate to target.', cls: '' },
    { ts: timestamp(), msg: 'Left-click terrain to mark strike target.',     cls: '' },
  ]);
  const logEndRef = useRef(null);

  useEffect(() => {
    const onMove = (e) => {
      if (!dragRef.current) return;
      const { idx, startMX, startMY, startX, startY } = dragRef.current;
      setVentPositions(prev => prev.map((p, i) =>
        i === idx ? { x: startX + e.clientX - startMX, y: startY + e.clientY - startMY } : p
      ));
    };
    const onUp = () => { dragRef.current = null; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
  }, []);

  const addLog = useCallback((msg, cls = '') => {
    setLog(prev => [...prev, { ts: timestamp(), msg, cls }].slice(-60));
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  const speakMinutes = useCallback((n) => {
    speakReport(`You have ${n} minute${n !== 1 ? 's' : ''} remaining`);
  }, []);

  const handleClockExpire = useCallback(() => {
    setFailReason('TIME EXPIRED — TARGET SITES COMPROMISED');
    addLog('⚠ TIME EXPIRED — MISSION FAILED', 'warn');
  }, [addLog]);

  useEffect(() => {
    if (!containerRef.current || !window.Cesium) return;
    const C = window.Cesium;

    primeBlastAudio();

    const creditDiv = document.createElement('div');
    creditDiv.style.display = 'none';

    const viewer = new C.Viewer(containerRef.current, {
      imageryProvider:      false,
      baseLayerPicker:      false,
      geocoder:             false,
      homeButton:           false,
      sceneModePicker:      false,
      navigationHelpButton: false,
      animation:            false,
      timeline:             false,
      fullscreenButton:     false,
      infoBox:              false,
      selectionIndicator:   false,
      creditContainer:      creditDiv,
    });

    viewer.imageryLayers.addImageryProvider(
      new C.UrlTemplateImageryProvider({ url: ESRI_SAT, maximumLevel: 23 })
    );

    viewer.scene.globe.depthTestAgainstTerrain = true;

    // Terrain in Hormuzgan sits around 2083m — clamp camera at 2500m when zoomed in
    const MIN_CAM_HEIGHT = 2500;
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = MIN_CAM_HEIGHT;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 30_000_000;
    const onPostUpdate = () => {
      if (viewer.isDestroyed()) return;
      const h = viewer.camera.positionCartographic.height;
      if (h < MIN_CAM_HEIGHT) {
        const c = viewer.camera.positionCartographic.clone();
        c.height = MIN_CAM_HEIGHT;
        viewer.camera.setView({ destination: C.Cartographic.toCartesian(c) });
      }
    };
    viewer.scene.postUpdate.addEventListener(onPostUpdate);

    // Start over the western hemisphere — full globe view. Player must navigate to target.
    viewer.camera.setView({
      destination:  C.Cartesian3.fromDegrees(INIT_START_LON, INIT_START_LAT, INIT_ALT),
      orientation:  { heading: 0, pitch: C.Math.toRadians(-90), roll: 0 },
    });

    // Preload explosion GLB
    viewer.entities.add({
      position: C.Cartesian3.fromDegrees(CENTER_LON, CENTER_LAT, -5000),
      model: { uri: '/layered_explosion_as_solid.glb', scale: 0.0001, minimumPixelSize: 0, maximumScale: 0.0001 },
    });

    C.ArcGISTiledElevationTerrainProvider.fromUrl(ARCGIS_TRN).then(tp => {
      if (viewer.isDestroyed()) return;
      viewer.terrainProvider = tp;
      terrainProviderRef.current = tp;
      addLog('Terrain loaded. Left-click terrain to mark strike target.', 'info');
    }).catch(() => {
      if (!viewer.isDestroyed()) addLog('Terrain unavailable — flat mode.', 'warn');
    });

    viewer.camera.changed.addEventListener(() => {
      const carto = C.Cartographic.fromCartesian(viewer.camera.position);
      const h = carto.height;
      const altStr = h >= 10_000 ? `${Math.round(h / 1000).toLocaleString()} km` : `${Math.round(h).toLocaleString()} m`;
      if (camAltRef.current) camAltRef.current.textContent = altStr;
      if (camLatRef.current) camLatRef.current.textContent = `${C.Math.toDegrees(carto.latitude).toFixed(4)}°N`;
      if (camLonRef.current) camLonRef.current.textContent = `${C.Math.toDegrees(carto.longitude).toFixed(4)}°E`;
    });

    const handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click) => {
      const ray = viewer.camera.getPickRay(click.position);
      let cart  = viewer.scene.globe.pick(ray, viewer.scene);
      if (!cart) cart = viewer.camera.pickEllipsoid(click.position);
      if (!cart) return;

      const carto = C.Cartographic.fromCartesian(cart);
      const lat   = C.Math.toDegrees(carto.latitude);
      const lon   = C.Math.toDegrees(carto.longitude);

      if (tankModeRef.current) {
        if (pendingMarkerRef.current) viewer.entities.remove(pendingMarkerRef.current);
        pendingMarkerRef.current = viewer.entities.add({
          position: C.Cartesian3.fromDegrees(lon, lat),
          point: {
            pixelSize: 18, color: C.Color.YELLOW,
            outlineColor: C.Color.BLACK, outlineWidth: 2,
            heightReference: C.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: '? TANK', font: '700 11px monospace',
            fillColor: C.Color.YELLOW, outlineColor: C.Color.BLACK, outlineWidth: 2,
            style: C.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new C.Cartesian2(0, -22),
            heightReference: C.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        setPendingTank({ lat, lon });
        addLog(`Pending: ${lat.toFixed(5)}°N  ${lon.toFixed(5)}°E — confirm in sidebar.`, 'info');
        return;
      }

      const groundAlt = carto.height || 0;
      if (targetRef.current) {
        targetRef.current.entities.forEach(e => viewer.entities.remove(e));
      }

      const chCanvas = document.createElement('canvas');
      chCanvas.width = 40; chCanvas.height = 40;
      const chCtx = chCanvas.getContext('2d');
      chCtx.strokeStyle = 'black';
      chCtx.lineWidth = 2.5;
      chCtx.beginPath(); chCtx.moveTo(0, 20); chCtx.lineTo(40, 20); chCtx.stroke();
      chCtx.beginPath(); chCtx.moveTo(20, 0); chCtx.lineTo(20, 40); chCtx.stroke();

      const pos = C.Cartesian3.fromDegrees(lon, lat);
      const tE1 = viewer.entities.add({
        position: pos,
        ellipse: {
          semiMajorAxis: 9.14, semiMinorAxis: 9.14,
          material: C.Color.LIME.withAlpha(0.25),
          outline: true, outlineColor: C.Color.LIME, outlineWidth: 2,
          heightReference: C.HeightReference.CLAMP_TO_GROUND,
        },
      });
      const tE2 = viewer.entities.add({
        position: pos,
        point: {
          pixelSize: 10, color: C.Color.LIME,
          outlineColor: C.Color.WHITE, outlineWidth: 1,
          heightReference: C.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: '✦ STRIKE', font: '700 11px monospace',
          fillColor: C.Color.LIME,
          outlineColor: C.Color.BLACK, outlineWidth: 2,
          style: C.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new C.Cartesian2(0, -22),
          heightReference: C.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      const tE3 = viewer.entities.add({
        position: pos,
        billboard: {
          image: chCanvas,
          heightReference: C.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scale: 1,
        },
      });

      targetRef.current = { entities: [tE1, tE2, tE3], lat, lon, groundAlt };
      setHasTarget(true);
      addLog(`Target marked — ${lat.toFixed(5)}°N  ${lon.toFixed(5)}°E`, 'info');
    }, C.ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction((move) => {
      const { x, y } = move.endPosition;
      if (crosshairHRef.current) crosshairHRef.current.style.top  = `${y}px`;
      if (crosshairVRef.current) crosshairVRef.current.style.left = `${x}px`;
      const ray  = viewer.camera.getPickRay(move.endPosition);
      const cart = viewer.scene.globe.pick(ray, viewer.scene)
                ?? viewer.camera.pickEllipsoid(move.endPosition);
      if (cart) {
        const carto = C.Cartographic.fromCartesian(cart);
        if (coordDisplayRef.current) {
          coordDisplayRef.current.style.display = 'block';
          coordDisplayRef.current.textContent =
            `${C.Math.toDegrees(carto.latitude).toFixed(6)}°N   ${C.Math.toDegrees(carto.longitude).toFixed(6)}°E`;
        }
      } else {
        if (coordDisplayRef.current) coordDisplayRef.current.style.display = 'none';
      }
    }, C.ScreenSpaceEventType.MOUSE_MOVE);

    viewerRef.current = viewer;

    return () => {
      viewer.scene.postUpdate.removeEventListener(onPostUpdate);
      handler.destroy();
      if (!viewer.isDestroyed()) viewer.destroy();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLaunchStrike = useCallback(() => {
    const target = targetRef.current;
    if (!target || strikeActive.current) return;

    bombsDroppedRef.current = 1;
    setBombsLeft(0);

    setStrikeInProg(true);
    targetRef.current = null;
    setHasTarget(false);

    addLog('⚠ MOAB INBOUND — IMPACT IN 3...', 'warn');
    setTimeout(() => addLog('2...', 'warn'), 1000);
    setTimeout(() => addLog('1...', 'warn'), 2000);

    setTimeout(() => {
      if (viewerRef.current) (target.entities || []).forEach(e => viewerRef.current.entities.remove(e));
      detonateStrike(viewerRef.current, target.lat, target.lon, target.groundAlt || 0, addLog, (sLat, sLon) => {
        if (!window.Cesium) return;
        const C = window.Cesium;

        let hitTarget = null;
        TARGETS.forEach(t => {
          if (destroyedRef.current.has(t.id)) return;
          const dist = C.Cartesian3.distance(
            C.Cartesian3.fromDegrees(sLon, sLat),
            C.Cartesian3.fromDegrees(t.lon, t.lat),
          );
          if (dist <= t.radius) hitTarget = t;
        });

        if (hitTarget) {
          destroyedRef.current.add(hitTarget.id);
          addLog('★ DOCKING AREA DESTROYED — direct hit', 'warn');
          setTimeout(() => speakReport('Direct hit. Target eliminated.'), 15000);
          setTimeout(() => { setMissionAccomplished(true); onMissionComplete?.(); }, 6200);
          setTimeout(() => triggerFlyby(viewerRef.current, () => setShowFlyby(true)), 7500);
        } else {
          addLog('★ MOAB — MISS. DOCKING AREA INTACT.', 'warn');
          setTimeout(() => {
            speakReport('Ordnance missed. Docking area intact. Mission failed.');
            setFailReason('ORDNANCE MISSED — DOCKING AREA INTACT');
            addLog('⚠ MISS — MISSION FAILED', 'warn');
          }, 15000);
        }
      });
      setStrikeInProg(false);
    }, 3000);
  }, [addLog]);

  const handleToggleTankMode = useCallback(() => {
    const next = !tankModeRef.current;
    tankModeRef.current = next;
    setTankModeState(next);
    if (!next && pendingMarkerRef.current && viewerRef.current) {
      viewerRef.current.entities.remove(pendingMarkerRef.current);
      pendingMarkerRef.current = null;
      setPendingTank(null);
    }
    addLog(
      next ? 'Tank placement mode ON — click terrain to mark.' : 'Tank placement mode OFF.',
      next ? 'info' : '',
    );
  }, [addLog]);

  const handleConfirmTank = useCallback(() => {
    if (!pendingTank) return;
    const { lat, lon } = pendingTank;
    if (pendingMarkerRef.current && viewerRef.current) {
      viewerRef.current.entities.remove(pendingMarkerRef.current);
      pendingMarkerRef.current = null;
    }
    setPendingTank(null);
    setPlacedTankList(prev => {
      const updated = [...prev, { lat, lon }];
      console.log('Tank locations:', JSON.stringify(updated.map(t => ({ lat: +t.lat.toFixed(6), lon: +t.lon.toFixed(6) }))));
      return updated;
    });
    if (terrainProviderRef.current) {
      placeTankAt(viewerRef.current, lat, lon, terrainProviderRef.current, addLog);
    }
  }, [pendingTank, addLog]);

  const handleCancelTank = useCallback(() => {
    if (pendingMarkerRef.current && viewerRef.current) {
      viewerRef.current.entities.remove(pendingMarkerRef.current);
      pendingMarkerRef.current = null;
    }
    setPendingTank(null);
    addLog('Tank placement cancelled.', '');
  }, [addLog]);

  const handleZoomIn = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const h = viewer.camera.positionCartographic.height;
    viewer.camera.zoomIn(h * 0.3);
  }, []);

  const handleZoomOut = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const h = viewer.camera.positionCartographic.height;
    viewer.camera.zoomOut(h * 0.3);
  }, []);

  const handleResetView = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || !window.Cesium) return;
    const C = window.Cesium;
    viewer.camera.flyTo({
      destination:  C.Cartesian3.fromDegrees(INIT_START_LON, INIT_START_LAT, INIT_ALT),
      orientation:  { heading: 0, pitch: C.Math.toRadians(-90), roll: 0 },
      duration:     2.0,
    });
    addLog('View reset to global overview.', '');
  }, [addLog]);

  const launchReady = hasTarget && !strikeInProg && !failReason && bombsLeft > 0;

  return (
    <div className="game-wrap">

      {briefing && <Level4Briefing playerName={playerName} onReady={() => setBriefing(false)} />}

      <div className="hud">
        <div className="hud-brand">
          TACT/CMD
          <span>LEVEL 4 — MARITIME STRIKE</span>
        </div>

        <div className="hud-stats">
          <div className="hud-stat">
            <span className="hud-stat-label">Alt</span>
            <span className="hud-stat-value" ref={camAltRef}>{Math.round(INIT_ALT / 1000).toLocaleString()} km</span>
          </div>
          <div className="hud-stat">
            <span className="hud-stat-label">Lat</span>
            <span className="hud-stat-value" ref={camLatRef}>{CENTER_LAT.toFixed(4)}°N</span>
          </div>
          <div className="hud-stat">
            <span className="hud-stat-label">Lon</span>
            <span className="hud-stat-value" ref={camLonRef}>{CENTER_LON.toFixed(4)}°E</span>
          </div>
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
            <div className="panel-title accent">// Recon Image</div>
            {BRIEF_IMAGES.map((img, i) => (
              <button
                key={i}
                className="btn-secondary"
                style={{
                  width: '100%', marginBottom: '.3rem', textAlign: 'left',
                  color:       ventVisible[i] ? 'var(--cyan)'                  : 'rgba(255,210,0,.85)',
                  borderColor: ventVisible[i] ? 'rgba(0,212,255,.6)'           : 'rgba(255,210,0,.55)',
                  background:  ventVisible[i] ? 'rgba(0,212,255,.12)'          : 'rgba(255,200,0,.08)',
                  boxShadow:   ventVisible[i] ? '0 0 8px rgba(0,212,255,.25)'  : '0 0 6px rgba(255,200,0,.2)',
                  fontWeight: 700,
                }}
                onClick={() => setVentVisible(v => v.map((x, j) => j === i ? !x : x))}
              >
                {ventVisible[i] ? '◉' : '○'} {img.label}
              </button>
            ))}
          </div>

          <div className="panel">
            <div className="panel-title accent">// Intel Summary</div>
            <div className="intel-row">
              <span className="intel-key">Source</span>
              <span className="intel-val" style={{ fontSize: '.58rem' }}>HOSTAGE RAID</span>
            </div>
            <div className="intel-row">
              <span className="intel-key">Threat</span>
              <span className="intel-val">SPEEDBOATS</span>
            </div>
            <div className="intel-row">
              <span className="intel-key">Geo Data</span>
              <span className="intel-val" style={{ color: '#FF8800' }}>NONE</span>
            </div>
            <div className="intel-row">
              <span className="intel-key">Ordnance</span>
              <span className="intel-val" style={{ color: bombsLeft === 0 ? '#FF3030' : 'var(--amber)' }}>
                {bombsLeft === 1 ? '1 × MOAB' : 'EXPENDED'}
              </span>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">// Strike Control</div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
              <span style={{ fontSize: '.6rem', color: 'var(--t-ghost)', letterSpacing: '.1em' }}>ORDNANCE</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.9rem', fontWeight: 700,
                color: bombsLeft === 0 ? '#FF3030' : 'var(--amber)' }}>
                {'⬡ '.repeat(bombsLeft)}{'⬢ '.repeat(1 - bombsLeft)}
              </span>
            </div>

            <button
              style={{
                width:        '100%',
                padding:      '.55rem .75rem',
                marginBottom: '.5rem',
                fontFamily:   'var(--font-mono)',
                fontSize:     '.72rem',
                fontWeight:   700,
                letterSpacing:'.08em',
                cursor:       launchReady ? 'pointer' : 'not-allowed',
                border:       `1px solid ${launchReady ? 'rgba(255,80,0,.8)' : 'rgba(255,80,0,.2)'}`,
                borderRadius: '3px',
                background:   launchReady ? 'rgba(255,50,0,.18)' : 'rgba(255,50,0,.05)',
                color:        launchReady ? '#FF5500' : 'rgba(255,80,0,.3)',
                transition:   'all .2s',
                boxShadow:    launchReady ? '0 0 12px rgba(255,80,0,.35)' : 'none',
              }}
              disabled={!launchReady}
              onClick={handleLaunchStrike}
            >
              {strikeInProg ? '◌ STRIKE IN PROGRESS...' : '⚡ LAUNCH STRIKE'}
            </button>

            <div style={{ fontSize: '.6rem', color: launchReady ? 'var(--t-dim)' : 'var(--t-ghost)', lineHeight: 1.6 }}>
              {launchReady
                ? 'Target locked. Confirm launch.'
                : strikeInProg
                  ? 'Ordnance in flight...'
                  : 'Left-click terrain to mark target.'}
            </div>

            <div style={{ marginTop: '.75rem' }}>
              <div style={{ display: 'flex', gap: '.4rem', marginBottom: '.4rem' }}>
                <button className="btn-secondary" onClick={handleZoomIn}  style={{ flex: 1 }}>＋ Zoom In</button>
                <button className="btn-secondary" onClick={handleZoomOut} style={{ flex: 1 }}>－ Zoom Out</button>
              </div>
              <button className="btn-secondary" onClick={handleResetView} style={{ width: '100%' }}>
                ⊙ Reset View
              </button>
            </div>

            <div style={{ marginTop: '.6rem', fontSize: '.62rem', color: 'var(--t-dim)', lineHeight: 1.7 }}>
              <div><span style={{ color: 'var(--cyan)' }}>Scroll</span> — zoom in / out</div>
              <div><span style={{ color: 'var(--cyan)' }}>Left-drag</span> — pan</div>
              <div><span style={{ color: 'var(--cyan)' }}>Right-drag</span> — tilt / rotate</div>
              <div><span style={{ color: 'var(--cyan)' }}>Click</span> — set strike target</div>
            </div>
          </div>

          <button className="btn-secondary" style={{ marginTop: 'auto' }} onClick={onPlayAgain}>
            ← Return to Missions
          </button>
        </div>

        {/* 3D Cesium globe */}
        <div
          className="board-area"
          style={{ padding: 0, overflow: 'hidden', position: 'relative', alignItems: 'stretch', cursor: 'none' }}
        >
          <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

          <CountdownClock
            active={!briefing && !missionAccomplished && !failReason}
            onExpire={handleClockExpire}
            onMinute={speakMinutes}
          />

          {missionAccomplished && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', zIndex: 20,
              background: 'transparent', pointerEvents: 'none',
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '2.4rem', fontWeight: 700,
                color: '#00FF88', letterSpacing: '.2em', textAlign: 'center',
                textShadow: '0 0 30px rgba(0,255,136,.8), 0 0 60px rgba(0,255,136,.4)',
                animation: 'pulse 1.2s ease-in-out infinite',
              }}>
                MISSION ACCOMPLISHED
              </div>
              <div style={{
                marginTop: '1rem', fontFamily: 'var(--font-mono)', fontSize: '.9rem',
                color: '#00FFC8', letterSpacing: '.15em',
              }}>
                DOCKING AREA ELIMINATED
              </div>
              <button
                className="btn-secondary"
                style={{ marginTop: '2rem', color: 'var(--cyan)', borderColor: 'rgba(0,212,255,.4)', pointerEvents: 'auto' }}
                onClick={onPlayAgain}
              >
                ← Return to Missions
              </button>
            </div>
          )}

          {failReason && !missionAccomplished && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', zIndex: 20,
              background: 'rgba(0,0,0,.72)',
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '2.4rem', fontWeight: 700,
                color: '#FF2020', letterSpacing: '.2em', textAlign: 'center',
                textShadow: '0 0 30px rgba(255,32,32,.8), 0 0 60px rgba(255,32,32,.4)',
                animation: 'pulse 1.2s ease-in-out infinite',
              }}>
                MISSION FAILED
              </div>
              <div style={{
                marginTop: '1rem', fontFamily: 'var(--font-mono)', fontSize: '.9rem',
                color: '#FF6060', letterSpacing: '.15em',
              }}>
                {failReason}
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

          {showFlyby && <MissionFlyby viewerRef={viewerRef} />}

          {/* Intel image overlays — draggable */}
          {BRIEF_IMAGES.map((img, i) => ventVisible[i] && (
            <div key={i} style={{
              position: 'absolute',
              left: ventPositions[i].x,
              top:  ventPositions[i].y,
              width: '560px',
              border: '1px solid rgba(0,212,255,.5)',
              borderRadius: '3px',
              background: '#000',
              zIndex: 18,
              userSelect: 'none',
              boxShadow: '0 4px 24px rgba(0,0,0,.7)',
            }}>
              <div
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dragRef.current = {
                    idx: i,
                    startMX: e.clientX, startMY: e.clientY,
                    startX: ventPositions[i].x, startY: ventPositions[i].y,
                  };
                }}
                style={{
                  padding: '4px 10px',
                  background: 'rgba(0,212,255,.14)',
                  fontFamily: 'var(--font-mono)', fontSize: '.58rem',
                  letterSpacing: '.14em', color: 'var(--cyan)',
                  cursor: 'grab',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <span>▶ {img.label}</span>
                <span style={{ fontSize: '.5rem', color: 'var(--t-ghost)' }}>⠿ DRAG</span>
              </div>
              <img src={img.src} alt={img.label}
                style={{ width: '100%', display: 'block', opacity: .92, pointerEvents: 'none' }} />
            </div>
          ))}

          <div ref={crosshairHRef} style={{
            position: 'absolute', left: 0, right: 0, top: '-9999px',
            height: '1px', background: 'rgba(255,30,30,.8)',
            pointerEvents: 'none', zIndex: 10,
          }} />
          <div ref={crosshairVRef} style={{
            position: 'absolute', top: 0, bottom: 0, left: '-9999px',
            width: '1px', background: 'rgba(255,30,30,.8)',
            pointerEvents: 'none', zIndex: 10,
          }} />
          <div ref={coordDisplayRef} style={{
            display: 'none',
            position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,.72)', border: '1px solid rgba(0,255,200,.3)',
            borderRadius: '3px', padding: '4px 12px',
            fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: '#00FFC8',
            pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10,
          }} />
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
