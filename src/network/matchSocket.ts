import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let resolvedServerUrl = '';

function isLoopbackHost(hostname: string) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function normalizeServerUrl(serverUrl: string, protocol: string, currentHost: string) {
    try {
        const parsed = new URL(serverUrl);
        // If user opens game via LAN IP but stored URL is localhost, swap to current host.
        if (isLoopbackHost(parsed.hostname) && !isLoopbackHost(currentHost)) {
            parsed.hostname = currentHost;
            if (!parsed.port) parsed.port = '3001';
            parsed.protocol = `${protocol}:`;
            return parsed.toString().replace(/\/$/, '');
        }
        return parsed.toString().replace(/\/$/, '');
    } catch {
        return serverUrl;
    }
}

function resolveServerUrl() {
    const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
    const currentHost = window.location.hostname;
    const defaultServerUrl = `${protocol}://${currentHost}:3001`;

    const params = new URLSearchParams(window.location.search);
    const queryServer = params.get('matchServer')?.trim();
    if (queryServer) {
        window.localStorage.setItem('matchServerUrl', queryServer);
    }

    const persistedServer = window.localStorage.getItem('matchServerUrl')?.trim();
    const envServer = import.meta.env.VITE_MATCH_SERVER_URL?.trim();

    const preferred = envServer || queryServer || persistedServer || defaultServerUrl;
    const normalized = normalizeServerUrl(preferred, protocol, currentHost);

    if (normalized !== preferred) {
        window.localStorage.setItem('matchServerUrl', normalized);
    }

    return normalized;
}

export function getResolvedMatchServerUrl() {
    return resolvedServerUrl || resolveServerUrl();
}

export function getMatchSocket() {
    if (socket) return socket;

    const serverUrl = resolveServerUrl();
    resolvedServerUrl = serverUrl;

    socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 400,
    });

    return socket;
}

export function disconnectMatchSocket() {
    if (!socket) return;
    socket.disconnect();
    socket = null;
}
