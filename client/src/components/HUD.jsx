export default function HUD({ playerName, droneCnt, suspectedCnt, fired, hits, numFoxes = 9, droneLimit = 25 }) {
  const dronesLeft = droneLimit - droneCnt;
  const droneClass = dronesLeft <= 5 ? 'crit' : dronesLeft <= 10 ? 'warn' : '';
  const targetClass = suspectedCnt === numFoxes ? 'ok' : suspectedCnt > numFoxes ? 'warn' : '';

  return (
    <div className="hud">
      <div className="hud-brand">
        TACT/CMD
        <span>OPERATION BLACK SITE</span>
      </div>

      <div className="hud-stats">
        <div className="hud-stat">
          <span className="hud-stat-label">Drones Left</span>
          <span className={`hud-stat-value ${droneClass}`}>{dronesLeft}</span>
        </div>
        <div className="hud-stat">
          <span className="hud-stat-label">Launched</span>
          <span className="hud-stat-value">{droneCnt}</span>
        </div>
        <div className="hud-stat">
          <span className="hud-stat-label">Targets Marked</span>
          <span className={`hud-stat-value ${targetClass}`}>{suspectedCnt}</span>
        </div>
        {fired && (
          <div className="hud-stat">
            <span className="hud-stat-label">Cells Destroyed</span>
            <span className={`hud-stat-value ${hits === numFoxes ? 'ok flash-text-green' : hits >= 6 ? 'warn' : 'crit'}`}>
              {hits}/{numFoxes}
            </span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.2rem' }}>
        <div className="hud-player">
          COMMANDER <strong>{playerName}</strong>
        </div>
        <div className="hud-connection">
          <div className="dot-online" />
          SECURE LINK ACTIVE
        </div>
      </div>
    </div>
  );
}
