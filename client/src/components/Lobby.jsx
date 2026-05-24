import { useState } from 'react';

export default function Lobby({ onJoin, connecting, error, initialName = '' }) {
  const [name, setName] = useState(initialName);
  const [showBriefing, setShowBriefing] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) onJoin(name.trim());
  };

  const handleClick = () => {
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
                    conventional ground operations infeasible. Civilian casualties are not acceptable.
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
                  <div className="briefing-label">MISSION STRUCTURE — 3 SECTORS</div>
                  <p>
                    This operation spans <strong>up to 3 sectors</strong> across different theatres. Each sector
                    presents a new grid with cells relocated to unknown positions.
                  </p>
                  <ul className="briefing-list">
                    <li><strong>Sector 1 — Tehran:</strong> 9 cells. Initial insertion. Establish your methodology.</li>
                    <li><strong>Sector 2 — Tangier:</strong> Activated only if cells escape Sector 1.</li>
                    <li><strong>Sector 3 — Doha:</strong> Final engagement. No further chances after this.</li>
                  </ul>
                </div>
                <div className="briefing-section">
                  <div className="briefing-label">CELL ESCAPE &amp; RECONSTITUTION</div>
                  <p>
                    Any terror cell that evades the air strike does not simply flee — it <strong>splits and
                    reconstitutes</strong>. Each escaped cell regroups with surviving elements and spawns
                    additional operatives in the next sector. The number of targets in each follow-on mission
                    is <strong>double the number of cells that escaped</strong> the previous strike.
                  </p>
                  <p>
                    A single escape in Sector 1 becomes two targets in Sector 2. Precision is not optional —
                    every miss compounds the threat.
                  </p>
                </div>
                <div className="briefing-section">
                  <div className="briefing-label">RULES OF ENGAGEMENT</div>
                  <ul className="briefing-list">
                    <li>All active terror cells must be <strong>marked and destroyed</strong> to complete the sector.</li>
                    <li>Striking a cell with no confirmed hostile presence constitutes a <strong>civilian incident</strong> — immediate mission failure.</li>
                    <li>Any unmarked cell escapes to the next sector and <strong>reconstitutes as two cells</strong>.</li>
                    <li>After <strong>3 failed sectors</strong> the operation is terminated. Return to base.</li>
                    <li>Fewer drone deployments yield a higher mission score.</li>
                  </ul>
                </div>
                <div className="briefing-section">
                  <div className="briefing-label">OBJECTIVE</div>
                  <p>
                    Locate all cells. Mark them. Eliminate them simultaneously with a precision air strike.
                    Zero escapes. Zero civilian casualties. Across all three sectors.{' '}
                    <strong>Operation complete.</strong>
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
            type="button"
            className="btn-primary"
            disabled={connecting || !name.trim()}
            onClick={handleClick}
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
