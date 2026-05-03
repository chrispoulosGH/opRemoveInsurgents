import { useState, useEffect } from 'react';

const MAP_IMAGES  = { 1: '/iran_3.png',    2: '/tanzier_1.png', 3: '/doha_1.png' };
const SECTOR_NAME = { 1: 'Tehran Sector',  2: 'Tangier Sector', 3: 'Doha Sector'  };
const OP_NAME     = { 1: 'Operation Black Site', 2: 'Operation Sand Veil', 3: 'Operation Gulf Strike' };

export default function MissionBriefing({ missionNumber, numFoxes, droneLimit, isContinuation, onReady }) {
  const [countdown, setCountdown] = useState(3);
  const [showGo, setShowGo]       = useState(false);
  const [fading, setFading]       = useState(false);

  useEffect(() => {
    if (showGo) {
      const id = setTimeout(() => {
        setFading(true);
        setTimeout(onReady, 500);
      }, 800);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => {
      if (countdown <= 1) setShowGo(true);
      else setCountdown(c => c - 1);
    }, 1000);
    return () => clearTimeout(id);
  }, [countdown, showGo]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`mb-overlay${fading ? ' mb-fading' : ''}`} onClick={() => { setFading(true); setTimeout(onReady, 500); }}>
      <div className="mb-map" style={{ backgroundImage: `url('${MAP_IMAGES[missionNumber]}')` }} />
      <div className="mb-vignette" />

      <div className="mb-content">
        <div className="mb-header">
          <div className="mb-label">MISSION {missionNumber} OF 3</div>
          <div className="mb-op">{OP_NAME[missionNumber]}</div>
          <div className="mb-sector">{SECTOR_NAME[missionNumber]}</div>
        </div>

        <div className="mb-divider" />

        <div className="mb-stats">
          <div className="mb-stat">
            <span className="mb-stat-val">{numFoxes}</span>
            <span className="mb-stat-label">TARGETS</span>
          </div>
          <div className="mb-stat-sep" />
          <div className="mb-stat">
            <span className="mb-stat-val">{droneLimit}</span>
            <span className="mb-stat-label">DRONES</span>
          </div>
        </div>

        {isContinuation && (
          <div className="mb-continuation">⚠ ESCAPED CELLS HAVE RECONSTITUTED</div>
        )}

        <div className={`mb-countdown${showGo ? ' mb-go' : ''}`}>
          {showGo ? 'GO' : countdown}
        </div>

        <div className="mb-skip">CLICK TO SKIP</div>
      </div>
    </div>
  );
}
