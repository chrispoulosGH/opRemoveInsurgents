import { useState, useEffect, useCallback } from 'react';
import Lobby from './components/Lobby';
import Game from './components/Game';
import socket from './socket';

export default function App() {
  const [phase, setPhase] = useState('lobby'); // 'lobby' | 'connecting' | 'playing' | 'finished'
  const [playerName, setPlayerName] = useState('');
  const [foxes, setFoxes] = useState([]);
  const [players, setPlayers] = useState([]);
  const [gameOver, setGameOver] = useState(null);
  const [error, setError] = useState(null);
  const [mySocketId, setMySocketId] = useState(null);

  useEffect(() => {
    socket.on('connect', () => {
      setMySocketId(socket.id);
      setError(null);
    });

    socket.on('connect_error', () => {
      setPhase('lobby');
      setError('Cannot reach server. Is it running on port 3001?');
    });

    socket.on('join_error', (msg) => {
      setPhase('lobby');
      setError(msg);
    });

    socket.on('game_start', ({ foxes }) => {
      setFoxes(foxes);
      setGameOver(null);
      setPhase('playing');
    });

    socket.on('lobby_update', ({ players }) => {
      setPlayers(players);
    });

    socket.on('game_over', (data) => {
      setGameOver(data);
      setPhase('finished');
    });

    return () => {
      socket.off('connect');
      socket.off('connect_error');
      socket.off('join_error');
      socket.off('game_start');
      socket.off('lobby_update');
      socket.off('game_over');
    };
  }, []);

  const handleJoin = useCallback((name) => {
    setPlayerName(name.toUpperCase());
    setError(null);
    setPhase('connecting');
    if (!socket.connected) {
      socket.connect();
    }
    socket.emit('join', { name });
  }, []);

  const handleSubmitScore = useCallback((hits, misses, droneCnt) => {
    socket.emit('submit_score', { hits, misses, droneCnt });
  }, []);

  const handlePlayAgain = useCallback(() => {
    socket.disconnect();
    setFoxes([]);
    setPlayers([]);
    setGameOver(null);
    setError(null);
    setPhase('lobby');
  }, []);

  if (phase === 'lobby' || phase === 'connecting') {
    return (
      <Lobby
        onJoin={handleJoin}
        connecting={phase === 'connecting'}
        error={error}
        initialName={playerName}
      />
    );
  }

  return (
    <Game
      playerName={playerName}
      mySocketId={mySocketId}
      foxes={foxes}
      players={players}
      gameOver={gameOver}
      onSubmitScore={handleSubmitScore}
      onPlayAgain={handlePlayAgain}
    />
  );
}
