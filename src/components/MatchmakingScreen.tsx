import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameMode } from '../types/gameMode';

type MatchmakingMode = Exclude<GameMode, 'vs-ai' | 'test-vs-ai'>;

type TeamId = 'A' | 'B';

export interface MatchedPlayer {
    id: string;
    name: string;
    team: TeamId;
}

export interface MatchFoundPayload {
    roomId: string;
    mode: MatchmakingMode;
    playerId: string;
    team: TeamId;
    players: MatchedPlayer[];
}

interface MatchmakingScreenProps {
    mode: MatchmakingMode;
    nickname: string;
    onBack: () => void;
    onMatched: (payload: MatchFoundPayload) => void;
}

interface RoomMember {
    id: string;
    name: string;
}

interface RoomStatePayload {
    roomCode: string;
    mode: MatchmakingMode;
    hostId: string;
    members: RoomMember[];
    requiredPlayers: number;
    readyBy: Record<string, boolean>;
}

type MatchView = 'select' | 'queue' | 'room';

const MODE_LABEL: Record<MatchmakingMode, string> = {
    'pvp-1v1': 'PVP 1v1',
};

interface QueueEntry {
    id: string;
    name: string;
    mode: MatchmakingMode;
    joinedAt: number;
}

interface LocalRoom {
    roomCode: string;
    mode: MatchmakingMode;
    hostId: string;
    members: RoomMember[];
    requiredPlayers: number;
    readyBy: Record<string, boolean>;
}

interface MatchFoundEvent {
    roomId: string;
    mode: MatchmakingMode;
    players: MatchedPlayer[];
}

interface MatchStartEvent extends MatchFoundEvent {
    startAt: number;
}

const QUEUE_KEY = 'bitchemical_local_queue_v1';
const ROOM_KEY = 'bitchemical_local_rooms_v1';
const CHANNEL_NAME = 'bitchemical_local_match_channel_v1';

function getQueue(): QueueEntry[] {
    try {
        return JSON.parse(window.localStorage.getItem(QUEUE_KEY) || '[]') as QueueEntry[];
    } catch {
        return [];
    }
}

function setQueue(queue: QueueEntry[]) {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

function getRooms(): Record<string, LocalRoom> {
    try {
        return JSON.parse(window.localStorage.getItem(ROOM_KEY) || '{}') as Record<string, LocalRoom>;
    } catch {
        return {};
    }
}

function setRooms(rooms: Record<string, LocalRoom>) {
    window.localStorage.setItem(ROOM_KEY, JSON.stringify(rooms));
}

function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

export function MatchmakingScreen({ mode, nickname, onBack, onMatched }: MatchmakingScreenProps) {
    const [playerId] = useState(() => `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`);
    const [view, setView] = useState<MatchView>('select');
    const viewRef = useRef<MatchView>(view);
    const [queueCount, setQueueCount] = useState(0);
    const [status, setStatus] = useState('Chon che do de bat dau.');
    const [connectionStatus, setConnectionStatus] = useState('Che do local: khong can server');
    const [roomCodeInput, setRoomCodeInput] = useState('');
    const [roomState, setRoomState] = useState<RoomStatePayload | null>(null);
    const [selfId] = useState(playerId);
    const channelRef = useRef<BroadcastChannel | null>(null);
    const roomStateRef = useRef<RoomStatePayload | null>(null);
    const pendingMatchRef = useRef<string | null>(null);

    const modeLabel = useMemo(() => MODE_LABEL[mode], [mode]);

    // Keep viewRef in sync so cleanup closures always read the latest value
    useEffect(() => { viewRef.current = view; }, [view]);
    useEffect(() => { roomStateRef.current = roomState; }, [roomState]);

    useEffect(() => {
        const channel = new BroadcastChannel(CHANNEL_NAME);
        channelRef.current = channel;

        const refreshQueueCount = () => {
            const queue = getQueue().filter((entry) => entry.mode === mode);
            setQueueCount(queue.length);
        };

        const removeSelfFromQueue = () => {
            const queue = getQueue().filter((entry) => entry.id !== playerId);
            setQueue(queue);
            refreshQueueCount();
            channel.postMessage({ type: 'queue_updated', mode });
        };

        const removeSelfFromAllRooms = () => {
            const rooms = getRooms();
            let changed = false;
            for (const [code, room] of Object.entries(rooms)) {
                const nextMembers = room.members.filter((m) => m.id !== playerId);
                if (nextMembers.length !== room.members.length) {
                    changed = true;
                    if (nextMembers.length === 0) {
                        delete rooms[code];
                    } else {
                        const nextReadyBy = { ...room.readyBy };
                        delete nextReadyBy[playerId];
                        rooms[code] = {
                            ...room,
                            hostId: room.hostId === playerId ? nextMembers[0].id : room.hostId,
                            members: nextMembers,
                            readyBy: nextReadyBy,
                        };
                    }
                }
            }
            if (changed) {
                setRooms(rooms);
                channel.postMessage({ type: 'room_updated' });
            }
        };

        const scheduleMatchStart = (payload: MatchStartEvent) => {
            if (pendingMatchRef.current === payload.roomId) return;
            pendingMatchRef.current = payload.roomId;

            const selfPlayer = payload.players.find((p) => p.id === playerId);
            if (!selfPlayer) return;

            setStatus('Doi doi thu... vao game dong bo.');
            const delay = Math.max(0, payload.startAt - Date.now());
            window.setTimeout(() => {
                onMatched({
                    roomId: payload.roomId,
                    mode: payload.mode,
                    playerId: selfPlayer.id,
                    team: selfPlayer.team,
                    players: payload.players,
                });
            }, delay);
        };

        const emitMatchStart = (roomId: string, participants: RoomMember[], delayMs = 1200) => {
            const payload: MatchStartEvent = {
                roomId,
                mode,
                startAt: Date.now() + delayMs,
                players: participants.map((p, idx) => ({
                    id: p.id,
                    name: p.name,
                    team: idx === 0 ? 'A' : 'B',
                })),
            };
            channel.postMessage({ type: 'match_start', payload });
            scheduleMatchStart(payload);
        };

        const tryQueueMatch = () => {
            const queue = getQueue().filter((entry) => entry.mode === mode);
            if (queue.length < 2) {
                refreshQueueCount();
                return;
            }

            const matched = queue.slice(0, 2);
            const remaining = getQueue().filter((entry) => !matched.some((m) => m.id === entry.id));
            setQueue(remaining);
            refreshQueueCount();
            channel.postMessage({ type: 'queue_updated', mode });

            emitMatchStart(`queue_${Date.now()}`, matched.map((m) => ({ id: m.id, name: m.name })), 1000);
        };

        const syncRoomState = () => {
            const currentRoom = roomStateRef.current;
            if (!currentRoom) return;
            const rooms = getRooms();
            const room = rooms[currentRoom.roomCode];
            if (!room) {
                setRoomState(null);
                return;
            }
            setRoomState(room);
        };

        const onMessage = (event: MessageEvent) => {
            const data = event.data as { type?: string; payload?: MatchFoundEvent | MatchStartEvent; mode?: string };
            if (data.type === 'queue_updated') {
                refreshQueueCount();
                if (viewRef.current === 'queue') {
                    tryQueueMatch();
                }
            }
            if (data.type === 'room_updated') {
                syncRoomState();
            }
            if (data.type === 'match_start' && data.payload && 'startAt' in data.payload) {
                const selfPlayer = data.payload.players.find((p) => p.id === playerId);
                if (!selfPlayer) return;
                scheduleMatchStart(data.payload);
            }
        };

        refreshQueueCount();
        channel.addEventListener('message', onMessage);

        const onBeforeUnload = () => {
            removeSelfFromQueue();
            removeSelfFromAllRooms();
        };

        window.addEventListener('beforeunload', onBeforeUnload);

        return () => {
            removeSelfFromQueue();
            if (viewRef.current !== 'room') {
                removeSelfFromAllRooms();
            }
            channel.removeEventListener('message', onMessage);
            window.removeEventListener('beforeunload', onBeforeUnload);
            channel.close();
        };
    // roomState is intentionally excluded to avoid re-subscribing channel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, nickname, onMatched, playerId]);

    useEffect(() => {
        const channel = channelRef.current;
        if (!channel) return;

        if (view === 'queue') {
            const queue = getQueue().filter((entry) => entry.id !== playerId);
            queue.push({ id: playerId, name: nickname, mode, joinedAt: Date.now() });
            queue.sort((a, b) => a.joinedAt - b.joinedAt);
            setQueue(queue);
            setQueueCount(queue.filter((entry) => entry.mode === mode).length);
            channel.postMessage({ type: 'queue_updated', mode });
            setStatus('Dang tim tran...');
            return;
        }

        if (view === 'room') {
            const queue = getQueue().filter((entry) => entry.id !== playerId);
            setQueue(queue);
            channel.postMessage({ type: 'queue_updated', mode });
            setQueueCount(0);
            return;
        }

        const queue = getQueue().filter((entry) => entry.id !== playerId);
        setQueue(queue);
        channel.postMessage({ type: 'queue_updated', mode });
        setRoomState(null);
        setQueueCount(0);
        setStatus('Chon che do de bat dau.');
    }, [view, mode, nickname, playerId]);

    const handleCreateRoom = () => {
        const channel = channelRef.current;
        if (!channel) return;

        const rooms = getRooms();
        let code = generateCode();
        while (rooms[code]) {
            code = generateCode();
        }

        const room: LocalRoom = {
            roomCode: code,
            mode,
            hostId: playerId,
            requiredPlayers: 2,
            members: [{ id: playerId, name: nickname }],
            readyBy: { [playerId]: false },
        };

        rooms[code] = room;
        setRooms(rooms);
        setRoomState(room);
        setView('room');
        setStatus('Da tao phong. Chia se ma phong cho ban be.');
        channel.postMessage({ type: 'room_updated' });
    };

    const handleJoinRoom = () => {
        const code = roomCodeInput.trim().toUpperCase();
        if (!code) {
            setStatus('Nhap ma phong truoc khi tham gia.');
            return;
        }
        const channel = channelRef.current;
        if (!channel) return;

        const rooms = getRooms();
        const room = rooms[code];
        if (!room) {
            setStatus('Khong tim thay phong.');
            return;
        }
        if (room.mode !== mode) {
            setStatus('Phong dang o che do khac.');
            return;
        }
        if (!room.members.some((m) => m.id === playerId) && room.members.length >= room.requiredPlayers) {
            setStatus('Phong da day.');
            return;
        }

        const nextRoom: LocalRoom = {
            ...room,
            members: room.members.some((m) => m.id === playerId)
                ? room.members
                : [...room.members, { id: playerId, name: nickname }],
            readyBy: {
                ...room.readyBy,
                [playerId]: room.readyBy[playerId] ?? false,
            },
        };
        rooms[code] = nextRoom;
        setRooms(rooms);
        setRoomState(nextRoom);
        setView('room');
        setStatus('Da vao phong.');
        channel.postMessage({ type: 'room_updated' });
    };

    const handleLeaveRoom = () => {
        const channel = channelRef.current;
        if (!channel || !roomState) return;

        const rooms = getRooms();
        const room = rooms[roomState.roomCode];
        if (room) {
            const members = room.members.filter((m) => m.id !== playerId);
            if (members.length === 0) {
                delete rooms[roomState.roomCode];
            } else {
                rooms[roomState.roomCode] = {
                    ...room,
                    members,
                    hostId: room.hostId === playerId ? members[0].id : room.hostId,
                    readyBy: Object.fromEntries(Object.entries(room.readyBy).filter(([id]) => id !== playerId)),
                };
            }
            setRooms(rooms);
            channel.postMessage({ type: 'room_updated' });
        }

        setRoomState(null);
        setStatus('Da roi phong.');
        setView('select');
    };

    const handleStartRoomMatch = () => {
        if (!roomState) return;
        const channel = channelRef.current;
        if (!channel) return;

        const rooms = getRooms();
        const room = rooms[roomState.roomCode];
        if (!room) {
            setStatus('Phong khong ton tai.');
            return;
        }
        if (room.hostId !== playerId) {
            setStatus('Chi chu phong moi duoc bat dau.');
            return;
        }
        if (room.members.length < room.requiredPlayers) {
            setStatus('Can du 2 nguoi de bat dau tran 1v1.');
            return;
        }
        const allReady = room.members.every((m) => Boolean(room.readyBy[m.id]));
        if (!allReady) {
            setStatus('Can ca 2 nguoi bam San sang truoc khi bat dau.');
            return;
        }

        delete rooms[room.roomCode];
        setRooms(rooms);
        channel.postMessage({ type: 'room_updated' });

        const participants = room.members.slice(0, 2);
        const payload: MatchStartEvent = {
            roomId: `room_${room.roomCode}_${Date.now()}`,
            mode,
            startAt: Date.now() + 1500,
            players: participants.map((p, idx) => ({
                id: p.id,
                name: p.name,
                team: idx === 0 ? 'A' : 'B',
            })),
        };
        channel.postMessage({ type: 'match_start', payload });
        setStatus('Dang dong bo voi doi thu...');

        const selfPlayer = payload.players.find((p) => p.id === playerId);
        if (selfPlayer) {
            pendingMatchRef.current = payload.roomId;
            const delay = Math.max(0, payload.startAt - Date.now());
            window.setTimeout(() => {
                onMatched({ ...payload, playerId: selfPlayer.id, team: selfPlayer.team });
            }, delay);
        }
    };

    const handleToggleReady = () => {
        if (!roomState) return;
        const channel = channelRef.current;
        if (!channel) return;

        const rooms = getRooms();
        const room = rooms[roomState.roomCode];
        if (!room) {
            setStatus('Phong khong ton tai.');
            return;
        }

        const nextReady = !Boolean(room.readyBy[playerId]);
        rooms[roomState.roomCode] = {
            ...room,
            readyBy: {
                ...room.readyBy,
                [playerId]: nextReady,
            },
        };

        setRooms(rooms);
        channel.postMessage({ type: 'room_updated' });
        setStatus(nextReady ? 'Ban da san sang. Dang cho doi thu...' : 'Da huy trang thai san sang.');
    };

    const handleChooseQueue = () => {
        setView('queue');
    };

    const handleChooseRoom = () => {
        setView('room');
        setStatus('Tao phong moi hoac nhap ma de vao phong.');
    };

    const handleBackToSelect = () => {
        setView('select');
    };

    const isHost = roomState?.hostId === selfId;
    const allReady = Boolean(
        roomState
        && roomState.members.length >= roomState.requiredPlayers
        && roomState.members.every((m) => Boolean(roomState.readyBy[m.id])),
    );
    const isSelfReady = Boolean(roomState?.readyBy[selfId]);
    const canStartRoom = Boolean(roomState && isHost && roomState.members.length >= roomState.requiredPlayers && allReady);

    return (
        <div className="matchmaking-root">
            <div className="matchmaking-card">
                <h2>{modeLabel}</h2>
                <p>{status}</p>
                <p className="meta">{connectionStatus}</p>
                <p className="meta">Mo them 1 tab nua cung game de du 2 nguoi cho 1v1 local.</p>
                <p className="meta">Luu y: che do nay chi hoat dong trong cung mot may (cung trinh duyet/profile), khong choi duoc giua 2 may khac nhau.</p>

                <div className="match-choice-grid">
                    <button className={`match-choice-window ${view === 'queue' ? 'active' : ''}`} onClick={handleChooseQueue}>
                        <span className="choice-icon">⚡</span>
                        <span className="choice-title">Ghep Tran</span>
                        <span className="choice-desc">Vao hang doi va tim tran nhanh theo mode da chon.</span>
                    </button>
                    <button className={`match-choice-window ${view === 'room' ? 'active' : ''}`} onClick={handleChooseRoom}>
                        <span className="choice-icon">🏠</span>
                        <span className="choice-title">Tao Phong</span>
                        <span className="choice-desc">Tao phong rieng, chia se ma hoac vao phong ban be.</span>
                    </button>
                </div>

                {view === 'queue' && (
                    <div className="room-panel queue-panel">
                        <p className="meta">Nguoi choi trong hang doi: {queueCount}</p>
                        <p className="hint">Dang ghep tran cho {modeLabel}...</p>
                        <p className="hint">Chi vao game khi du 2 nguoi trong hang doi.</p>
                    </div>
                )}

                {view === 'room' && (
                    <div className="room-panel">
                        {!roomState && (
                            <>
                                <button className="action-btn" onClick={handleCreateRoom}>Tao phong</button>
                                <div className="join-row">
                                    <input
                                        className="room-input"
                                        value={roomCodeInput}
                                        onChange={(e) => setRoomCodeInput(e.target.value)}
                                        placeholder="Nhap ma phong (VD: A1B2C3)"
                                        maxLength={10}
                                    />
                                    <button className="action-btn secondary" onClick={handleJoinRoom}>Vao phong</button>
                                </div>
                            </>
                        )}

                        {roomState && (
                            <>
                                <p className="meta">Ma phong: <strong>{roomState.roomCode}</strong></p>
                                <p className="meta">Nguoi choi: {roomState.members.length}/{roomState.requiredPlayers}</p>
                                <ul className="member-list">
                                    {roomState.members.map((m) => (
                                        <li key={m.id}>
                                            {m.name}
                                            {m.id === roomState.hostId ? ' (chu phong)' : ''}
                                            {roomState.readyBy[m.id] ? ' - San sang' : ' - Chua san sang'}
                                        </li>
                                    ))}
                                </ul>
                                <div className="room-actions">
                                    <button className="action-btn danger" onClick={handleLeaveRoom}>Roi phong</button>
                                    <button className="action-btn secondary" onClick={handleToggleReady}>{isSelfReady ? 'Huy san sang' : 'San sang'}</button>
                                    <button className="action-btn" disabled={!canStartRoom} onClick={handleStartRoomMatch}>Bat dau dong bo</button>
                                </div>
                                {isHost && roomState.members.length < roomState.requiredPlayers && (
                                    <p className="hint">Phong nay dang tat AI bo sung, can du nguoi that moi bat dau duoc.</p>
                                )}
                                {roomState.members.length >= roomState.requiredPlayers && !allReady && (
                                    <p className="hint">Can ca 2 nguoi bam San sang roi host moi bat dau duoc.</p>
                                )}
                            </>
                        )}
                    </div>
                )}

                <p className="hint">Nickname: {nickname}</p>
                {view !== 'select' && (
                    <button className="back-btn secondary" onClick={handleBackToSelect}>Quay lai lua chon</button>
                )}
                <button className="back-btn" onClick={onBack}>Quay lai</button>
            </div>
        </div>
    );
}
