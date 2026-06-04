import { useState, useEffect, useCallback, useRef } from 'react';
import Lobby from './components/Lobby';
import MissionSelect from './components/MissionSelect';
import Game from './components/Game';
import HostageGame from './components/HostageGame';
import Level3Game from './components/Level3Game';
import Level4Game from './components/Level4Game';
import Level5Game from './components/Level5Game';
import socket from './socket';

function loadCompleted() {
  try { return new Set(JSON.parse(localStorage.getItem('tc_completed_missions') || '[]')); }
  catch { return new Set(); }
}

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
  const [missionId, setMissionId]   = useState(0);
  const [hostageData, setHostageData] = useState(null);
  const [hostageId, setHostageId]     = useState(0);
  const [completedMissions, setCompletedMissions] = useState(loadCompleted);
  const pendingHostageMission = useRef(false);
  const rawNameRef            = useRef('');

  const markComplete = useCallback((id) => {
    setCompletedMissions(prev => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem('tc_completed_missions', JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    socket.on('connect', () => {
      setMySocketId(socket.id);
      setError(null);
    });

    socket.on('connect_error', () => {
      setPhase('mission-select');
      setError('Cannot reach server. Is it running on port 3001?');
    });

    socket.on('join_error', (msg) => {
      setPhase('mission-select');
      setError(msg);
    });

    socket.on('game_start', ({ foxes, numFoxes, droneLimit, isContinuation, missionNumber }) => {
      if (pendingHostageMission.current) {
        pendingHostageMission.current = false;
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

  // Player enters name → mission select (no server connection yet)
  const handleJoin = useCallback((name) => {
    rawNameRef.current = name;
    setPlayerName(name.toUpperCase());
    setError(null);
    setPhase('mission-select');
  }, []);

  // Player picks a mission
  const handleSelectMission = useCallback((missionId) => {
    setError(null);
    if (missionId === 3) {
      setPhase('level3');
      return;
    }
    if (missionId === 4) {
      setPhase('level4');
      return;
    }
    if (missionId === 5) {
      setPhase('level5');
      return;
    }
    setPhase('connecting');
    if (missionId === 2) pendingHostageMission.current = true;
    if (!socket.connected) socket.connect();
    socket.emit('join', { name: rawNameRef.current });
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

  const handleContinueHostageMission = useCallback((escaped) => {
    socket.emit('continue_hostage_mission', { escaped });
  }, []);

  // Mission 2 success — hostage rescued
  const handleHostageMissionComplete = useCallback(() => {
    markComplete(2);
    setPhase('mission-select');
  }, [markComplete]);

  // Mission 1 success — called from Game.jsx
  const handleMission1Complete = useCallback(() => {
    markComplete(1);
  }, [markComplete]);

  // Mission 3 success — called from Level3Game.jsx
  const handleMission3Complete = useCallback(() => {
    markComplete(3);
  }, [markComplete]);

  // Mission 4 success — called from Level4Game.jsx
  const handleMission4Complete = useCallback(() => {
    markComplete(4);
  }, [markComplete]);

  // Mission 5 — free-flight patrol, no completion tracking
  const handleMission5Complete = useCallback(() => {
    markComplete(5);
  }, [markComplete]);

  const handleReturnToMissions = useCallback(() => {
    if (socket.connected) socket.disconnect();
    setFoxes([]);
    setPlayers([]);
    setGameOver(null);
    setError(null);
    setNumFoxes(9);
    setDroneLimit(25);
    setIsContinuation(false);
    setMissionNumber(1);
    setHostageData(null);
    setPhase('mission-select');
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

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

  if (phase === 'mission-select') {
    return (
      <MissionSelect
        playerName={playerName}
        completedMissions={completedMissions}
        onSelect={handleSelectMission}
        onBack={() => setPhase('lobby')}
        error={error}
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
        onStartLevel3={handleHostageMissionComplete}
        onPlayAgain={handleReturnToMissions}
      />
    );
  }

  if (phase === 'level3') {
    return (
      <Level3Game
        playerName={playerName}
        onPlayAgain={handleReturnToMissions}
        onMissionComplete={handleMission3Complete}
      />
    );
  }

  if (phase === 'level4') {
    return (
      <Level4Game
        playerName={playerName}
        onPlayAgain={handleReturnToMissions}
        onMissionComplete={handleMission4Complete}
      />
    );
  }

  if (phase === 'level5') {
    return (
      <Level5Game
        playerName={playerName}
        onPlayAgain={handleReturnToMissions}
        onMissionComplete={handleMission5Complete}
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
      onPlayAgain={handleReturnToMissions}
      onMissionComplete={handleMission1Complete}
    />
  );
}
