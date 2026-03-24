import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../game/config';
import { BootScene } from '../game/scenes/BootScene';
import { BattleScene } from '../game/scenes/BattleScene';
import { MultiplayerBattleScene } from '../game/scenes/MultiplayerBattleScene';
import type { MatchFoundPayload } from './MatchmakingScreen';
import type { GameMode } from '../types/gameMode';

interface GameCanvasProps {
    onGameOver: (winner: string, playerHp: number, aiHp: number) => void;
    selectedElements: string[];
    selectedElementImageUrls: Record<string, string>;
    gameMode: GameMode;
    multiplayerMatch: MatchFoundPayload | null;
    fullViewport?: boolean;
}

export function GameCanvas({
    onGameOver,
    selectedElements,
    selectedElementImageUrls,
    gameMode,
    multiplayerMatch,
    fullViewport = false,
}: GameCanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const gameRef = useRef<Phaser.Game | null>(null);

    useEffect(() => {
        if (!containerRef.current || gameRef.current) return;

        const isMultiplayer = gameMode !== 'vs-ai';
        const scenes = isMultiplayer ? [MultiplayerBattleScene] : [BootScene, BattleScene];

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
                    game.registry.set('multiplayerMatch', multiplayerMatch);
                },
            },
        };

        const game = new Phaser.Game(config);
        gameRef.current = game;

        // Pass callback to active gameplay scene.
        game.events.once('ready', () => {
            if (isMultiplayer) {
                const mpScene = game.scene.getScene('MultiplayerBattleScene') as MultiplayerBattleScene;
                if (mpScene) {
                    mpScene.onGameOver = onGameOver;
                }
                return;
            }
            const battleScene = game.scene.getScene('BattleScene') as BattleScene;
            if (battleScene) {
                battleScene.onGameOver = onGameOver;
            }
        });

        if (!isMultiplayer) {
            game.scene.start('BootScene');
        } else if (multiplayerMatch) {
            game.scene.start('MultiplayerBattleScene', {
                roomId: multiplayerMatch.roomId,
                mode: multiplayerMatch.mode,
                playerId: multiplayerMatch.playerId,
                team: multiplayerMatch.team,
            });
        }

        // Listen for scene start to pass callback
        game.events.on('step', () => {
            if (isMultiplayer) {
                const scene = game.scene.getScene('MultiplayerBattleScene');
                if (scene && scene.scene.isActive()) {
                    (scene as MultiplayerBattleScene).onGameOver = onGameOver;
                }
                return;
            }

            const battle = game.scene.getScene('BattleScene') as BattleScene;
            if (battle && battle.scene.isActive()) {
                battle.onGameOver = onGameOver;
            }
        });

        return () => {
            gameRef.current?.destroy(true);
            gameRef.current = null;
        };
    }, [onGameOver, selectedElements, selectedElementImageUrls, gameMode, multiplayerMatch]);

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
