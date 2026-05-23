import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { N, getEntryLabel } from '../gameLogic';

const GRID_SIZE = N + 2;

function buildGrid() {
  const cells = [];
  for (let gi = 0; gi < GRID_SIZE; gi++) {
    for (let gj = 0; gj < GRID_SIZE; gj++) {
      const row = gi - 1;
      const col = gj - 1;
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

export default function HostageBoard({
  devices,           // Map<"row,col", distance>
  targets,           // Set<"row,col">
  entries,           // Set<"row,col">
  revealed,          // Map<"row,col", bool> | null
  gridRef,
  cellSize = 22,
  missionNumber = 1,
  borderInactive = false,
  onInnerClick,
  onInnerRightClick,
  onBorderClick,
}) {
  const [crossHover, setCrossHover] = useState(null);
  const circlesRef = useRef(null);

  const MAP_IMAGES = { 1: '/Gaza_1.png', 2: '/Fal_1.png', 3: '/Gaza_1.png' };

  // Redraw range circles on canvas whenever devices or cellSize changes
  useEffect(() => {
    const canvas = circlesRef.current;
    if (!canvas) return;
    const bp  = cellSize * 2 + 1;
    const dim = bp * 2 + N * (cellSize + 1) - 1;
    canvas.width  = dim;
    canvas.height = dim;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, dim, dim);

    for (const [key, info] of devices) {
      const [row, col] = key.split(',').map(Number);
      const cx = bp + col * (cellSize + 1) + cellSize / 2;
      const cy = bp + row * (cellSize + 1) + cellSize / 2;
      const r  = info.distance * (cellSize + 1);
      const isPurple = (info.hostageIdx ?? 0) === 0;
      const fillColor   = isPurple ? 'rgba(65,0,185,0.36)'   : 'rgba(0,70,200,0.36)';
      const strokeColor = isPurple ? 'rgba(155,75,255,0.70)' : 'rgba(50,140,255,0.70)';

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [devices, cellSize]);

  const getCellClass = useCallback((cell) => {
    const { key, corner, border, inner } = cell;

    if (corner) return 'cell cell-corner';

    if (border) {
      let cls = 'cell cell-border';
      if (borderInactive) cls += ' border-inactive';
      else if (entries.has(key)) cls += ' launched';
      return cls;
    }

    // inner
    let cls = 'cell cell-inner';

    if (revealed?.has(key)) {
      cls += revealed.get(key) ? ' hit' : ' false-positive';
    } else if (targets.has(key)) {
      cls += ' target';
    } else if (devices.has(key)) {
      cls += ' device';
    }

    if (crossHover && (cell.row === crossHover.row || cell.col === crossHover.col))
      cls += ' cross-highlight';

    return cls;
  }, [devices, targets, entries, revealed, crossHover]);

  return (
    <div className="grid-wrap">
      <div
        className="game-grid"
        ref={gridRef}
        style={{
          '--cell': `${cellSize}px`,
          '--bcell': `${cellSize * 2}px`,
          backgroundImage: `url('${MAP_IMAGES[missionNumber] ?? MAP_IMAGES[1]}')`,
        }}
      >
        <div className="grid-scan" />

        {/* Range circles — canvas so each layer truly stacks darker */}
        <canvas
          ref={circlesRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 4 }}
        />

        {CELLS.map((cell) => {
          const label = cell.border ? getEntryLabel(cell.row, cell.col) : null;
          const info  = cell.inner  ? devices.get(cell.key) : undefined;
          const dist  = info?.distance;
          const showX = cell.inner && revealed?.has(cell.key) && revealed.get(cell.key);
          return (
            <div
              key={cell.key}
              className={getCellClass(cell)}
              style={info && (info.hostageIdx ?? 0) === 1 && !revealed?.has(cell.key) ? {
                background: 'rgba(0,60,180,.85)',
                borderColor: 'rgba(50,140,255,.8)',
                boxShadow: '0 0 8px rgba(50,140,255,.45)',
              } : undefined}
              onClick={() => {
                if (cell.border && !borderInactive) onBorderClick?.(cell.row, cell.col);
                else if (cell.inner) onInnerClick?.(cell.row, cell.col);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (cell.inner) onInnerRightClick?.(cell.row, cell.col);
              }}
              onMouseEnter={() => { if (cell.inner) setCrossHover({ row: cell.row, col: cell.col }); }}
              onMouseLeave={() => { if (cell.inner) setCrossHover(null); }}
            >
              {showX && <span style={{ fontSize: 13, color: 'var(--red)', textShadow: '0 0 10px var(--red)' }}>✕</span>}
              {dist !== undefined && !showX && (
                <span className="device-dist">{dist}</span>
              )}
              {label && <span className="gc-label">{label}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
