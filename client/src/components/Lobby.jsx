import { useState } from 'react';

export default function Lobby({ onJoin, connecting, error, initialName = '' }) {
  const [name, setName] = useState(initialName);
  const [showBriefing, setShowBriefing] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) onJoin(name.trim());
  };

  return (
    <div className="lobby">
      <div className="lobby-hero">
        <h1>TACTICAL COMMAND</h1>
        <p>Operation Black Site</p>
        <div className="lobby-tagline">
          Intelligence assets report 9 terror cells operating within a classified
          grid sector. Deploy reconnaissance drones to map deflection signatures
          and eliminate all targets before rival operatives do.
        </div>
      </div>

      {showBriefing && (
        <div className="briefing-overlay" onClick={() => setShowBriefing(false)}>
          <div className="briefing-dialog" onClick={e => e.stopPropagation()}>
            <div className="briefing">
              <div className="briefing-header">
                <span className="briefing-stamp">CLASSIFIED</span>
                <span className="briefing-title">// OPERATION BLACK SITE — FIELD BRIEFING</span>
                <span className="briefing-stamp">EYES ONLY</span>
              </div>
              <div className="briefing-body">
                <div className="briefing-section">
                  <div className="briefing-label">SITUATION</div>
                  <p>
                    Intelligence confirms <strong>9 active terror cells</strong> embedded within a classified
                    urban grid sector. Cells are dispersed throughout the civilian population, making
                    conventional ground operations infeasible. Collateral damage is not acceptable.
                    Rival operatives are racing to neutralise the same targets — speed and precision are critical.
                  </p>
                </div>
                <div className="briefing-section">
                  <div className="briefing-label">RECONNAISSANCE ASSETS</div>
                  <p>
                    You are authorised to deploy a limited number of <strong>autonomous reconnaissance drones</strong>
                    into the grid perimeter. Drones are single-use, unarmed, and cannot be remotely redirected
                    once launched. All telemetry is transmitted only after the drone exits the grid boundary.
                  </p>
                  <p>Drone behaviour on contact with a terror cell:</p>
                  <ul className="briefing-list">
                    <li><strong>Direct approach</strong> — drone reverses course back to its entry point.</li>
                    <li><strong>Oblique approach</strong> — drone deflects 90° and exits via an adjacent edge.</li>
                    <li><strong>No contact</strong> — drone exits the opposite side of the grid uninterrupted.</li>
                  </ul>
                  <p>
                    Cross-referencing multiple drone flight paths allows you to triangulate cell locations.
                    Use simulation mode (right-click a border) to test hypotheses against your marks before
                    committing real drones.
                  </p>
                </div>
                <div className="briefing-section">
                  <div className="briefing-label">RULES OF ENGAGEMENT</div>
                  <ul className="briefing-list">
                    <li>All <strong>9 terror cells</strong> must be marked and destroyed to complete the mission.</li>
                    <li>Striking a cell with no confirmed hostile presence constitutes a <strong>civilian incident</strong>.</li>
                    <li>Any cell left unmarked allows insurgents to <strong>escape and regroup</strong> elsewhere
                        in the city — mission failure.</li>
                    <li>Fewer drone deployments yield a higher mission score.</li>
                  </ul>
                </div>
                <div className="briefing-section">
                  <div className="briefing-label">OBJECTIVE</div>
                  <p>
                    Locate all 9 cells. Mark them. Eliminate them simultaneously with a precision air strike.
                    Zero escapes. Zero civilian casualties. <strong>Mission accomplished.</strong>
                  </p>
                </div>
              </div>
              <div className="briefing-close">
                <button className="btn-secondary" onClick={() => setShowBriefing(false)}>
                  ✕ Close Briefing
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="lobby-card">
        <h2>// Agent Identification</h2>

        {error && <div className="lobby-error">⚠ {error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="agent-name">Agent Callsign</label>
            <input
              id="agent-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ALPHA-1"
              maxLength={16}
              autoFocus
              disabled={connecting}
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={connecting || !name.trim()}
          >
            {connecting ? '◌ Establishing Link...' : '▶ Deploy Agent'}
          </button>
        </form>

        <button
          className="btn-secondary"
          style={{ marginTop: '1rem', width: '100%' }}
          onClick={() => setShowBriefing(true)}
        >
          ◈ Read Mission Briefing
        </button>
      </div>

      <div className="lobby-footer">
        Left-click border → launch drone &nbsp;|&nbsp;
        Left-click grid → mark target &nbsp;|&nbsp;
        Right-click border → preview path
      </div>
    </div>
  );
}
