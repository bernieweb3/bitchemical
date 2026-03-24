import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { getMatchSocket } from '../../network/matchSocket';

type TeamId = 'A' | 'B';

type MatchMode = 'pvp-1v1' | 'pvp-2v2' | 'pvp-3v3';

interface RemotePlayer {
    id: string;
    name: string;
    x: number;
    y: number;
    hp: number;
    team: TeamId;
    alive: boolean;
}

interface RemoteProjectile {
    id: string;
    x: number;
    y: number;
    team: TeamId;
}

interface StatePayload {
    players: RemotePlayer[];
    projectiles: RemoteProjectile[];
    remainingMs: number;
}

interface MultiplayerInitData {
    roomId: string;
    mode: MatchMode;
    playerId: string;
    team: TeamId;
}

interface InputState {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    shoot: boolean;
    aimX: number;
    aimY: number;
}

export class MultiplayerBattleScene extends Phaser.Scene {
    private roomId = '';
    private playerId = '';
    private team: TeamId = 'A';
    private mode: MatchMode = 'pvp-1v1';
    private state: StatePayload = { players: [], projectiles: [], remainingMs: 180000 };
    private socket = getMatchSocket();
    private gfx!: Phaser.GameObjects.Graphics;

    private keyA!: Phaser.Input.Keyboard.Key;
    private keyD!: Phaser.Input.Keyboard.Key;
    private keyW!: Phaser.Input.Keyboard.Key;
    private keyS!: Phaser.Input.Keyboard.Key;
    private inputState: InputState = {
        left: false,
        right: false,
        up: false,
        down: false,
        shoot: false,
        aimX: GAME_WIDTH / 2,
        aimY: GAME_HEIGHT / 2,
    };

    private inputSendAccumulator = 0;
    private gameOver = false;
    public onGameOver?: (winner: string, playerHp: number, aiHp: number) => void;

    constructor() {
        super({ key: 'MultiplayerBattleScene' });
    }

    init(data: MultiplayerInitData) {
        this.roomId = data.roomId;
        this.playerId = data.playerId;
        this.team = data.team;
        this.mode = data.mode;
    }

    create() {
        this.gfx = this.add.graphics();

        this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
        this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
        this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
        this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);

        const pointer = this.input.activePointer;
        this.inputState.aimX = pointer.worldX;
        this.inputState.aimY = pointer.worldY;

        this.input.on('pointerdown', () => {
            this.inputState.shoot = true;
        });

        this.socket.emit('join_room_runtime', { roomId: this.roomId });

        this.socket.on('state_update', this.handleStateUpdate);
        this.socket.on('game_over', this.handleGameOverEvent);
    }

    update(_time: number, delta: number) {
        this.handleInput();
        this.sendInput(delta);
        this.drawWorld();
    }

    private handleInput() {
        const pointer = this.input.activePointer;
        this.inputState.left = this.keyA.isDown;
        this.inputState.right = this.keyD.isDown;
        this.inputState.up = this.keyW.isDown;
        this.inputState.down = this.keyS.isDown;
        this.inputState.aimX = pointer.worldX;
        this.inputState.aimY = pointer.worldY;
    }

    private sendInput(delta: number) {
        this.inputSendAccumulator += delta;
        if (this.inputSendAccumulator < 33) return;
        this.inputSendAccumulator = 0;

        this.socket.emit('player_input', {
            roomId: this.roomId,
            playerId: this.playerId,
            input: this.inputState,
        });

        this.inputState.shoot = false;
    }

    private handleStateUpdate = (payload: { roomId: string; state: StatePayload }) => {
        if (payload.roomId !== this.roomId) return;
        this.state = payload.state;
    };

    private handleGameOverEvent = (payload: { roomId: string; winnerTeam: TeamId | 'draw' }) => {
        if (payload.roomId !== this.roomId || this.gameOver) return;
        this.gameOver = true;
        const winner = payload.winnerTeam === 'draw'
            ? 'DRAW'
            : payload.winnerTeam === this.team
                ? 'TEAM WIN'
                : 'TEAM LOSE';

        const myTeamHp = this.state.players.filter((p) => p.team === this.team).reduce((sum, p) => sum + p.hp, 0);
        const enemyTeamHp = this.state.players.filter((p) => p.team !== this.team).reduce((sum, p) => sum + p.hp, 0);
        this.onGameOver?.(winner, myTeamHp, enemyTeamHp);
    };

    private drawWorld() {
        const g = this.gfx;
        g.clear();

        // Background
        g.fillStyle(0x0b1320);
        g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        // Mid line
        g.lineStyle(2, 0x334155, 0.8);
        g.lineBetween(GAME_WIDTH / 2, 0, GAME_WIDTH / 2, GAME_HEIGHT);

        // Players
        for (const p of this.state.players) {
            if (!p.alive) continue;
            const isSelf = p.id === this.playerId;
            const color = p.team === 'A' ? 0x22c55e : 0xef4444;
            g.fillStyle(color, isSelf ? 1 : 0.85);
            g.fillCircle(p.x, p.y, 18);

            g.lineStyle(2, isSelf ? 0xffffff : 0x111827, 0.9);
            g.strokeCircle(p.x, p.y, 18);

            g.fillStyle(0x111827, 0.8);
            g.fillRect(p.x - 22, p.y - 30, 44, 6);
            g.fillStyle(0x22c55e, 1);
            g.fillRect(p.x - 22, p.y - 30, 44 * Phaser.Math.Clamp(p.hp / 100, 0, 1), 6);

            this.addOrUpdateLabel(`name_${p.id}`, p.name, p.x, p.y - 44, isSelf ? '#ffffff' : '#dbeafe');
        }

        // Projectiles
        for (const b of this.state.projectiles) {
            g.fillStyle(b.team === 'A' ? 0x86efac : 0xfca5a5, 0.95);
            g.fillCircle(b.x, b.y, 6);
        }

        const timeSec = Math.max(0, Math.ceil(this.state.remainingMs / 1000));
        this.addOrUpdateLabel('hud_mode', `Mode: ${this.mode.toUpperCase()}`, 110, 24, '#93c5fd', 0);
        this.addOrUpdateLabel('hud_team', `Team: ${this.team}`, 110, 46, this.team === 'A' ? '#22c55e' : '#ef4444', 0);
        this.addOrUpdateLabel('hud_time', `Time: ${timeSec}s`, GAME_WIDTH / 2, 24, '#f8fafc');

        if (this.gameOver) {
            g.fillStyle(0x000000, 0.65);
            g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        }
    }

    private addOrUpdateLabel(key: string, text: string, x: number, y: number, color: string, originX = 0.5) {
        let label = this.children.getByName(key) as Phaser.GameObjects.Text | null;
        if (!label) {
            label = this.add.text(x, y, text, {
                fontFamily: 'Courier New',
                fontSize: '14px',
                color,
            }).setName(key).setOrigin(originX, 0.5).setDepth(100);
        }
        label.setPosition(x, y);
        label.setText(text);
        label.setColor(color);
    }

    shutdown() {
        this.socket.off('state_update', this.handleStateUpdate);
        this.socket.off('game_over', this.handleGameOverEvent);
    }
}
