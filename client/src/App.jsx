import { useState, useEffect, useCallback, useRef } from 'react';
import Lobby from './components/Lobby';
import Game from './components/Game';
import HostageGame from './components/HostageGame';
import Level3Game from './components/Level3Game';
import socket from './socket';

export default function App() {
  const [phase, setPhase]           = useState('lobby');
  const [playerName, setPlayerName] = useState('');
  const [foxes, setFoxes]           = useState([]);
  const [players, setPlayers]       = useState([]);
  const [gameOver, setGameOver]     = useState(null);
  const [error, setError]           = useState(null);
  const [mySocketId, setMySocketId] = useState(null);
  const [numFoxes, setNumFoxes]     = useState(9);
  const [droneLimit, setDroneLimit] = useState(25);
  const [isContinuation, setIsContinuation] = useState(false);
  const [missionNumber, setMissionNumber]   = useState(1);
  const [missionId, setMissionId]   = useState(0); // increments to force Game remount
  const [hostageData, setHostageData] = useState(null); // { hostageCount, deviceLimit, hostageLevel, isContinuation }
  const [hostageId, setHostageId]     = useState(0);    // increments to force HostageGame remount
  const pendingHostageTest            = useRef(false);

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

    socket.on('game_start', ({ foxes, numFoxes, droneLimit, isContinuation, missionNumber }) => {
      if (pendingHostageTest.current) {
        pendingHostageTest.current = false;
        socket.emit('start_hostage_mission');
        return;
      }
      setFoxes(foxes);
      setNumFoxes(numFoxes ?? 9);
      setDroneLimit(droneLimit ?? 25);
      setIsContinuation(isContinuation ?? false);
      setMissionNumber(missionNumber ?? 1);
      setGameOver(null);
      setMissionId(id => id + 1);
      setPhase('playing');
    });

    socket.on('lobby_update', ({ players }) => {
      setPlayers(players);
    });

    socket.on('game_over', (data) => {
      setGameOver(data);
      setPhase('finished');
    });

    socket.on('hostage_start', (data) => {
      setHostageData(data);
      setHostageId(id => id + 1);
      setPhase('hostage');
    });

    return () => {
      socket.off('connect');
      socket.off('connect_error');
      socket.off('join_error');
      socket.off('game_start');
      socket.off('lobby_update');
      socket.off('game_over');
      socket.off('hostage_start');
    };
  }, []);

  const handleJoin = useCallback((name) => {
    setPlayerName(name.toUpperCase());
    setError(null);
    setPhase('connecting');
    if (!socket.connected) socket.connect();
    socket.emit('join', { name });
  }, []);

  const handleSubmitScore = useCallback((hits, misses, droneCnt) => {
    socket.emit('submit_score', { hits, misses, droneCnt });
  }, []);

  const handleContinueMission = useCallback((escaped) => {
    socket.emit('continue_mission', { escaped });
  }, []);

  const handleStartHostageMission = useCallback(() => {
    socket.emit('start_hostage_mission');
  }, []);

  const handleTestHostage = useCallback(() => {
    pendingHostageTest.current = true;
    setPlayerName('TEST');
    setError(null);
    setPhase('connecting');
    if (!socket.connected) socket.connect();
    socket.emit('join', { name: 'TEST' });
  }, []);

  const handleContinueHostageMission = useCallback((escaped) => {
    socket.emit('continue_hostage_mission', { escaped });
  }, []);

  const handleStartLevel3 = useCallback(() => {
    setPhase('level3');
  }, []);

  const handleTestLevel3 = useCallback(() => {
    setPlayerName('TEST');
    setPhase('level3');
  }, []);

  const handlePlayAgain = useCallback(() => {
    socket.disconnect();
    setFoxes([]);
    setPlayers([]);
    setGameOver(null);
    setError(null);
    setNumFoxes(9);
    setDroneLimit(25);
    setIsContinuation(false);
    setMissionNumber(1);
    setPhase('lobby');
  }, []);

  if (phase === 'lobby' || phase === 'connecting') {
    return (
      <Lobby
        onJoin={handleJoin}
        connecting={phase === 'connecting'}
        error={error}
        initialName={playerName}
        onTestHostage={handleTestHostage}
        onTestLevel3={handleTestLevel3}
      />
    );
  }

  if (phase === 'hostage' && hostageData) {
    return (
      <HostageGame
        key={hostageId}
        playerName={playerName}
        hostageCount={hostageData.hostageCount}
        deviceLimit={hostageData.deviceLimit}
        hostageLevel={hostageData.hostageLevel}
        isContinuation={hostageData.isContinuation ?? false}
        escapedCount={hostageData.escapedCount ?? 0}
        onContinue={handleContinueHostageMission}
        onStartLevel3={handleStartLevel3}
        onPlayAgain={handlePlayAgain}
      />
    );
  }

  if (phase === 'level3') {
    return (
      <Level3Game
        playerName={playerName}
        onPlayAgain={handlePlayAgain}
      />
    );
  }

  return (
    <Game
      key={missionId}
      playerName={playerName}
      mySocketId={mySocketId}
      foxes={foxes}
      players={players}
      gameOver={gameOver}
      numFoxes={numFoxes}
      droneLimit={droneLimit}
      isContinuation={isContinuation}
      missionNumber={missionNumber}
      onSubmitScore={handleSubmitScore}
      onContinueMission={handleContinueMission}
      onPlayAgain={handlePlayAgain}
      onStartHostageMission={handleStartHostageMission}
    />
  );
}
