import { useState, useEffect } from 'react';

const MAP_IMAGES  = { 1: '/Gaza_1.png', 2: '/Fal_1.png', 3: '/Gaza_1.png' };
const SECTOR_NAME = { 1: 'Tehran Sector',      2: 'Tangier Sector',      3: 'Doha Sector'         };
const OP_NAME     = { 1: 'Operation Nightfall', 2: 'Operation Dark Tide', 3: 'Operation Last Light' };

export default function HostageBriefing({ hostageLevel, hostageCount, deviceLimit, isContinuation, escapedCount, onReady }) {
  const [countdown, setCountdown] = useState(3);
  const [showGo, setShowGo]       = useState(false);
  const [fading, setFading]       = useState(false);

  useEffect(() => {
    if (showGo) {
      const id = setTimeout(() => { setFading(true); setTimeout(onReady, 500); }, 800);
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
      <div className="mb-map" style={{ backgroundImage: `url('${MAP_IMAGES[hostageLevel]}')` }} />
      <div className="mb-vignette" />

      <div className="mb-content">
        <div className="mb-header">
          <div className="mb-label">LEVEL 2 — ROUND {hostageLevel} OF 3</div>
          <div className="mb-op">{OP_NAME[hostageLevel]}</div>
          <div className="mb-sector">{SECTOR_NAME[hostageLevel]}</div>
        </div>

        <div className="mb-divider" />

        <div className="mb-stats">
          <div className="mb-stat">
            <span className="mb-stat-val">{hostageCount}</span>
            <span className="mb-stat-label">HOSTAGES</span>
          </div>
          <div className="mb-stat-sep" />
          <div className="mb-stat">
            <span className="mb-stat-val">{deviceLimit}</span>
            <span className="mb-stat-label">DEVICES</span>
          </div>
        </div>

        {isContinuation && (
          <div className="mb-continuation">
            ⚠ {escapedCount} HOSTAGE{escapedCount !== 1 ? 'S' : ''} MOVED TO NEW LOCATION
          </div>
        )}

        <div className={`mb-countdown${showGo ? ' mb-go' : ''}`}>
          {showGo ? 'GO' : countdown}
        </div>

        <div className="mb-skip">CLICK TO SKIP</div>
      </div>
    </div>
  );
}
