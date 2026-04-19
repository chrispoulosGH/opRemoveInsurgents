import { useEffect, useRef } from 'react';
import { playMissileLaunch } from '../audio';

// Pre-buffer all SFX at module import time so there is zero loading lag
const SFX = ['/sfx/jet-engine.mp3', '/sfx/blast1.mp3'];
SFX.forEach(src => { const a = new Audio(src); a.preload = 'auto'; a.load(); });

const CELL_PX     = 30;
const BORDER_PX   = 60;
const JET_COUNT   = 10;
const JET_GAP     = 38;    // px between jets vertically
const FLY_IN_DUR  = 5.4;   // seconds for jets to reach grid edge
const PAUSE_DUR   = 0.35;  // seconds jets hover before firing
const STAGGER     = 0.14;  // seconds between successive missile launches
const SPEED       = 300;   // missile px / second
const POST_PAUSE  = 0.7;   // seconds after last impact before jets leave
const FLY_OUT_DUR = 3.6;   // seconds for jets to exit left

// ── audio helpers ─────────────────────────────────────────────────────────────

function playClip(url, volume = 1.0, rate = 1.0) {
  try {
    const a = new Audio(url);
    a.volume = volume;
    a.playbackRate = rate;
    a.play().catch(() => {});
  } catch (_) {}
}

function playBlast(url, volume, rate) {
  try {
    const a = new Audio(url);
    a.volume = volume;
    a.playbackRate = rate;
    a.play().catch(() => {});
    return a;
  } catch (_) { return null; }
}

function stopAudios(audios, fadeDur = 0.25) {
  audios.forEach(a => {
    if (!a) return;
    const step = a.volume / (fadeDur * 60);
    const iv = setInterval(() => {
      a.volume = Math.max(0, a.volume - step);
      if (a.volume === 0) { clearInterval(iv); try { a.pause(); } catch (_) {} }
    }, 1000 / 60);
  });
}

// ── drawing helpers ──────────────────────────────────────────────────────────

function drawJet(ctx, x, y, size, facingRight) {
  ctx.save();
  ctx.translate(x, y);
  if (!facingRight) ctx.scale(-1, 1);

  ctx.fillStyle   = '#9aaabb';
  ctx.strokeStyle = '#4a5a6a';
  ctx.lineWidth   = 0.8;

  // fuselage
  ctx.beginPath();
  ctx.moveTo( size * .55,  0);
  ctx.lineTo(-size * .18, -size * .10);
  ctx.lineTo(-size * .52, -size * .07);
  ctx.lineTo(-size * .52,  size * .07);
  ctx.lineTo(-size * .18,  size * .10);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // top wing
  ctx.beginPath();
  ctx.moveTo( size * .10,  0);
  ctx.lineTo(-size * .10, -size * .38);
  ctx.lineTo(-size * .30, -size * .04);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // bottom wing
  ctx.beginPath();
  ctx.moveTo( size * .10,  0);
  ctx.lineTo(-size * .10,  size * .38);
  ctx.lineTo(-size * .30,  size * .04);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // tail fin
  ctx.beginPath();
  ctx.moveTo(-size * .30,  0);
  ctx.lineTo(-size * .50, -size * .22);
  ctx.lineTo(-size * .50, -size * .06);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  ctx.restore();
}

function drawMissile(ctx, m) {
  const len = 14;
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.rotate(m.angle);

  // exhaust trail
  const grad = ctx.createLinearGradient(-len / 2, 0, -len / 2 - 22, 0);
  grad.addColorStop(0, 'rgba(255,160,40,.8)');
  grad.addColorStop(1, 'rgba(255,60,0,0)');
  ctx.strokeStyle = grad;
  ctx.lineWidth   = 3;
  ctx.beginPath();
  ctx.moveTo(-len / 2, 0);
  ctx.lineTo(-len / 2 - 22, 0);
  ctx.stroke();

  // body
  ctx.fillStyle = '#d09020';
  ctx.fillRect(-len / 2, -2.5, len, 5);

  // nose
  ctx.fillStyle = '#ff3300';
  ctx.beginPath();
  ctx.moveTo(len / 2, 0);
  ctx.lineTo(len / 2 + 7, -2.5);
  ctx.lineTo(len / 2 + 7,  2.5);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function tickFlash(ctx, m, dt) {
  if (m.flashAlpha <= 0) return;
  m.flashAlpha = Math.max(0, m.flashAlpha - dt * 3.5);
  const r  = 6 + 18 * (1 - m.flashAlpha);
  const g  = ctx.createRadialGradient(m.tx, m.ty, 0, m.tx, m.ty, r);
  g.addColorStop(0,  `rgba(255,255,200,${m.flashAlpha})`);
  g.addColorStop(.4, `rgba(255,120,0,${m.flashAlpha * .8})`);
  g.addColorStop(1,  'rgba(255,40,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(m.tx, m.ty, r, 0, Math.PI * 2);
  ctx.fill();
}

// ── component ────────────────────────────────────────────────────────────────

export default function AirStrike({ targets, gridRef, onCellImpact, onDone }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const grid   = gridRef?.current;
    if (!canvas || !grid || targets.length === 0) { onDone(); return; }

    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    const ctx  = canvas.getContext('2d');
    const rect = grid.getBoundingClientRect();

    // formation
    const destX   = rect.left - 44;
    const centerY = rect.top + rect.height / 2;
    const topY    = centerY - ((JET_COUNT - 1) * JET_GAP) / 2;
    const jets    = Array.from({ length: JET_COUNT }, (_, i) => ({
      y: topY + i * JET_GAP, x: -72, facingRight: true,
    }));

    // missiles — one per target, assigned to jets round-robin
    const missiles = targets.map((t, i) => {
      const jet = jets[i % JET_COUNT];
      const tx  = rect.left + BORDER_PX + t.col * CELL_PX + CELL_PX / 2;
      const ty  = rect.top  + BORDER_PX + t.row * CELL_PX + CELL_PX / 2;
      const dx  = tx - destX;
      const dy  = ty - jet.y;
      return {
        sx: destX, sy: jet.y, tx, ty,
        x: destX,  y: jet.y,
        angle:    Math.atan2(dy, dx),
        dur:      Math.hypot(dx, dy) / SPEED,
        launchAt: FLY_IN_DUR + PAUSE_DUR + i * STAGGER,
        active: false, impacted: false,
        flashAlpha: 0,
        key: `${t.row},${t.col}`,
      };
    });

    const last      = missiles[missiles.length - 1];
    const flyOutAt  = last.launchAt + last.dur + POST_PAUSE;

    // ── schedule audio ──────────────────────────────────────────────────────
    // Jet engine: starts immediately, loops for the full fly-in duration
    const jetAudio = new Audio('/sfx/jet-engine.mp3');
    jetAudio.volume = 0.5;
    jetAudio.loop   = true;
    jetAudio.play().catch(() => {});
    // Stop engine after jets have left
    const engineStopMs = (flyOutAt + FLY_OUT_DUR + 0.3) * 1000;
    const engineTimer  = setTimeout(() => { jetAudio.pause(); }, engineStopMs);

    // Missile launches: staggered, one sound per missile
    const launchTimers = missiles.map(m =>
      setTimeout(() => playMissileLaunch(), m.launchAt * 1000)
    );

    const blastAudios = [];  // track blast clips so we can stop them on fly-out
    let startTs = null;
    let prevTs  = null;
    let animId;
    let done    = false;
    let blastsStopped = false;

    function frame(ts) {
      if (done) return;
      if (!startTs) { startTs = ts; prevTs = ts; }
      const t  = (ts - startTs) / 1000;
      const dt = (ts - prevTs)  / 1000;
      prevTs = ts;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // ── jet positions ──
      if (t < FLY_IN_DUR) {
        const e = 1 - Math.pow(1 - t / FLY_IN_DUR, 3);  // ease-out cubic
        jets.forEach(j => { j.x = -72 + (destX + 72) * e; j.facingRight = true; });
      } else if (t >= flyOutAt) {
        if (!blastsStopped) { blastsStopped = true; stopAudios(blastAudios); }
        const p = Math.min((t - flyOutAt) / FLY_OUT_DUR, 1);
        const e = p * p;                                   // ease-in
        jets.forEach(j => { j.x = destX - (destX + 220) * e; j.facingRight = false; });
        if (p >= 1 && !done) {
          done = true;
          cancelAnimationFrame(animId);
          onDone();
          return;
        }
      }
      // else: jets hover at destX

      // ── missiles ──
      missiles.forEach(m => {
        if (m.impacted) { tickFlash(ctx, m, dt); return; }
        if (t < m.launchAt) return;
        m.active = true;
        const p  = Math.min((t - m.launchAt) / m.dur, 1);
        m.x = m.sx + (m.tx - m.sx) * p;
        m.y = m.sy + (m.ty - m.sy) * p;
        if (p >= 1) {
          m.impacted   = true;
          m.flashAlpha = 1.0;
          blastAudios.push(playBlast('/sfx/blast1.mp3', 0.7 + Math.random() * 0.2, 0.9 + Math.random() * 0.2));
          onCellImpact(m.key);
        } else {
          drawMissile(ctx, m);
        }
        tickFlash(ctx, m, dt);
      });

      // jets drawn on top of missiles
      jets.forEach(j => drawJet(ctx, j.x, j.y, 30, j.facingRight));

      animId = requestAnimationFrame(frame);
    }

    animId = requestAnimationFrame(frame);
    return () => {
      done = true;
      cancelAnimationFrame(animId);
      jetAudio.pause();
      clearTimeout(engineTimer);
      launchTimers.forEach(clearTimeout);
      stopAudios(blastAudios, 0.1);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 200 }}
    />
  );
}
