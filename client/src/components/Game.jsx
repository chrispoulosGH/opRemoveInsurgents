import { useState, useCallback, useRef, useEffect } from 'react';
import { N, traceDrone, calcScore } from '../gameLogic';
import { playPanicScreams, playDroneDeployed, playTargetLit, playTargetUnlit, playDeployingStrikeForce, playDronesDepleted, playMaxTargetsLit, speakReport } from '../audio';
import HUD from './HUD';
import GameBoard from './GameBoard';
import AirStrike from './AirStrike';
import Scoreboard from './Scoreboard';
import MissionBriefing from './MissionBriefing';

function timestamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function Game({ playerName, mySocketId, foxes, players, gameOver, numFoxes = 9, droneLimit = 25, isContinuation = false, missionNumber = 1, onSubmitScore, onContinueMission, onPlayAgain, onStartHostageMission }) {
  const [briefing, setBriefing]     = useState(true);
  const [suspected, setSuspected]   = useState(new Set());   // Set<"row,col">
  const [launches, setLaunches]     = useState(new Map());   // Map<"row,col", { label, path, exitRow, exitCol }>
  const [previews, setPreviews]     = useState(new Map());   // Map<entryKey, { label, path, exitRow, exitCol }>
  const [fired, setFired]           = useState(false);
  const [hits, setHits]             = useState(0);
  const [falsePos, setFalsePos]     = useState(0);
  const [airStriking, setAirStriking] = useState(false);
  const [strikeReveal, setStrikeReveal] = useState(null); // Set<key> | null
  const [strikeCells, setStrikeCells]   = useState([]);   // [{row,col}] for AirStrike
  const [runnersActive, setRunnersActive] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [log, setLog]               = useState([
    { ts: timestamp(), msg: `LEVEL 1 — ROUND ${missionNumber} OF 3 — ${numFoxes} terror cells active.`, cls: 'info' },
    { ts: timestamp(), msg: 'Awaiting drone deployment orders.', cls: '' },
  ]);
  const [showScore, setShowScore]   = useState(false);
  const [cellSize, setCellSize]     = useState(30);
  const [revealTracedKey, setRevealTracedKey] = useState(null);
  const logEndRef  = useRef(null);
  const gridRef    = useRef(null);   // attached to .game-grid in GameBoard
  const foxKeysRef    = useRef(new Set());   // stable ref for impact callback
  const missedRef     = useRef(0);           // missed fox count for done callback
  const hitsRef       = useRef(0);           // hit count for done callback
  const falsePosRef   = useRef(0);           // false positive count for done callback
  const screamsFired      = useRef(false);   // ensure screams only start once
  const runnersScheduled  = useRef(false);   // ensure runner delay only fires once
  const totalTargetsRef   = useRef(0);       // total missile targets for this strike

  useEffect(() => {
    const id = setTimeout(() => {
      if (isContinuation) {
        speakReport(`Escaped terror cells have reconstituted. ${numFoxes} new terror cells detected in new locations. ${droneLimit} drones available. Commence drone reconnaissance now.`);
      } else {
        speakReport(`Intelligence confirms ${numFoxes} active terror cells operating in the sector. Hostile elements are embedded within the civilian population. Civilian casualties are not acceptable. Drone reconnaissance is authorized. Locate and mark all targets for simultaneous elimination. Commence drone reconnaissance now.`);
      }
    }, 50);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addLog = useCallback((msg, cls = '') => {
    setLog(prev => {
      const next = [...prev, { ts: timestamp(), msg, cls }];
      return next.slice(-60); // keep last 60 lines
    });
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  // Toggle a suspected fox location
  const handleInnerClick = useCallback((row, col) => {
    if (fired) return;
    const key = `${row},${col}`;
    setSuspected(prev => {
      if (!prev.has(key) && prev.size >= numFoxes) {
        addLog(`TARGET LIMIT REACHED — maximum ${numFoxes} targets allowed.`, 'bad');
        playMaxTargetsLit();
        return prev;
      }
      const next = new Set(prev);
      if (next.has(key)) {
        playTargetUnlit(next.size);
        next.delete(key);
        addLog(`Target unmarked at (${row},${col})`, 'warn');
      } else {
        next.add(key);
        playTargetLit(next.size);
        addLog(`Target marked at (${row},${col})`, 'good');
      }
      return next;
    });
  }, [fired, addLog]);

  // Launch a real drone from a border position
  const handleBorderClick = useCallback((row, col) => {
    if (fired) return;
    const key = `${row},${col}`;
    if (launches.has(key)) return;                          // already launched
    if (launches.size >= droneLimit) {
      playDronesDepleted();
      addLog('DRONE LIMIT REACHED — no further launches permitted.', 'bad');
      return;
    }

    const result = traceDrone(row, col, foxes);
    const entryKey = key;
    const exitKey  = `${result.exitRow},${result.exitCol}`;

    playDroneDeployed(launches.size + 1);
    setLaunches(prev => new Map(prev).set(entryKey, result));

    if (entryKey === exitKey) {
      addLog(`${result.label} → REVERSED — direct obstruction detected!`, 'warn');
    } else {
      addLog(`${result.label} → exits at ${exitKey}`, '');
    }
  }, [fired, launches, foxes, addLog]);

  // Preview a test path using player's own marks as simulated fox positions.
  // Right-clicking the entry or exit of an existing preview removes it.
  const handleBorderRightClick = useCallback((row, col) => {
    const key = `${row},${col}`;

    // Toggle off an existing preview
    if (previews.has(key)) {
      setPreviews(prev => { const next = new Map(prev); next.delete(key); return next; });
      return;
    }
    for (const [entryKey, p] of previews) {
      if (`${p.exitRow},${p.exitCol}` === key) {
        setPreviews(prev => { const next = new Map(prev); next.delete(entryKey); return next; });
        return;
      }
    }

    if (!fired) {
      // Pre-fire: only from real launch entry/exit points, using player's marks
      const isLaunchEntry = launches.has(key);
      const isLaunchExit  = [...launches.values()].some(l => `${l.exitRow},${l.exitCol}` === key);
      if (!isLaunchEntry && !isLaunchExit) return;
      const simTargets = [...suspected].map(k => { const [r, c] = k.split(',').map(Number); return [r, c]; });
      const result = traceDrone(row, col, simTargets);
      setPreviews(prev => new Map(prev).set(key, result));
      addLog(`SIM: ${result.label} test-path rendered (using your marks)`, 'info');
    } else if (bannerVisible) {
      // Post-game: any border cell, simulated using player's marks
      const simTargets = [...suspected].map(k => { const [r, c] = k.split(',').map(Number); return [r, c]; });
      const result = traceDrone(row, col, simTargets);
      setPreviews(prev => new Map(prev).set(key, result));
      addLog(`SIM: ${result.label} simulated path (your marks)`, 'info');
    } else {
      // Post-fire pre-banner: any border cell, using actual fox positions
      const result = traceDrone(row, col, foxes);
      setPreviews(prev => new Map(prev).set(key, result));
      addLog(`TRACE: ${result.label} actual path revealed`, 'info');
    }
  }, [fired, bannerVisible, previews, launches, suspected, foxes, addLog]);

  const handleInnerRightClick = useCallback((row, col) => {
    if (!fired) return;
    const foxKeys = new Set(foxes.map(([r, c]) => `${r},${c}`));
    const key = `${row},${col}`;
    if (!foxKeys.has(key)) return; // only red/green (fox) cells

    // Toggle: right-clicking the same cell again clears traces
    if (revealTracedKey === key) {
      setPreviews(new Map());
      setRevealTracedKey(null);
      addLog(`Deflection traces cleared for (${row},${col})`, '');
      return;
    }

    // Trace from all 4 aligned border entry points using actual fox positions
    const entries = [
      [-1, col],   // north border
      [N,  col],   // south border
      [row, -1],   // west border
      [row, N],    // east border
    ];
    const newPreviews = new Map();
    for (const [er, ec] of entries) {
      const result = traceDrone(er, ec, foxes);
      newPreviews.set(`${er},${ec}`, result);
    }
    setPreviews(newPreviews);
    setRevealTracedKey(key);
    addLog(`Deflection traces shown for fox at (${row},${col}) — right-click again to clear`, 'info');
  }, [fired, foxes, revealTracedKey, addLog]);

  const handleFire = useCallback(async () => {
    if (fired || suspected.size === 0) return;

    const foxKeys = new Set(foxes.map(([r, c]) => `${r},${c}`));
    foxKeysRef.current = foxKeys;

    let hitCount = 0;
    for (const key of foxKeys) { if (suspected.has(key)) hitCount++; }

    let fpCount = 0;
    for (const key of suspected) { if (!foxKeys.has(key)) fpCount++; }

    const misses   = numFoxes - hitCount;
    const droneCnt = launches.size;
    const score    = calcScore(hitCount, droneCnt, droneLimit);

    const cells = [...suspected].map(k => {
      const [r, c] = k.split(',').map(Number);
      return { row: r, col: c };
    });

    missedRef.current        = misses;
    hitsRef.current          = hitCount;
    falsePosRef.current      = fpCount;
    screamsFired.current     = false;
    runnersScheduled.current = false;
    totalTargetsRef.current  = cells.length;

    // Disable button and lock into "nothing revealed yet" mode immediately
    setHits(hitCount);
    setFalsePos(fpCount);
    setFired(true);
    setStrikeReveal(new Set());   // empty Set = progressive mode, no cells revealed yet
    setPreviews(new Map());
    addLog('═══ FIRE MISSION INITIATED ═══', 'warn');
    addLog(`Cells destroyed: ${hitCount}/${numFoxes}`, hitCount === numFoxes ? 'good' : hitCount >= 5 ? 'info' : 'bad');
    addLog(`Score: ${score} pts (${hitCount}×10 + ${droneLimit - droneCnt} drone bonus)`, 'good');
    addLog('Transmitting results to command...', 'info');
    onSubmitScore(hitCount, misses, droneCnt);

    // Wait for voice to finish, then send the planes
    await playDeployingStrikeForce();

    setStrikeCells(cells);
    setAirStriking(true);
  }, [fired, suspected, foxes, launches, addLog, onSubmitScore]);

  // Called by AirStrike each time a missile reaches its target cell
  const handleCellImpact = useCallback((key) => {
    setStrikeReveal(prev => {
      const s = new Set(prev);
      s.add(key);
      // Once every missile has landed, wait 1s then reveal runners + missed cells
      if (s.size >= totalTargetsRef.current && !runnersScheduled.current) {
        runnersScheduled.current = true;
        setTimeout(() => {
          setRunnersActive(true);
          if (!screamsFired.current && missedRef.current > 0) {
            screamsFired.current = true;
            playPanicScreams(7000);
          }
        }, 1000);
      }
      return s;
    });
  }, []);

  // Called by AirStrike after jets have flown back off screen
  const handleAirStrikeDone = useCallback(() => {
    setAirStriking(false);
    setStrikeReveal(null);
    // Banner appears after runners have had time to flee (max 8s run duration)
    setTimeout(() => {
      setBannerVisible(true);
      const h  = hitsRef.current;
      const m  = missedRef.current;
      const fp = falsePosRef.current;
      if (fp > 0) {
        speakReport('Mission failed. Unacceptable civilian casualties. Level 1 aborted.');
      } else if (m > 0 && missionNumber >= 3) {
        speakReport(`Level 1 failed. ${m} terror cell${m !== 1 ? 's' : ''} escaped. All rounds exhausted. Operation terminated.`);
      } else {
        const parts = [];
        if (m === 0) {
          parts.push('Mission accomplished.');
          parts.push(`All ${h} terror cell${h !== 1 ? 's' : ''} neutralized.`);
          parts.push('Level 1 complete. Outstanding work, agent. Stand by for Level 2 — Hostage Rescue.');
        } else {
          parts.push(`Round ${missionNumber} failed.`);
          if (h > 0) parts.push(`${h} terror cell${h !== 1 ? 's' : ''} destroyed.`);
          parts.push(`${m} terror cell${m !== 1 ? 's' : ''} escaped.`);
          parts.push(`Proceeding to round ${missionNumber + 1}.`);
        }
        speakReport(parts.join(' '));
      }
    }, 8500);
  }, []);

  const handleClearPaths = useCallback(() => {
    if (fired) return;
    setPreviews(new Map());
    addLog('Simulated paths cleared.', '');
  }, [fired, addLog]);

  const handleClearMarks = useCallback(() => {
    if (fired) return;
    setSuspected(new Set());
    addLog('All target marks cleared.', '');
  }, [fired, addLog]);

  const suspectedCnt = suspected.size;
  const droneCnt = launches.size;
  const dronesLeft = droneLimit - droneCnt;

  return (
    <div className="game-wrap">
      <HUD
        playerName={playerName}
        droneCnt={droneCnt}
        suspectedCnt={suspectedCnt}
        fired={fired}
        hits={hits}
        numFoxes={numFoxes}
        droneLimit={droneLimit}
      />

      <div className="game-body">
        {/* Left sidebar */}
        <div className="sidebar">
          {/* Intel summary */}
          <div className="panel">
            <div className="panel-title accent">// Intel Summary</div>
            <div className="intel-row">
              <span className="intel-key">Sector Grid</span>
              <span className="intel-val">{N}×{N}</span>
            </div>
            <div className="intel-row">
              <span className="intel-key">Terror Cells</span>
              <span className="intel-val red">{numFoxes}</span>
            </div>
            <div className="intel-row">
              <span className="intel-key">Drones Available</span>
              <span className={`intel-val ${dronesLeft <= 5 ? 'red' : dronesLeft <= 10 ? 'orange' : 'green'}`}>
                {dronesLeft}
              </span>
            </div>
            <div className="intel-row">
              <span className="intel-key">Targets Marked</span>
              <span className={`intel-val ${suspectedCnt === numFoxes ? 'green' : ''}`}>
                {suspectedCnt}/{numFoxes}
              </span>
            </div>
            {fired && (
              <div className="intel-row">
                <span className="intel-key">Cells Destroyed</span>
                <span className={`intel-val ${hits === numFoxes ? 'green flash-text-green' : 'orange'}`}>
                  {hits}/{numFoxes}
                </span>
              </div>
            )}
            {fired && (
              <div className="intel-row">
                <span className="intel-key">Final Score</span>
                <span className="intel-val green">{calcScore(hits, droneCnt, droneLimit)}</span>
              </div>
            )}
            {fired && (
              <div className="score-formula">
                <div className="score-formula-row">
                  <div className="score-term">
                    <span className="score-val green">10 × {hits}</span>
                    <span className="score-lbl">hits</span>
                  </div>
                  <span className="score-op">+</span>
                  <div className="score-term">
                    <span className="score-val cyan">({droneLimit} − {droneCnt})</span>
                    <span className="score-lbl">limit − drones</span>
                  </div>
                  <span className="score-op">=</span>
                  <div className="score-term">
                    <span className="score-val green">{calcScore(hits, droneCnt, droneLimit)}</span>
                    <span className="score-lbl">score</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="panel">
            <div className="panel-title">// Controls</div>
            <div className="controls">
              <button
                className={`btn-fire${fired ? ' fired' : ''}`}
                onClick={handleFire}
                disabled={fired || suspected.size === 0}
              >
                {fired ? '✓ MISSILES FIRED' : '⚡ FIRE MISSILES'}
              </button>
              <button
                className="btn-secondary"
                onClick={handleClearPaths}
                disabled={fired || previews.size === 0}
              >
                ↺ Clear Sim Paths
              </button>
              <button
                className="btn-secondary"
                onClick={handleClearMarks}
                disabled={fired || suspected.size === 0}
              >
                ✕ Clear Target Marks
              </button>
              {gameOver && (
                <button
                  className="btn-secondary"
                  onClick={() => setShowScore(true)}
                  style={{ borderColor: 'var(--cyan)', color: 'var(--cyan)' }}
                >
                  ◈ View Scoreboard
                </button>
              )}
              <div className="grid-size-control">
                <div className="grid-size-label">
                  <span>Grid Size</span>
                  <span style={{ color: 'var(--cyan)' }}>{cellSize}px</span>
                </div>
                <input
                  type="range"
                  min={18}
                  max={42}
                  step={1}
                  value={cellSize}
                  onChange={e => setCellSize(Number(e.target.value))}
                  className="grid-size-slider"
                />
                <div className="grid-size-hints">
                  <span>Small</span><span>Large</span>
                </div>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="panel">
            <div className="panel-title">// Legend</div>
            <div className="legend-list">
              <div className="legend-row"><div className="swatch swatch-border" /> Border — launch drone</div>
              <div className="legend-row"><div className="swatch swatch-empty" /> Grid — click to mark</div>
              <div className="legend-row"><div className="swatch swatch-target" /> Marked target</div>
              <div className="legend-row"><div className="swatch swatch-path" /> Drone flight path</div>
              {fired && <>
                <div className="legend-row"><div className="swatch swatch-hit" /> DESTROYED (hit)</div>
                <div className="legend-row"><div className="swatch swatch-miss" /> Fox not targeted</div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,.07)', margin: '.3rem 0' }} />
                <div className="legend-row"><div className="swatch swatch-reveal-hit" /> Cell destroyed</div>
                <div className="legend-row"><div className="swatch swatch-reveal-esc" /> Terror cell escaped</div>
                <div className="legend-row"><div className="swatch swatch-reveal-civ" /> Civilian strike</div>
              </>}
            </div>
          </div>

          {/* Mission log */}
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

        {/* Game board */}
        <div className="board-area">
          {bannerVisible && (() => {
            const missionFailed  = hits < numFoxes || falsePos > 0;
            const isGameOver     = falsePos > 0 || (hits < numFoxes && missionNumber >= 3);
            const isAccomplished = !missionFailed;
            return (
              <div className={`mission-banner ${isAccomplished ? 'accomplished' : 'failed'}`}>
                <div className="mission-title">
                  {isAccomplished
                    ? 'LEVEL 1 COMPLETE'
                    : isGameOver
                      ? 'LEVEL 1 FAILED'
                      : `ROUND ${missionNumber} FAILED`}
                </div>
                <div className="mission-subtitle">
                  {isAccomplished
                    ? `All ${numFoxes} terror cell${numFoxes !== 1 ? 's' : ''} eliminated — proceed to Level 2`
                    : isGameOver
                      ? `${numFoxes - hits} terror cell${numFoxes - hits !== 1 ? 's' : ''} escaped — all rounds exhausted`
                      : `${numFoxes - hits} terror cell${numFoxes - hits !== 1 ? 's' : ''} escaped — round ${missionNumber + 1} of 3 incoming`
                  }
                </div>
                {hits > 0 && hits < numFoxes && (
                  <div className="mission-subtitle mission-killed">
                    {`${hits} terror cell${hits !== 1 ? 's' : ''} destroyed`}
                  </div>
                )}
                {falsePos > 0 && (
                  <div className="mission-subtitle mission-casualties">
                    {`${falsePos} civilian location${falsePos !== 1 ? 's' : ''} destroyed`}
                  </div>
                )}
                {isAccomplished && onStartHostageMission && (
                  <button
                    className="btn-fire"
                    style={{ marginTop: '1rem', width: 'auto', padding: '0 1.5rem', background: 'var(--purple)' }}
                    onClick={onStartHostageMission}
                  >
                    ▶ Proceed to Level 2 — Hostage Rescue
                  </button>
                )}
                {missionFailed && !isGameOver && (
                  <button
                    className="btn-fire"
                    style={{ marginTop: '1rem', width: 'auto', padding: '0 1.5rem' }}
                    onClick={() => onContinueMission(numFoxes - hits)}
                  >
                    ⟩ Continue — Round {missionNumber + 1} of 3
                  </button>
                )}
                <button
                  className="btn-secondary"
                  style={{ marginTop: '.5rem', width: 'auto', padding: '0 1.5rem' }}
                  onClick={onPlayAgain}
                >
                  ↺ Play Again
                </button>
              </div>
            );
          })()}

          <GameBoard
            foxes={foxes}
            suspected={suspected}
            launches={launches}
            previews={previews}
            fired={fired}
            strikeReveal={strikeReveal}
            airStriking={airStriking}
            runnersActive={runnersActive}
            gridRef={gridRef}
            cellSize={cellSize}
            missionNumber={missionNumber}
            onInnerClick={handleInnerClick}
            onInnerRightClick={handleInnerRightClick}
            onBorderClick={handleBorderClick}
            onBorderRightClick={handleBorderRightClick}
          />

          {airStriking && (
            <AirStrike
              targets={strikeCells}
              gridRef={gridRef}
              cellPx={cellSize}
              borderPx={cellSize * 2}
              onCellImpact={handleCellImpact}
              onDone={handleAirStrikeDone}
            />
          )}

          {/* Control cues */}
          {!fired && (
            <div className="control-cues">
              <div className="cue">
                <span className="cue-icon">🖱️L</span>
                <div className="cue-text">
                  <span className="cue-zone">Outer Border</span>
                  <span className="cue-desc">Launch reconnaissance drone</span>
                </div>
              </div>
              <div className="cue-divider" />
              <div className="cue">
                <span className="cue-icon">🖱️R</span>
                <div className="cue-text">
                  <span className="cue-zone">Outer Border</span>
                  <span className="cue-desc">Simulate drone path with your marks</span>
                </div>
              </div>
              <div className="cue-divider" />
              <div className="cue">
                <span className="cue-icon">🖱️L</span>
                <div className="cue-text">
                  <span className="cue-zone">Inner Grid</span>
                  <span className="cue-desc">Toggle target mark on cell</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="sidebar">
          {/* Players panel */}
          <div className="panel">
            <div className="panel-title accent">// Active Agents</div>
            <div className="player-list">
              {players.map((p) => (
                <div key={p.id} className="player-row">
                  <div className={`player-indicator ${p.submitted ? 'submitted' : 'active'}`} />
                  <span className={`player-name ${p.id === mySocketId ? 'me' : ''}`}>
                    {p.name}
                    {p.id === mySocketId && ' (you)'}
                  </span>
                  <span className="player-status">
                    {p.submitted ? 'FIRED' : 'ACTIVE'}
                  </span>
                </div>
              ))}
              {players.length === 0 && (
                <div style={{ fontSize: '.65rem', color: 'var(--t-ghost)' }}>No agents listed</div>
              )}
            </div>
          </div>

          {/* Drone manifest */}
          <div className="panel">
            <div className="panel-title">// Drone Manifest</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', maxHeight: '200px', overflowY: 'auto' }}>
              {[...launches.entries()].map(([key, launch]) => {
                const exitKey = `${launch.exitRow},${launch.exitCol}`;
                const reflected = key === exitKey;
                return (
                  <div key={key} className="log-entry">
                    <span className="log-ts" style={{ color: 'var(--orange)' }}>{launch.label}</span>
                    <span className="log-msg" style={{ color: reflected ? 'var(--red)' : '' }}>
                      → {reflected ? 'REFLECTED' : exitKey}
                    </span>
                  </div>
                );
              })}
              {launches.size === 0 && (
                <div style={{ fontSize: '.65rem', color: 'var(--t-ghost)' }}>No drones deployed</div>
              )}
            </div>
          </div>

          {/* Strategy tips */}
          <div className="panel">
            <div className="panel-title">// Field Notes</div>
            <div className="log-list" style={{ fontSize: '.65rem', color: 'var(--t-dim)', lineHeight: 1.7 }}>
              <div>A drone that <span style={{ color: 'var(--amber)' }}>reverses</span> hit a direct obstruction.</div>
              <div>A drone that <span style={{ color: 'var(--amber)' }}>deflects</span> passed near one.</div>
              <div>A drone exiting where it <span style={{ color: 'var(--amber)' }}>entered</span> bounced back.</div>
              <div style={{ marginTop: '.5rem' }}>
                Right-click border to <span style={{ color: 'var(--cyan)' }}>simulate</span> a path using your current marks.
              </div>
              <div style={{ marginTop: '.5rem' }}>
                Score = <span style={{ color: 'var(--green)' }}>10 × hits</span> + <span style={{ color: 'var(--cyan)' }}>({droneLimit} − drones)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showScore && gameOver && (
        <Scoreboard
          gameOver={gameOver}
          mySocketId={mySocketId}
          numFoxes={numFoxes}
          onClose={() => setShowScore(false)}
        />
      )}

      {briefing && (
        <MissionBriefing
          missionNumber={missionNumber}
          numFoxes={numFoxes}
          droneLimit={droneLimit}
          isContinuation={isContinuation}
          onReady={() => setBriefing(false)}
        />
      )}
    </div>
  );
}
