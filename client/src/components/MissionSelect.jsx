import { useState } from 'react';

const MISSIONS = [
  {
    id: 1,
    code: 'OP-SERPENT',
    title: 'ELIMINATE TERROR CELLS',
    type: 'AREA DENIAL — MULTI-TARGET STRIKE',
    classification: 'TOP SECRET',
    location: 'CLASSIFIED AO',
    assets: 'AUTONOMOUS DRONE PACKAGE',
    difficulty: 'MODERATE',
    diffColor: '#FFB800',
    briefing: [
      'Intelligence has confirmed 9 active terror cells operating within a classified grid sector. Cells are embedded among the civilian population — conventional ground operations are not viable.',
      'Deploy reconnaissance drones to map deflection signatures and triangulate cell positions. Mark all targets and eliminate them simultaneously with a precision air strike.',
      'Rival operatives are racing to neutralise the same targets. Zero civilian casualties are acceptable. Speed and precision are critical.',
    ],
  },
  {
    id: 2,
    code: 'OP-GUARDIAN',
    title: 'HOSTAGE RESCUE',
    type: 'DIRECT ACTION — PERSONNEL RECOVERY',
    classification: 'TOP SECRET',
    location: 'UNDISCLOSED COMPOUND',
    assets: 'SEAL TEAM / LISTENING DEVICES',
    difficulty: 'HIGH',
    diffColor: '#FF8800',
    briefing: [
      'Confirmed intelligence: civilian hostages are being held at a fortified compound by armed insurgents. Standard extraction is not possible without prior reconnaissance.',
      'Deploy listening devices to triangulate hostage positions within the compound. Coordinate SEAL team entry and extraction routes based on device readings.',
      'All hostages must be extracted alive. Any premature contact with insurgents will compromise the operation.',
    ],
  },
  {
    id: 3,
    code: 'OP-BLACK SITE',
    title: 'DESTROY URANIUM SITES',
    type: 'STRATEGIC STRIKE — WMD DENIAL',
    classification: 'EYES ONLY',
    location: 'NANGARHAR PROVINCE, AFG',
    assets: 'B-52 / MOAB ORDNANCE × 3',
    difficulty: 'CRITICAL',
    diffColor: '#FF3030',
    briefing: [
      'Satellite intelligence confirms enriched uranium stockpiles stored in an underground facility in Nangarhar Province, Afghanistan. The facility is hardened against conventional strike packages.',
      'Three ventilation shafts provide the only access to the hardened bunker below. Each shaft must receive a direct MOAB hit to breach and destroy the stores.',
      'You have three bombs and ten minutes. All three shafts must be destroyed for mission success. Strike radius is fifteen feet — precision is everything.',
    ],
  },
  {
    id: 4,
    code: 'OP-IRONCLAD',
    title: 'ELIMINATE SPEEDBOAT THREAT',
    type: 'MARITIME STRIKE — AREA DENIAL',
    classification: 'TOP SECRET',
    location: 'CLASSIFIED AO',
    assets: 'B-52 / MOAB ORDNANCE × 1',
    difficulty: 'HIGH',
    diffColor: '#FF8800',
    briefing: [
      'Oil tankers and barges are under sustained attack from elusive high-speed armed boats. Multiple vessels have been struck. Location of the AO is classified.',
      'Low-level aerial reconnaissance has located what is believed to be the primary docking and staging area. A recon image will be provided at mission start.',
      'You have one MOAB and three minutes. Navigate to the area, identify the docking facility, and eliminate it. Strike radius is 200 yards.',
    ],
  },
];

export default function MissionSelect({ playerName, completedMissions, onSelect, onBack, error }) {
  const [hovered, setHovered] = useState(null);

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#020c14',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--font-mono)',
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '.28rem 2rem',
        borderBottom: '1px solid rgba(0,212,255,.15)',
        background: 'rgba(0,0,0,.55)',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: '.65rem', color: 'var(--cyan)', letterSpacing: '.2em' }}>
          ██ TACTICAL COMMAND — OPERATION BLACK SITE
        </div>
        <div style={{ fontSize: '.82rem', fontWeight: 700, color: '#fff', letterSpacing: '.16em' }}>
          MISSION SELECT
        </div>
        <div style={{ fontSize: '.65rem', color: 'var(--t-ghost)', letterSpacing: '.1em' }}>
          AGENT: <span style={{ color: 'rgba(255,255,255,.6)' }}>{playerName}</span>
        </div>
      </div>

      {/* Subtitle */}
      <div style={{
        textAlign: 'center', padding: '.56rem 2rem .16rem',
        fontSize: '.6rem', color: 'var(--t-ghost)', letterSpacing: '.22em',
        flexShrink: 0,
      }}>
        SELECT OPERATION — MISSIONS MAY BE ATTEMPTED IN ANY ORDER
      </div>

      {error && (
        <div style={{
          textAlign: 'center', padding: '.16rem 2rem',
          fontSize: '.6rem', color: 'var(--red)', letterSpacing: '.1em',
          flexShrink: 0,
        }}>
          ⚠ {error}
        </div>
      )}

      {/* Mission cards */}
      <div style={{
        flex: 1,
        display: 'flex', gap: '.55rem',
        padding: '.4rem 2rem .6rem',
        justifyContent: 'center', alignItems: 'flex-start',
        flexWrap: 'wrap',
      }}>
        {MISSIONS.map(m => {
          const completed = completedMissions.has(m.id);
          const isHov     = hovered === m.id;
          return (
            <div
              key={m.id}
              onMouseEnter={() => setHovered(m.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                width: '320px', height: '320px', flexShrink: 0, overflow: 'hidden',
                border: `1px solid ${
                  completed ? 'rgba(0,255,136,.45)' :
                  isHov     ? 'rgba(0,212,255,.55)' :
                              'rgba(0,212,255,.18)'
                }`,
                borderRadius: '4px',
                background: completed ? 'rgba(0,255,136,.04)' :
                            isHov     ? 'rgba(0,212,255,.05)' :
                                        'rgba(0,0,0,.4)',
                display: 'flex', flexDirection: 'column',
                transition: 'border-color .2s, background .2s, box-shadow .2s',
                boxShadow: completed ? '0 0 20px rgba(0,255,136,.1)' :
                           isHov     ? '0 0 18px rgba(0,212,255,.12)' :
                                       'none',
              }}
            >
              {/* Card header */}
              <div style={{
                padding: '.32rem 1rem .28rem',
                borderBottom: '1px solid rgba(0,212,255,.1)',
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  marginBottom: '.16rem',
                }}>
                  <div style={{ fontSize: '.5rem', color: 'var(--t-ghost)', letterSpacing: '.2em' }}>
                    {m.classification} — {m.code}
                  </div>
                  {completed && (
                    <div style={{
                      fontSize: '.5rem', fontWeight: 700, color: '#00FF88',
                      letterSpacing: '.12em', border: '1px solid rgba(0,255,136,.5)',
                      padding: '2px 7px', borderRadius: '2px',
                      background: 'rgba(0,255,136,.1)', whiteSpace: 'nowrap',
                    }}>
                      ✓ COMPLETE
                    </div>
                  )}
                </div>
                <div style={{
                  fontSize: '1.05rem', fontWeight: 700, color: '#fff',
                  letterSpacing: '.08em', lineHeight: 1.2, marginBottom: '.12rem',
                }}>
                  {m.title}
                </div>
                <div style={{ fontSize: '.54rem', color: 'var(--cyan)', letterSpacing: '.14em' }}>
                  {m.type}
                </div>
              </div>

              {/* Stats grid */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr',
                borderBottom: '1px solid rgba(0,212,255,.08)',
              }}>
                {[
                  ['LOCATION',   m.location,   false],
                  ['DIFFICULTY', m.difficulty,  false],
                  ['ASSETS',     m.assets,      true],
                ].map(([label, val, full]) => (
                  <div key={label} style={{
                    padding: '.16rem .8rem',
                    gridColumn:  full ? 'span 2' : 'auto',
                    borderTop:   full ? '1px solid rgba(0,212,255,.08)' : 'none',
                    borderRight: !full && label === 'LOCATION' ? '1px solid rgba(0,212,255,.08)' : 'none',
                  }}>
                    <div style={{ fontSize: '.48rem', color: 'var(--t-ghost)', letterSpacing: '.16em' }}>
                      {label}
                    </div>
                    <div style={{
                      fontSize: '.6rem', fontWeight: 700, marginTop: '.04rem',
                      color: label === 'DIFFICULTY' ? m.diffColor : 'rgba(255,255,255,.72)',
                      letterSpacing: '.05em',
                    }}>
                      {val}
                    </div>
                  </div>
                ))}
              </div>

              {/* Briefing */}
              <div style={{ padding: '.3rem 1rem', flex: 1 }}>
                <div style={{
                  fontSize: '.48rem', color: 'var(--t-ghost)',
                  letterSpacing: '.18em', marginBottom: '.2rem',
                }}>
                  MISSION BRIEFING
                </div>
                {m.briefing.map((para, i) => (
                  <p key={i} style={{
                    fontSize: '.6rem', color: 'var(--t-dim)', lineHeight: 1.4,
                    margin: i < m.briefing.length - 1 ? '0 0 .22rem' : '0',
                  }}>
                    {para}
                  </p>
                ))}
              </div>

              {/* Deploy button */}
              <div style={{ padding: '.3rem 1rem', borderTop: '1px solid rgba(0,212,255,.08)' }}>
                <button
                  onClick={() => onSelect(m.id)}
                  style={{
                    width: '100%', padding: '.22rem',
                    fontFamily: 'var(--font-mono)', fontSize: '.72rem',
                    fontWeight: 700, letterSpacing: '.1em',
                    cursor: 'pointer', borderRadius: '3px',
                    border: `1px solid ${completed ? 'rgba(0,255,136,.55)' : 'rgba(0,212,255,.55)'}`,
                    background: completed ? 'rgba(0,255,136,.1)' : 'rgba(0,212,255,.1)',
                    color: completed ? '#00FF88' : 'var(--cyan)',
                    transition: 'all .15s',
                  }}
                >
                  {completed ? '↺ REPLAY MISSION' : '▶ DEPLOY'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: '0 2rem .6rem', display: 'flex',
        justifyContent: 'center', flexShrink: 0,
      }}>
        <button className="btn-secondary" onClick={onBack}
          style={{ fontSize: '.62rem', letterSpacing: '.1em', padding: '.16rem 1.4rem' }}>
          ← Change Agent
        </button>
      </div>
    </div>
  );
}
