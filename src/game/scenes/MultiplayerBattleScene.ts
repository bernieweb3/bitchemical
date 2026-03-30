import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, PLATFORMS } from '../config';
import { getMatchSocket } from '../../network/matchSocket';
import { ELEMENTS } from '../data/elements';

const IDLE_TEXTURE_KEY = 'scientist_idle_frame_0';
const IDLE_ANIM_KEY = 'scientist_idle';
const RUN_ANIM_KEY = 'scientist_run';
const MAX_HEALTH = 1000;
const MAX_MANA = 100;

type TeamId = 'A' | 'B';

type MatchMode = 'pvp-1v1';

interface RemotePlayer {
    id: string;
    name: string;
    x: number;
    y: number;
    vx?: number;
    vy?: number;
    w: number;
    h: number;
    hp: number;
    mana: number;
    team: TeamId;
    alive: boolean;
    facingRight: boolean;
    crouching?: boolean;
    selectedElements: string[];
    selectedElement: string;
    inventory: Record<string, number>;
}

interface RemoteProjectile {
    id: string;
    x: number;
    y: number;
    vx?: number;
    vy?: number;
    team: TeamId;
    element?: string;
}

interface RemoteBlock {
    x: number;
    y: number;
    element: string;
    hp: number;
    maxHp: number;
    team: TeamId;
}

interface StatePayload {
    players: RemotePlayer[];
    projectiles: RemoteProjectile[];
    blocks: RemoteBlock[];
    remainingMs: number;
}

interface MultiplayerInitData {
    roomId: string;
    mode: MatchMode;
    playerId: string;
    team: TeamId;
    selectedElements?: string[];
}

interface InputState {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    shoot: boolean;
    build: boolean;
    aimX: number;
    aimY: number;
    selectedElement: string;
}

export class MultiplayerBattleScene extends Phaser.Scene {
    private roomId = '';
    private playerId = '';
    private team: TeamId = 'A';
    private mode: MatchMode = 'pvp-1v1';
    private state: StatePayload = { players: [], projectiles: [], blocks: [], remainingMs: 180000 };
    private socket = getMatchSocket();
    private gfx!: Phaser.GameObjects.Graphics;
    private playerSprites = new Map<string, Phaser.GameObjects.Sprite>();
    private projectileSprites = new Map<string, Phaser.GameObjects.Image>();
    private projectileTrails = new Map<string, Array<{ x: number; y: number; alpha: number }>>();
    private lastPlayerPositions = new Map<string, { x: number; y: number }>();

    private keyA!: Phaser.Input.Keyboard.Key;
    private keyD!: Phaser.Input.Keyboard.Key;
    private keyW!: Phaser.Input.Keyboard.Key;
    private keyS!: Phaser.Input.Keyboard.Key;
    private keyQ!: Phaser.Input.Keyboard.Key;
    private keyE!: Phaser.Input.Keyboard.Key;
    private keyShift!: Phaser.Input.Keyboard.Key;
    private inputState: InputState = {
        left: false,
        right: false,
        up: false,
        down: false,
        shoot: false,
        build: false,
        aimX: GAME_WIDTH / 2,
        aimY: GAME_HEIGHT / 2,
        selectedElement: 'Fe',
    };

    private inputSendAccumulator = 0;
    private gameOver = false;
    public onGameOver?: (winner: string, playerHp: number, aiHp: number) => void;

    private selectedElements: string[] = ['Fe', 'Cu', 'Zn'];
    private selectedIndex = 0;

    constructor() {
        super({ key: 'MultiplayerBattleScene' });
    }

    init(data: MultiplayerInitData) {
        this.roomId = data.roomId;
        this.playerId = data.playerId;
        this.team = data.team;
        this.mode = data.mode;

        const fromRegistry = ((data.selectedElements ?? this.registry.get('selectedElements')) as string[] | undefined ?? []).filter(Boolean).slice(0, 3);
        if (fromRegistry.length > 0) {
            this.selectedElements = [...fromRegistry];
            while (this.selectedElements.length < 3) {
                const fallback = ['Fe', 'Cu', 'Zn'][this.selectedElements.length] ?? 'Fe';
                if (!this.selectedElements.includes(fallback)) this.selectedElements.push(fallback);
                else break;
            }
        }
        this.selectedIndex = 0;
        this.inputState.selectedElement = this.selectedElements[this.selectedIndex] ?? 'Fe';
    }

    create() {
        this.gfx = this.add.graphics();

        this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
        this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
        this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
        this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
        this.keyQ = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
        this.keyE = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
        this.keyShift = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

        const pointer = this.input.activePointer;
        this.inputState.aimX = pointer.worldX;
        this.inputState.aimY = pointer.worldY;

        this.input.on('pointerdown', () => {
            this.inputState.shoot = true;
        });

        this.keyQ.on('down', () => {
            if (this.gameOver) return;
            this.selectedIndex = (this.selectedIndex - 1 + this.selectedElements.length) % this.selectedElements.length;
            this.inputState.selectedElement = this.selectedElements[this.selectedIndex] ?? this.inputState.selectedElement;
        });

        this.keyE.on('down', () => {
            if (this.gameOver) return;
            this.selectedIndex = (this.selectedIndex + 1) % this.selectedElements.length;
            this.inputState.selectedElement = this.selectedElements[this.selectedIndex] ?? this.inputState.selectedElement;
        });

        this.keyShift.on('down', () => {
            if (this.gameOver) return;
            this.inputState.build = true;
        });

        this.socket.emit('join_room_runtime', { roomId: this.roomId, selectedElements: this.selectedElements });

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
        if (this.inputSendAccumulator < 16) return;
        this.inputSendAccumulator = 0;

        this.socket.emit('player_input', {
            roomId: this.roomId,
            playerId: this.playerId,
            input: this.inputState,
        });

        this.inputState.shoot = false;
        this.inputState.build = false;
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

        this.drawBackground(g);
        this.drawPlatforms(g);
        this.drawBlocks(g);

        this.syncPlayerSprites();
        this.syncProjectileSprites();

        const localPlayer = this.state.players.find((p) => p.id === this.playerId);
        if (localPlayer) {
            this.drawBattleStyleHud(g, localPlayer);
            this.drawElementPanel(g, localPlayer);
        }

        for (const p of this.state.players) {
            if (!p.alive) continue;
            const isSelf = p.id === this.playerId;
            const centerX = p.x + p.w / 2;
            this.addOrUpdateLabel(`name_${p.id}`, p.name, centerX, p.y - 14, isSelf ? '#ffffff' : '#dbeafe');
            g.fillStyle(0x111827, 0.82);
            g.fillRect(centerX - 24, p.y - 4, 48, 6);
            g.fillStyle(0x22c55e, 0.98);
            g.fillRect(centerX - 24, p.y - 4, 48 * Phaser.Math.Clamp(p.hp / MAX_HEALTH, 0, 1), 6);
        }

        if (this.gameOver) {
            g.fillStyle(0x000000, 0.65);
            g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

            const myTeamHp = this.state.players.filter((p) => p.team === this.team).reduce((sum, p) => sum + p.hp, 0);
            const enemyTeamHp = this.state.players.filter((p) => p.team !== this.team).reduce((sum, p) => sum + p.hp, 0);

            let title = 'GAME OVER';
            let color = '#f44336';
            if (myTeamHp > enemyTeamHp) {
                title = 'YOU WIN!';
                color = '#4CAF50';
            } else if (myTeamHp === enemyTeamHp) {
                title = 'DRAW!';
                color = '#ffeb3b';
            }

            this.addOrUpdateLabel('go_title', title, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, color, 0.5, '56px', 'bold');
            this.addOrUpdateLabel('go_score', `Team HP: ${Math.round(myTeamHp)}  |  Enemy HP: ${Math.round(enemyTeamHp)}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 15, '#aaaaaa', 0.5, '16px');
            this.addOrUpdateLabel('go_hint', 'Match ket thuc, quay lai menu de choi lai', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 50, '#888888', 0.5, '16px');
        }
    }

    private drawBattleStyleHud(g: Phaser.GameObjects.Graphics, localPlayer: RemotePlayer) {
        const enemyPlayers = this.state.players.filter((p) => p.team !== this.team);
        const enemyHpTotal = enemyPlayers.reduce((sum, p) => sum + p.hp, 0);
        const enemyManaTotal = enemyPlayers.reduce((sum, p) => sum + p.mana, 0);
        const enemyCount = Math.max(1, enemyPlayers.length);
        const enemyHp = Phaser.Math.Clamp(enemyHpTotal / enemyCount, 0, MAX_HEALTH);
        const enemyMana = Phaser.Math.Clamp(enemyManaTotal / enemyCount, 0, 100);

        g.fillStyle(0x222222); g.fillRect(20, 18, 200, 22);
        g.fillStyle(0x4caf50); g.fillRect(22, 20, (localPlayer.hp / MAX_HEALTH) * 196, 18);
        g.lineStyle(1, 0xaaaaaa); g.strokeRect(20, 18, 200, 22);

        g.fillStyle(0x1b2533); g.fillRect(20, 43, 200, 12);
        g.fillStyle(0x29b6f6); g.fillRect(22, 45, (localPlayer.mana / MAX_MANA) * 196, 8);
        g.lineStyle(1, 0x4fc3f7); g.strokeRect(20, 43, 200, 12);

        g.fillStyle(0x222222); g.fillRect(GAME_WIDTH - 220, 18, 200, 22);
        g.fillStyle(0xf44336); g.fillRect(GAME_WIDTH - 218, 20, (enemyHp / MAX_HEALTH) * 196, 18);
        g.lineStyle(1, 0xaaaaaa); g.strokeRect(GAME_WIDTH - 220, 18, 200, 22);

        g.fillStyle(0x1b2533); g.fillRect(GAME_WIDTH - 220, 43, 200, 12);
        g.fillStyle(0x29b6f6); g.fillRect(GAME_WIDTH - 218, 45, (enemyMana / MAX_MANA) * 196, 8);
        g.lineStyle(1, 0x4fc3f7); g.strokeRect(GAME_WIDTH - 220, 43, 200, 12);

        g.fillStyle(0x000000, 0.7); g.fillRect(GAME_WIDTH / 2 - 45, 10, 90, 30);
        g.lineStyle(2, this.state.remainingMs < 60000 ? 0xf44336 : 0x4caf50);
        g.strokeRect(GAME_WIDTH / 2 - 45, 10, 90, 30);

        g.fillStyle(0x000000, 0.7); g.fillRect(GAME_WIDTH / 2 - 70, 46, 140, 40);
        g.lineStyle(1, 0x4caf50, 0.5); g.strokeRect(GAME_WIDTH / 2 - 70, 46, 140, 40);

        g.fillStyle(0x000000, 0.6); g.fillRect(15, GAME_HEIGHT - 92, 280, 80);

        const mins = Math.floor(this.state.remainingMs / 60000);
        const secs = Math.max(0, Math.ceil((this.state.remainingMs % 60000) / 1000));
        const timerText = `${mins}:${secs.toString().padStart(2, '0')}`;
        const loadoutText = (localPlayer.selectedElements ?? this.selectedElements).map((k) => k).join(' / ');
        const angleText = `${this.getCurrentPlayerAimAngle(localPlayer)} deg`;

        this.addOrUpdateLabel('hud_player_label', `LOADOUT: ${loadoutText}`, 25, 23, '#ffffff', 0, '12px', 'bold');
        this.addOrUpdateLabel('hud_player_hp', `HP ${Math.round(localPlayer.hp)}`, 150, 23, '#ffffff', 0, '12px', 'bold');
        this.addOrUpdateLabel('hud_player_mana', `MANA ${Math.floor(localPlayer.mana)}/${MAX_MANA}`, 150, 48, '#4fc3f7', 0, '12px', 'bold');

        this.addOrUpdateLabel('hud_enemy_label', 'ENEMY', GAME_WIDTH - 215, 23, '#ffffff', 0, '12px', 'bold');
        this.addOrUpdateLabel('hud_enemy_hp', `HP ${Math.round(enemyHp)}`, GAME_WIDTH - 55, 23, '#ffffff', 0, '12px', 'bold');
        this.addOrUpdateLabel('hud_enemy_mana', `MANA ${Math.round(enemyMana)}/${MAX_MANA}`, GAME_WIDTH - 55, 48, '#4fc3f7', 0, '12px', 'bold');

        this.addOrUpdateLabel('hud_timer', timerText, GAME_WIDTH / 2, 30, this.state.remainingMs < 60000 ? '#f44336' : '#ffffff', 0.5, '18px', 'bold');
        this.addOrUpdateLabel('hud_angle_label', 'MOUSE AIM:', GAME_WIDTH / 2, 55, '#aaaaaa', 0.5, '10px');
        this.addOrUpdateLabel('hud_angle_value', angleText, GAME_WIDTH / 2, 75, '#4CAF50', 0.5, '18px', 'bold');

        this.addOrUpdateLabel('hud_inst_1', 'WASD - Move / Jump / Crouch', 22, GAME_HEIGHT - 82, '#bbbbbb', 0, '10px');
        this.addOrUpdateLabel('hud_inst_2', 'CLICK - Shoot random 1 of your 3 bullets', 22, GAME_HEIGHT - 68, '#bbbbbb', 0, '10px');
        this.addOrUpdateLabel('hud_inst_3', 'Q/E - Cycle element | SHIFT - Build block (uses mana)', 22, GAME_HEIGHT - 54, '#bbbbbb', 0, '10px');
        this.addOrUpdateLabel('hud_inst_4', 'Move mouse to aim | B + arrows build cursor', 22, GAME_HEIGHT - 40, '#bbbbbb', 0, '10px');
    }

    private getCurrentPlayerAimAngle(localPlayer: RemotePlayer) {
        const muzzleX = localPlayer.x + localPlayer.w / 2 + (localPlayer.facingRight ? 18 : -18);
        const muzzleY = localPlayer.y + localPlayer.h + 2 + (localPlayer.crouching ? -50 : -60);
        const dx = this.inputState.aimX - muzzleX;
        const dy = this.inputState.aimY - muzzleY;
        const angleRad = Math.atan2(-dy, Math.max(1, Math.abs(dx)));
        const angleDeg = Phaser.Math.RadToDeg(angleRad);
        return Math.round(Phaser.Math.Clamp(angleDeg, 0, 90) * 100) / 100;
    }

    private drawBlocks(g: Phaser.GameObjects.Graphics) {
        for (const blk of this.state.blocks) {
            const elem = ELEMENTS[blk.element as keyof typeof ELEMENTS];
            const color = elem?.color ?? (blk.team === 'A' ? 0x4caf50 : 0xf44336);
            const hpR = blk.maxHp > 0 ? blk.hp / blk.maxHp : 0;

            g.fillStyle(color, 0.55 + hpR * 0.35);
            g.fillRect(blk.x, blk.y, 32, 32);
            g.lineStyle(2, hpR > 0.5 ? 0xffffff : 0xff6666, 0.45);
            g.strokeRect(blk.x, blk.y, 32, 32);

            g.fillStyle(0x111111, 0.75);
            g.fillRect(blk.x + 3, blk.y + 3, 26, 4);
            g.fillStyle(hpR > 0.5 ? 0x4caf50 : hpR > 0.25 ? 0xffc107 : 0xf44336, 0.95);
            g.fillRect(blk.x + 3, blk.y + 3, 26 * Phaser.Math.Clamp(hpR, 0, 1), 4);
        }
    }

    private drawBackground(g: Phaser.GameObjects.Graphics) {
        const bands = 20;
        for (let i = 0; i < bands; i++) {
            const t = i / bands;
            const r = Math.floor(13 * (1 - t) + 10 * t);
            const gg = Math.floor(13 * (1 - t) + 22 * t);
            const b = Math.floor(26 * (1 - t) + 40 * t);
            g.fillStyle((r << 16) | (gg << 8) | b);
            g.fillRect(0, (i / bands) * GAME_HEIGHT, GAME_WIDTH, GAME_HEIGHT / bands + 1);
        }

        for (let i = 0; i < 60; i++) {
            const sx = (i * 73 + 11) % GAME_WIDTH;
            const sy = (i * 37 + 7) % 350;
            const sz = (i % 3) + 0.5;
            g.fillStyle(0xffffff, 0.2 + (i % 5) * 0.12);
            g.fillCircle(sx, sy, sz);
        }

        g.fillStyle(0xe8e8e8);
        g.fillCircle(GAME_WIDTH - 150, 90, 35);
        g.fillStyle(0xcccccc);
        g.fillCircle(GAME_WIDTH - 160, 85, 6);
        g.fillCircle(GAME_WIDTH - 142, 98, 4);
    }

    private drawPlatforms(g: Phaser.GameObjects.Graphics) {
        for (const p of PLATFORMS) {
            if (p.height > 50) {
                g.fillStyle(0x2d3748);
                g.fillRect(p.x, p.y, p.width, p.height);
                g.fillStyle(0x48bb78);
                g.fillRect(p.x, p.y, p.width, 6);
            } else {
                g.fillStyle(0x5a6577);
                g.fillRect(p.x, p.y, p.width, p.height);
            }
            g.lineStyle(1, 0xa0aec0, 0.5);
            g.strokeRect(p.x, p.y, p.width, p.height);
        }
    }

    private syncPlayerSprites() {
        const activeIds = new Set<string>();

        for (const p of this.state.players) {
            if (!p.alive) continue;
            activeIds.add(p.id);

            let sprite = this.playerSprites.get(p.id);
            if (!sprite) {
                sprite = this.add.sprite(p.x + p.w / 2, p.y + p.h + 2, IDLE_TEXTURE_KEY).setDepth(30).setOrigin(0.5, 1);
                if (this.anims.exists(IDLE_ANIM_KEY)) sprite.play(IDLE_ANIM_KEY);
                this.playerSprites.set(p.id, sprite);
            }

            sprite.setVisible(true);
            const currentX = sprite.x;
            const currentY = sprite.y;
            const targetX = p.x + p.w / 2;
            const targetY = p.y + p.h + 2;
            sprite.setPosition(
                Phaser.Math.Linear(currentX, targetX, 0.55),
                Phaser.Math.Linear(currentY, targetY, 0.55),
            );
            sprite.setDisplaySize(92, (p.crouching ? 117 : 130));
            sprite.setFlipX(!p.facingRight);

            const prev = this.lastPlayerPositions.get(p.id);
            const movingX = prev ? Math.abs(p.x - prev.x) > 0.4 : false;
            const targetAnim = movingX ? RUN_ANIM_KEY : IDLE_ANIM_KEY;
            if (this.anims.exists(targetAnim) && sprite.anims.currentAnim?.key !== targetAnim) {
                sprite.play(targetAnim);
            }

            this.lastPlayerPositions.set(p.id, { x: p.x, y: p.y });
        }

        for (const [id, sprite] of this.playerSprites.entries()) {
            if (!activeIds.has(id)) {
                sprite.destroy();
                this.playerSprites.delete(id);
                this.lastPlayerPositions.delete(id);
                const oldLabel = this.children.getByName(`name_${id}`) as Phaser.GameObjects.Text | null;
                oldLabel?.destroy();
            }
        }
    }

    private syncProjectileSprites() {
        const activeIds = new Set<string>();

        for (const b of this.state.projectiles) {
            activeIds.add(b.id);

            const trail = this.projectileTrails.get(b.id) ?? [];
            trail.push({ x: b.x, y: b.y, alpha: 1 });
            while (trail.length > 20) trail.shift();
            for (let i = 0; i < trail.length; i++) {
                trail[i].alpha = i / Math.max(1, trail.length);
            }
            this.projectileTrails.set(b.id, trail);

            const elemForTrail = b.element ? ELEMENTS[b.element as keyof typeof ELEMENTS] : undefined;
            const trailColor = elemForTrail?.color ?? (b.team === 'A' ? 0x4caf50 : 0xf44336);
            for (const t of trail) {
                this.gfx.fillStyle(trailColor, t.alpha * 0.4);
                this.gfx.fillCircle(t.x, t.y, 6 * t.alpha);
            }

            let sprite = this.projectileSprites.get(b.id);
            const textureCandidates = b.element
                ? [
                    `projectile_display_${b.element}`,
                    `projectile_display_${b.element.toLowerCase()}`,
                    `projectile_display_${b.element.toUpperCase()}`,
                    `projectile_${b.element}`,
                    `projectile_${b.element.toLowerCase()}`,
                    `projectile_${b.element.toUpperCase()}`,
                ]
                : [];
            const textureKey = textureCandidates.find((key) => this.textures.exists(key));

            if (!sprite) {
                if (textureKey) {
                    sprite = this.add.image(b.x, b.y, textureKey).setDepth(35);
                    sprite.setDisplaySize(44, 44);
                    this.projectileSprites.set(b.id, sprite);
                } else {
                    const elem = b.element ? ELEMENTS[b.element as keyof typeof ELEMENTS] : undefined;
                    const color = elem?.color ?? (b.team === 'A' ? 0x4caf50 : 0xf44336);
                    this.gfx.fillStyle(color, 0.95);
                    this.gfx.fillCircle(b.x, b.y, 7);
                    this.gfx.fillStyle(0xffffff, 0.65);
                    this.gfx.fillCircle(b.x - 2, b.y - 2, 2);
                }
                continue;
            }

            if (textureKey && sprite.texture.key !== textureKey) {
                sprite.setTexture(textureKey);
            }

            sprite.setPosition(b.x, b.y);
            sprite.setVisible(Boolean(textureKey));
            sprite.setRotation(sprite.rotation + 0.2);

            if (!textureKey) {
                const elem = b.element ? ELEMENTS[b.element as keyof typeof ELEMENTS] : undefined;
                const color = elem?.color ?? (b.team === 'A' ? 0x4caf50 : 0xf44336);
                this.gfx.fillStyle(color, 0.95);
                this.gfx.fillCircle(b.x, b.y, 7);
                this.gfx.fillStyle(0xffffff, 0.65);
                this.gfx.fillCircle(b.x - 2, b.y - 2, 2);
            }
        }

        for (const [id, sprite] of this.projectileSprites.entries()) {
            if (!activeIds.has(id)) {
                sprite.destroy();
                this.projectileSprites.delete(id);
                this.projectileTrails.delete(id);
            }
        }
    }

    private drawElementPanel(g: Phaser.GameObjects.Graphics, localPlayer: RemotePlayer) {
        const selectedElements = localPlayer.selectedElements?.length > 0 ? localPlayer.selectedElements.slice(0, 3) : this.selectedElements;
        const selectedElement = localPlayer.selectedElement || this.inputState.selectedElement;

        g.fillStyle(0x000000, 0.72);
        g.fillRect(GAME_WIDTH - 280, GAME_HEIGHT - 90, 270, 72);

        this.addOrUpdateLabel('elem_title', 'ELEMENTS [Q/E cycle, SHIFT place]', GAME_WIDTH - 275, GAME_HEIGHT - 74, '#888888', 0);
        this.addOrUpdateLabel('elem_selected', `Build: ${selectedElement}`, GAME_WIDTH - 275, GAME_HEIGHT - 86, '#ffffff', 0);

        selectedElements.forEach((key, i) => {
            const elem = ELEMENTS[key as keyof typeof ELEMENTS];
            const ex = GAME_WIDTH - 275 + i * 65;
            const ey = GAME_HEIGHT - 55;
            const isSel = key === selectedElement;
            const inventoryCount = localPlayer.inventory?.[key] ?? 0;

            g.fillStyle(isSel ? (elem?.color ?? 0x4caf50) : 0x333333);
            g.fillRect(ex, ey, 55, 30);
            g.lineStyle(isSel ? 2 : 1, isSel ? 0xffffff : 0x555555);
            g.strokeRect(ex, ey, 55, 30);

            this.addOrUpdateLabel(`elem_symbol_${key}`, key, ex + 6, ey + 8, '#dfe8ff', 0);
            this.addOrUpdateLabel(`elem_count_${key}`, `x${inventoryCount}`, ex + 30, ey + 8, '#cccccc', 0);
        });
    }

    private addOrUpdateLabel(
        key: string,
        text: string,
        x: number,
        y: number,
        color: string,
        originX = 0.5,
        fontSize = '14px',
        fontStyle: string = 'normal',
    ) {
        let label = this.children.getByName(key) as Phaser.GameObjects.Text | null;
        if (!label) {
            label = this.add.text(x, y, text, {
                fontFamily: 'Courier New',
                fontSize,
                color,
                fontStyle,
            }).setName(key).setOrigin(originX, 0.5).setDepth(100);
        }
        label.setPosition(x, y);
        label.setText(text);
        label.setColor(color);
        label.setFontSize(fontSize);
        label.setFontStyle(fontStyle);
    }

    shutdown() {
        this.socket.off('state_update', this.handleStateUpdate);
        this.socket.off('game_over', this.handleGameOverEvent);
        for (const sprite of this.playerSprites.values()) {
            sprite.destroy();
        }
        this.playerSprites.clear();
        for (const sprite of this.projectileSprites.values()) {
            sprite.destroy();
        }
        this.projectileSprites.clear();
        this.projectileTrails.clear();
        this.lastPlayerPositions.clear();
    }
}
