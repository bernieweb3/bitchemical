import type { GameMode } from '../types/gameMode';

interface MainMenuProps {
    onStartGame: (mode: GameMode) => void;
}

import './MainMenu.css';

export function MainMenu({ onStartGame }: MainMenuProps) {
    const gameModes = [
        { mode: 'vs-ai' as const, name: 'Choi voi may', accent: 'mode-solo', note: '1vAI tactical duel', icon: '🤖', badge: 'AI' },
        { mode: 'pvp-1v1' as const, name: 'PVP 1v1', accent: 'mode-duo', note: 'Dau 1 doi 1 real-time', icon: '⚔', badge: '1V1' },
    ];

    const railItems = [
        { icon: '🛡', label: 'Profile' },
        { icon: '⚔', label: 'Battle', active: true },
        { icon: '🛒', label: 'Shop', hasNotification: true },
        { icon: '👥', label: 'Friends', hasNotification: true },
        { icon: '🏆', label: 'Leaderboard' },
    ];

    return (
        <div className="lobby-root">
            <div className="lobby-bg-grid" />
            <div className="lobby-bg-orb orb-a" />
            <div className="lobby-bg-orb orb-b" />
            <div className="lobby-bg-orb orb-c" />
            <div className="lobby-bg-orb orb-d" />
            <div className="lobby-bg-orb orb-e" />
            <div className="terrain-ring ring-a" />
            <div className="terrain-ring ring-b" />

            <header className="lobby-topbar">
                <div className="profile-chip">
                    <div className="player-avatar">⚡</div>
                    <div className="rank-badge">--</div>
                    <div className="profile-meta">
                        <div className="profile-name">Player</div>
                        <div className="xp-track">
                            <div className="xp-fill placeholder" />
                        </div>
                    </div>
                </div>

                <div className="lobby-logo">
                    <span>ELEMENTAL</span>
                    <strong>SIEGE</strong>
                </div>

                <div className="topbar-actions">
                    <button className="social-btn" aria-label="Discord">🎮</button>
                    <button className="social-btn" aria-label="Reddit">🧡</button>
                    <div className="currency gems">💎 --</div>
                    <div className="currency coins">🪙 --</div>
                    <button className="settings-btn" aria-label="Settings">⚙</button>
                </div>
            </header>

            <aside className="left-rail">
                {railItems.map((item) => (
                    <button key={item.label} className={`rail-item ${item.active ? 'active' : ''}`}>
                        <span className="rail-icon">{item.icon}</span>
                        <span className="rail-label">{item.label}</span>
                        {item.hasNotification && <span className="rail-badge dot" />}
                    </button>
                ))}
            </aside>

            <main className="lobby-main">
                <section className="center-panel">
                    <div className="settings-row">
                        <div className="setting-box">Region: Auto (AS)</div>
                        <div className="setting-box">Quality: High</div>
                    </div>

                    <label className="nickname-wrap">
                        <span>Set Your Nickname</span>
                        <input value="" placeholder="Waiting for profile data" readOnly />
                    </label>

                    <div className="mode-heading">Choose a Game Mode</div>
                    <div className="mode-grid">
                        {gameModes.map((mode) => (
                            <button key={mode.name} className={`mode-card ${mode.accent}`} onClick={() => onStartGame(mode.mode)}>
                                <div className="mode-icon-wrap">
                                    <div className="mode-icon-badge">{mode.badge}</div>
                                    <div className="mode-icon">{mode.icon}</div>
                                </div>
                                <div className="mode-name-row">
                                    <div className="mode-name">{mode.name}</div>
                                    <div className="mode-play">▶</div>
                                </div>
                                <div className="mode-note">{mode.note}</div>
                            </button>
                        ))}
                    </div>

                    <button className="vip-banner" onClick={() => onStartGame('pvp-1v1')}>
                        <div className="vip-glow" />
                        <div className="vip-left">
                            <div className="vip-icon">🌟</div>
                            <div>
                                <div className="vip-title">Protect the VIP</div>
                                <div className="vip-sub">Limited mode is live - tap to deploy</div>
                            </div>
                        </div>
                        <div className="vip-right">
                            <div className="vip-tag">LIMITED</div>
                            <div className="vip-timer">--:--</div>
                        </div>
                    </button>
                </section>

                <section className="right-panel">
                    <article className="panel-card season-card">
                        <div className="panel-head">
                            <div className="panel-badge">🏆</div>
                            <div className="panel-title">Season --</div>
                        </div>
                        <div className="panel-value">Tier --</div>
                        <div className="season-progress">
                            <div className="season-progress-fill placeholder" />
                        </div>
                        <div className="panel-meta">Progress data pending</div>
                    </article>

                    <article className="panel-card challenge-card">
                        <div className="panel-title">Challenges</div>
                        <div className="panel-value">--/--</div>
                        <div className="challenge-list empty">
                            <div className="challenge-item">
                                <span>Challenge data pending</span>
                                <span className="challenge-progress">--</span>
                            </div>
                        </div>
                        <div className="panel-meta">Tasks will appear when backend is ready</div>
                    </article>

                    <article className="panel-card discover-card">
                        <div className="panel-title">Info</div>
                        <ul>
                            <li>Content will be loaded from server</li>
                        </ul>
                    </article>
                </section>
            </main>
        </div>
    );
}
