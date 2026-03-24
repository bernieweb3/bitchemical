export type GameMode = 'vs-ai' | 'pvp-1v1' | 'pvp-2v2' | 'pvp-3v3';

export const GAME_MODES: Array<{ mode: GameMode; label: string; players: number; teams: string; note: string }> = [
    { mode: 'vs-ai', label: 'Choi voi may', players: 1, teams: '1vAI', note: 'Solo tactical duel' },
    { mode: 'pvp-1v1', label: 'PVP 1v1', players: 2, teams: '1v1', note: 'Dau 1 doi 1 real-time' },
    { mode: 'pvp-2v2', label: 'PVP 2v2', players: 4, teams: '2v2', note: '2 nguoi moi doi, real-time' },
    { mode: 'pvp-3v3', label: 'PVP 3v3', players: 6, teams: '3v3', note: 'Tran chien 6 nguoi real-time' },
];

export const MULTIPLAYER_MODES: GameMode[] = ['pvp-1v1', 'pvp-2v2', 'pvp-3v3'];

export function isMultiplayerMode(mode: GameMode): boolean {
    return MULTIPLAYER_MODES.includes(mode);
}
