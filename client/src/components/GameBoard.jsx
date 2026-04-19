import { useMemo, useCallback, useState } from 'react';
import { N, getEntryLabel } from '../gameLogic';

// Build the full 27×27 grid descriptor once
const GRID_SIZE = N + 2; // 27

function buildGrid() {
  const cells = [];
  for (let gi = 0; gi < GRID_SIZE; gi++) {
    for (let gj = 0; gj < GRID_SIZE; gj++) {
      const row = gi - 1; // game row: -1 .. N
      const col = gj - 1; // game col: -1 .. N
      const top    = gi === 0;
      const bottom = gi === GRID_SIZE - 1;
      const left   = gj === 0;
      const right  = gj === GRID_SIZE - 1;
      const corner = (top || bottom) && (left || right);
      const border = !corner && (top || bottom || left || right);
      const inner  = !top && !bottom && !left && !right;
      cells.push({ row, col, corner, border, inner, key: `${row},${col}` });
    }
  }
  return cells;
}

const CELLS = buildGrid();

export default function GameBoard({
  foxes,            // [row,col][] — actual positions (used for drone nav, not revealed)
  suspected,        // Set<"row,col">
  launches,         // Map<"row,col", { label, path, exitRow, exitCol }>
  previews,         // Map<entryKey, { label, path, exitRow, exitCol }>
  fired,
  strikeReveal,     // Set<key> | null — cells hit by missiles so far; null = full reveal
  airStriking,      // bool — true while airstrike animation is running
  runnersActive,    // bool — true 0.5s after airstrike done, enables runner render
  gridRef,          // ref to attach to .game-grid DOM node
  onInnerClick,     // (row, col) => void
  onBorderClick,    // (row, col) => void
  onBorderRightClick, // (row, col) => void
}) {
  const [hoveredKey, setHoveredKey] = useState(null);
  const [crossHover, setCrossHover] = useState(null); // { row, col }

  // Exit key for each real launch entry: entryKey → exitKey and exitKey → entryKey
  const exitSet = useMemo(() => {
    const s = new Map(); // "row,col" → label
    for (const [, launch] of launches) {
      const k = `${launch.exitRow},${launch.exitCol}`;
      s.set(k, launch.label);
    }
    return s;
  }, [launches]);

  // Bidirectional pair map: any border key → its partner key (for launches + previews)
  const pairMap = useMemo(() => {
    const m = new Map(); // key → pairedKey
    for (const [entryKey, launch] of launches) {
      const exitKey = `${launch.exitRow},${launch.exitCol}`;
      m.set(entryKey, exitKey);
      m.set(exitKey, entryKey);
    }
    for (const [entryKey, p] of previews) {
      const exitKey = `${p.exitRow},${p.exitCol}`;
      m.set(entryKey, exitKey);
      m.set(exitKey, entryKey);
    }
    return m;
  }, [launches, previews]);

  // Entry and exit keys for all active previews
  const previewBorderSet = useMemo(() => {
    const s = new Map(); // "row,col" → label
    for (const [entryKey, p] of previews) {
      s.set(entryKey, p.label);
      s.set(`${p.exitRow},${p.exitCol}`, p.label);
    }
    return s;
  }, [previews]);

  const previewSet = useMemo(() => {
    const s = new Set();
    for (const [, p] of previews) {
      for (const [r, c] of p.path) s.add(`${r},${c}`);
    }
    return s;
  }, [previews]);

  const foxSet = useMemo(() => {
    if (!fired) return new Set();
    return new Set(foxes.map(([r, c]) => `${r},${c}`));
  }, [fired, foxes]);

  // Stable random runner data per missed-fox cell
  const DIRS = ['runner-e','runner-ne','runner-nw','runner-w','runner-sw','runner-se'];
  const runnerData = useMemo(() => {
    const m = new Map();
    for (const key of foxSet) {
      const count = 2 + Math.floor(Math.random() * 4);
      const shuffled = [...DIRS].sort(() => Math.random() - 0.5);
      const runners = Array.from({ length: count }, (_, i) => ({
        dir:        shuffled[i % shuffled.length],
        dur:        (4.5 + Math.random() * 3.5).toFixed(2),   // 4.5–8s
        delay:      (Math.random() * 0.45).toFixed(2),         // 0–0.45s launch stagger
        top:        (15 + Math.random() * 70).toFixed(1),      // 15–85% within cell
        left:       (15 + Math.random() * 70).toFixed(1),      // 15–85% within cell
        bobDelay:   (Math.random() * 0.2).toFixed(2),          // desync bob between runners
      }));
      m.set(key, runners);
    }
    return m;
  }, [foxSet]); // eslint-disable-line react-hooks/exhaustive-deps

  const falsePositiveSet = useMemo(() => {
    if (!fired) return new Set();
    const s = new Set();
    for (const key of suspected) {
      if (!foxSet.has(key)) s.add(key);
    }
    return s;
  }, [fired, suspected, foxSet]);

  const hitSet = useMemo(() => {
    if (!fired) return new Set();
    const s = new Set();
    for (const [r, c] of foxes) {
      const k = `${r},${c}`;
      if (suspected.has(k)) s.add(k);
    }
    return s;
  }, [fired, foxes, suspected]);

  // The partner of the hovered key (if any)
  const hoveredPairKey = hoveredKey ? pairMap.get(hoveredKey) : null;

  const getCellClass = useCallback((cell) => {
    const { key, corner, border, inner } = cell;

    if (corner) return 'cell cell-corner';

    if (border) {
      const isLaunched      = launches.has(key);
      const exitLabel       = exitSet.get(key);
      const isExit          = exitLabel !== undefined && !isLaunched;
      const isPreviewBorder = previewBorderSet.has(key) && !isLaunched && !isExit;
      const isHovered       = key === hoveredKey || key === hoveredPairKey;

      let cls = 'cell cell-border';
      if (isLaunched)           cls += ' launched';
      else if (isExit)          cls += ' is-exit';
      else if (isPreviewBorder) cls += ' preview-border';
      if (isHovered)            cls += ' pair-highlight';
      return cls;
    }

    // interior cell
    let cls = 'cell cell-inner';
    const isTarget  = suspected.has(key);
    const isPreview = previewSet.has(key);

    if (fired) {
      const isFox  = foxSet.has(key);
      const isMark = suspected.has(key);

      if (strikeReveal !== null) {
        // Progressive reveal: missile not yet arrived → keep showing target marker
        if (strikeReveal.has(key)) {
          if (isFox && isMark) cls += ' hit';
          else if (isMark)     cls += ' false-positive';
        } else if (isMark) {
          cls += ' target';                          // still awaiting missile
        } else if (runnersActive && isFox) {
          cls += ' missed-fox';                      // revealed when runners appear
        }
      } else {
        // Full reveal (airstrike done or instant)
        if (isFox && isMark) cls += ' hit';
        else if (isFox)      cls += ' missed-fox';
        else if (isMark)     cls += ' false-positive';
      }
    } else {
      if (isTarget)       cls += ' target';
      else if (isPreview) cls += ' path';
    }

    if (crossHover && (cell.row === crossHover.row || cell.col === crossHover.col))
      cls += ' cross-highlight';

    return cls;
  }, [launches, exitSet, suspected, previewSet, previewBorderSet, fired, foxSet,
      hoveredKey, hoveredPairKey, crossHover, strikeReveal, airStriking, runnersActive]);

  const getCellText = useCallback((cell) => {
    const { key, border, inner } = cell;
    if (border) {
      const launch = launches.get(key);
      if (launch) return launch.label;
      const exitLabel = exitSet.get(key);
      if (exitLabel) return exitLabel;
      const previewLabel = previewBorderSet.get(key);
      if (previewLabel) return previewLabel;
      return null;
    }
    // Render hit marker as real text so ::before and ::after are both free for smoke
    if (inner && fired && foxSet.has(key) && suspected.has(key)) return '✕';
    return null;
  }, [launches, exitSet, previewBorderSet, fired, foxSet, suspected]);

  return (
    <div className="grid-wrap">
      <div className="game-grid" ref={gridRef}>
        <div className="grid-scan" />
        {CELLS.map((cell) => {
          const text = getCellText(cell);
          return (
            <div
              key={cell.key}
              className={getCellClass(cell)}
              onClick={() => {
                if (cell.border) onBorderClick(cell.row, cell.col);
                else if (cell.inner && !fired) onInnerClick(cell.row, cell.col);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (cell.border) onBorderRightClick(cell.row, cell.col);
              }}
              onMouseEnter={() => {
                if (cell.border && pairMap.has(cell.key)) setHoveredKey(cell.key);
                if (cell.inner) setCrossHover({ row: cell.row, col: cell.col });
              }}
              onMouseLeave={() => {
                if (cell.border) setHoveredKey(null);
                if (cell.inner) setCrossHover(null);
              }}
              title={cell.border ? `Launch from ${getEntryLabel(cell.row, cell.col)}` : undefined}
            >
              {text}
              {(hitSet.has(cell.key) || falsePositiveSet.has(cell.key)) && (strikeReveal === null || strikeReveal.has(cell.key)) && <span className="flame" />}
              {falsePositiveSet.has(cell.key) && (strikeReveal === null || strikeReveal.has(cell.key)) && <span className="white-flag" />}
              {runnersActive && foxSet.has(cell.key) && !suspected.has(cell.key) && (
                <div className="runners-wrap">
                  {(runnerData.get(cell.key) ?? []).map((rd, i) => (
                    <div key={i} className="runner-wrap" style={{
                      animationName:            rd.dir,
                      animationDuration:        `${rd.dur}s`,
                      animationDelay:           `${rd.delay}s`,
                      animationTimingFunction:  'ease-out',
                      animationIterationCount:  1,
                      animationFillMode:        'forwards',
                      top:   `${rd.top}%`,
                      left:  `${rd.left}%`,
                    }}>
                      <span className="runner" style={{ animationDelay: `${rd.bobDelay}s` }}>
                        <span className="runner-beard" />
                        <span className="runner-arm runner-arm-l" />
                        <span className="runner-arm runner-arm-r" />
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
