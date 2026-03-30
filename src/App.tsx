import { useState, useCallback, useEffect } from 'react';
import { MainMenu } from './components/MainMenu';
import { GameCanvas } from './components/GameCanvas';
import { GameOverScreen } from './components/GameOverScreen';
import { ElementLoadoutScreen } from './components/ElementLoadoutScreen.tsx';
import { MatchmakingScreen, type MatchFoundPayload } from './components/MatchmakingScreen';
import type { SelectedLoadoutItem } from './components/ElementLoadoutScreen.tsx';
import { isMultiplayerMode, type GameMode } from './types/gameMode';
import './App.css';
import './components/MatchmakingScreen.css';

type Screen = 'menu' | 'loadout' | 'matchmaking' | 'game' | 'gameover';

interface GameResult {
    winner: string;
    playerHp: number;
    aiHp: number;
}

function App() {
    const [screen, setScreen] = useState<Screen>('menu');
    const [gameResult, setGameResult] = useState<GameResult | null>(null);
    const [gameKey, setGameKey] = useState(0);
    const [selectedElements, setSelectedElements] = useState<string[]>(['K', 'Fe', 'Br']);
    const [selectedElementImageUrls, setSelectedElementImageUrls] = useState<Record<string, string>>({});
    const [syncedLoadoutsByPlayer, setSyncedLoadoutsByPlayer] = useState<Record<string, string[]> | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [selectedMode, setSelectedMode] = useState<GameMode>('vs-ai');
    const [playerNickname] = useState(`Player${Math.floor(1000 + Math.random() * 9000)}`);
    const [matchedRoom, setMatchedRoom] = useState<MatchFoundPayload | null>(null);

    const handleStartGame = useCallback((mode: GameMode) => {
        setSelectedMode(mode);
        if (mode === 'vs-ai') {
            setMatchedRoom(null);
            setScreen('loadout');
            return;
        }
        setScreen('matchmaking');
    }, []);
    const handleMatched = useCallback((payload: MatchFoundPayload) => {
        setMatchedRoom(payload);
        setScreen('loadout');
    }, []);


    const handleStartWithLoadout = useCallback((
        elements: SelectedLoadoutItem[],
        syncContext?: { syncedLoadoutsByPlayer?: Record<string, string[]> },
    ) => {
        setSelectedElements(elements.map((item) => item.symbol));
        setSelectedElementImageUrls(
            elements.reduce<Record<string, string>>((acc, item) => {
                if (item.imageUrl) {
                    acc[item.symbol] = item.imageUrl;
                }
                return acc;
            }, {})
        );
        setSyncedLoadoutsByPlayer(syncContext?.syncedLoadoutsByPlayer ?? null);
        setGameKey((k) => k + 1);
        setScreen('game');
    }, []);

    const handleGameOver = useCallback((winner: string, playerHp: number, aiHp: number) => {
        setGameResult({ winner, playerHp, aiHp });
        // Short delay before showing game over screen
        setTimeout(() => setScreen('gameover'), 1500);
    }, []);

    const handlePlayAgain = useCallback(() => {
        if (isMultiplayerMode(selectedMode)) {
            setMatchedRoom(null);
            setScreen('matchmaking');
            return;
        }
        setGameKey((k) => k + 1);
        setScreen('game');
    }, [selectedMode]);

    const handleMainMenu = useCallback(() => {
        setMatchedRoom(null);
        setSyncedLoadoutsByPlayer(null);
        setSelectedMode('vs-ai');
        setScreen('menu');
    }, []);

    const handleToggleFullscreen = useCallback(async () => {
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
                setIsFullscreen(true);
            } else {
                await document.exitFullscreen();
                setIsFullscreen(false);
            }
        } catch {
            // Ignore fullscreen errors on unsupported/blocked contexts.
        }
    }, []);

    const handleExitGame = useCallback(() => {
        setMatchedRoom(null);
        setSyncedLoadoutsByPlayer(null);
        setScreen('menu');
    }, []);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(Boolean(document.fullscreenElement));
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    return (
        <div className="app-root">
            {screen === 'menu' && <MainMenu onStartGame={handleStartGame} />}
            {screen === 'loadout' && (
                <ElementLoadoutScreen
                    onStartGame={handleStartWithLoadout}
                    onBack={() => setScreen(isMultiplayerMode(selectedMode) ? 'matchmaking' : 'menu')}
                    multiplayerSync={isMultiplayerMode(selectedMode) && matchedRoom
                        ? {
                            roomId: matchedRoom.roomId,
                            playerId: matchedRoom.playerId,
                            expectedPlayers: matchedRoom.players.length,
                        }
                        : null}
                />
            )}
            {screen === 'matchmaking' && selectedMode !== 'vs-ai' && (
                <MatchmakingScreen
                    mode={selectedMode}
                    nickname={playerNickname}
                    onBack={() => setScreen('menu')}
                    onMatched={handleMatched}
                />
            )}
            {screen === 'game' && (
                <div className="game-container full-viewport">
                    <div className="game-controls">
                        <button className="game-control-btn" onClick={handleToggleFullscreen}>
                            {isFullscreen ? 'Thoat toan man hinh' : 'Toan man hinh'}
                        </button>
                        <button className="game-control-btn exit" onClick={handleExitGame}>
                            Thoat game
                        </button>
                    </div>
                    <GameCanvas
                        key={gameKey}
                        onGameOver={handleGameOver}
                        selectedElements={selectedElements}
                        selectedElementImageUrls={selectedElementImageUrls}
                        syncedLoadoutsByPlayer={syncedLoadoutsByPlayer}
                        gameMode={selectedMode}
                        multiplayerMatch={isMultiplayerMode(selectedMode) ? matchedRoom : null}
                        fullViewport
                    />
                </div>
            )}
            {screen === 'gameover' && gameResult && (
                <GameOverScreen
                    winner={gameResult.winner}
                    playerHp={gameResult.playerHp}
                    aiHp={gameResult.aiHp}
                    onPlayAgain={handlePlayAgain}
                    onMainMenu={handleMainMenu}
                />
            )}
        </div>
    );
}

export default App;
