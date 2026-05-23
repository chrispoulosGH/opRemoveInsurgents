import { useEffect, useRef } from 'react';
import { playGunfire, playFirefightChaos } from '../audio';

const N    = 25;
const WALK_SPEED = 32;   // px / second
const TEAM_SIZE  = 4;
const STAGGER    = 0.55; // seconds between each member on walks
const C_STAGGER  = 0.28; // seconds between each member entering/leaving cell
const DOT_R      = 2.88; // 15 % larger than previous 2.5

const ENTER_FADE    = 0.35;
const INSIDE_DUR    = 3.0;
const EMERGE_FADE   = 0.35;
const FIREFIGHT_DUR = 4.0;

function drawSeal(ctx, x, y, alpha) {
  ctx.beginPath();
  ctx.arc(x, y, DOT_R, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.fill();
}

function drawVictim(ctx, x, y, alpha) {
  ctx.beginPath();
  ctx.arc(x, y, DOT_R, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.fill();
}

function drawFlash(ctx, x, y, alpha) {
  const r = 14 + 18 * (1 - alpha);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0,  `rgba(255,255,180,${alpha})`);
  g.addColorStop(.5, `rgba(255,100,0,${alpha * .7})`);
  g.addColorStop(1,  'rgba(255,40,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

function borderToScreen(row, col, rect, cellPx, bp) {
  if (row === -1) return { x: rect.left + bp + col * cellPx + cellPx / 2, y: rect.top - 8 };
  if (row === N)  return { x: rect.left + bp + col * cellPx + cellPx / 2, y: rect.bottom + 8 };
  if (col === -1) return { x: rect.left - 8, y: rect.top + bp + row * cellPx + cellPx / 2 };
  return              { x: rect.right + 8,  y: rect.top + bp + row * cellPx + cellPx / 2 };
}

function cellCenter(row, col, rect, cellPx, bp) {
  return {
    x: rect.left + bp + col * cellPx + cellPx / 2,
    y: rect.top  + bp + row * cellPx + cellPx / 2,
  };
}

export default function SealTeam({ checks, gridRef, cellPx, borderPx, onDone }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const grid   = gridRef?.current;
    if (!canvas || !grid || !checks?.length) { onDone?.(); return; }

    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx  = canvas.getContext('2d');
    const rect = grid.getBoundingClientRect();
    const bp   = borderPx ?? cellPx * 2;

    const teams = checks.map((check) => {
      const entry  = borderToScreen(check.entry[0],  check.entry[1],  rect, cellPx, bp);
      const target = cellCenter(    check.target[0], check.target[1], rect, cellPx, bp);
      const dx = target.x - entry.x, dy = target.y - entry.y;
      const dist = Math.hypot(dx, dy);
      return { entry, target, dx, dy, ux: dx/dist, uy: dy/dist,
               walkDur: dist / WALK_SPEED, correct: check.correct };
    });

    const maxWalk = Math.max(...teams.map(t => t.walkDur));

    // ── Correct path timings ─────────────────────────────────────────────────
    // last seal (i=TEAM_SIZE-1) arrives at maxWalk + (TEAM_SIZE-1)*STAGGER
    const ALL_ARRIVED    = maxWalk + (TEAM_SIZE - 1) * STAGGER;
    const ENTER_T_BASE   = ALL_ARRIVED + 0.25;
    // all seals fully inside after: ENTER_T_BASE + (TEAM_SIZE-1)*C_STAGGER + ENTER_FADE
    const INSIDE_START   = ENTER_T_BASE + (TEAM_SIZE - 1) * C_STAGGER + ENTER_FADE;
    const INSIDE_END     = INSIDE_START + INSIDE_DUR;
    const EMERGE_T_BASE  = INSIDE_END;
    // all emerged + victim after: EMERGE_T_BASE + TEAM_SIZE*C_STAGGER + EMERGE_FADE
    const EXTRACT_T_BASE = EMERGE_T_BASE + TEAM_SIZE * C_STAGGER + EMERGE_FADE + 0.25;
    // last element (victim, i=TEAM_SIZE) done: EXTRACT_T_BASE + TEAM_SIZE*STAGGER + walkDur

    // ── Incorrect path timings ───────────────────────────────────────────────
    const RESULT_T  = maxWalk + 0.25;
    const RETREAT_T = RESULT_T + FIREFIGHT_DUR;

    const DONE_T = Math.max(
      EXTRACT_T_BASE + TEAM_SIZE * STAGGER + maxWalk + 0.5,
      RETREAT_T      + (TEAM_SIZE - 1) * STAGGER + maxWalk + 0.5
    );

    let startTs = null, animId, done = false;
    let firefightPlayed = false, insideGunfirePlayed = false;

    function frame(ts) {
      if (done) return;
      if (!startTs) startTs = ts;
      const t = (ts - startTs) / 1000;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      teams.forEach((team) => {

        if (team.correct) {
          // ── Correct: staggered walk-in → cell → emerge with victim ──────────

          // Draw seals
          for (let i = 0; i < TEAM_SIZE; i++) {
            // Walk-in position (each seal starts STAGGER*i seconds later)
            const winP = Math.min(Math.max(0, (t - i * STAGGER) / team.walkDur), 1);

            // Walk-out position
            const woutStart = EXTRACT_T_BASE + i * STAGGER;
            const woutP = Math.min(Math.max(0, (t - woutStart) / team.walkDur), 1);

            // Where is this seal spatially?
            let mx, my;
            if (t < ENTER_T_BASE) {
              mx = team.entry.x + team.dx * winP;
              my = team.entry.y + team.dy * winP;
            } else if (t >= EXTRACT_T_BASE) {
              mx = team.target.x - team.dx * woutP;
              my = team.target.y - team.dy * woutP;
            } else {
              mx = team.target.x;
              my = team.target.y;
            }

            // Alpha: fade into cell, invisible inside, emerge
            const fadeInStart  = ENTER_T_BASE  + i * C_STAGGER;
            const fadeOutStart = EMERGE_T_BASE + i * C_STAGGER;
            let alpha;
            if (t < fadeInStart) {
              alpha = 1;
            } else if (t < fadeInStart + ENTER_FADE) {
              alpha = 1 - (t - fadeInStart) / ENTER_FADE;
            } else if (t < fadeOutStart) {
              alpha = 0;
            } else if (t < fadeOutStart + EMERGE_FADE) {
              alpha = (t - fadeOutStart) / EMERGE_FADE;
            } else if (t >= EXTRACT_T_BASE) {
              alpha = Math.max(0, 1 - woutP);
            } else {
              alpha = 1;
            }

            if (alpha > 0) drawSeal(ctx, mx, my, alpha);
          }

          // Draw victim (appears on emerge, i = TEAM_SIZE)
          const victimFadeStart = EMERGE_T_BASE + TEAM_SIZE * C_STAGGER;
          const victimWoutStart = EXTRACT_T_BASE + TEAM_SIZE * STAGGER;
          const victimWoutP     = Math.min(Math.max(0, (t - victimWoutStart) / team.walkDur), 1);

          if (t >= victimFadeStart) {
            let vAlpha;
            if (t < victimFadeStart + EMERGE_FADE) {
              vAlpha = (t - victimFadeStart) / EMERGE_FADE;
            } else if (t >= victimWoutStart) {
              vAlpha = Math.max(0, 1 - victimWoutP);
            } else {
              vAlpha = 1;
            }

            let vx, vy;
            if (t >= victimWoutStart) {
              vx = team.target.x - team.dx * victimWoutP;
              vy = team.target.y - team.dy * victimWoutP;
            } else {
              vx = team.target.x;
              vy = team.target.y;
            }

            if (vAlpha > 0) drawVictim(ctx, vx, vy, vAlpha);
          }

          // Gunfire sound when team is inside
          if (!insideGunfirePlayed && t >= INSIDE_START) {
            insideGunfirePlayed = true;
            playGunfire();
          }

        } else {
          // ── Incorrect: staggered walk-in → firefight → staggered retreat ────

          // Firefight flash
          if (t >= RESULT_T) {
            const elapsed = t - RESULT_T;
            if (elapsed < FIREFIGHT_DUR) {
              const fa = Math.max(0, 1 - (elapsed % 0.35) * 7);
              if (fa > 0) drawFlash(ctx, team.target.x, team.target.y, fa * 0.85);
            } else {
              const fa = Math.max(0, 1 - (elapsed - FIREFIGHT_DUR) * 2.5);
              if (fa > 0) drawFlash(ctx, team.target.x, team.target.y, fa * 0.5);
            }
          }

          // Draw seals with stagger
          for (let i = 0; i < TEAM_SIZE; i++) {
            const winP  = Math.min(Math.max(0, (t - i * STAGGER) / team.walkDur), 1);
            const retStart = RETREAT_T + i * STAGGER;
            const retP  = Math.min(Math.max(0, (t - retStart) / team.walkDur), 1);

            let mx, my;
            if (t < RESULT_T + i * STAGGER) {
              // Walking in (staggered)
              mx = team.entry.x + team.dx * winP;
              my = team.entry.y + team.dy * winP;
            } else if (t >= retStart) {
              // Retreating
              mx = team.target.x - team.dx * retP;
              my = team.target.y - team.dy * retP;
            } else {
              mx = team.target.x;
              my = team.target.y;
            }

            drawSeal(ctx, mx, my, 1);
          }

          if (!firefightPlayed && t >= RESULT_T) {
            firefightPlayed = true;
            playGunfire();
            playFirefightChaos((FIREFIGHT_DUR + 3) * 1000);
          }
        }
      });

      if (t >= DONE_T && !done) {
        done = true;
        cancelAnimationFrame(animId);
        onDone?.();
        return;
      }
      animId = requestAnimationFrame(frame);
    }

    animId = requestAnimationFrame(frame);
    return () => { done = true; cancelAnimationFrame(animId); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 200 }}
    />
  );
}
