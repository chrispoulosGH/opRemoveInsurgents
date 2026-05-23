const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const isProd = process.env.NODE_ENV === 'production';
const io = new Server(server, {
  cors: isProd ? {} : { origin: ['http://localhost:5173', 'http://localhost:5174'], methods: ['GET', 'POST'] }
});

if (isProd) {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

const N = 25;

// Global game state — single shared game
let foxPositions = [];
let missionNumFoxes  = 9;   // escalates on continue
let missionDroneLimit = 25;  // escalates on continue
let missionNumber = 1;       // 1-based; game over after MAX_MISSIONS failures
const MAX_MISSIONS = 3;
let players = new Map(); // socketId → { name, score, hits, droneCnt, submitted }
let gamePhase = 'lobby'; // 'lobby' | 'playing' | 'finished'

// Hostage rescue state (Level 2)
let hostagePositions   = [];
let hostageCount       = 2;
const HOSTAGE_DEVICE_LIMIT = 4;
let hostageLevel       = 1;
const MAX_HOSTAGE_MISSIONS = 3;
let hostagePhase       = 'inactive'; // 'inactive' | 'playing' | 'finished'

function hostageDistance(row, col) {
  const distances = hostagePositions.map(([hr, hc]) =>
    Math.round(Math.sqrt((row - hr) ** 2 + (col - hc) ** 2))
  );
  let minDist = Infinity, minIdx = 0;
  distances.forEach((d, i) => { if (d < minDist) { minDist = d; minIdx = i; } });
  return { distance: minDist, hostageIdx: minIdx, distances };
}

function generateFoxes(count) {
  const seen = new Set();
  const result = [];
  while (result.length < count) {
    const row = Math.floor(Math.random() * N);
    const col = Math.floor(Math.random() * N);
    const key = `${row},${col}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push([row, col]);
    }
  }
  return result;
}

function calcScore(hits, droneCnt) {
  return 10 * hits + (missionDroneLimit - droneCnt);
}

function broadcastState() {
  const playerList = [...players.entries()].map(([id, p]) => ({
    id,
    name: p.name,
    submitted: p.submitted
  }));
  io.emit('lobby_update', { players: playerList, gamePhase });
}

function checkGameOver() {
  if (gamePhase !== 'playing' || players.size === 0) return;
  const allSubmitted = [...players.values()].every(p => p.submitted);
  if (!allSubmitted) return;

  const rankings = [...players.entries()]
    .map(([id, p]) => ({
      id,
      name: p.name,
      score: p.score,
      hits: p.hits,
      droneCnt: p.droneCnt
    }))
    .sort((a, b) => b.score - a.score);

  gamePhase = 'finished';
  console.log('[*] GAME OVER — Rankings:', rankings.map(r => `${r.name}:${r.score}`).join(', '));
  io.emit('game_over', { rankings, foxes: foxPositions });
}

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} connected`);

  socket.on('join', ({ name }) => {
    const cleanName = (name || '').trim().toUpperCase().slice(0, 16);
    if (!cleanName) {
      socket.emit('join_error', 'Name is required');
      return;
    }

    players.set(socket.id, {
      name: cleanName,
      score: null,
      hits: 0,
      droneCnt: 0,
      submitted: false
    });

    // Start a fresh game if none in progress (or previous one is finished)
    if (gamePhase !== 'playing') {
      missionNumFoxes   = 9;
      missionDroneLimit = 25;
      missionNumber     = 1;
      foxPositions = generateFoxes(missionNumFoxes);
      gamePhase = 'playing';
      console.log(`[*] New game — ${missionNumFoxes} foxes, ${missionDroneLimit} drones`);
    }

    console.log(`[+] Player joined: ${cleanName}`);
    broadcastState();

    socket.emit('game_start', {
      foxes: foxPositions,
      n: N,
      numFoxes: missionNumFoxes,
      droneLimit: missionDroneLimit,
      missionNumber,
      isContinuation: false,
    });
  });

  socket.on('continue_mission', ({ escaped }) => {
    if (gamePhase !== 'finished') return;

    missionNumFoxes   = Math.max(1, escaped * 2);
    missionDroneLimit = missionNumFoxes * 3;
    missionNumber++;
    foxPositions = generateFoxes(missionNumFoxes);
    gamePhase = 'playing';

    for (const p of players.values()) {
      p.submitted = false;
      p.hits      = 0;
      p.droneCnt  = 0;
      p.score     = null;
    }

    console.log(`[*] Mission ${missionNumber} — ${missionNumFoxes} foxes, ${missionDroneLimit} drones`);
    broadcastState();
    io.emit('game_start', {
      foxes: foxPositions,
      n: N,
      numFoxes: missionNumFoxes,
      droneLimit: missionDroneLimit,
      missionNumber,
      isContinuation: true,
    });
  });

  socket.on('submit_score', ({ hits, misses, droneCnt }) => {
    const player = players.get(socket.id);
    if (!player || player.submitted || gamePhase !== 'playing') return;

    player.hits = hits;
    player.droneCnt = droneCnt;
    player.score = calcScore(hits, droneCnt);
    player.submitted = true;

    console.log(`[*] ${player.name} — hits:${hits} drones:${droneCnt} score:${player.score}`);
    broadcastState();
    checkGameOver();
  });

  socket.on('start_hostage_mission', () => {
    hostageCount    = 2;
    hostageLevel    = 1;
    hostagePhase    = 'playing';
    hostagePositions = generateFoxes(hostageCount);
    console.log(`[*] Hostage mission L${hostageLevel} — ${hostageCount} hostages`);
    io.emit('hostage_start', { hostageCount, deviceLimit: HOSTAGE_DEVICE_LIMIT, hostageLevel, isContinuation: false });
  });

  socket.on('continue_hostage_mission', ({ escaped }) => {
    if (hostagePhase !== 'finished') return;
    hostageCount    = Math.min(escaped * 2, 6);
    hostageLevel++;
    hostagePhase    = 'playing';
    hostagePositions = generateFoxes(hostageCount);
    console.log(`[*] Hostage mission L${hostageLevel} — ${hostageCount} hostages`);
    io.emit('hostage_start', { hostageCount, deviceLimit: HOSTAGE_DEVICE_LIMIT, hostageLevel, isContinuation: true, escapedCount: escaped });
  });

  socket.on('place_device', ({ row, col }) => {
    if (hostagePhase !== 'playing') return;
    const { distance, hostageIdx, distances } = hostageDistance(row, col);
    socket.emit('device_result', { row, col, distance, hostageIdx, distances });
  });

  socket.on('deploy_seals', ({ targets, entries }) => {
    if (hostagePhase !== 'playing') return;
    const checks = targets.map((t, i) => ({
      target: t,
      entry:  entries[i],
      correct: hostagePositions.some(([hr, hc]) => Math.abs(t[0]-hr) <= 1 && Math.abs(t[1]-hc) <= 1),
    }));
    const rescued = checks.filter(c => c.correct).length;
    hostagePhase = 'finished';
    io.emit('seal_result', {
      checks,
      rescued,
      escaped: hostageCount - rescued,
      hostagePositions,
      success: rescued === hostageCount,
      canContinue: hostageLevel < MAX_HOSTAGE_MISSIONS && rescued < hostageCount,
    });
  });

  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player) {
      console.log(`[-] ${player.name} disconnected`);
      players.delete(socket.id);

      if (players.size === 0) {
        foxPositions = [];
        missionNumFoxes   = 9;
        missionDroneLimit = 25;
        missionNumber     = 1;
        gamePhase         = 'lobby';
        hostagePositions  = [];
        hostageCount      = 2;
        hostageLevel      = 1;
        hostagePhase      = 'inactive';
        console.log('[*] All players gone — resetting');
      } else {
        broadcastState();
        checkGameOver();
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   TACTICAL COMMAND — SERVER ONLINE       ║
║   Port: ${PORT}  |  Waiting for agents...     ║
╚══════════════════════════════════════════╝
`);
});
