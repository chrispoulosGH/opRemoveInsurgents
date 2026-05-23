import { useState, useEffect, useCallback, useRef } from 'react';
import socket from '../socket';
import { speakReport } from '../audio';
import HostageBoard from './HostageBoard';
import SealTeam from './SealTeam';
import HostageBriefing from './HostageBriefing';

const N = 25;

function nearestBorderEntry(row, col) {
  const opts = [
    { d: row + 1,   e: [-1, col] },
    { d: N - row,   e: [N,  col] },
    { d: col + 1,   e: [row, -1] },
    { d: N - col,   e: [row,  N] },
  ];
  return opts.reduce((a, b) => a.d <= b.d ? a : b).e;
}

function timestamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function HostageGame({
  playerName,
  hostageCount   = 2,
  deviceLimit    = 4,
  hostageLevel   = 1,
  isContinuation = false,
  escapedCount   = 0,
  onContinue,
  onStartLevel3,
  onPlayAgain,
}) {
  const [briefing,   setBriefing]   = useState(true);
  const [devices,    setDevices]    = useState(new Map());  // "row,col" → distance
  const [targets,    setTargets]    = useState(new Set());  // suspected hostage cells
  const [entries,    setEntries]    = useState([]);         // [[row,col]]
  const [sealChecks, setSealChecks] = useState(null);
  const [revealed,   setRevealed]   = useState(null);       // Map<"row,col", bool>
  const [result,     setResult]     = useState(null);
  const [cellSize,   setCellSize]   = useState(19);
  const [log,        setLog]        = useState([
    { ts: timestamp(), msg: `LEVEL 2 — HOSTAGE RESCUE — ROUND ${hostageLevel} OF 3`, cls: 'warn' },
    { ts: timestamp(), msg: `${hostageCount} hostage${hostageCount !== 1 ? 's' : ''} detected in sector.`, cls: 'info' },
    { ts: timestamp(), msg: `${deviceLimit} listening devices available.`, cls: '' },
  ]);

  const gridRef        = useRef(null);
  const logEndRef      = useRef(null);
  const devicesRef     = useRef(devices);
  const targetsRef     = useRef(targets);
  const sealChecksRef  = useRef(sealChecks);
  const resultRef      = useRef(result);
  const sealResultRef    = useRef(null);
  const colorAssignRef   = useRef(null); // { serverIdx → displayIdx } set on first device

  // Keep refs in sync with state so socket handlers always see current values
  devicesRef.current    = devices;
  targetsRef.current    = targets;
  sealChecksRef.current = sealChecks;
  resultRef.current     = result;

  useEffect(() => {
    function resize() {
      const vw = window.innerWidth, vh = window.innerHeight;
      const max = Math.floor(Math.min((vw - 520) / (N + 2), (vh - 120) / (N + 2)));
      setCellSize(Math.max(14, Math.min(50, Math.round(max * 0.85))));
    }
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const addLog = useCallback((msg, cls = '') => {
    setLog(prev => [...prev, { ts: timestamp(), msg, cls }].slice(-60));
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  // Voice intro
  useEffect(() => {
    const id = setTimeout(() => {
      if (isContinuation) {
        speakReport(`Remaining hostages have been moved. Additional captives taken. ${hostageCount} hostage${hostageCount !== 1 ? 's' : ''} now held in sector. Deploy listening devices. Commence rescue operation now.`);
      } else {
        speakReport(`Intelligence has detected ${hostageCount} hostage${hostageCount !== 1 ? 's' : ''} held in the sector. You have ${deviceLimit} listening devices to triangulate their position. Deploy a SEAL team for extraction. Commence rescue operation now.`);
      }
    }, 400);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    socket.on('device_result', ({ row, col, distance, hostageIdx, distances }) => {
      if (!colorAssignRef.current) {
        colorAssignRef.current = { purpleServerIdx: hostageIdx, blueServerIdx: 1 - hostageIdx };
      }
      const { purpleServerIdx, blueServerIdx } = colorAssignRef.current;
      let displayIdx = hostageIdx === purpleServerIdx ? 0 : 1;
      let effectiveDist = distance;

      // Cap each color at 2 — if full, assign to the other color with its correct distance
      const cur = devicesRef.current;
      const cnt = [0, 1].map(i => [...cur.values()].filter(d => d.hostageIdx === i).length);
      if (cnt[displayIdx] >= 2) {
        displayIdx = 1 - displayIdx;
        effectiveDist = distances[displayIdx === 0 ? purpleServerIdx : blueServerIdx];
      }

      const updated = new Map(cur).set(`${row},${col}`, { distance: effectiveDist, hostageIdx: displayIdx });
      devicesRef.current = updated;
      setDevices(updated);
      addLog(`Device at (${row},${col}) — signal: ${effectiveDist} cells`, 'info');
      speakReport(`Signal detected. Distance ${effectiveDist} cells.`);

      if (updated.size >= deviceLimit) {
        addLog('All devices placed. Right-click to mark hostage location, then deploy.', 'warn');
        speakReport('All devices placed. Mark the hostage location.');
      }
    });

    socket.on('seal_result', (data) => {
      sealResultRef.current = data;
      setSealChecks(data.checks);
    });

    return () => { socket.off('device_result'); socket.off('seal_result'); };
  }, [addLog]);

  const handleInnerClick = useCallback((row, col) => {
    if (sealChecks || result) return;
    const key = `${row},${col}`;
    if (devices.has(key)) {
      setDevices(prev => { const n = new Map(prev); n.delete(key); return n; });
      addLog(`Device removed at (${row},${col}).`, '');
      return;
    }
    if (devices.size >= deviceLimit) {
      addLog(`Device limit reached (${deviceLimit}).`, 'warn');
      speakReport('Device limit reached.');
      return;
    }
    socket.emit('place_device', { row, col });
    addLog(`Deploying listening device at (${row},${col})...`, '');
  }, [sealChecks, result, devices, deviceLimit, addLog]);

  const handleInnerRightClick = useCallback((row, col) => {
    if (sealChecks || result) return;
    const key = `${row},${col}`;
    if (targets.has(key)) {
      const idx = [...targets].indexOf(key);
      setTargets(prev => { const n = new Set(prev); n.delete(key); return n; });
      setEntries(prev => prev.filter((_, i) => i !== idx));
      addLog(`Target mark removed at (${row},${col}).`, '');
      return;
    }
    if (targets.size >= hostageCount) {
      addLog(`Max ${hostageCount} target${hostageCount !== 1 ? 's' : ''} allowed.`, 'warn');
      return;
    }
    const entry = nearestBorderEntry(row, col);
    setTargets(prev => new Set(prev).add(key));
    setEntries(prev => [...prev, entry]);
    addLog(`Hostage location marked at (${row},${col}).`, 'info');
  }, [sealChecks, result, targets, hostageCount, addLog]);

  const handleBorderClick = useCallback((row, col) => {
    if (sealChecks || result) return;
    const idx = entries.findIndex(([r, c]) => r === row && c === col);
    if (idx !== -1) {
      setEntries(prev => prev.filter((_, i) => i !== idx));
      addLog(`Entry point removed at (${row},${col}).`, '');
      return;
    }
    if (entries.length >= hostageCount) {
      addLog(`Max ${hostageCount} entry point${hostageCount !== 1 ? 's' : ''} allowed.`, 'warn');
      return;
    }
    setEntries(prev => [...prev, [row, col]]);
    addLog(`SEAL entry point set at (${row},${col}).`, 'info');
  }, [sealChecks, result, entries, hostageCount, addLog]);

  const handleDeploy = useCallback(() => {
    if (targets.size !== hostageCount || entries.length !== hostageCount) return;
    const targetArr = [...targets].map(k => k.split(',').map(Number));
    addLog('═══ SEAL TEAMS DEPLOYING ═══', 'warn');
    speakReport('SEAL teams deploying. Stand by.');
    socket.emit('deploy_seals', { targets: targetArr, entries });
  }, [targets, entries, hostageCount, addLog]);

  const handleSealDone = useCallback(() => {
    const data = sealResultRef.current;
    if (!data) return;
    const rev = new Map();
    data.hostagePositions.forEach(([r, c]) => rev.set(`${r},${c}`, true));
    data.checks.forEach(({ target, correct }) => { if (!correct) rev.set(`${target[0]},${target[1]}`, false); });
    setSealChecks(null);
    setRevealed(rev);
    setResult({ success: data.success, rescued: data.rescued, escaped: data.escaped, canContinue: data.canContinue });
    if (data.success) {
      speakReport('All hostages extracted. Mission accomplished. Outstanding work, agent.');
    } else if (data.canContinue) {
      speakReport(`Round ${hostageLevel} failed. ${data.escaped} hostage${data.escaped !== 1 ? 's' : ''} remain in enemy hands. Prepare for round ${hostageLevel + 1}.`);
    } else {
      speakReport('Overall mission failure. All hostages lost. Operation terminated.');
    }
  }, [hostageLevel]);

  const canDeploy   = targets.size === hostageCount && entries.length === hostageCount && !sealChecks && !result;
  const entriesSet  = new Set(entries.map(([r, c]) => `${r},${c}`));
  const devicesLeft = deviceLimit - devices.size;

  return (
    <div className="game-wrap">

      {/* HUD */}
      <div className="hud">
        <div className="hud-brand">
          TACT/CMD
          <span>LEVEL 2 — ROUND {hostageLevel}/3</span>
        </div>
        <div className="hud-stats">
          <div className="hud-stat">
            <span className="hud-stat-label">Devices Left</span>
            <span className={`hud-stat-value ${devicesLeft === 0 ? 'crit' : devicesLeft <= 1 ? 'warn' : ''}`}>{devicesLeft}</span>
          </div>
          <div className="hud-stat">
            <span className="hud-stat-label">Placed</span>
            <span className="hud-stat-value">{devices.size}</span>
          </div>
          <div className="hud-stat">
            <span className="hud-stat-label">Targets Marked</span>
            <span className={`hud-stat-value ${targets.size === hostageCount ? 'ok' : ''}`}>{targets.size}/{hostageCount}</span>
          </div>
          <div className="hud-stat">
            <span className="hud-stat-label">Entry Points</span>
            <span className={`hud-stat-value ${entries.length === hostageCount ? 'ok' : ''}`}>{entries.length}/{hostageCount}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.2rem' }}>
          <div className="hud-player">AGENT <strong>{playerName}</strong></div>
          <div className="hud-connection"><div className="dot-online" />SECURE LINK ACTIVE</div>
        </div>
      </div>

      <div className="game-body">

        {/* Left sidebar */}
        <div className="sidebar">
          <div className="panel">
            <div className="panel-title accent">// Intel Summary</div>
            <div className="intel-row">
              <span className="intel-key">Sector</span>
              <span className="intel-val">{N}×{N}</span>
            </div>
            <div className="intel-row">
              <span className="intel-key">Hostages</span>
              <span className="intel-val red">{hostageCount}</span>
            </div>
            <div className="intel-row">
              <span className="intel-key">Devices Left</span>
              <span className={`intel-val ${devicesLeft === 0 ? 'red' : devicesLeft <= 1 ? 'orange' : 'green'}`}>{devicesLeft}</span>
            </div>
            <div className="intel-row">
              <span className="intel-key">Targets Marked</span>
              <span className={`intel-val ${targets.size === hostageCount ? 'green' : ''}`}>{targets.size}/{hostageCount}</span>
            </div>
            <div className="intel-row">
              <span className="intel-key">Round</span>
              <span className={`intel-val ${hostageLevel === 3 ? 'red' : 'orange'}`}>{hostageLevel} / 3</span>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">// Controls</div>
            <div className="controls">
              <button
                className={`btn-fire${sealChecks ? ' fired' : ''}`}
                onClick={handleDeploy}
                disabled={!canDeploy}
              >
                {sealChecks ? '◌ Teams Deployed...' : '▶ Deploy SEAL Teams'}
              </button>
              <button
                className="btn-secondary"
                disabled={!!sealChecks || !!result || devices.size === 0}
                onClick={() => { setDevices(new Map()); colorAssignRef.current = null; addLog('All devices removed.', ''); }}
              >
                ✕ Remove All Devices
              </button>
              <button
                className="btn-secondary"
                disabled={!!sealChecks || !!result || targets.size === 0}
                onClick={() => { setTargets(new Set()); addLog('All target marks cleared.', ''); }}
              >
                ✕ Clear Target Marks
              </button>
              <div className="grid-size-control">
                <div className="grid-size-label">
                  <span>Grid Size</span>
                  <span style={{ color: 'var(--cyan)' }}>{cellSize}px</span>
                </div>
                <input type="range" min={14} max={50} step={1} value={cellSize}
                  onChange={e => setCellSize(Number(e.target.value))} className="grid-size-slider" />
                <div className="grid-size-hints"><span>Small</span><span>Large</span></div>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">// Legend</div>
            <div className="legend-list">
              <div className="legend-row"><div className="swatch swatch-border" /> Border — SEAL entry point</div>
              <div className="legend-row"><div className="swatch" style={{ background: 'rgba(168,85,247,.3)', border: '1px solid rgba(168,85,247,.6)' }} /> Left-click — place device</div>
              <div className="legend-row"><div className="swatch swatch-target" /> Right-click — mark hostage</div>
              <div className="legend-row"><div className="swatch swatch-border" style={{ background: 'rgba(255,140,0,.15)', borderColor: 'var(--orange)' }} /> Selected entry point</div>
              {revealed && <>
                <div style={{ borderTop: '1px solid rgba(255,255,255,.07)', margin: '.3rem 0' }} />
                <div className="legend-row"><div className="swatch swatch-reveal-hit" /> Hostage rescued</div>
                <div className="legend-row"><div className="swatch swatch-reveal-civ" /> Wrong location</div>
              </>}
            </div>
          </div>
        </div>

        {/* Board */}
        <div className="board-area">
          {result && (
            <div className={`mission-banner ${result.success ? 'accomplished' : 'failed'}`}>
              <div className="mission-title">
                {result.success
                  ? 'HOSTAGES RESCUED'
                  : result.canContinue
                    ? `ROUND ${hostageLevel} FAILED`
                    : 'MISSION FAILED'}
              </div>
              <div className="mission-subtitle">
                {result.success
                  ? `All ${result.rescued} hostage${result.rescued !== 1 ? 's' : ''} extracted safely`
                  : result.canContinue
                    ? `${result.escaped} hostage${result.escaped !== 1 ? 's' : ''} evaded extraction — round ${hostageLevel + 1} incoming`
                    : 'All hostages lost — operation terminated'}
              </div>
              {result.success && onStartLevel3 && (
                <button className="btn-fire"
                  style={{ marginTop: '1rem', width: 'auto', padding: '0 1.5rem', background: 'var(--purple)' }}
                  onClick={onStartLevel3}>
                  ▶ Proceed to Level 3 — Direct Action
                </button>
              )}
              {result.canContinue && (
                <button className="btn-fire"
                  style={{ marginTop: '1rem', width: 'auto', padding: '0 1.5rem' }}
                  onClick={() => onContinue(result.escaped)}>
                  ⟩ Proceed to Round {hostageLevel + 1}
                </button>
              )}
              <button className="btn-secondary"
                style={{ marginTop: '.5rem', width: 'auto', padding: '0 1.5rem' }}
                onClick={onPlayAgain}>
                ↺ Play Again
              </button>
            </div>
          )}

          <HostageBoard
            devices={devices}
            targets={targets}
            entries={entriesSet}
            revealed={revealed}
            gridRef={gridRef}
            cellSize={cellSize}
            missionNumber={hostageLevel}
            borderInactive
            onInnerClick={handleInnerClick}
            onInnerRightClick={handleInnerRightClick}
            onBorderClick={handleBorderClick}
          />

          {sealChecks && (
            <SealTeam
              checks={sealChecks}
              gridRef={gridRef}
              cellPx={cellSize}
              borderPx={cellSize * 2}
              onDone={handleSealDone}
            />
          )}
        </div>

        {/* Right sidebar — mission log */}
        <div className="sidebar">
          <div className="panel">
            <div className="panel-title">// Field Notes</div>
            <div style={{ fontSize: '.65rem', color: 'var(--t-dim)', lineHeight: 1.7 }}>
              <div>Device number = distance to <span style={{ color: 'var(--purple)' }}>nearest hostage</span></div>
              <div style={{ marginTop: '.4rem' }}>
                <span style={{ color: 'var(--cyan)' }}>Left-click</span> inner cell → place device
              </div>
              <div><span style={{ color: 'var(--green)' }}>Right-click</span> inner cell → mark hostage</div>
              <div><span style={{ color: 'var(--orange)' }}>Click border</span> → set SEAL entry point</div>
              <div style={{ marginTop: '.4rem', color: 'var(--t-ghost)' }}>
                Pair entry points with target cells in order: first entry → first target.
              </div>
            </div>
          </div>

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

      {briefing && (
        <HostageBriefing
          hostageLevel={hostageLevel}
          hostageCount={hostageCount}
          deviceLimit={deviceLimit}
          isContinuation={isContinuation}
          escapedCount={escapedCount}
          onReady={() => setBriefing(false)}
        />
      )}
    </div>
  );
}
