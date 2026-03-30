import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../game/config';
import { BootScene } from '../game/scenes/BootScene';
import { BattleScene } from '../game/scenes/BattleScene';
import type { MatchFoundPayload } from './MatchmakingScreen';
import type { GameMode } from '../types/gameMode';

interface GameCanvasProps {
    onGameOver: (winner: string, playerHp: number, aiHp: number) => void;
    selectedElements: string[];
    selectedElementImageUrls: Record<string, string>;
    syncedLoadoutsByPlayer: Record<string, string[]> | null;
    gameMode: GameMode;
    multiplayerMatch: MatchFoundPayload | null;
    fullViewport?: boolean;
}

export function GameCanvas({
    onGameOver,
    selectedElements,
    selectedElementImageUrls,
    syncedLoadoutsByPlayer,
    gameMode,
    multiplayerMatch,
    fullViewport = false,
}: GameCanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const gameRef = useRef<Phaser.Game | null>(null);

    useEffect(() => {
        if (!containerRef.current || gameRef.current) return;

        const scenes = [BootScene, BattleScene];
        const localBattleMode = gameMode === 'pvp-1v1'
            ? (multiplayerMatch?.team === 'A' ? 'local-1v1-host' : multiplayerMatch?.team === 'B' ? 'local-1v1-client' : 'local-1v1')
            : 'vs-ai';

        const config: Phaser.Types.Core.GameConfig = {
            type: Phaser.CANVAS,
            width: GAME_WIDTH,
            height: GAME_HEIGHT,
            parent: containerRef.current,
            backgroundColor: '#0d0d1a',
            scene: scenes,
            physics: {
                default: 'arcade',
                arcade: { gravity: { x: 0, y: 0 }, debug: false },
            },
            scale: {
                mode: Phaser.Scale.FIT,
                autoCenter: Phaser.Scale.CENTER_BOTH,
            },
            callbacks: {
                preBoot: (game) => {
                    game.registry.set('selectedElements', selectedElements);
                    game.registry.set('selectedElementImageUrls', selectedElementImageUrls);
                    game.registry.set('syncedLoadoutsByPlayer', syncedLoadoutsByPlayer);
                    game.registry.set('battleMode', localBattleMode);
                    const opponent = multiplayerMatch?.players.find((player) => player.id !== multiplayerMatch.playerId);
                    game.registry.set('localRealtimeMatch', multiplayerMatch ? {
                        roomId: multiplayerMatch.roomId,
                        playerId: multiplayerMatch.playerId,
                        team: multiplayerMatch.team,
                        opponentPlayerId: opponent?.id,
                    } : null);
                },
            },
        };

        const game = new Phaser.Game(config);
        gameRef.current = game;

        // Pass callback to active gameplay scene.
        game.events.once('ready', () => {
            const battleScene = game.scene.getScene('BattleScene') as BattleScene;
            if (battleScene) {
                battleScene.onGameOver = onGameOver;
            }
        });

        game.scene.start('BootScene');

        // Listen for scene start to pass callback
        game.events.on('step', () => {
            const battle = game.scene.getScene('BattleScene') as BattleScene;
            if (battle && battle.scene.isActive()) {
                battle.onGameOver = onGameOver;
            }
        });

        return () => {
            gameRef.current?.destroy(true);
            gameRef.current = null;
        };
    }, [onGameOver, selectedElements, selectedElementImageUrls, syncedLoadoutsByPlayer, gameMode, multiplayerMatch]);

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                maxWidth: fullViewport ? '100vw' : GAME_WIDTH,
                height: fullViewport ? '100vh' : 'auto',
                aspectRatio: fullViewport ? undefined : `${GAME_WIDTH}/${GAME_HEIGHT}`,
                margin: '0 auto',
                borderRadius: fullViewport ? '0' : '12px',
                overflow: 'hidden',
                boxShadow: '0 0 40px rgba(76, 175, 80, 0.15), 0 0 80px rgba(0,0,0,0.6)',
                border: fullViewport ? '0' : '2px solid rgba(76, 175, 80, 0.2)',
            }}
        />
    );
}
