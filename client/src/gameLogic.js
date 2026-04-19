// Faithful port of the Python drone navigation logic from tc_client.py
export const N = 25;
export const NUM_FOXES = 9;

// Returns the three cells directly ahead of the drone (left, center, right relative to travel direction).
// Returns null when the drone has exited the grid.
function checkAhead(dir, pos) {
  const [row, col] = pos;
  if (dir === 'n') {
    if (row <= -1) return null;
    return [[row - 1, col - 1], [row - 1, col], [row - 1, col + 1]];
  }
  if (dir === 's') {
    if (row >= N) return null;
    // Python: r=[row+1,col-1], c=[row+1,col], l=[row+1,col+1]  → returns (l,c,r)
    return [[row + 1, col + 1], [row + 1, col], [row + 1, col - 1]];
  }
  if (dir === 'e') {
    if (col >= N) return null;
    return [[row - 1, col + 1], [row, col + 1], [row + 1, col + 1]];
  }
  if (dir === 'w') {
    if (col <= -1) return null;
    return [[row + 1, col - 1], [row, col - 1], [row - 1, col - 1]];
  }
  return null;
}

// Returns ['1'|'0', '1'|'0', '1'|'0'] for left/center/right cells
function senseTargets(cells, targets) {
  return cells.map(([r, c]) =>
    targets.some(([tr, tc]) => tr === r && tc === c) ? '1' : '0'
  );
}

// Determines new direction based on what's sensed ahead (port of Python det_direction)
function steer(dir, alerts, pos) {
  const [row, col] = pos;

  if (alerts.every(a => a === '0')) return dir; // nothing sensed, fly straight

  // Center blocked or both flanks blocked → reverse
  if (alerts[1] === '1' || (alerts[0] === '1' && alerts[2] === '1')) {
    return { n: 's', s: 'n', e: 'w', w: 'e' }[dir];
  }

  // Left side only → veer right
  if (alerts[0] === '1') {
    if (dir === 'n') return row < 0 ? 's' : 'e';
    if (dir === 's') return row >= N ? 'n' : 'w';
    if (dir === 'e') return col < 0 ? 'w' : 's';
    if (dir === 'w') return col >= N ? 'e' : 'n';
  }

  // Right side only → veer left
  if (alerts[2] === '1') {
    if (dir === 'n') return row < 0 ? 's' : 'w';
    if (dir === 's') return row >= N ? 'n' : 'e';
    if (dir === 'e') return col < 0 ? 'w' : 'n';
    if (dir === 'w') return col >= N ? 'e' : 's';
  }

  return dir;
}

// Advance one step in the given direction (port of Python advance)
function step(dir, pos) {
  const [row, col] = pos;
  if (dir === 'n') return row <= -1 ? pos : [row - 1, col];
  if (dir === 's') return row >= N ? pos : [row + 1, col];
  if (dir === 'e') return col >= N ? pos : [row, col + 1];
  if (dir === 'w') return [row, col - 1]; // original has no west guard
  return pos;
}

// Determine initial travel direction from a border launch position
function entryDirection(row, col) {
  if (row === -1) return 's';
  if (row === N) return 'n';
  if (col === -1) return 'e';
  return 'w';
}

export function getEntryLabel(row, col) {
  if (row === -1) return `N${col}`;
  if (row === N) return `S${col}`;
  if (col === -1) return `W${row}`;
  return `E${row}`;
}

// Trace a drone from a border entry point through the field.
// targets: array of [row, col] — the actual or simulated positions to navigate around.
// Returns { exitRow, exitCol, path, label }
export function traceDrone(startRow, startCol, targets) {
  let dir = entryDirection(startRow, startCol);
  let pos = [startRow, startCol];
  const path = [];
  const MAX = 2000;

  let ahead = checkAhead(dir, pos);
  for (let i = 0; i < MAX; i++) {
    if (!ahead) break;
    const alerts = senseTargets(ahead, targets);
    dir = steer(dir, alerts, pos);
    pos = step(dir, pos);
    if (pos[0] >= 0 && pos[0] < N && pos[1] >= 0 && pos[1] < N) {
      path.push([pos[0], pos[1]]);
    }
    ahead = checkAhead(dir, pos);
  }

  return {
    exitRow: pos[0],
    exitCol: pos[1],
    path,
    label: getEntryLabel(startRow, startCol)
  };
}

export function calcScore(hits, droneCnt) {
  return 10 * hits + (N - droneCnt);
}
