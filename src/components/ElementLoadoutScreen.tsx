import { type MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import periodicElements from '../data/periodic-elements.json';

const AUTO_START_SECONDS = 7;
const MAX_LOADOUT_SIZE = 3;
const DEFAULT_AUTO_LOADOUT = ['K', 'Fe', 'Br'];

const rawElementImageUrls = import.meta.glob('../../img/nguyento/*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
}) as Record<string, string>;

interface ElementLoadoutScreenProps {
    onStartGame: (
        selectedElements: SelectedLoadoutItem[],
        syncContext?: { syncedLoadoutsByPlayer?: Record<string, string[]> },
    ) => void;
    onBack: () => void;
    multiplayerSync?: {
        roomId: string;
        playerId: string;
        expectedPlayers: number;
    } | null;
}

export interface SelectedLoadoutItem {
    symbol: string;
    imageUrl: string | null;
}

type ThemeMode = 'light' | 'dark';

type PeriodicElement = {
    atomicNumber: number;
    symbol: string;
    name: string;
    atomicMass: string;
    electronicConfiguration: string;
    standardState: string;
    groupBlock: string;
    period: number;
    group: number;
    series: 'main' | 'lanthanide' | 'actinide';
    category: string;
};

type HoverCardState = {
    element: PeriodicElement;
    imageUrl: string | null;
};

interface LoadoutReadyEvent {
    playerId: string;
    symbols: string[];
    sentAt: number;
}

interface LoadoutStartEvent {
    startAt: number;
    expectedPlayers: number;
}

const GROUP_LABELS = [
    { group: 1, label: 'IA' },
    { group: 2, label: 'IIA' },
    { group: 3, label: 'IIIB' },
    { group: 4, label: 'IVB' },
    { group: 5, label: 'VB' },
    { group: 6, label: 'VIB' },
    { group: 7, label: 'VIIB' },
    { group: 9, label: 'VIIIB' },
    { group: 11, label: 'IB' },
    { group: 12, label: 'IIB' },
    { group: 13, label: 'IIIA' },
    { group: 14, label: 'IVA' },
    { group: 15, label: 'VA' },
    { group: 16, label: 'VIA' },
    { group: 17, label: 'VIIA' },
    { group: 18, label: 'VIIIA' },
];

const CATEGORY_COLORS: Record<string, { light: string; dark: string; label: string }> = {
    'alkali metal': { light: '#f5b7c7', dark: '#8a3d5a', label: 'Kim loai kiem' },
    'alkaline earth metal': { light: '#f8c8dd', dark: '#92516c', label: 'Kim loai kiem tho' },
    'transition metal': { light: '#e7b5d0', dark: '#7f4666', label: 'Kim loai chuyen tiep' },
    'post-transition metal': { light: '#deb0cf', dark: '#764a6a', label: 'Kim loai hau chuyen tiep' },
    metalloid: { light: '#f4de7b', dark: '#7f6b2e', label: 'A kim' },
    nonmetal: { light: '#f4eb9a', dark: '#7f7430', label: 'Phi kim' },
    halogen: { light: '#f0e16a', dark: '#796d1f', label: 'Halogen' },
    'noble gas': { light: '#9ad8d0', dark: '#2a6f67', label: 'Khi hiem' },
    lanthanoid: { light: '#d8acd3', dark: '#754172', label: 'Lanthanide' },
    actinoid: { light: '#cfa0cc', dark: '#6e3a6b', label: 'Actinide' },
    metal: { light: '#ddb1cf', dark: '#734c67', label: 'Kim loai' },
};

const PERIOD_LAYOUT: Record<number, string[]> = {
    1: ['H', 'He'],
    2: ['Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne'],
    3: ['Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar'],
    4: ['K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr'],
    5: ['Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe'],
    6: ['Cs', 'Ba', 'La', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn'],
    7: ['Fr', 'Ra', 'Ac', 'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds', 'Rg', 'Cn', 'Nh', 'Fl', 'Mc', 'Lv', 'Ts', 'Og'],
};

const GROUP_BY_SYMBOL = new Map<string, number>([
    // Period 1
    ['H', 1], ['He', 18],
    // Period 2
    ['Li', 1], ['Be', 2], ['B', 13], ['C', 14], ['N', 15], ['O', 16], ['F', 17], ['Ne', 18],
    // Period 3
    ['Na', 1], ['Mg', 2], ['Al', 13], ['Si', 14], ['P', 15], ['S', 16], ['Cl', 17], ['Ar', 18],
    // Period 4
    ['K', 1], ['Ca', 2], ['Sc', 3], ['Ti', 4], ['V', 5], ['Cr', 6], ['Mn', 7], ['Fe', 8], ['Co', 9], ['Ni', 10], ['Cu', 11], ['Zn', 12], ['Ga', 13], ['Ge', 14], ['As', 15], ['Se', 16], ['Br', 17], ['Kr', 18],
    // Period 5
    ['Rb', 1], ['Sr', 2], ['Y', 3], ['Zr', 4], ['Nb', 5], ['Mo', 6], ['Tc', 7], ['Ru', 8], ['Rh', 9], ['Pd', 10], ['Ag', 11], ['Cd', 12], ['In', 13], ['Sn', 14], ['Sb', 15], ['Te', 16], ['I', 17], ['Xe', 18],
    // Period 6
    ['Cs', 1], ['Ba', 2], ['La', 3], ['Hf', 4], ['Ta', 5], ['W', 6], ['Re', 7], ['Os', 8], ['Ir', 9], ['Pt', 10], ['Au', 11], ['Hg', 12], ['Tl', 13], ['Pb', 14], ['Bi', 15], ['Po', 16], ['At', 17], ['Rn', 18],
    // Period 7
    ['Fr', 1], ['Ra', 2], ['Ac', 3], ['Rf', 4], ['Db', 5], ['Sg', 6], ['Bh', 7], ['Hs', 8], ['Mt', 9], ['Ds', 10], ['Rg', 11], ['Cn', 12], ['Nh', 13], ['Fl', 14], ['Mc', 15], ['Lv', 16], ['Ts', 17], ['Og', 18],
]);

const LANTHANIDES = ['La', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu'];
const ACTINIDES = ['Ac', 'Th', 'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm', 'Md', 'No', 'Lr'];

const SEARCH_ALIASES: Record<string, string> = {
    Fe: 'sat iron',
    Cu: 'dong copper',
    Ag: 'bac silver',
    Au: 'vang gold',
    Hg: 'thuy ngan mercury',
    Pb: 'chi lead',
    Sn: 'thiec tin',
    K: 'kali potassium',
    Na: 'natri sodium',
    Cl: 'clo chlorine',
    Si: 'silic silicon',
    C: 'cacbon carbon',
    O: 'oxi oxygen',
    N: 'nitrogen nito',
    H: 'hydrogen hidro',
    He: 'heli',
    Br: 'bromine brom',
};

const SYMBOL_IMAGE_HINTS: Record<string, string[]> = {
    K: ['potassium', 'k'],
    Ca: ['calcium', 'ca'],
    Sc: ['scandium', 'sc'],
    Ti: ['titanium', 'ti'],
    V: ['vanadium', 'v'],
    Cr: ['chramium', 'chromium', 'cr'],
    Mn: ['mangaese', 'manganese', 'mn'],
    Fe: ['iron', 'fe'],
    Co: ['cobalt', 'co'],
    Ni: ['nickel', 'ni'],
    Cu: ['capper', 'copper', 'cu'],
    Zn: ['zinc', 'zn'],
    Ga: ['gallium', 'ga'],
    Ge: ['germanium', 'ge'],
    As: ['arsenic', 'as'],
    Se: ['selenium', 'se'],
    Br: ['bromine', 'br'],
    Kr: ['krypton', 'kr'],
    Rb: ['rubidium', 'rb'],
    Sr: ['strontium', 'sr'],
    Y: ['yttrium', 'y'],
    Zr: ['zirconium', 'zr'],
    Nb: ['niobium', 'nb'],
    Mo: ['molybdenum', 'mo'],
    Tc: ['technetium', 'tc'],
    Ru: ['ruthenium', 'ru'],
    Rh: ['rhodium', 'rh'],
    Pd: ['palladium', 'pd'],
    Ag: ['silver', 'ag'],
    Cd: ['cadmium', 'cd'],
    In: ['indium', 'in'],
    Sn: ['tin', 'sn'],
    Sb: ['antimony', 'sb'],
    Te: ['tellurium', 'te'],
    I: ['iodine', 'i'],
    Xe: ['xenon', 'xe'],
    Cs: ['caesium', 'cesium', 'cs'],
    Ba: ['barium', 'bari', 'ba'],
    La: ['lanthanum', 'la'],
    Hf: ['hafnium', 'hf'],
    Ta: ['tantalum', 'ta'],
    W: ['tungsten', 'wolfram', 'w'],
    Re: ['rhenium', 're'],
    Os: ['osmium', 'os'],
    Ir: ['iridium', 'ir'],
    Pt: ['platinum', 'pt'],
    Au: ['gold', 'aurum', 'au'],
    Hg: ['mercury', 'hydrargyrum', 'hg'],
    Tl: ['thallium', 'tl'],
    Pb: ['lead', 'plumbum', 'pb'],
    Bi: ['bismuth', 'bi'],
    Po: ['polonium', 'po'],
    At: ['astatine', 'at'],
    Rn: ['radon', 'rn'],
    Fr: ['francium', 'fr'],
    Ra: ['radium', 'ra'],
    Ac: ['actinideum', 'actinium', 'ac'],
    Rf: ['rutherfordium', 'rf'],
    Db: ['dubnium', 'db'],
    Sg: ['seaborgium', 'sg'],
    Bh: ['bohrium', 'bh'],
    Hs: ['hassium', 'hs'],
    Mt: ['meitnerium', 'mt'],
    Ds: ['darmsardtium', 'darmstadtium', 'ds'],
    Rg: ['roentgenium', 'rg'],
    Cn: ['copernicium', 'cn'],
    Nh: ['ununtri', 'nihonium', 'nh'],
    Fl: ['flerovi', 'flerovium', 'fl'],
    Mc: ['ununpenti', 'moscovium', 'mc'],
    Lv: ['livermorium', 'lv'],
    Ts: ['tennessine', 'ts'],
    Og: ['oganesson', 'og'],
};

function normalizeAssetName(text: string) {
    return text
        .toLowerCase()
        .replace(/\.svg$/g, '')
        .replace(/[^a-z0-9]/g, '');
}

function buildSymbolImageMap() {
    const normalizedFiles = Object.entries(rawElementImageUrls).map(([path, url]) => {
        const fileName = path.split('/').pop() ?? path;
        const fileNameLower = fileName.toLowerCase();
        const baseName = fileNameLower.replace(/\.svg$/, '').trim();
        const normalizedBase = normalizeAssetName(baseName);
        const suffixMatch = baseName.match(/_([a-z]{1,2})$/);
        const prefixMatch = baseName.match(/^([a-z]{1,2})_/);

        return {
            key: normalizedBase,
            baseName,
            suffixSymbol: suffixMatch?.[1] ?? null,
            prefixSymbol: prefixMatch?.[1] ?? null,
            url,
        };
    });

    const map: Record<string, string> = {};

    for (const symbol of Object.keys(SYMBOL_IMAGE_HINTS)) {
        const symbolLower = symbol.toLowerCase();

        const directBySuffix = normalizedFiles.find((f) => f.suffixSymbol === symbolLower);
        if (directBySuffix) {
            map[symbol] = directBySuffix.url;
            continue;
        }

        const directByPrefix = normalizedFiles.find((f) => f.prefixSymbol === symbolLower);
        if (directByPrefix) {
            map[symbol] = directByPrefix.url;
            continue;
        }

        const directByExactName = normalizedFiles.find((f) => f.baseName === symbolLower || f.key === symbolLower);
        if (directByExactName) {
            map[symbol] = directByExactName.url;
            continue;
        }

        const hints = SYMBOL_IMAGE_HINTS[symbol] ?? [];
        const hintCandidates = hints
            .map((hint) => normalizeAssetName(hint))
            .filter((hint) => hint.length >= 3);

        const matchedByHint = normalizedFiles.find((f) => hintCandidates.some((hint) => f.key.includes(hint)));
        if (matchedByHint) {
            map[symbol] = matchedByHint.url;
        }
    }

    return map;
}

const SYMBOL_IMAGE_URLS = buildSymbolImageMap();


function normalizeText(text: string) {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function formatMass(rawMass: string | number | null | undefined) {
    if (rawMass === null || rawMass === undefined) return 'Unknown';

    const massText = String(rawMass).trim();
    if (!massText) return 'Unknown';

    return massText.replace(/\([^)]*\)/g, '').trim();
}

function levenshtein(a: string, b: string) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array.from({ length: n + 1 }, () => 0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }

    return dp[m][n];
}

function derivePeriod(symbol: string) {
    for (const [period, symbols] of Object.entries(PERIOD_LAYOUT)) {
        if (symbols.includes(symbol)) return Number(period);
    }
    return 1;
}

function getCategory(groupBlock: string) {
    return CATEGORY_COLORS[groupBlock] ? groupBlock : 'metal';
}

function getElementImageUrl(symbol: string) {
    return SYMBOL_IMAGE_URLS[symbol] ?? null;
}

export function ElementLoadoutScreen({ onStartGame, onBack, multiplayerSync = null }: ElementLoadoutScreenProps) {
    const [theme, setTheme] = useState<ThemeMode>('light');
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<string>('all');
    const [selectedLoadout, setSelectedLoadout] = useState<string[]>([]);
    const [countdown, setCountdown] = useState(AUTO_START_SECONDS);
    const [hoverCard, setHoverCard] = useState<HoverCardState | null>(null);
    const [hoverCardVisible, setHoverCardVisible] = useState(false);
    const showTimerRef = useRef<number | null>(null);
    const hideTimerRef = useRef<number | null>(null);
    const autoStartTimerRef = useRef<number | null>(null);
    const syncStartTimerRef = useRef<number | null>(null);
    const selectedLoadoutRef = useRef<string[]>([]);
    const readyPayloadRef = useRef<LoadoutReadyEvent | null>(null);
    const readyPlayersRef = useRef<Record<string, LoadoutReadyEvent>>({});
    const syncChannelRef = useRef<BroadcastChannel | null>(null);
    const plannedStartAtRef = useRef<number | null>(null);
    const startedRef = useRef(false);

    useEffect(() => {
        return () => {
            if (showTimerRef.current !== null) window.clearTimeout(showTimerRef.current);
            if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
            if (autoStartTimerRef.current !== null) window.clearInterval(autoStartTimerRef.current);
            if (syncStartTimerRef.current !== null) window.clearTimeout(syncStartTimerRef.current);
            if (syncChannelRef.current) {
                syncChannelRef.current.close();
                syncChannelRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        selectedLoadoutRef.current = selectedLoadout;
    }, [selectedLoadout]);

    const elements = useMemo<PeriodicElement[]>(() => {
        return (periodicElements as Array<{
            atomicNumber: number;
            symbol: string;
            name: string;
            atomicMass: string | number | null;
            electronicConfiguration?: string | null;
            standardState?: string | null;
            groupBlock?: string | null;
        }>)
            .map((raw) => {
                const symbol = raw.symbol;
                const period = derivePeriod(symbol);
                const group = GROUP_BY_SYMBOL.get(symbol) ?? 0;
                const series: 'main' | 'lanthanide' | 'actinide' =
                    LANTHANIDES.includes(symbol) ? 'lanthanide' : ACTINIDES.includes(symbol) ? 'actinide' : 'main';

                return {
                    atomicNumber: raw.atomicNumber,
                    symbol,
                    name: raw.name,
                    atomicMass: formatMass(raw.atomicMass),
                    electronicConfiguration: raw.electronicConfiguration || 'Unknown',
                    standardState: raw.standardState || 'unknown',
                    groupBlock: raw.groupBlock || 'metal',
                    period,
                    group,
                    series,
                    category: getCategory(raw.groupBlock || 'metal'),
                };
            })
            .sort((a, b) => a.atomicNumber - b.atomicNumber);
    }, []);

    const matches = useMemo(() => {
        const normalizedQuery = normalizeText(query);
        const result = new Set<string>();

        if (!normalizedQuery) return result;

        for (const el of elements) {
            const alias = SEARCH_ALIASES[el.symbol] ?? '';
            const text = normalizeText(`${el.name} ${el.symbol} ${alias}`);

            const direct = text.includes(normalizedQuery) || normalizedQuery.includes(text);
            const distance = levenshtein(text, normalizedQuery);
            const fuzzy = distance <= 3 || distance / Math.max(text.length, normalizedQuery.length) <= 0.34;

            if (direct || fuzzy) {
                result.add(el.symbol);
            }
        }

        return result;
    }, [elements, query]);

    const filterOptions = useMemo(() => {
        const unique = [...new Set(elements.map((e) => e.category))];
        return ['all', ...unique];
    }, [elements]);

    const palette = theme === 'light'
        ? {
            page: '#e8ecef',
            card: '#ffffff',
            border: '#b4bcc7',
            text: '#1a2736',
            subtle: '#3f5266',
            title: '#195f86',
            subtitle: '#2f6f94',
            empty: '#f2f4f7',
            shadow: '0 6px 18px rgba(26,42,60,0.09)',
            searchBg: '#ffffff',
            panel: '#f7fafc',
        }
        : {
            page: '#0d1220',
            card: '#121a2b',
            border: '#27324a',
            text: '#eaf0ff',
            subtle: '#9cabc9',
            title: '#e984a2',
            subtitle: '#9eb0e6',
            empty: '#0f1524',
            shadow: '0 8px 28px rgba(0,0,0,0.45)',
            searchBg: '#111a2d',
            panel: '#11192a',
        };

    const mainElements = elements.filter((e) => e.series === 'main');
    const lanthanides = elements.filter((e) => e.series === 'lanthanide');
    const actinides = elements.filter((e) => e.series === 'actinide');

    const canStart = selectedLoadout.length === 3;

    const resolveStartSymbols = (currentSymbols: string[]) => {
        const inElements = new Set(elements.map((el) => el.symbol));
        const unique = [...new Set(currentSymbols)].filter((symbol) => inElements.has(symbol));
        const fallbackPool = [...DEFAULT_AUTO_LOADOUT, ...elements.map((el) => el.symbol)];

        for (const symbol of fallbackPool) {
            if (unique.length >= MAX_LOADOUT_SIZE) break;
            if (!inElements.has(symbol)) continue;
            if (unique.includes(symbol)) continue;
            unique.push(symbol);
        }

        return unique.slice(0, MAX_LOADOUT_SIZE);
    };

    const getSyncedLoadoutMap = (selfSymbols: string[]) => {
        const output: Record<string, string[]> = {};
        const current = readyPlayersRef.current;
        for (const [id, payload] of Object.entries(current)) {
            output[id] = resolveStartSymbols(payload.symbols);
        }
        if (multiplayerSync) {
            output[multiplayerSync.playerId] = resolveStartSymbols(selfSymbols);
        }
        return Object.keys(output).length > 0 ? output : undefined;
    };

    const startGameWithSymbols = (symbols: string[]) => {
        if (startedRef.current) return;
        const finalSymbols = resolveStartSymbols(symbols);
        const tryScheduleSyncedStart = (channel: BroadcastChannel, startNow: () => void) => {
            if (!multiplayerSync) return;
            if (plannedStartAtRef.current !== null) return;

            const readyPlayers = Object.values(readyPlayersRef.current);
            if (readyPlayers.length < multiplayerSync.expectedPlayers) return;
            if (!readyPayloadRef.current) return;

            const sortedIds = readyPlayers.map((p) => p.playerId).sort();
            if (sortedIds[0] !== multiplayerSync.playerId) return;

            const startAt = Date.now() + 800;
            plannedStartAtRef.current = startAt;
            channel.postMessage({
                type: 'loadout_start',
                payload: {
                    startAt,
                    expectedPlayers: multiplayerSync.expectedPlayers,
                } as LoadoutStartEvent,
            });
            const waitMs = Math.max(0, startAt - Date.now());
            syncStartTimerRef.current = window.setTimeout(startNow, waitMs);
        };

        const startNow = () => {
            if (startedRef.current) return;
            startedRef.current = true;
            if (autoStartTimerRef.current !== null) {
                window.clearInterval(autoStartTimerRef.current);
                autoStartTimerRef.current = null;
            }
            if (syncStartTimerRef.current !== null) {
                window.clearTimeout(syncStartTimerRef.current);
                syncStartTimerRef.current = null;
            }
            onStartGame(
                finalSymbols.map((symbol) => ({ symbol, imageUrl: getElementImageUrl(symbol) })),
                { syncedLoadoutsByPlayer: getSyncedLoadoutMap(finalSymbols) },
            );
        };

        if (!multiplayerSync) {
            startNow();
            return;
        }

        const channel = syncChannelRef.current;
        if (!channel) {
            startNow();
            return;
        }

        const selfReady: LoadoutReadyEvent = {
            playerId: multiplayerSync.playerId,
            symbols: finalSymbols,
            sentAt: Date.now(),
        };
        readyPayloadRef.current = selfReady;
        readyPlayersRef.current[multiplayerSync.playerId] = selfReady;
        channel.postMessage({ type: 'loadout_ready', payload: selfReady });
        tryScheduleSyncedStart(channel, startNow);
    };

    useEffect(() => {
        if (!multiplayerSync) return;

        const channelName = `bitchemical_loadout_${multiplayerSync.roomId}`;
        const channel = new BroadcastChannel(channelName);
        syncChannelRef.current = channel;

        const onMessage = (event: MessageEvent) => {
            const data = event.data as {
                type?: string;
                payload?: LoadoutReadyEvent | LoadoutStartEvent;
            };

            if (data.type === 'loadout_ready' && data.payload && 'playerId' in data.payload) {
                readyPlayersRef.current[data.payload.playerId] = data.payload;

                // Re-check coordination on every ready event to avoid deadlock when
                // the second player's ready arrives after local timeout callback.
                if (
                    multiplayerSync
                    && readyPayloadRef.current
                    && plannedStartAtRef.current === null
                    && syncChannelRef.current
                ) {
                    const readyPlayers = Object.values(readyPlayersRef.current);
                    if (readyPlayers.length >= multiplayerSync.expectedPlayers) {
                        const sortedIds = readyPlayers.map((p) => p.playerId).sort();
                        if (sortedIds[0] === multiplayerSync.playerId) {
                            const startAt = Date.now() + 800;
                            plannedStartAtRef.current = startAt;
                            syncChannelRef.current.postMessage({
                                type: 'loadout_start',
                                payload: {
                                    startAt,
                                    expectedPlayers: multiplayerSync.expectedPlayers,
                                } as LoadoutStartEvent,
                            });
                            const waitMs = Math.max(0, startAt - Date.now());
                            if (syncStartTimerRef.current !== null) {
                                window.clearTimeout(syncStartTimerRef.current);
                            }
                            syncStartTimerRef.current = window.setTimeout(() => {
                                if (startedRef.current) return;
                                const selfReady = readyPayloadRef.current;
                                if (!selfReady) return;
                                startedRef.current = true;
                                if (autoStartTimerRef.current !== null) {
                                    window.clearInterval(autoStartTimerRef.current);
                                    autoStartTimerRef.current = null;
                                }
                                onStartGame(
                                    selfReady.symbols.map((symbol) => ({ symbol, imageUrl: getElementImageUrl(symbol) })),
                                    {
                                        syncedLoadoutsByPlayer: Object.fromEntries(
                                            Object.entries(readyPlayersRef.current).map(([id, payload]) => [id, resolveStartSymbols(payload.symbols)]),
                                        ),
                                    },
                                );
                            }, waitMs);
                        }
                    }
                }
                return;
            }

            if (data.type === 'loadout_start' && data.payload && 'startAt' in data.payload) {
                if (startedRef.current) return;

                const selfReady = readyPayloadRef.current;
                if (!selfReady) {
                    startGameWithSymbols(selectedLoadoutRef.current);
                    return;
                }

                plannedStartAtRef.current = data.payload.startAt;
                const waitMs = Math.max(0, data.payload.startAt - Date.now());
                if (syncStartTimerRef.current !== null) {
                    window.clearTimeout(syncStartTimerRef.current);
                }
                syncStartTimerRef.current = window.setTimeout(() => {
                    if (startedRef.current) return;
                    startedRef.current = true;
                    if (autoStartTimerRef.current !== null) {
                        window.clearInterval(autoStartTimerRef.current);
                        autoStartTimerRef.current = null;
                    }
                    onStartGame(
                        selfReady.symbols.map((symbol) => ({ symbol, imageUrl: getElementImageUrl(symbol) })),
                        { syncedLoadoutsByPlayer: getSyncedLoadoutMap(selfReady.symbols) },
                    );
                }, waitMs);
            }
        };

        channel.addEventListener('message', onMessage);

        return () => {
            channel.removeEventListener('message', onMessage);
            channel.close();
            if (syncChannelRef.current === channel) {
                syncChannelRef.current = null;
            }
        };
    // onStartGame is stable from parent useCallback and safe here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [multiplayerSync?.roomId, multiplayerSync?.playerId, multiplayerSync?.expectedPlayers]);

    useEffect(() => {
        autoStartTimerRef.current = window.setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    if (autoStartTimerRef.current !== null) {
                        window.clearInterval(autoStartTimerRef.current);
                        autoStartTimerRef.current = null;
                    }
                    startGameWithSymbols(selectedLoadoutRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (autoStartTimerRef.current !== null) {
                window.clearInterval(autoStartTimerRef.current);
                autoStartTimerRef.current = null;
            }
        };
        // run once on screen mount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const showElement = (e: PeriodicElement) => {
        if (filter !== 'all' && e.category !== filter) return false;
        if (query.length === 0) return true;
        return matches.has(e.symbol);
    };

    const resolveColor = (e: PeriodicElement) => {
        if (theme !== 'light') {
            const darkStyle = CATEGORY_COLORS[e.category] ?? CATEGORY_COLORS.metal;
            return darkStyle.dark;
        }

        if (e.series === 'lanthanide' || e.series === 'actinide') return '#efe88e';
        if (e.group === 1 || e.group === 2) return '#b8e37f';
        if (e.group >= 3 && e.group <= 12) return '#efe56e';
        if (e.group >= 13 && e.group <= 16) return '#ebb0d0';
        if (e.group === 17) return '#dfb8e8';
        if (e.group === 18) return '#9ed8cf';
        return '#ead4dd';
    };

    const toggleLoadout = (symbol: string) => {
        setSelectedLoadout((prev) => {
            if (prev.includes(symbol)) return prev.filter((s) => s !== symbol);
            if (prev.length >= 3) return prev;
            return [...prev, symbol];
        });
    };

    const handleCellEnter = (_event: MouseEvent<HTMLButtonElement>, el: PeriodicElement) => {
        if (hideTimerRef.current !== null) {
            window.clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
        }
        if (showTimerRef.current !== null) {
            window.clearTimeout(showTimerRef.current);
            showTimerRef.current = null;
        }

        setHoverCard({
            element: el,
            imageUrl: getElementImageUrl(el.symbol),
        });

        setHoverCardVisible(false);
        showTimerRef.current = window.setTimeout(() => {
            setHoverCardVisible(true);
        }, 100);
    };

    const handleCellLeave = (symbol: string) => {
        if (showTimerRef.current !== null) {
            window.clearTimeout(showTimerRef.current);
            showTimerRef.current = null;
        }

        setHoverCardVisible(false);
        hideTimerRef.current = window.setTimeout(() => {
            setHoverCard((current) => (current?.element.symbol === symbol ? null : current));
        }, 140);
    };

    const renderElementCell = (el: PeriodicElement, isSeriesRow = false) => {
        const visible = showElement(el);
        const selected = selectedLoadout.includes(el.symbol);
        const matched = matches.has(el.symbol) && query.length > 0;
        const cellImageUrl = getElementImageUrl(el.symbol);

        return (
            <button
                key={`${el.symbol}-${isSeriesRow ? 'series' : 'main'}`}
                onMouseEnter={(event) => handleCellEnter(event, el)}
                onMouseLeave={() => handleCellLeave(el.symbol)}
                onClick={() => toggleLoadout(el.symbol)}
                style={{
                    width: '100%',
                    aspectRatio: '1 / 1',
                    minHeight: 34,
                    borderRadius: 4,
                    border: selected ? '2px solid #2da86b' : matched ? '2px solid #f1b82e' : `1px solid ${palette.border}`,
                    background: visible ? resolveColor(el) : palette.empty,
                    color: theme === 'light' ? '#222' : '#f6f8ff',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '4px 4px 14px 4px',
                    transform: hoverCard?.element.symbol === el.symbol && hoverCardVisible ? 'scale(1.04)' : 'scale(1)',
                    transition: 'transform .16s ease, box-shadow .16s ease, border-color .16s ease',
                    boxShadow: hoverCard?.element.symbol === el.symbol && hoverCardVisible ? '0 10px 18px rgba(20,37,58,0.24)' : 'none',
                    opacity: visible ? 1 : 0.35,
                    position: 'relative',
                }}
            >
                <span style={{ position: 'absolute', top: 4, left: 5, fontSize: 'clamp(7px, 0.72vw, 9px)', textAlign: 'left', opacity: 0.86 }}>{el.atomicNumber}</span>
                {cellImageUrl ? (
                    <span
                        style={{
                            width: '62%',
                            aspectRatio: '1 / 1',
                            borderRadius: '50%',
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            pointerEvents: 'none',
                        }}
                    >
                        <img
                            src={cellImageUrl}
                            alt={el.symbol}
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                opacity: 0.95,
                                display: 'block',
                            }}
                        />
                    </span>
                ) : null}
                <span style={{ position: 'absolute', right: 5, bottom: 4, fontSize: 'clamp(10px, 1.15vw, 16px)', lineHeight: 1, textAlign: 'center', fontWeight: 900 }}>{el.symbol}</span>
                {selected && (
                    <span style={{
                        position: 'absolute',
                        top: 2,
                        right: 2,
                        fontSize: 9,
                        color: '#0f6a3f',
                        background: '#c7f3dc',
                        borderRadius: 8,
                        padding: '1px 4px',
                        fontWeight: 800,
                    }}>
                        PICK
                    </span>
                )}
            </button>
        );
    };

    const getElementAtMainGrid = (period: number, group: number) => {
        return mainElements.find((el) => el.period === period && el.group === group) ?? null;
    };

    return (
        <div style={{ minHeight: '100vh', background: palette.page, padding: 10, color: palette.text, transition: 'background .25s ease' }}>
            <div style={{ width: '100%', margin: '0 auto' }}>
                <div style={{ minHeight: 'calc(100vh - 20px)', background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 8, boxShadow: palette.shadow, padding: 14, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                        <div style={{ flex: 1, minWidth: 280, textAlign: 'center' }}>
                            <div style={{ fontSize: 'clamp(20px, 3.2vw, 34px)', fontWeight: 800, color: palette.title, letterSpacing: 0.6, fontFamily: 'Cambria, Times New Roman, serif' }}>Cam nang su dung BANG TUAN HOAN CAC NGUYEN TO HOA HOC</div>
                            <div style={{ fontSize: 'clamp(12px, 1.7vw, 18px)', fontStyle: 'italic', color: palette.subtitle, fontFamily: 'Cambria, Times New Roman, serif' }}>Phien ban mo phong giao khoa - bo cuc nhom IA den VIIIA</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button
                                onClick={() => setTheme((m) => (m === 'light' ? 'dark' : 'light'))}
                                style={{ border: `1px solid ${palette.border}`, background: palette.panel, borderRadius: 10, color: palette.text, padding: '9px 12px', fontWeight: 700, cursor: 'pointer' }}
                            >
                                {theme === 'light' ? 'Dark mode' : 'Light mode'}
                            </button>
                            <button
                                onClick={onBack}
                                style={{ border: `1px solid ${palette.border}`, background: palette.panel, borderRadius: 10, color: palette.text, padding: '9px 12px', fontWeight: 700, cursor: 'pointer' }}
                            >
                                Quay lai
                            </button>
                        </div>
                    </div>

                    <div className="loadout-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 360px)', gap: 14, alignItems: 'start', flex: 1 }}>
                        <div style={{ position: 'relative' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                                <input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search by name / symbol (e.g. Iron, Fe, oxy, chlorine)"
                                    style={{
                                        flex: 1,
                                        borderRadius: 8,
                                        border: `1px solid ${palette.border}`,
                                        background: palette.searchBg,
                                        color: palette.text,
                                        padding: '10px 12px',
                                        fontSize: 14,
                                        outline: 'none',
                                    }}
                                />
                                <select
                                    value={filter}
                                    onChange={(e) => setFilter(e.target.value)}
                                    style={{
                                        width: 240,
                                        maxWidth: '100%',
                                        borderRadius: 8,
                                        border: `1px solid ${palette.border}`,
                                        background: palette.searchBg,
                                        color: palette.text,
                                        padding: '10px 12px',
                                        fontSize: 14,
                                        outline: 'none',
                                    }}
                                >
                                    {filterOptions.map((opt) => (
                                        <option key={opt} value={opt}>{opt === 'all' ? 'All groups' : (CATEGORY_COLORS[opt]?.label ?? opt)}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="periodic-board" style={{ width: '100%', border: `1px solid ${palette.border}`, borderRadius: 6, padding: 6, background: theme === 'light' ? '#fcfdff' : '#0f1728', position: 'relative', overflow: 'hidden' }}>
                                <div style={{
                                    position: 'absolute',
                                    top: 30,
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    width: 460,
                                    maxWidth: 'calc(100% - 20px)',
                                    minHeight: 122,
                                    border: `1px solid ${palette.border}b3`,
                                    borderRadius: 14,
                                    background: theme === 'light' ? 'rgba(246, 250, 255, 0.94)' : 'rgba(17, 27, 43, 0.9)',
                                    boxShadow: hoverCard ? `0 14px 28px rgba(20,37,58,0.2), 0 0 0 1px ${resolveColor(hoverCard.element)}50` : '0 10px 22px rgba(20,37,58,0.14)',
                                    opacity: hoverCard ? (hoverCardVisible ? 1 : 0.85) : 0.94,
                                    transition: 'opacity .18s ease, transform .18s ease, box-shadow .18s ease',
                                    zIndex: 30,
                                    pointerEvents: 'none',
                                    backdropFilter: 'blur(4px)',
                                }}>
                                    {hoverCard?.imageUrl && (
                                        <img
                                            src={hoverCard.imageUrl}
                                            alt={hoverCard.element.symbol}
                                            style={{
                                                position: 'absolute',
                                                right: 0,
                                                top: 0,
                                                width: 1,
                                                height: 1,
                                                objectFit: 'cover',
                                                opacity: 0,
                                            }}
                                        />
                                    )}

                                    {hoverCard ? (
                                        <div style={{
                                            position: 'relative',
                                            minHeight: 122,
                                            padding: '10px 12px',
                                            display: 'grid',
                                            gridTemplateColumns: '72px minmax(0, 1fr) 96px',
                                            gap: 12,
                                            alignItems: 'center',
                                        }}>
                                            <div style={{
                                                width: 72,
                                                height: 72,
                                                borderRadius: 10,
                                                border: `1px solid ${palette.border}`,
                                                background: resolveColor(hoverCard.element),
                                                display: 'flex',
                                                flexDirection: 'column',
                                                justifyContent: 'center',
                                                alignItems: 'center',
                                            }}>
                                                <div style={{ fontSize: 11, opacity: 0.78 }}>#{hoverCard.element.atomicNumber}</div>
                                                <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1 }}>{hoverCard.element.symbol}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.05 }}>{hoverCard.element.name}</div>
                                                <div style={{ marginTop: 6, fontSize: 15, color: palette.subtle }}>Mass: {hoverCard.element.atomicMass}</div>
                                                <div style={{ marginTop: 3, fontSize: 15, color: palette.subtle }}>{CATEGORY_COLORS[hoverCard.element.category]?.label ?? hoverCard.element.category}</div>
                                                <div style={{ marginTop: 3, fontSize: 15, color: palette.subtle }}>State: {hoverCard.element.standardState}</div>
                                            </div>
                                            <div style={{
                                                width: 92,
                                                height: 92,
                                                borderRadius: 14,
                                                overflow: 'hidden',
                                                border: `1px solid ${palette.border}`,
                                                background: theme === 'light' ? '#ffffff' : '#0d1424',
                                                boxShadow: '0 6px 16px rgba(20,37,58,0.22)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}>
                                                {hoverCard.imageUrl ? (
                                                    <img
                                                        src={hoverCard.imageUrl}
                                                        alt={hoverCard.element.name}
                                                        style={{
                                                            width: '100%',
                                                            height: '100%',
                                                            objectFit: 'cover',
                                                            opacity: 1,
                                                        }}
                                                    />
                                                ) : (
                                                    <span style={{ fontSize: 11, color: palette.subtle, textAlign: 'center', padding: 6 }}>
                                                        No image
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{
                                            minHeight: 122,
                                            padding: '10px 12px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: palette.subtle,
                                            textAlign: 'center',
                                            fontSize: 14,
                                            fontStyle: 'italic',
                                        }}>
                                            Di chuot vao mot nguyen to de xem thong so chi tiet.
                                        </div>
                                    )}
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(22px, 0.6fr) repeat(18, minmax(0, 1fr))', gap: 4, marginBottom: 4 }}>
                                    <div />
                                    {Array.from({ length: 18 }).map((_, i) => {
                                        const g = GROUP_LABELS.find((x) => x.group === i + 1);
                                        return (
                                            <div key={`group-${i + 1}`} style={{ textAlign: 'center', fontSize: 'clamp(8px, 0.9vw, 11px)', fontWeight: 700, color: '#395b7a', fontFamily: 'Cambria, serif' }}>
                                                {g?.label ?? ''}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(22px, 0.6fr) repeat(18, minmax(0, 1fr))', gap: 4 }}>
                                    {Array.from({ length: 7 }).flatMap((_, periodIdx) => {
                                        const period = periodIdx + 1;
                                        const row = [
                                            <div key={`period-${period}`} style={{ width: '100%', aspectRatio: '1 / 1', minHeight: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#2f6183', fontSize: 'clamp(10px, 1vw, 12px)', fontFamily: 'Cambria, serif' }}>{period}</div>,
                                        ];

                                        for (let group = 1; group <= 18; group++) {
                                            const el = getElementAtMainGrid(period, group);
                                            if (!el) {
                                                row.push(
                                                    <div key={`empty-${period}-${group}`} style={{ width: '100%', aspectRatio: '1 / 1', minHeight: 30, borderRadius: 4, border: 'none', background: 'transparent' }} />,
                                                );
                                            } else {
                                                row.push(renderElementCell(el));
                                            }
                                        }

                                        return row;
                                    })}
                                </div>

                                <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'minmax(22px, 0.6fr) repeat(18, minmax(0, 1fr))', gap: 4 }}>
                                    <div style={{ width: '100%', aspectRatio: '1 / 1', minHeight: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 'clamp(8px, 0.8vw, 10px)', color: '#486886', fontFamily: 'Cambria, serif' }}>Lanthanide</div>
                                    <div style={{ width: '100%', aspectRatio: '1 / 1', minHeight: 30, border: 'none', borderRadius: 4, background: 'transparent' }} />
                                    <div style={{ width: '100%', aspectRatio: '1 / 1', minHeight: 30, border: 'none', borderRadius: 4, background: 'transparent' }} />
                                    {lanthanides.map((el) => renderElementCell(el, true))}
                                    <div style={{ width: '100%', aspectRatio: '1 / 1', minHeight: 30 }} />
                                </div>

                                <div style={{ marginTop: 4, display: 'grid', gridTemplateColumns: 'minmax(22px, 0.6fr) repeat(18, minmax(0, 1fr))', gap: 4 }}>
                                    <div style={{ width: '100%', aspectRatio: '1 / 1', minHeight: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 'clamp(8px, 0.8vw, 10px)', color: '#486886', fontFamily: 'Cambria, serif' }}>Actinide</div>
                                    <div style={{ width: '100%', aspectRatio: '1 / 1', minHeight: 30, border: 'none', borderRadius: 4, background: 'transparent' }} />
                                    <div style={{ width: '100%', aspectRatio: '1 / 1', minHeight: 30, border: 'none', borderRadius: 4, background: 'transparent' }} />
                                    {actinides.map((el) => renderElementCell(el, true))}
                                    <div style={{ width: '100%', aspectRatio: '1 / 1', minHeight: 30 }} />
                                </div>

                                <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                    {Object.entries(CATEGORY_COLORS).map(([key, value]) => (
                                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, color: palette.subtle, fontSize: 12 }}>
                                            <span style={{ width: 14, height: 14, borderRadius: 2, border: `1px solid ${palette.border}`, background: theme === 'light' ? value.light : value.dark }} />
                                            {value.label}
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </div>

                        <div style={{ border: `1px solid ${palette.border}`, borderRadius: 10, background: palette.panel, padding: 12, height: '100%' }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: palette.subtle }}>Loadout (3 vien dan)</div>
                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 186 }}>
                                {selectedLoadout.map((symbol) => {
                                    const el = elements.find((item) => item.symbol === symbol);
                                    if (!el) return null;
                                    return (
                                        <button
                                            key={symbol}
                                            onClick={() => toggleLoadout(symbol)}
                                            style={{
                                                border: `1px solid ${palette.border}`,
                                                borderRadius: 8,
                                                background: '#1ea46615',
                                                color: palette.text,
                                                textAlign: 'left',
                                                padding: '8px 10px',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            <div style={{ fontSize: 15, fontWeight: 800 }}>{el.symbol} - {el.name}</div>
                                            <div style={{ marginTop: 2, fontSize: 12, color: palette.subtle }}>Mass: {el.atomicMass} | {CATEGORY_COLORS[el.category]?.label ?? el.category}</div>
                                        </button>
                                    );
                                })}
                            </div>

                            <div style={{ marginTop: 8, fontSize: 12, color: palette.subtle, lineHeight: 1.6 }}>
                                Click 1 lan de chon nguyen to, click lan nua de bo chon. Re chuot vao o nguyen to de xem thong so.
                            </div>

                            <div style={{ marginTop: 8, fontSize: 12, color: '#b45309', fontWeight: 700 }}>
                                Tu dong vao game sau {countdown}s. Neu chua chon du, he thong se tu chon mac dinh.
                            </div>

                            <button
                                onClick={() => startGameWithSymbols(selectedLoadout)}
                                disabled={!canStart}
                                style={{
                                    marginTop: 12,
                                    width: '100%',
                                    borderRadius: 10,
                                    padding: '12px 14px',
                                    fontWeight: 800,
                                    border: canStart ? '2px solid #2da86b' : `2px solid ${palette.border}`,
                                    background: canStart ? '#2da86b22' : palette.empty,
                                    color: canStart ? '#1f7f50' : palette.subtle,
                                    cursor: canStart ? 'pointer' : 'not-allowed',
                                    textTransform: 'uppercase',
                                }}
                            >
                                Bat Dau ({countdown}s)
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                @media (max-width: 1240px) {
                    .loadout-layout {
                        grid-template-columns: 1fr !important;
                    }
                }

                @media (max-width: 820px) {
                    .periodic-board {
                        overflow-x: auto;
                    }
                }

                @media (max-width: 640px) {
                    .periodic-board {
                        transform: scale(0.94);
                        transform-origin: top center;
                    }
                }
            `}</style>
        </div>
    );
}

