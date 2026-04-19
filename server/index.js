const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ['http://localhost:5173', 'http://localhost:5174'], methods: ['GET', 'POST'] }
});

const N = 25;
const NUM_FOXES = 9;

// Global game state — single shared game
let foxPositions = [];
let players = new Map(); // socketId → { name, score, hits, droneCnt, submitted }
let gamePhase = 'lobby'; // 'lobby' | 'playing' | 'finished'

function generateFoxes() {
  const seen = new Set();
  const result = [];
  while (result.length < NUM_FOXES) {
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
  return 10 * hits + (N - droneCnt);
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

    // Start a new game if none in progress
    if (gamePhase === 'lobby') {
      foxPositions = generateFoxes();
      gamePhase = 'playing';
      console.log(`[*] New game started — foxes: ${JSON.stringify(foxPositions)}`);
    }

    console.log(`[+] Player joined: ${cleanName}`);
    broadcastState();

    socket.emit('game_start', {
      foxes: foxPositions,
      n: N,
      numFoxes: NUM_FOXES
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

  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player) {
      console.log(`[-] ${player.name} disconnected`);
      players.delete(socket.id);

      if (players.size === 0) {
        foxPositions = [];
        gamePhase = 'lobby';
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
