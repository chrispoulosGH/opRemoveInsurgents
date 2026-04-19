import { NUM_FOXES, N } from '../gameLogic';

const MEDALS = ['gold', 'silver', 'bronze'];

export default function Scoreboard({ gameOver, mySocketId, onClose }) {
  const { rankings, foxes } = gameOver;

  return (
    <div className="overlay">
      <div className="score-modal">
        <div className="score-modal-header">
          <h2>// MISSION DEBRIEF</h2>
          <p>OPERATION BLACK SITE — COMPLETE</p>
        </div>

        <ul className="rank-list">
          {rankings.map((player, i) => {
            const isMe = player.id === mySocketId;
            const posClass = MEDALS[i] || '';
            return (
              <li key={player.id} className={`rank-item${isMe ? ' is-me' : ''}`}>
                <span className={`rank-pos ${posClass}`}>{i + 1}</span>
                <span className="rank-name">
                  {player.name}
                  {isMe && <span style={{ color: 'var(--cyan)', fontSize: '.65rem', marginLeft: '.5rem' }}>YOU</span>}
                </span>
                <div className="rank-meta">
                  <span className="rank-score">{player.score}</span>
                  <span className="rank-detail">
                    {player.hits}/{NUM_FOXES} HIT · {player.droneCnt} DRONES
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        {foxes && (
          <div style={{ marginTop: '1.25rem', fontSize: '.65rem', color: 'var(--t-dim)', letterSpacing: '.1em' }}>
            CELL LOCATIONS WERE:{' '}
            <span style={{ color: 'var(--red)' }}>
              {foxes.map(([r, c]) => `(${r},${c})`).join('  ')}
            </span>
          </div>
        )}

        <div className="score-actions">
          <button className="btn-secondary" onClick={onClose}>
            ✕ Close
          </button>
        </div>
      </div>
    </div>
  );
}
