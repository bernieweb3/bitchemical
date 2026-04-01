export type GameMode = 'vs-ai' | 'test-vs-ai' | 'pvp-1v1';

export const GAME_MODES: Array<{ mode: GameMode; label: string; players: number; teams: string; note: string }> = [
    { mode: 'vs-ai', label: 'Choi voi may', players: 1, teams: '1vAI', note: 'Solo tactical duel' },
    { mode: 'test-vs-ai', label: 'Test vs AI', players: 1, teams: '1vAI', note: 'Ban test co che truoc khi dong bo mode khac' },
    { mode: 'pvp-1v1', label: 'PVP 1v1', players: 2, teams: '1v1', note: 'Dau 1 doi 1 real-time' },
];

export const MULTIPLAYER_MODES = ['pvp-1v1'] as const;

export type MultiplayerGameMode = (typeof MULTIPLAYER_MODES)[number];

export function isMultiplayerMode(mode: GameMode): mode is MultiplayerGameMode {
    return (MULTIPLAYER_MODES as readonly GameMode[]).includes(mode);
}
