import { useEffect, useMemo, useState } from 'react';
import { getMatchSocket, getResolvedMatchServerUrl } from '../network/matchSocket';
import type { GameMode } from '../types/gameMode';

type TeamId = 'A' | 'B';

export interface MatchedPlayer {
    id: string;
    name: string;
    team: TeamId;
}

export interface MatchFoundPayload {
    roomId: string;
    mode: Exclude<GameMode, 'vs-ai'>;
    playerId: string;
    team: TeamId;
    players: MatchedPlayer[];
}

interface MatchmakingScreenProps {
    mode: Exclude<GameMode, 'vs-ai'>;
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
    mode: Exclude<GameMode, 'vs-ai'>;
    hostId: string;
    members: RoomMember[];
    requiredPlayers: number;
}

type MatchTab = 'queue' | 'room';

const MODE_LABEL: Record<Exclude<GameMode, 'vs-ai'>, string> = {
    'pvp-1v1': 'PVP 1v1',
    'pvp-2v2': 'PVP 2v2',
    'pvp-3v3': 'PVP 3v3',
};

export function MatchmakingScreen({ mode, nickname, onBack, onMatched }: MatchmakingScreenProps) {
    const [tab, setTab] = useState<MatchTab>('queue');
    const [queueCount, setQueueCount] = useState(1);
    const [status, setStatus] = useState('Dang tim tran...');
    const [connectionStatus, setConnectionStatus] = useState('Dang ket noi server...');
    const [roomCodeInput, setRoomCodeInput] = useState('');
    const [roomState, setRoomState] = useState<RoomStatePayload | null>(null);
    const [selfId, setSelfId] = useState('');
    const [serverUrl] = useState(getResolvedMatchServerUrl());
    const isLocalServer = useMemo(() => /localhost|127\.0\.0\.1/.test(serverUrl), [serverUrl]);

    const modeLabel = useMemo(() => MODE_LABEL[mode], [mode]);

    useEffect(() => {
        const socket = getMatchSocket();

        const handleConnect = () => {
            setSelfId(socket.id ?? '');
            setConnectionStatus('Da ket noi matchmaking server');
            if (tab === 'queue') {
                setStatus('Dang tim tran...');
                socket.emit('join_queue', { mode, nickname });
            }
        };

        const handleDisconnect = () => {
            setConnectionStatus('Mat ket noi, dang thu lai...');
        };

        const handleConnectError = (err: Error) => {
            setConnectionStatus(`Khong ket noi duoc server: ${err.message}`);
        };

        const handleQueueUpdate = (payload: { mode: string; count: number }) => {
            if (payload.mode !== mode) return;
            setQueueCount(payload.count);
        };

        const handleMatchFound = (payload: MatchFoundPayload) => {
            setStatus('Da tim thay tran, dang vao phong...');
            onMatched(payload);
        };

        const handleRoomCreated = (payload: RoomStatePayload) => {
            setTab('room');
            setRoomState(payload);
            setStatus('Da tao phong. Cho ban vao...');
        };

        const handleRoomUpdate = (payload: RoomStatePayload) => {
            setRoomState(payload);
        };

        const handleRoomError = (payload: { message: string }) => {
            setStatus(payload.message || 'Loi phong. Vui long thu lai.');
        };

        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('connect_error', handleConnectError);
        socket.on('queue_update', handleQueueUpdate);
        socket.on('match_found', handleMatchFound);
        socket.on('room_created', handleRoomCreated);
        socket.on('room_update', handleRoomUpdate);
        socket.on('room_error', handleRoomError);

        if (socket.connected) {
            handleConnect();
        }

        return () => {
            if (tab === 'queue') {
                socket.emit('leave_queue', { mode });
            }
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
            socket.off('connect_error', handleConnectError);
            socket.off('queue_update', handleQueueUpdate);
            socket.off('match_found', handleMatchFound);
            socket.off('room_created', handleRoomCreated);
            socket.off('room_update', handleRoomUpdate);
            socket.off('room_error', handleRoomError);
        };
    }, [mode, nickname, onMatched, tab]);

    useEffect(() => {
        const socket = getMatchSocket();
        if (!socket.connected) return;

        if (tab === 'queue') {
            setRoomState(null);
            setStatus('Dang tim tran...');
            socket.emit('leave_custom_room', {});
            socket.emit('join_queue', { mode, nickname });
            return;
        }

        socket.emit('leave_queue', { mode });
        setQueueCount(0);
    }, [tab, mode, nickname]);

    const handleCreateRoom = () => {
        const socket = getMatchSocket();
        setStatus('Dang tao phong...');
        socket.emit('create_custom_room', { mode, nickname });
    };

    const handleJoinRoom = () => {
        const code = roomCodeInput.trim().toUpperCase();
        if (!code) {
            setStatus('Nhap ma phong truoc khi tham gia.');
            return;
        }
        const socket = getMatchSocket();
        setStatus('Dang vao phong...');
        socket.emit('join_custom_room', { roomCode: code, mode, nickname });
    };

    const handleLeaveRoom = () => {
        const socket = getMatchSocket();
        socket.emit('leave_custom_room', {});
        setRoomState(null);
        setStatus('Da roi phong.');
    };

    const handleStartRoomMatch = () => {
        if (!roomState) return;
        const socket = getMatchSocket();
        socket.emit('start_custom_room', { roomCode: roomState.roomCode });
    };

    const isHost = roomState?.hostId === selfId;
    const canStartRoom = Boolean(roomState && roomState.members.length >= roomState.requiredPlayers && isHost);

    return (
        <div className="matchmaking-root">
            <div className="matchmaking-card">
                <h2>{modeLabel}</h2>
                <div className="match-tabs">
                    <button className={`tab-btn ${tab === 'queue' ? 'active' : ''}`} onClick={() => setTab('queue')}>Ghep tran nhanh</button>
                    <button className={`tab-btn ${tab === 'room' ? 'active' : ''}`} onClick={() => setTab('room')}>Phong ban be</button>
                </div>

                <p>{status}</p>
                <p className="meta">Nguoi choi trong hang doi: {queueCount}</p>
                <p className="meta">{connectionStatus}</p>
                <p className="meta">Match server: {serverUrl}</p>
                {connectionStatus.includes('Khong ket noi duoc server') && (
                    <p className="meta">
                        Goi y: chay `npm --prefix ".../260311-demogame" run match:server` va mo game bang IP host neu choi 2 may.
                    </p>
                )}
                {isLocalServer && (
                    <p className="meta">
                        Ban dang dung localhost. Neu choi 2 may, hay mo bang IP LAN + ?matchServer=http://IP_HOST:3001
                    </p>
                )}

                {tab === 'room' && (
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
                                        <li key={m.id}>{m.name}{m.id === roomState.hostId ? ' (chu phong)' : ''}</li>
                                    ))}
                                </ul>
                                <div className="room-actions">
                                    <button className="action-btn danger" onClick={handleLeaveRoom}>Roi phong</button>
                                    <button className="action-btn" disabled={!canStartRoom} onClick={handleStartRoomMatch}>Bat dau</button>
                                </div>
                            </>
                        )}
                    </div>
                )}

                <p className="hint">Nickname: {nickname}</p>
                <button className="back-btn" onClick={onBack}>Quay lai</button>
            </div>
        </div>
    );
}
