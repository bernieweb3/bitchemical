import Phaser from 'phaser';
import {
    GAME_WIDTH,
    GAME_HEIGHT,
    RIGHT_ZONE_START,
    GROUND_Y,
    GROUND_HEIGHT,
    GRAVITY,
    JUMP_FORCE,
    MOVE_SPEED,
    PROJECTILE_SPEED,
    MAX_HEALTH,
    MAX_MANA,
    MANA_REGEN_PER_SECOND,
    MANA_COST_SHOT,
    MANA_COST_BLOCK,
    DAMAGE,
    BLOCK_SIZE,
    MATCH_DURATION,
    PLATFORMS,
    CHARACTER_SPRITE_WIDTH,
    CHARACTER_SPRITE_HEIGHT,
    CHARACTER_CROUCH_SCALE_Y,
} from '../config';
import type { PlatformDef } from '../config';
import { ELEMENTS, ELEMENT_KEYS, STARTING_INVENTORY } from '../data/elements';

const IDLE_TEXTURE_KEY = 'scientist_idle_frame_0';
const IDLE_ANIM_KEY = 'scientist_idle';
const RUN_ANIM_KEY = 'scientist_run';

// ─── Interfaces ───────────────────────────────────────────────
interface CharacterState {
    x: number;
    y: number;
    velX: number;
    velY: number;
    moveInputX: number;
    width: number;
    height: number;
    health: number;
    mana: number;
    onGround: boolean;
    jumpsUsed: number;
    crouching: boolean;
    facingRight: boolean;
    side: 'left' | 'right';
    animFrame: number;
    animTimer: number;
    inventory: Record<string, number>;
    aiTimer: number;
    aiShootTimer: number;
}

interface ProjectileState {
    id: string;
    x: number;
    y: number;
    velX: number;
    velY: number;
    age: number;
    effectVariant: number;
    spinSpeed: number;
    elementKey?: string;
    sprite?: Phaser.GameObjects.Image;
    isPlayerProjectile: boolean;
    active: boolean;
    trail: { x: number; y: number; alpha: number }[];
}

interface BlockState {
    x: number;
    y: number;
    element: string;
    hp: number;
    maxHp: number;
    side: 'left' | 'right';
}

interface ParticleState {
    x: number;
    y: number;
    velX: number;
    velY: number;
    color: number;
    size: number;
    life: number;
    decay: number;
}

interface CharacterHitbox {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface LocalRealtimeMatch {
    roomId: string;
    playerId: string;
    team: 'A' | 'B';
    opponentPlayerId?: string;
}

interface RealtimeInputPayload {
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

interface RealtimeSnapshotPayload {
    player: CharacterState;
    ai: CharacterState;
    blocks: BlockState[];
    projectiles: ProjectileState[];
    matchTimer: number;
    gameOver: boolean;
    winner: string;
}

// ─── BattleScene ──────────────────────────────────────────────
export class BattleScene extends Phaser.Scene {
    private readonly projectileDisplaySize = 44;
    private readonly blockDamage = 30;
    private readonly minBlockSpacing = 8;
    private readonly groundAccel = 1800;
    private readonly airAccel = 950;
    private readonly groundDecel = 2400;
    private readonly airDecel = 700;

    private player!: CharacterState;
    private ai!: CharacterState;
    private projectiles: ProjectileState[] = [];
    private blocks: BlockState[] = [];
    private particles: ParticleState[] = [];

    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private keyA!: Phaser.Input.Keyboard.Key;
    private keyD!: Phaser.Input.Keyboard.Key;
    private keyW!: Phaser.Input.Keyboard.Key;
    private keyS!: Phaser.Input.Keyboard.Key;
    private keyQ!: Phaser.Input.Keyboard.Key;
    private keyE!: Phaser.Input.Keyboard.Key;
    private keyF!: Phaser.Input.Keyboard.Key;
    private keyR!: Phaser.Input.Keyboard.Key;
    private keyB!: Phaser.Input.Keyboard.Key;
    private keyShift!: Phaser.Input.Keyboard.Key;
    private keyUp!: Phaser.Input.Keyboard.Key;
    private keyDown!: Phaser.Input.Keyboard.Key;
    private keyLeft!: Phaser.Input.Keyboard.Key;
    private keyRight!: Phaser.Input.Keyboard.Key;
    private keyJ!: Phaser.Input.Keyboard.Key;
    private keyL!: Phaser.Input.Keyboard.Key;
    private keyI!: Phaser.Input.Keyboard.Key;
    private keyK!: Phaser.Input.Keyboard.Key;
    private keyO!: Phaser.Input.Keyboard.Key;
    private keyU!: Phaser.Input.Keyboard.Key;
    private keyN!: Phaser.Input.Keyboard.Key;
    private keyM!: Phaser.Input.Keyboard.Key;

    private playerAimAngle = 45;
    private selectedElement = 'C';
    private selectedElementKeys: string[] = [...ELEMENT_KEYS.slice(0, 3)];
    private selectedShotKeys: string[] = [...ELEMENT_KEYS.slice(0, 3)];
    private opponentElementKeys: string[] = [...ELEMENT_KEYS.slice(0, 3)];
    private lastShotElement = 'C';
    private aimTargetX = GAME_WIDTH / 2;
    private aimTargetY = GAME_HEIGHT / 2;

    // Block cursor
    private buildMode = false;
    private cursorGridX = 4; // grid column for left island
    private cursorGridY = 15; // grid row
    private cursorBlink = 0;

    private gameOver = false;
    private winner = '';
    private matchTimer = MATCH_DURATION;

    private cameraShakeX = 0;
    private cameraShakeY = 0;
    private cameraShakeIntensity = 0;

    private aiLastPlayerX = 0;
    private aiLastPlayerY = 0;
    private readonly aiJumpCooldownMs = 420;
    private lastAiJumpAt = 0;
    private playerVelocityHistory: { vx: number; vy: number }[] = [];
    private readonly projectileGravityScale = 0.18;
    private readonly playerShotSpeedMultiplier = 1.25;
    private readonly playerShotCooldownMs = 180;
    private lastPlayerShotAt = 0;
    private lastOpponentShotAt = 0;
    private battleMode: 'vs-ai' | 'local-1v1' | 'local-1v1-host' | 'local-1v1-client' = 'vs-ai';
    private opponentSelectedElement = 'C';
    private realtimeMatch: LocalRealtimeMatch | null = null;
    private realtimeChannel: BroadcastChannel | null = null;
    private remoteInput: RealtimeInputPayload = {
        left: false,
        right: false,
        up: false,
        down: false,
        shoot: false,
        build: false,
        aimX: 0,
        aimY: 0,
        selectedElement: 'C',
    };
    private remoteUpWasDown = false;
    private networkInput: RealtimeInputPayload = {
        left: false,
        right: false,
        up: false,
        down: false,
        shoot: false,
        build: false,
        aimX: 0,
        aimY: 0,
        selectedElement: 'C',
    };
    private snapshotAccumulator = 0;
    private projectileIdCounter = 0;
    private syncedLoadoutsByPlayer: Record<string, string[]> | null = null;
    private isParkourTestMode = false;
    private hasOpponent = true;
    private parkourPlatforms: PlatformDef[] = [];
    private parkourScrollSpeed = 56;
    private parkourHazardY = GAME_HEIGHT + 120;
    private readonly parkourHazardRiseSpeed = 6;
    private readonly parkourFallMargin = 28;
    private readonly parkourPlatformGapX = 170;
    private readonly parkourPlatformGapY = 62;
    private readonly parkourScrollDelayMs = 10000;
    private parkourElapsedMs = 0;

    // Phaser Graphics objects
    private gfx!: Phaser.GameObjects.Graphics;
    private playerSprite!: Phaser.GameObjects.Sprite;
    private aiSprite!: Phaser.GameObjects.Sprite;
    private uiTexts: Map<string, Phaser.GameObjects.Text> = new Map();

    public onGameOver?: (winner: string, playerHp: number, aiHp: number) => void;

    constructor() {
        super({ key: 'BattleScene' });
    }

    init(data: {
        onGameOver?: (winner: string, playerHp: number, aiHp: number) => void;
        selectedElements?: string[];
        syncedLoadoutsByPlayer?: Record<string, string[]>;
        battleMode?: 'vs-ai' | 'local-1v1' | 'local-1v1-host' | 'local-1v1-client';
        localRealtimeMatch?: LocalRealtimeMatch;
    }) {
        if (data.onGameOver) {
            this.onGameOver = data.onGameOver;
        }

        this.battleMode = data.battleMode
            ?? (this.registry.get('battleMode') as 'vs-ai' | 'local-1v1' | 'local-1v1-host' | 'local-1v1-client' | undefined)
            ?? 'vs-ai';
        this.realtimeMatch = data.localRealtimeMatch
            ?? (this.registry.get('localRealtimeMatch') as LocalRealtimeMatch | undefined)
            ?? null;
        this.syncedLoadoutsByPlayer = data.syncedLoadoutsByPlayer
            ?? (this.registry.get('syncedLoadoutsByPlayer') as Record<string, string[]> | undefined)
            ?? null;

        const normalizeLoadout = (raw: string[] | undefined) => {
            const filtered = (raw ?? []).filter((key) => Boolean(ELEMENTS[key])).slice(0, 3);
            while (filtered.length < 3) {
                const fallback = ELEMENT_KEYS.find((k) => !filtered.includes(k));
                if (!fallback) break;
                filtered.push(fallback);
            }
            return filtered;
        };

        this.selectedElementKeys = normalizeLoadout(data.selectedElements);
        this.selectedShotKeys = [...this.selectedElementKeys];
        this.opponentElementKeys = [...this.selectedElementKeys];

        if (this.realtimeMatch?.playerId && this.syncedLoadoutsByPlayer) {
            const selfLoadout = normalizeLoadout(this.syncedLoadoutsByPlayer[this.realtimeMatch.playerId]);
            if (selfLoadout.length > 0) {
                this.selectedElementKeys = selfLoadout;
                this.selectedShotKeys = [...selfLoadout];
            }

            const opponentId = this.realtimeMatch.opponentPlayerId;
            if (opponentId) {
                const opponentLoadout = normalizeLoadout(this.syncedLoadoutsByPlayer[opponentId]);
                if (opponentLoadout.length > 0) {
                    this.opponentElementKeys = opponentLoadout;
                }
            }
        }

        // Ensure player always enters with exactly 3 selected bullets.
        while (this.selectedElementKeys.length < 3) {
            const fallback = ELEMENT_KEYS.find((k) => !this.selectedElementKeys.includes(k));
            if (!fallback) break;
            this.selectedElementKeys.push(fallback);
        }

        while (this.selectedShotKeys.length < 3) {
            const fallback = this.selectedElementKeys[this.selectedShotKeys.length] ?? ELEMENT_KEYS[this.selectedShotKeys.length] ?? ELEMENT_KEYS[0];
            this.selectedShotKeys.push(fallback);
        }

        while (this.opponentElementKeys.length < 3) {
            const fallback = ELEMENT_KEYS.find((k) => !this.opponentElementKeys.includes(k));
            if (!fallback) break;
            this.opponentElementKeys.push(fallback);
        }

        this.selectedElement = this.selectedElementKeys[0] ?? 'C';

        const registryGameMode = this.registry.get('gameMode') as string | undefined;
        this.isParkourTestMode = registryGameMode === 'test-vs-ai';
        this.hasOpponent = !this.isParkourTestMode;
        if (this.isParkourTestMode) {
            this.battleMode = 'vs-ai';
        }
    }

    create() {
        this.gameOver = false;
        this.winner = '';
        this.matchTimer = MATCH_DURATION;
        this.projectiles = [];
        this.blocks = [];
        this.particles = [];
        this.playerAimAngle = 45;
        this.selectedElement = this.selectedElementKeys[0] ?? 'C';
        this.lastShotElement = this.selectedShotKeys[0] ?? this.selectedElement;
        this.aimTargetX = GAME_WIDTH / 2;
        this.aimTargetY = GAME_HEIGHT / 2;
        this.cameraShakeIntensity = 0;
        this.cameraShakeX = 0;
        this.cameraShakeY = 0;
        this.lastPlayerShotAt = -this.playerShotCooldownMs;
        this.lastOpponentShotAt = -this.playerShotCooldownMs;
        this.lastAiJumpAt = -this.aiJumpCooldownMs;
        this.opponentSelectedElement = this.opponentElementKeys[0] ?? 'C';
        this.snapshotAccumulator = 0;
        this.projectileIdCounter = 0;
        this.parkourHazardY = GAME_HEIGHT + 120;
        this.remoteUpWasDown = false;
        this.parkourElapsedMs = 0;

        // Characters
        const spawnY = this.isParkourTestMode ? GAME_HEIGHT - 220 : 520;
        this.player = this.createChar(170, spawnY, 'left', this.selectedElementKeys);
        this.ai = this.createChar(1360, spawnY, 'right', this.opponentElementKeys);
        if (this.isParkourTestMode) {
            this.initializeParkourPlatforms();
        }
        this.aiLastPlayerX = this.player.x;
        this.aiLastPlayerY = this.player.y;
        this.playerVelocityHistory = [];

        // Graphics
        this.gfx = this.add.graphics();

        // Character sprites (loaded in BootScene)
        this.playerSprite = this.add.sprite(0, 0, IDLE_TEXTURE_KEY).setDepth(30).setOrigin(0.5, 1);
        this.aiSprite = this.add.sprite(0, 0, IDLE_TEXTURE_KEY).setDepth(30).setOrigin(0.5, 1);
        this.playerSprite.play(IDLE_ANIM_KEY);
        this.aiSprite.play(IDLE_ANIM_KEY);
        this.aiSprite.setVisible(this.hasOpponent);

        // Input keys
        this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
        this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
        this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
        this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
        this.keyQ = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
        this.keyE = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
        this.keyF = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F);
        this.keyR = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
        this.keyB = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.B);
        this.keyShift = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
        this.keyUp = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
        this.keyDown = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
        this.keyLeft = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
        this.keyRight = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
        this.keyJ = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.J);
        this.keyL = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.L);
        this.keyI = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.I);
        this.keyK = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.K);
        this.keyO = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.O);
        this.keyU = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.U);
        this.keyN = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.N);
        this.keyM = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.M);

        // Keyboard listener (restart only on game over)
        this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
            if (this.gameOver) {
                if (event.key === 'r' || event.key === 'R') {
                    this.scene.restart();
                }
                return;
            }
        });

        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (this.gameOver) return;
            if (this.battleMode === 'local-1v1-client') {
                const camera = this.cameras.main;
                this.networkInput.aimX = pointer.x + camera.scrollX;
                this.networkInput.aimY = pointer.y + camera.scrollY;
                this.networkInput.shoot = true;
                return;
            }
            this.handlePlayerClickShot(pointer);
        });

        // Element cycling (on just pressed)
        this.keyQ.on('down', () => {
            if (this.gameOver) return;
            const idx = this.selectedElementKeys.indexOf(this.selectedElement);
            this.selectedElement = this.selectedElementKeys[(idx - 1 + this.selectedElementKeys.length) % this.selectedElementKeys.length];
        });
        this.keyE.on('down', () => {
            if (this.gameOver) return;
            const idx = this.selectedElementKeys.indexOf(this.selectedElement);
            this.selectedElement = this.selectedElementKeys[(idx + 1) % this.selectedElementKeys.length];
        });
        this.keyF.on('down', () => {
            if (this.gameOver) return;
            this.placeBlock();
        });
        this.keyN.on('down', () => {
            if (this.gameOver || this.battleMode !== 'local-1v1') return;
            const idx = this.selectedElementKeys.indexOf(this.opponentSelectedElement);
            this.opponentSelectedElement = this.selectedElementKeys[(idx - 1 + this.selectedElementKeys.length) % this.selectedElementKeys.length];
        });
        this.keyM.on('down', () => {
            if (this.gameOver || this.battleMode !== 'local-1v1') return;
            const idx = this.selectedElementKeys.indexOf(this.opponentSelectedElement);
            this.opponentSelectedElement = this.selectedElementKeys[(idx + 1) % this.selectedElementKeys.length];
        });
        this.keyU.on('down', () => {
            if (this.gameOver || this.battleMode !== 'local-1v1') return;
            this.placeBlockFor(this.ai, this.opponentSelectedElement);
        });
        this.keyO.on('down', () => {
            if (this.gameOver || this.battleMode !== 'local-1v1') return;
            this.handleOpponentShoot();
        });
        this.keyShift.on('down', () => {
            if (this.gameOver) return;
            this.placeBlock();
        });
        this.keyB.on('down', () => {
            if (this.gameOver) return;
            this.buildMode = !this.buildMode;
            if (this.buildMode) {
                // Initialize cursor near player
                this.cursorGridX = Math.floor((this.player.x + this.player.width / 2) / BLOCK_SIZE);
                this.cursorGridY = Math.floor((this.player.y + this.player.height - BLOCK_SIZE) / BLOCK_SIZE);
            }
        });
        this.keyUp.on('down', () => {
            if (!this.buildMode || this.gameOver) return;
            if (this.battleMode === 'local-1v1-client') {
                this.networkInput.build = true;
                return;
            }
            this.cursorGridY = Math.max(0, this.cursorGridY - 1);
        });
        this.keyDown.on('down', () => {
            if (!this.buildMode || this.gameOver) return;
            if (this.battleMode === 'local-1v1-client') {
                this.networkInput.build = true;
                return;
            }
            this.cursorGridY = Math.min(Math.floor((GAME_HEIGHT - 1) / BLOCK_SIZE), this.cursorGridY + 1);
        });
        this.keyLeft.on('down', () => {
            if (!this.buildMode || this.gameOver) return;
            this.cursorGridX = Math.max(0, this.cursorGridX - 1);
        });
        this.keyRight.on('down', () => {
            if (!this.buildMode || this.gameOver) return;
            this.cursorGridX = Math.min(Math.floor((GAME_WIDTH - 1) / BLOCK_SIZE), this.cursorGridX + 1);
        });

        // Timer
        this.time.addEvent({
            delay: 1000,
            callback: () => {
                if (!this.gameOver) {
                    this.matchTimer--;
                    if (this.matchTimer <= 0) this.endByTimer();
                }
            },
            loop: true,
        });

        // Create persistent UI text objects
        this.createUITexts();

        if ((this.battleMode === 'local-1v1-host' || this.battleMode === 'local-1v1-client') && this.realtimeMatch?.roomId) {
            const channelName = `bitchemical_realtime_${this.realtimeMatch.roomId}`;
            this.realtimeChannel = new BroadcastChannel(channelName);
            this.realtimeChannel.onmessage = (event: MessageEvent) => {
                const data = event.data as {
                    type?: string;
                    playerId?: string;
                    payload?: RealtimeInputPayload | RealtimeSnapshotPayload;
                };
                if (data.playerId === this.realtimeMatch?.playerId) return;

                if (this.battleMode === 'local-1v1-host' && data.type === 'input' && data.payload) {
                    this.remoteInput = data.payload as RealtimeInputPayload;
                }

                if (this.battleMode === 'local-1v1-client' && data.type === 'state' && data.payload) {
                    this.applyRealtimeSnapshot(data.payload as RealtimeSnapshotPayload);
                }
            };
        }
    }

    private createChar(x: number, y: number, side: 'left' | 'right', allowedKeys: string[] = this.selectedElementKeys): CharacterState {
        const inventory: Record<string, number> = {};
        ELEMENT_KEYS.forEach((key) => {
            inventory[key] = allowedKeys.includes(key) ? (STARTING_INVENTORY[key] ?? 3) : 0;
        });

        return {
            x, y, velX: 0, velY: 0, moveInputX: 0, width: 30, height: 46,
            health: MAX_HEALTH, mana: MAX_MANA, onGround: false, jumpsUsed: 0, crouching: false,
            facingRight: side === 'left', side,
            animFrame: 0, animTimer: 0,
            inventory,
            aiTimer: 0, aiShootTimer: 0,
        };
    }

    private createUITexts() {
        const style = { fontFamily: '"Courier New", monospace', fontSize: '12px', color: '#ffffff' };
        const boldStyle = { ...style, fontStyle: 'bold' };

        this.uiTexts.set('playerLabel', this.add.text(25, 23, 'PLAYER', { ...boldStyle }).setDepth(100));
        this.uiTexts.set('playerHp', this.add.text(150, 23, '', { ...boldStyle }).setDepth(100));
        this.uiTexts.set('playerMana', this.add.text(150, 48, '', { ...boldStyle, color: '#4fc3f7' }).setDepth(100));
        this.uiTexts.set('aiLabel', this.add.text(GAME_WIDTH - 215, 23, 'AI', { ...boldStyle }).setDepth(100));
        this.uiTexts.set('aiHp', this.add.text(GAME_WIDTH - 55, 23, '', { ...boldStyle }).setDepth(100));
        this.uiTexts.set('aiMana', this.add.text(GAME_WIDTH - 55, 48, '', { ...boldStyle, color: '#4fc3f7' }).setDepth(100));

        this.uiTexts.set('timer', this.add.text(GAME_WIDTH / 2, 30, '', {
            ...boldStyle, fontSize: '18px',
        }).setOrigin(0.5).setDepth(100));

        this.uiTexts.set('angleLabel', this.add.text(GAME_WIDTH / 2, 55, 'MOUSE AIM:', {
            fontFamily: '"Courier New", monospace', fontSize: '10px', color: '#aaaaaa',
        }).setOrigin(0.5).setDepth(100));

        this.uiTexts.set('angleValue', this.add.text(GAME_WIDTH / 2, 75, '', {
            ...boldStyle, fontSize: '18px', color: '#4CAF50',
        }).setOrigin(0.5).setDepth(100));

        // Instructions
        const instStyle = { fontFamily: '"Courier New", monospace', fontSize: '10px', color: '#bbbbbb' };
        this.uiTexts.set('inst1', this.add.text(22, GAME_HEIGHT - 82, 'WASD — Move / Jump / Crouch', instStyle).setDepth(100));
        this.uiTexts.set('inst2', this.add.text(22, GAME_HEIGHT - 68, 'CLICK — Shoot random 1 of your 3 bullets', instStyle).setDepth(100));
        this.uiTexts.set('inst3', this.add.text(22, GAME_HEIGHT - 54, 'Q/E — Cycle element | SHIFT — Build block (uses mana)', instStyle).setDepth(100));
        this.uiTexts.set('inst4', this.add.text(22, GAME_HEIGHT - 40, 'Move mouse to aim | B + ↑↓←→ build cursor', instStyle).setDepth(100));

        // Element labels
        this.selectedElementKeys.forEach((key, i) => {
            const elem = ELEMENTS[key];
            const ex = GAME_WIDTH - 275 + i * 65;
            const ey = GAME_HEIGHT - 55;
            this.uiTexts.set(`elem_${key}`, this.add.text(ex + 5, ey + 5, elem.symbol, {
                fontFamily: '"Courier New", monospace', fontSize: '12px', fontStyle: 'bold', color: '#aaaaaa',
            }).setDepth(100));
            this.uiTexts.set(`elemCount_${key}`, this.add.text(ex + 28, ey + 5, '', {
                fontFamily: '"Courier New", monospace', fontSize: '10px', color: '#cccccc',
            }).setDepth(100));
            this.uiTexts.set(`elemHp_${key}`, this.add.text(ex + 5, ey + 20, `HP:${elem.hp}`, {
                fontFamily: '"Courier New", monospace', fontSize: '8px', color: '#888888',
            }).setDepth(100));
        });

        // Element panel title
        this.uiTexts.set('elemTitle', this.add.text(GAME_WIDTH - 275, GAME_HEIGHT - 73, 'ELEMENTS [Q/E cycle, SHIFT place]', {
            fontFamily: '"Courier New", monospace', fontSize: '9px', color: '#888888',
        }).setDepth(100));
        this.uiTexts.set('elemSelectedName', this.add.text(GAME_WIDTH - 275, GAME_HEIGHT - 84, '', {
            fontFamily: '"Courier New", monospace', fontSize: '10px', fontStyle: 'bold', color: '#ffffff',
        }).setDepth(100));

        // Game over texts (hidden initially)
        this.uiTexts.set('goTitle', this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, '', {
            fontFamily: '"Courier New", monospace', fontSize: '56px', fontStyle: 'bold', color: '#4CAF50',
        }).setOrigin(0.5).setDepth(200).setVisible(false));

        this.uiTexts.set('goScore', this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 15, '', {
            fontFamily: '"Courier New", monospace', fontSize: '16px', color: '#aaaaaa',
        }).setOrigin(0.5).setDepth(200).setVisible(false));

        this.uiTexts.set('goRestart', this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 50, 'Press R to restart', {
            fontFamily: '"Courier New", monospace', fontSize: '16px', color: '#888888',
        }).setOrigin(0.5).setDepth(200).setVisible(false));
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE
    // ═══════════════════════════════════════════════════════════
    update(_time: number, delta: number) {
        const dt = delta / 1000;

        if (!this.gameOver && this.isParkourTestMode) {
            this.parkourElapsedMs += delta;
        }

        if (!this.gameOver && this.isParkourTestMode && this.battleMode !== 'local-1v1-client') {
            this.updateParkourCourse(dt);
        }
        this.gfx.clear();

        // Draw world
        this.drawBackground();
        this.drawPlatforms();
        this.drawBlocks();

        if (!this.gameOver) {
            this.regenMana(dt);
            if (this.battleMode === 'local-1v1-client') {
                this.captureNetworkInput();
                this.sendRealtimeInput();
            } else {
                this.updateMouseAim();
                this.handleInput();
                this.updateChar(this.player, dt);
            }

            if (this.battleMode === 'local-1v1-host') {
                this.applyRemoteInputToOpponent();
                if (this.hasOpponent) this.updateChar(this.ai, dt);
                this.snapshotAccumulator += delta;
                if (this.snapshotAccumulator >= 16) {
                    this.snapshotAccumulator = 0;
                    this.broadcastRealtimeSnapshot();
                }
            } else if (this.battleMode === 'local-1v1') {
                if (this.hasOpponent) this.updateChar(this.ai, dt);
            } else if (this.battleMode === 'local-1v1-client') {
                // Client receives state from host and only renders it.
            } else {
                if (this.hasOpponent) {
                    this.updateAI(dt);
                    this.updateChar(this.ai, dt);
                }
            }

            if (this.battleMode !== 'local-1v1-client') {
                this.updateProjectiles(dt);
                this.updateParticles(dt);
                if (this.isParkourTestMode) {
                    this.evaluateParkourFailState();
                }
                this.updateCameraShake();
            }
        }

        this.syncCharacterSprite(this.player, this.playerSprite);
        if (this.hasOpponent) {
            this.syncCharacterSprite(this.ai, this.aiSprite);
        }
        this.drawProjectiles();
        this.drawParticles();
        this.drawBlockCursor();
        this.updateUITexts();
    }

    private captureNetworkInput() {
        this.networkInput.left = this.keyA.isDown;
        this.networkInput.right = this.keyD.isDown;
        this.networkInput.up = this.keyW.isDown;
        this.networkInput.down = this.keyS.isDown;
        this.networkInput.selectedElement = this.selectedElement;

        const pointer = this.input.activePointer;
        if (pointer) {
            const camera = this.cameras.main;
            this.networkInput.aimX = pointer.x + camera.scrollX;
            this.networkInput.aimY = pointer.y + camera.scrollY;
        }
    }

    private sendRealtimeInput() {
        if (!this.realtimeChannel || !this.realtimeMatch) return;
        this.realtimeChannel.postMessage({
            type: 'input',
            playerId: this.realtimeMatch.playerId,
            payload: { ...this.networkInput },
        });
        this.networkInput.shoot = false;
        this.networkInput.build = false;
    }

    private applyRemoteInputToOpponent() {
        this.ai.crouching = this.remoteInput.down;
        this.ai.moveInputX = (this.remoteInput.right ? 1 : 0) - (this.remoteInput.left ? 1 : 0);
        const remoteJumpPressed = this.remoteInput.up && !this.remoteUpWasDown;
        if (remoteJumpPressed && this.tryCharacterJump(this.ai)) {
            this.ai.velY = JUMP_FORCE;
        }
        this.remoteUpWasDown = this.remoteInput.up;

        if (this.remoteInput.selectedElement && this.opponentElementKeys.includes(this.remoteInput.selectedElement)) {
            this.opponentSelectedElement = this.remoteInput.selectedElement;
        }

        if (this.remoteInput.shoot) {
            this.ai.facingRight = this.getShootFacingByMoveOrAim(this.ai, this.remoteInput.aimX);
            const angle = this.getAngleFromAimFor(this.ai, this.remoteInput.aimX, this.remoteInput.aimY);
            const shotElement = this.opponentElementKeys.length > 0
                ? Phaser.Utils.Array.GetRandom(this.opponentElementKeys)
                : this.opponentSelectedElement;
            const shotFired = this.shootProjectile(this.ai, angle, false, this.playerShotSpeedMultiplier, shotElement);
            if (shotFired) this.lastOpponentShotAt = this.time.now;
        }
        if (this.remoteInput.build) {
            this.placeBlockFor(this.ai, this.opponentSelectedElement);
        }

        this.remoteInput.shoot = false;
        this.remoteInput.build = false;
    }

    private getAngleFromAimFor(c: CharacterState, aimX: number, aimY: number) {
        const muzzle = this.getGunMuzzlePosition(c);
        const dx = aimX - muzzle.x;
        const dy = aimY - muzzle.y;
        const angleRad = Math.atan2(-dy, Math.max(1, Math.abs(dx)));
        return Phaser.Math.Clamp(Phaser.Math.RadToDeg(angleRad), 0, 90);
    }

    private getShootFacingByMoveOrAim(c: CharacterState, aimX: number) {
        if (c.moveInputX > 0) return true;
        if (c.moveInputX < 0) return false;
        return aimX >= (c.x + c.width / 2);
    }

    private broadcastRealtimeSnapshot() {
        if (!this.realtimeChannel || !this.realtimeMatch) return;
        const payload: RealtimeSnapshotPayload = {
            player: { ...this.player, inventory: { ...this.player.inventory } },
            ai: { ...this.ai, inventory: { ...this.ai.inventory } },
            blocks: this.blocks.map((b) => ({ ...b })),
            projectiles: this.projectiles.map((p) => ({
                ...p,
                trail: p.trail.map((t) => ({ ...t })),
                sprite: undefined,
            })),
            matchTimer: this.matchTimer,
            gameOver: this.gameOver,
            winner: this.winner,
        };
        this.realtimeChannel.postMessage({ type: 'state', playerId: this.realtimeMatch.playerId, payload });
    }

    private applyRealtimeSnapshot(snapshot: RealtimeSnapshotPayload) {
        this.player = { ...snapshot.player, inventory: { ...snapshot.player.inventory } };
        this.ai = { ...snapshot.ai, inventory: { ...snapshot.ai.inventory } };
        this.blocks = snapshot.blocks.map((b) => ({ ...b }));

        const previousSprites = new Map<string, Phaser.GameObjects.Image | undefined>(
            this.projectiles.map((p) => [p.id, p.sprite]),
        );
        const incomingIds = new Set(snapshot.projectiles.map((p) => p.id));

        for (const existing of this.projectiles) {
            if (!incomingIds.has(existing.id)) {
                existing.sprite?.destroy();
            }
        }

        this.projectiles = snapshot.projectiles.map((p) => {
            const mapped: ProjectileState = {
                ...p,
                trail: p.trail.map((t) => ({ ...t })),
                sprite: previousSprites.get(p.id),
            };
            this.ensureProjectileSprite(mapped);
            return mapped;
        });

        this.matchTimer = snapshot.matchTimer;
        this.gameOver = snapshot.gameOver;
        this.winner = snapshot.winner;

        if (this.gameOver) {
            this.onGameOver?.(this.winner, this.player.health, this.ai.health);
        }
    }

    // ─── Input ───────────────────────────────────────────────
    private handleInput() {
        this.player.moveInputX = (this.keyD.isDown ? 1 : 0) - (this.keyA.isDown ? 1 : 0);
        if (Phaser.Input.Keyboard.JustDown(this.keyW) && this.tryCharacterJump(this.player)) { this.player.velY = JUMP_FORCE; }
        this.player.crouching = this.keyS.isDown;

        if (this.battleMode === 'local-1v1') {
            this.ai.moveInputX = (this.keyL.isDown ? 1 : 0) - (this.keyJ.isDown ? 1 : 0);
            if (Phaser.Input.Keyboard.JustDown(this.keyI) && this.tryCharacterJump(this.ai)) { this.ai.velY = JUMP_FORCE; }
            this.ai.crouching = this.keyK.isDown;
        }

        if (this.battleMode === 'local-1v1-client') {
            if (this.keyQ.isDown || this.keyE.isDown) {
                this.networkInput.selectedElement = this.selectedElement;
            }
        }
    }

    private updateMouseAim() {
        const pointer = this.input.activePointer;
        if (!pointer) return;
        const camera = this.cameras.main;
        const pointerWorldX = pointer.x + camera.scrollX;
        const pointerWorldY = pointer.y + camera.scrollY;

        this.applyAimTarget(pointerWorldX, pointerWorldY);
    }

    private applyAimTarget(worldX: number, worldY: number) {
        const muzzle = this.getGunMuzzlePosition(this.player);
        const dx = worldX - muzzle.x;
        const dy = worldY - muzzle.y;

        this.aimTargetX = worldX;
        this.aimTargetY = worldY;

        const angleRad = Math.atan2(-dy, Math.max(1, Math.abs(dx)));
        const angleDeg = Phaser.Math.RadToDeg(angleRad);
        this.playerAimAngle = Phaser.Math.Clamp(angleDeg, 0, 90);
    }

    private handlePlayerClickShot(pointer: Phaser.Input.Pointer) {
        const now = this.time.now;
        if (now - this.lastPlayerShotAt < this.playerShotCooldownMs) {
            return;
        }
        if (this.selectedShotKeys.length <= 0) {
            return;
        }
        if (this.player.mana < MANA_COST_SHOT) {
            return;
        }

        const camera = this.cameras.main;
        const pointerWorldX = pointer.x + camera.scrollX;
        const pointerWorldY = pointer.y + camera.scrollY;
        this.applyAimTarget(pointerWorldX, pointerWorldY);
        this.player.facingRight = this.getShootFacingByMoveOrAim(this.player, pointerWorldX);

        const shotElement = Phaser.Utils.Array.GetRandom(this.selectedShotKeys);
        const shotFired = this.shootProjectile(this.player, this.getCurrentPlayerAngle(), true, this.playerShotSpeedMultiplier, shotElement);
        if (!shotFired) {
            return;
        }

        this.lastShotElement = shotElement;
        this.lastPlayerShotAt = now;
    }

    private handleOpponentShoot() {
        if (!this.hasOpponent) return;
        const now = this.time.now;
        if (now - this.lastOpponentShotAt < this.playerShotCooldownMs) {
            return;
        }
        const shotElement = this.opponentElementKeys.length > 0
            ? Phaser.Utils.Array.GetRandom(this.opponentElementKeys)
            : this.opponentSelectedElement;
        const shotFired = this.shootProjectile(this.ai, this.getCurrentOpponentAngle(), false, this.playerShotSpeedMultiplier, shotElement);
        if (!shotFired) {
            return;
        }
        this.lastOpponentShotAt = now;
    }

    private regenMana(dt: number) {
        const regenAmount = MANA_REGEN_PER_SECOND * dt;
        this.player.mana = Phaser.Math.Clamp(this.player.mana + regenAmount, 0, MAX_MANA);
        if (this.hasOpponent) {
            this.ai.mana = Phaser.Math.Clamp(this.ai.mana + regenAmount, 0, MAX_MANA);
        }
    }

    private enforceFacingTowardOpponent() {
        if (!this.hasOpponent) return;
        this.player.facingRight = this.ai.x >= this.player.x;
        this.ai.facingRight = this.player.x >= this.ai.x;
    }

    private getCurrentPlayerAngle() {
        return this.playerAimAngle;
    }

    private getCurrentOpponentAngle() {
        const muzzle = this.getGunMuzzlePosition(this.ai);
        const targetX = this.player.x + this.player.width / 2;
        const targetY = this.player.y + this.player.height / 2;
        const dx = targetX - muzzle.x;
        const dy = targetY - muzzle.y;
        const angleRad = Math.atan2(-dy, Math.max(1, Math.abs(dx)));
        return Phaser.Math.Clamp(Phaser.Math.RadToDeg(angleRad), 0, 90);
    }

    private hashElementKey(key: string) {
        let hash = 0;
        for (let i = 0; i < key.length; i++) {
            hash = ((hash << 5) - hash) + key.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    private colorFromSymbol(symbol: string) {
        const hue = (this.hashElementKey(symbol) % 360) / 360;
        return Phaser.Display.Color.HSVToRGB(hue, 0.66, 1).color;
    }

    private brightenColor(color: number, amount = 0.45) {
        const rgb = Phaser.Display.Color.IntegerToRGB(color);
        const r = Math.min(255, Math.round(rgb.r + (255 - rgb.r) * amount));
        const g = Math.min(255, Math.round(rgb.g + (255 - rgb.g) * amount));
        const b = Math.min(255, Math.round(rgb.b + (255 - rgb.b) * amount));
        return (r << 16) | (g << 8) | b;
    }

    private getProjectilePrimaryColor(elementKey?: string, isPlayerProjectile = true) {
        if (elementKey && ELEMENTS[elementKey]) return ELEMENTS[elementKey].color;
        if (elementKey) return this.colorFromSymbol(elementKey);
        return isPlayerProjectile ? 0x4caf50 : 0xf44336;
    }

    private getProjectileVariant(elementKey?: string) {
        if (!elementKey) return 0;
        return this.hashElementKey(elementKey) % 4;
    }


    // ─── Character Physics ──────────────────────────────────
    private updateChar(c: CharacterState, dt: number) {
        const moveSpeedScale = c.crouching ? 0.55 : 1;
        const targetVelX = c.moveInputX * MOVE_SPEED * moveSpeedScale;
        const accel = c.onGround ? this.groundAccel : this.airAccel;
        const decel = c.onGround ? this.groundDecel : this.airDecel;
        const rate = c.moveInputX === 0 ? decel : accel;
        c.velX = this.approach(c.velX, targetVelX, rate * dt);
        if (c.moveInputX > 0) c.facingRight = true;
        else if (c.moveInputX < 0) c.facingRight = false;

        const wasOnGround = c.onGround;
        const previousFeetY = c.y + c.height;
        const platformDrift = (this.isParkourTestMode && this.isParkourScrollActive()) ? (this.parkourScrollSpeed * dt + 2) : 0;

        c.velY += GRAVITY * dt;
        c.x += c.velX * dt;
        c.y += c.velY * dt;

        c.onGround = false;
        for (const p of this.getActivePlatforms()) {
            const overlapX = c.x < p.x + p.width && c.x + c.width > p.x;
            const feetY = c.y + c.height;
            const canSnapToMovingPlatform = wasOnGround
                && overlapX
                && previousFeetY <= p.y + platformDrift
                && previousFeetY >= p.y - (platformDrift + 4)
                && c.velY >= -20;

            if ((overlapX && feetY >= p.y && feetY <= p.y + p.height + c.velY * dt + 5) || canSnapToMovingPlatform) {
                if (c.velY > 0) { c.y = p.y - c.height; c.velY = 0; c.onGround = true; }
                else if (canSnapToMovingPlatform) { c.y = p.y - c.height; c.velY = 0; c.onGround = true; }
            }
        }
        for (const b of this.blocks) {
            if (c.x < b.x + BLOCK_SIZE && c.x + c.width > b.x &&
                c.y + c.height >= b.y && c.y + c.height <= b.y + BLOCK_SIZE + c.velY * dt + 5) {
                if (c.velY > 0) { c.y = b.y - c.height; c.velY = 0; c.onGround = true; }
            }
        }

        if (c.onGround) {
            c.jumpsUsed = 0;
        }

        if (c.x < 0) c.x = 0;
        if (c.x + c.width > GAME_WIDTH) c.x = GAME_WIDTH - c.width;

        c.animTimer++;
        if (c.animTimer > 8) { c.animTimer = 0; c.animFrame = (c.animFrame + 1) % 4; }
    }

    private isParkourScrollActive() {
        return this.parkourElapsedMs >= this.parkourScrollDelayMs;
    }

    private approach(current: number, target: number, maxDelta: number) {
        if (current < target) return Math.min(current + maxDelta, target);
        if (current > target) return Math.max(current - maxDelta, target);
        return target;
    }

    private tryCharacterJump(c: CharacterState) {
        if (c.onGround) {
            c.jumpsUsed = 0;
        }
        if (c.jumpsUsed >= 2) {
            return false;
        }
        c.jumpsUsed += 1;
        return true;
    }

    private syncCharacterSprite(c: CharacterState, sprite: Phaser.GameObjects.Sprite) {
        const baseX = c.x + c.width / 2;
        const baseY = c.y + c.height + 2;
        const spriteScaleY = c.crouching ? CHARACTER_CROUCH_SCALE_Y : 1;

        sprite.setPosition(baseX, baseY);
        sprite.setDisplaySize(CHARACTER_SPRITE_WIDTH, CHARACTER_SPRITE_HEIGHT * spriteScaleY);
        sprite.setFlipX(!c.facingRight);

        const isRunning = c.onGround && Math.abs(c.velX) >= 20;
        const targetAnim = isRunning ? RUN_ANIM_KEY : IDLE_ANIM_KEY;
        if (this.anims.exists(targetAnim)) {
            if (!sprite.anims.isPlaying || sprite.anims.currentAnim?.key !== targetAnim) {
                sprite.play(targetAnim);
            }
        } else {
            sprite.anims.stop();
            sprite.setTexture(IDLE_TEXTURE_KEY);
        }
    }

    // ─── Shooting ───────────────────────────────────────────
    private shootProjectile(c: CharacterState, angle: number, isPlayer: boolean, speedMultiplier = 1, elementKey?: string) {
        if (c.mana < MANA_COST_SHOT) {
            return false;
        }

        const rad = (angle * Math.PI) / 180;
        const dir = c.facingRight ? 1 : -1;
        const muzzle = this.getGunMuzzlePosition(c);
        const speed = PROJECTILE_SPEED * speedMultiplier;
        const normalizedElement = elementKey?.trim();
        const effectVariant = this.getProjectileVariant(normalizedElement);
        const primaryColor = this.getProjectilePrimaryColor(normalizedElement, isPlayer);
        const textureKey = this.resolveProjectileTextureKey(normalizedElement, primaryColor);
        const projectileId = `${this.realtimeMatch?.roomId ?? 'offline'}_${this.projectileIdCounter++}`;

        const sprite = textureKey
            ? this.add.image(muzzle.x, muzzle.y, textureKey).setDepth(35).setDisplaySize(this.projectileDisplaySize, this.projectileDisplaySize)
            : undefined;
        if (sprite) {
            sprite.setAlpha(0.95);
            sprite.setBlendMode(Phaser.BlendModes.NORMAL);
        }

        this.projectiles.push({
            id: projectileId,
            x: muzzle.x,
            y: muzzle.y,
            velX: Math.cos(rad) * speed * dir,
            velY: -Math.sin(rad) * speed,
            age: 0,
            effectVariant,
            spinSpeed: (effectVariant === 3 ? 14 : effectVariant === 1 ? 12 : 8) * (Math.random() > 0.5 ? 1 : -1),
            elementKey,
            sprite,
            isPlayerProjectile: isPlayer,
            active: true,
            trail: [],
        });

        const created = this.projectiles[this.projectiles.length - 1];
        this.syncProjectileSpriteTransform(created);

        c.mana = Math.max(0, c.mana - MANA_COST_SHOT);
        return true;
    }

    private resolveProjectileTextureKey(elementKey: string | undefined, _fallbackColor: number) {
        if (!elementKey) return null;
        const normalizedElement = elementKey.trim();
        const displayCandidates = [
            `projectile_display_${normalizedElement}`,
            `projectile_display_${normalizedElement.toLowerCase()}`,
            `projectile_display_${normalizedElement.toUpperCase()}`,
        ];
        const readyDisplay = displayCandidates.find((key) => this.textures.exists(key));
        return readyDisplay ?? null;
    }

    private ensureProjectileSprite(projectile: ProjectileState) {
        if (projectile.sprite || !projectile.active) return;
        const color = this.getProjectilePrimaryColor(projectile.elementKey, projectile.isPlayerProjectile);
        const textureKey = this.resolveProjectileTextureKey(projectile.elementKey, color);
        if (!textureKey) return;

        const sprite = this.add.image(projectile.x, projectile.y, textureKey)
            .setDepth(35)
            .setDisplaySize(this.projectileDisplaySize, this.projectileDisplaySize)
            .setAlpha(0.95);

        sprite.setBlendMode(Phaser.BlendModes.NORMAL);

        projectile.sprite = sprite;
        this.syncProjectileSpriteTransform(projectile);
    }

    private syncProjectileSpriteTransform(projectile: ProjectileState) {
        if (!projectile.sprite) return;

        const pulseAmp = projectile.effectVariant === 2 ? 0.07 : 0.055;
        const pulseRate = projectile.effectVariant === 2 ? 13 : 10;
        const pulse = 1 + Math.sin(projectile.age * pulseRate) * pulseAmp;
        projectile.sprite.setPosition(projectile.x, projectile.y);
        projectile.sprite.setRotation(projectile.age * projectile.spinSpeed);
        projectile.sprite.setDisplaySize(this.projectileDisplaySize * pulse, this.projectileDisplaySize * pulse);
        projectile.sprite.setAlpha(0.9);
    }

    private getCharacterHitbox(c: CharacterState): CharacterHitbox {
        const baseX = c.x + c.width / 2;
        const baseY = c.y + c.height + 2;
        const hitboxWidth = 52;
        const hitboxHeight = c.crouching ? 92 : 102;

        return {
            x: baseX - hitboxWidth / 2,
            y: baseY - hitboxHeight,
            width: hitboxWidth,
            height: hitboxHeight,
        };
    }

    private getGunMuzzlePosition(c: CharacterState) {
        const spriteX = c.x + c.width / 2;
        const spriteBaseY = c.y + c.height + 2;

        // Tuned offsets to align projectile spawn with blaster tip.
        const muzzleXOffset = c.facingRight ? 18 : -18;
        const muzzleYOffset = c.crouching ? -50 : -60;

        return {
            x: spriteX + muzzleXOffset,
            y: spriteBaseY + muzzleYOffset,
        };
    }

    private updateProjectiles(dt: number) {
        for (const p of this.projectiles) {
            if (!p.active) continue;
            p.age += dt;
            const primaryColor = this.getProjectilePrimaryColor(p.elementKey, p.isPlayerProjectile);
            const maxTrail = p.effectVariant === 2 ? 24 : p.effectVariant === 1 ? 14 : p.effectVariant === 3 ? 16 : 20;
            p.trail.push({ x: p.x, y: p.y, alpha: 1 });
            if (p.trail.length > maxTrail) p.trail.shift();
            p.trail.forEach((t, i) => { t.alpha = i / p.trail.length; });

            const sparkleChance = (p.effectVariant === 1 ? 0.28 : p.effectVariant === 0 ? 0.2 : p.effectVariant === 3 ? 0.16 : 0.12) * dt * 60;
            if (Math.random() < sparkleChance) {
                this.particles.push({
                    x: p.x,
                    y: p.y,
                    velX: (Math.random() - 0.5) * (p.effectVariant === 1 ? 180 : 130),
                    velY: (Math.random() - 0.5) * (p.effectVariant === 2 ? 70 : 130),
                    color: primaryColor,
                    size: p.effectVariant === 2 ? 3.8 : 2.4,
                    life: p.effectVariant === 2 ? 0.95 : 0.8,
                    decay: p.effectVariant === 2 ? 0.022 + Math.random() * 0.02 : 0.035 + Math.random() * 0.03,
                });
            }

            p.velY += GRAVITY * this.projectileGravityScale * dt;
            p.x += p.velX * dt;
            p.y += p.velY * dt;
            if (p.sprite) {
                this.syncProjectileSpriteTransform(p);
            }

            if (p.x < -50 || p.x > GAME_WIDTH + 50 || p.y > GAME_HEIGHT + 50) {
                p.active = false;
                p.sprite?.destroy();
                continue;
            }

            // Platform collision
            for (const plat of this.getActivePlatforms()) {
                if (p.x > plat.x && p.x < plat.x + plat.width && p.y > plat.y && p.y < plat.y + plat.height) {
                    p.active = false;
                    p.sprite?.destroy();
                    this.spawnProjectileImpactEffect(p.x, p.y, p);
                    break;
                }
            }
            if (!p.active) continue;

            // Block collision
            for (let i = this.blocks.length - 1; i >= 0; i--) {
                const b = this.blocks[i];
                if (p.x > b.x && p.x < b.x + BLOCK_SIZE && p.y > b.y && p.y < b.y + BLOCK_SIZE) {
                    p.active = false;
                    p.sprite?.destroy();
                    b.hp -= this.blockDamage;
                    this.spawnProjectileImpactEffect(p.x, p.y, p);
                    this.spawnParticles(p.x, p.y, ELEMENTS[b.element].color);
                    if (b.hp <= 0) {
                        if (ELEMENTS[b.element].special === 'explode') this.createExplosion(b.x + BLOCK_SIZE / 2, b.y + BLOCK_SIZE / 2);
                        this.blocks.splice(i, 1);
                    }
                    break;
                }
            }
            if (!p.active) continue;

            // Character collision
            if (!this.hasOpponent && p.isPlayerProjectile) {
                continue;
            }
            const target = p.isPlayerProjectile ? this.ai : this.player;
            const hitbox = this.getCharacterHitbox(target);
            if (p.x > hitbox.x && p.x < hitbox.x + hitbox.width && p.y > hitbox.y && p.y < hitbox.y + hitbox.height) {
                this.takeDamage(target, DAMAGE);
                p.active = false;
                p.sprite?.destroy();
                this.spawnProjectileImpactEffect(p.x, p.y, p);
            }
        }
        this.projectiles = this.projectiles.filter(pp => pp.active);
    }

    private spawnProjectileImpactEffect(x: number, y: number, projectile: ProjectileState) {
        const elem = projectile.elementKey ? ELEMENTS[projectile.elementKey] : undefined;
        const color = this.getProjectilePrimaryColor(projectile.elementKey, projectile.isPlayerProjectile);
        const highlight = this.brightenColor(color, 0.55);
        const variant = projectile.effectVariant;
        const isExplosive = elem?.special === 'explode';

        const burstCount = (variant === 0 ? 24 : variant === 1 ? 18 : variant === 2 ? 16 : 22) + (isExplosive ? 10 : 0);
        const burstSpeed = (variant === 0 ? 340 : variant === 1 ? 520 : variant === 2 ? 240 : 300) + (isExplosive ? 120 : 0);
        const ringCount = variant === 2 ? 2 : 1;

        for (let i = 0; i < burstCount; i++) {
            this.particles.push({
                x,
                y,
                velX: (Math.random() - 0.5) * burstSpeed,
                velY: (Math.random() - 0.5) * burstSpeed,
                color: i % 2 === 0 ? color : highlight,
                size: Math.random() * (variant === 2 ? 6 : 4) + 2,
                life: 1,
                decay: Math.random() * (variant === 2 ? 0.03 : 0.04) + (variant === 2 ? 0.02 : 0.024),
            });
        }

        for (let ring = 0; ring < ringCount; ring++) {
            const ringRadius = 16 + ring * 10;
            const ringParticles = 10 + ring * 4;
            for (let i = 0; i < ringParticles; i++) {
                const a = (i / ringParticles) * Math.PI * 2;
                this.particles.push({
                    x: x + Math.cos(a) * ringRadius,
                    y: y + Math.sin(a) * ringRadius,
                    velX: Math.cos(a) * (120 + ring * 50),
                    velY: Math.sin(a) * (120 + ring * 50),
                    color: highlight,
                    size: variant === 1 ? 2 : 3,
                    life: 0.8,
                    decay: 0.03 + Math.random() * 0.02,
                });
            }
        }
    }

    // ─── Block Placement ───────────────────────────────────
    private placeBlock() {
        this.placeBlockFor(this.player, this.selectedElement);
    }

    private placeBlockFor(actor: CharacterState, elementKey: string) {
        const elem = ELEMENTS[elementKey];
        if (!elem) return;
        if (actor.inventory[elementKey] <= 0) return;
        if (actor.mana < MANA_COST_BLOCK) return;

        let bx: number, by: number;
        if (actor.side === 'left' && this.buildMode) {
            // Use cursor position
            bx = this.cursorGridX * BLOCK_SIZE;
            by = this.cursorGridY * BLOCK_SIZE;
        } else {
            // Legacy: place in front of player
            bx = actor.facingRight
                ? Math.floor((actor.x + actor.width) / BLOCK_SIZE) * BLOCK_SIZE
                : Math.floor((actor.x - BLOCK_SIZE) / BLOCK_SIZE) * BLOCK_SIZE;
            by = Math.floor((actor.y + actor.height - BLOCK_SIZE) / BLOCK_SIZE) * BLOCK_SIZE;
        }

        if (bx < 0 || bx > GAME_WIDTH - BLOCK_SIZE) return;
        if (by < 0 || by > GAME_HEIGHT - BLOCK_SIZE) return;
        const minDistance = BLOCK_SIZE + this.minBlockSpacing;
        for (const b of this.blocks) {
            const dx = Math.abs(b.x - bx);
            const dy = Math.abs(b.y - by);
            if (dx < minDistance && dy < minDistance) return;
        }
        this.blocks.push({
            x: bx,
            y: by,
            element: elementKey,
            hp: elem.hp,
            maxHp: elem.hp,
            side: bx >= RIGHT_ZONE_START ? 'right' : 'left',
        });
        actor.inventory[elementKey]--;
        actor.mana = Math.max(0, actor.mana - MANA_COST_BLOCK);
    }

    // ─── Damage ─────────────────────────────────────────────
    private takeDamage(c: CharacterState, amount: number) {
        c.health -= amount;
        if (c.health <= 0) {
            c.health = 0;
            this.gameOver = true;
            if (!this.hasOpponent) {
                this.winner = c.side === 'left' ? 'GAME OVER' : 'PLAYER WINS';
            } else if (this.battleMode === 'local-1v1') {
                this.winner = c.side === 'left' ? 'PLAYER 2 WINS' : 'PLAYER 1 WINS';
            } else {
                this.winner = c.side === 'left' ? 'AI WINS' : 'PLAYER WINS';
            }
            this.onGameOver?.(this.winner, this.player.health, this.ai.health);
        }
        this.cameraShakeIntensity = 8;
        this.spawnParticles(c.x + c.width / 2, c.y + c.height / 2, c.side === 'left' ? 0x4caf50 : 0xf44336);
    }

    private createExplosion(cx: number, cy: number) {
        const radius = 80;
        const targets = this.hasOpponent ? [this.player, this.ai] : [this.player];
        for (const c of targets) {
            const dx = (c.x + c.width / 2) - cx;
            const dy = (c.y + c.height / 2) - cy;
            if (Math.sqrt(dx * dx + dy * dy) < radius) this.takeDamage(c, 20);
        }
        for (let i = 0; i < 40; i++) {
            this.particles.push({
                x: cx, y: cy,
                velX: (Math.random() - 0.5) * 600, velY: (Math.random() - 0.5) * 600,
                color: Math.random() > 0.5 ? 0x44cc44 : 0xffeb3b,
                size: Math.random() * 8 + 3, life: 1, decay: Math.random() * 0.02 + 0.015,
            });
        }
    }

    private endByTimer() {
        this.gameOver = true;
        if (!this.hasOpponent) this.winner = 'SURVIVED';
        else if (this.player.health > this.ai.health) this.winner = this.battleMode === 'local-1v1' ? 'PLAYER 1 WINS' : 'PLAYER WINS';
        else if (this.ai.health > this.player.health) this.winner = this.battleMode === 'local-1v1' ? 'PLAYER 2 WINS' : 'AI WINS';
        else this.winner = 'DRAW';
        this.onGameOver?.(this.winner, this.player.health, this.ai.health);
    }

    shutdown() {
        for (const projectile of this.projectiles) {
            projectile.sprite?.destroy();
        }
        if (this.realtimeChannel) {
            this.realtimeChannel.close();
            this.realtimeChannel = null;
        }
    }

    // ─── Particles ──────────────────────────────────────────
    private spawnParticles(x: number, y: number, color: number) {
        for (let i = 0; i < 15; i++) {
            this.particles.push({
                x, y,
                velX: (Math.random() - 0.5) * 300, velY: (Math.random() - 0.5) * 300,
                color, size: Math.random() * 5 + 2, life: 1, decay: Math.random() * 0.03 + 0.02,
            });
        }
    }

    private updateParticles(dt: number) {
        for (const p of this.particles) {
            p.x += p.velX * dt;
            p.y += p.velY * dt;
            p.velY += GRAVITY * 0.3 * dt;
            p.life -= p.decay;
        }
        this.particles = this.particles.filter(p => p.life > 0);
    }

    // ─── Camera Shake ──────────────────────────────────────
    private updateCameraShake() {
        if (this.cameraShakeIntensity > 0) {
            this.cameraShakeX = (Math.random() - 0.5) * this.cameraShakeIntensity;
            this.cameraShakeY = (Math.random() - 0.5) * this.cameraShakeIntensity;
            this.cameraShakeIntensity *= 0.9;
            if (this.cameraShakeIntensity < 0.5) {
                this.cameraShakeIntensity = 0;
                this.cameraShakeX = 0;
                this.cameraShakeY = 0;
            }
        }
        this.cameras.main.setScroll(-this.cameraShakeX, -this.cameraShakeY);
    }

    // ─── AI ─────────────────────────────────────────────────
    private updateAI(dt: number) {
        if (this.gameOver) return;
        const a = this.ai;
        const now = this.time.now;
        a.aiTimer++;
        a.aiShootTimer++;

        const cvx = this.player.x - this.aiLastPlayerX;
        this.playerVelocityHistory.push({ vx: cvx, vy: this.player.y - this.aiLastPlayerY });
        if (this.playerVelocityHistory.length > 30) this.playerVelocityHistory.shift();
        let avgVx = 0;
        for (const v of this.playerVelocityHistory) avgVx += v.vx;
        avgVx /= this.playerVelocityHistory.length;
        this.aiLastPlayerX = this.player.x;
        this.aiLastPlayerY = this.player.y;

        const hr = a.health / Math.max(this.player.health, 1);
        const cd = hr < 0.5 ? 50 : hr < 0.8 ? 80 : 110;

        if (a.aiShootTimer > cd) {
            let bestAngle = 45, bestScore = -Infinity, foundHit = false;
            const playerHitbox = this.getCharacterHitbox(this.player);
            const preds = [
                { x: playerHitbox.x, y: playerHitbox.y },
                { x: playerHitbox.x + avgVx * 12, y: Math.min(playerHitbox.y, GROUND_Y - 60) },
            ];
            for (let ang = 15; ang <= 75; ang += 2) {
                for (const pr of preds) {
                    const px = Math.max(0, Math.min(GAME_WIDTH - 40, pr.x));
                    const py = Math.max(100, Math.min(GROUND_Y - 60, pr.y));
                    const aiMuzzle = this.getGunMuzzlePosition(a);
                    const r = this.simShot(aiMuzzle.x, aiMuzzle.y, ang, px, py, playerHitbox.width, playerHitbox.height);
                    if (r.hit) {
                        const s = 1000 - r.frame;
                        if (s > bestScore) { bestScore = s; bestAngle = ang; foundHit = true; }
                    } else if (!foundHit) {
                        const s = -r.dist;
                        if (s > bestScore) { bestScore = s; bestAngle = ang; }
                    }
                }
            }
            const aiShotFired = this.shootProjectile(a, bestAngle + (Math.random() - 0.5) * 15, false);
            if (aiShotFired) {
                a.aiShootTimer = 0;
            }
        }

        if (a.aiTimer > 50) {
            a.aiTimer = 0;
            const r = Math.random();
            if (r < 0.4) a.moveInputX = 1;
            else if (r < 0.8) a.moveInputX = -1;
            else a.moveInputX = 0;
        }

        const aiFeetY = a.y + a.height;
        const playerFeetY = this.player.y + this.player.height;
        const playerHigher = playerFeetY < aiFeetY - 28;
        const jumpReady = now - this.lastAiJumpAt >= this.aiJumpCooldownMs;
        const nearBlockAhead = this.blocks.some((b) => {
            const aheadX = a.facingRight ? a.x + a.width + 12 : a.x - 12;
            const sameLane = b.y < aiFeetY && b.y + BLOCK_SIZE > a.y;
            const isAhead = a.facingRight
                ? (b.x <= aheadX && b.x + BLOCK_SIZE >= aheadX)
                : (b.x <= aheadX && b.x + BLOCK_SIZE >= aheadX);
            return sameLane && isAhead;
        });
        const nearEdge = this.isNearPlatformEdge(a);

        if (a.onGround && jumpReady && (playerHigher || nearBlockAhead || nearEdge || Math.random() < 0.08)) {
            a.velY = JUMP_FORCE;
            this.lastAiJumpAt = now;
        }

        if (a.x < 20) a.moveInputX = 1;
        else if (a.x > GAME_WIDTH - 70) a.moveInputX = -1;
    }

    private isNearPlatformEdge(c: CharacterState) {
        const feetY = c.y + c.height;
        const centerX = c.x + c.width / 2;
        const support = this.getActivePlatforms().find((p) => (
            centerX > p.x && centerX < p.x + p.width && Math.abs(feetY - p.y) < 12
        ));

        if (!support) return false;

        const edgeMargin = 22;
        if (c.facingRight) {
            return support.x + support.width - centerX < edgeMargin;
        }
        return centerX - support.x < edgeMargin;
    }

    private simShot(sx: number, sy: number, angle: number, tx: number, ty: number, tw: number, th: number) {
        const rad = (angle * Math.PI) / 180;
        const step = 1 / 60;
        let x = sx, y = sy;
        const dir = this.ai.facingRight ? 1 : -1;
        let vx = Math.cos(rad) * PROJECTILE_SPEED * step * dir;
        let vy = -Math.sin(rad) * PROJECTILE_SPEED * step;
        const g = GRAVITY * this.projectileGravityScale * step * step;
        let best = Infinity, bf = -1;

        for (let f = 0; f < 120; f++) {
            vy += g; x += vx; y += vy;
            if (x >= tx && x <= tx + tw && y >= ty && y <= ty + th) return { hit: true, frame: f, dist: 0 };
            const d = Math.sqrt((x - tx - tw / 2) ** 2 + (y - ty - th / 2) ** 2);
            if (d < best) { best = d; bf = f; }
            if (y > GROUND_Y + 10 || x < -50) return { hit: false, dist: best, frame: bf };
        }
        return { hit: false, dist: best, frame: bf };
    }

    // ═══════════════════════════════════════════════════════════
    // DRAWING (Phaser Graphics)
    // ═══════════════════════════════════════════════════════════

    private drawBackground() {
        const g = this.gfx;
        // Sky gradient (simulated with horizontal bands)
        const bands = 20;
        for (let i = 0; i < bands; i++) {
            const t = i / bands;
            const r = Math.floor(13 * (1 - t) + 10 * t);
            const gr = Math.floor(13 * (1 - t) + 22 * t);
            const b = Math.floor(26 * (1 - t) + 40 * t);
            const color = (r << 16) | (gr << 8) | b;
            g.fillStyle(color);
            g.fillRect(0, (i / bands) * GAME_HEIGHT, GAME_WIDTH, GAME_HEIGHT / bands + 1);
        }

        // Stars
        for (let i = 0; i < 60; i++) {
            const sx = (i * 73 + 11) % GAME_WIDTH;
            const sy = (i * 37 + 7) % 350;
            const sz = (i % 3) + 0.5;
            g.fillStyle(0xffffff, 0.2 + (i % 5) * 0.12);
            g.fillCircle(sx, sy, sz);
        }

        // Moon
        g.fillStyle(0xe8e8e8);
        g.fillCircle(GAME_WIDTH - 150, 90, 35);
        g.fillStyle(0xcccccc);
        g.fillCircle(GAME_WIDTH - 160, 85, 6);
        g.fillCircle(GAME_WIDTH - 142, 98, 4);
    }

    private drawPlatforms() {
        const g = this.gfx;
        for (const p of this.getActivePlatforms()) {
            if (p.height > 50) {
                g.fillStyle(0x2d3748);
                g.fillRect(p.x, p.y, p.width, p.height);
                g.fillStyle(0x48bb78);
                g.fillRect(p.x, p.y, p.width, 6);
            } else {
                g.fillStyle(this.isParkourTestMode ? 0x2f445e : 0x5a6577);
                g.fillRect(p.x, p.y, p.width, p.height);
            }
            g.lineStyle(1, 0xa0aec0, 0.5);
            g.strokeRect(p.x, p.y, p.width, p.height);
        }

    }

    private getActivePlatforms() {
        return this.isParkourTestMode ? this.parkourPlatforms : PLATFORMS;
    }

    private initializeParkourPlatforms() {
        this.parkourPlatforms = [];
        this.parkourPlatforms.push({ x: 30, y: GAME_HEIGHT - 120, width: 330, height: 20, side: 'left' });
        this.parkourPlatforms.push({ x: GAME_WIDTH - 360, y: GAME_HEIGHT - 120, width: 330, height: 20, side: 'right' });
        const spacing = 92;

        for (let i = 0; i < 12; i++) {
            const y = GAME_HEIGHT - 210 - i * spacing;
            const leftPlatform: PlatformDef = { x: 50, y, width: 150, height: 18, side: 'left' };
            const rightPlatform: PlatformDef = { x: 860, y: y - spacing / 2, width: 150, height: 18, side: 'right' };
            this.repositionParkourPlatform(leftPlatform, leftPlatform.y - 12, leftPlatform.y + 12);
            this.repositionParkourPlatform(rightPlatform, rightPlatform.y - 12, rightPlatform.y + 12);
            this.parkourPlatforms.push(leftPlatform);
            this.parkourPlatforms.push(rightPlatform);
        }
    }

    private updateParkourCourse(dt: number) {
        if (!this.isParkourScrollActive()) {
            return;
        }

        for (const platform of this.parkourPlatforms) {
            platform.y += this.parkourScrollSpeed * dt;
            if (platform.y > GAME_HEIGHT + 60) {
                this.repositionParkourPlatform(platform, -900, -120);
            }
        }

        this.parkourHazardY = Math.max(140, this.parkourHazardY - this.parkourHazardRiseSpeed * dt);
    }

    private repositionParkourPlatform(platform: PlatformDef, minY: number, maxY: number) {
        let candidateX = platform.x;
        let candidateY = Phaser.Math.Between(minY, maxY);
        for (let attempt = 0; attempt < 28; attempt++) {
            candidateX = platform.side === 'left'
                ? Phaser.Math.Between(50, 620)
                : Phaser.Math.Between(860, 1430);
            candidateY = Phaser.Math.Between(minY, maxY);
            if (!this.hasNearbyParkourPlatform(platform, candidateX, candidateY)) {
                break;
            }
        }
        platform.x = candidateX;
        platform.y = candidateY;
    }

    private hasNearbyParkourPlatform(target: PlatformDef, x: number, y: number) {
        return this.parkourPlatforms.some((p) => (
            p !== target
            && p.side === target.side
            && Math.abs(p.x - x) < this.parkourPlatformGapX
            && Math.abs(p.y - y) < this.parkourPlatformGapY
        ));
    }

    private evaluateParkourFailState() {
        if (this.gameOver) return;

        const playerFell = this.player.y > GAME_HEIGHT + this.parkourFallMargin;
        const opponentFell = this.hasOpponent
            ? (this.ai.y > GAME_HEIGHT + this.parkourFallMargin)
            : false;

        if (!playerFell && (!this.hasOpponent || !opponentFell)) return;

        this.gameOver = true;
        if (!this.hasOpponent) {
            this.winner = 'GAME OVER';
        } else if (playerFell && opponentFell) {
            this.winner = 'DRAW';
        } else if (playerFell) {
            this.winner = 'PLAYER 2 WINS';
        } else {
            this.winner = 'PLAYER 1 WINS';
        }
        this.onGameOver?.(this.winner, this.player.health, this.ai.health);
    }

    private drawBlocks() {
        const g = this.gfx;
        for (const b of this.blocks) {
            const elem = ELEMENTS[b.element];
            const hpR = b.hp / b.maxHp;
            g.fillStyle(elem.color, 0.5 + hpR * 0.5);
            g.fillRect(b.x, b.y, BLOCK_SIZE, BLOCK_SIZE);
            g.lineStyle(2, hpR > 0.5 ? 0xffffff : 0xff0000, hpR > 0.5 ? 0.25 : 0.5);
            g.strokeRect(b.x, b.y, BLOCK_SIZE, BLOCK_SIZE);

            // Tiny HP bar to make block damage readable during combat.
            g.fillStyle(0x111111, 0.75);
            g.fillRect(b.x + 3, b.y + 3, BLOCK_SIZE - 6, 4);
            g.fillStyle(hpR > 0.5 ? 0x4caf50 : hpR > 0.25 ? 0xffc107 : 0xf44336, 0.95);
            g.fillRect(b.x + 3, b.y + 3, (BLOCK_SIZE - 6) * Phaser.Math.Clamp(hpR, 0, 1), 4);

            if (hpR < 0.66) {
                g.lineStyle(1, 0xffffff, 0.28);
                g.lineBetween(b.x + 8, b.y + 10, b.x + 16, b.y + 18);
            }
            if (hpR < 0.33) {
                g.lineStyle(1, 0xffffff, 0.35);
                g.lineBetween(b.x + 20, b.y + 8, b.x + 12, b.y + 22);
                g.lineBetween(b.x + 7, b.y + 23, b.x + 25, b.y + 13);
            }
        }
        // Block element text rendered separately via dynamic text
        // (kept simple - blocks show via color)
    }

    private drawCharacter(c: CharacterState, isPlayer: boolean) {
        const g = this.gfx;
        const cx = c.x + c.width / 2;
        const h = c.crouching ? c.height * 0.6 : c.height;
        const baseY = c.y + c.height;
        const color = isPlayer ? 0x4caf50 : 0xf44336;
        const dark = isPlayer ? 0x388e3c : 0xc62828;

        // Head
        g.fillStyle(color);
        g.fillCircle(cx, baseY - h + 12, 12);
        g.lineStyle(2, dark);
        g.strokeCircle(cx, baseY - h + 12, 12);

        // Eyes
        const eo = c.facingRight ? 3 : -3;
        g.fillStyle(0xffffff);
        g.fillCircle(cx + eo, baseY - h + 10, 3);
        g.fillStyle(0x000000);
        g.fillCircle(cx + eo + (c.facingRight ? 1 : -1), baseY - h + 10, 1.5);

        // Body
        g.lineStyle(6, color);
        g.lineBetween(cx, baseY - h + 24, cx, baseY - 20);

        // Arms
        const aw = Math.abs(c.velX) > 10 ? Math.sin(c.animFrame * 0.8) * 5 : 0;
        g.lineBetween(cx - 15, baseY - h + 35 + aw, cx, baseY - h + 30);
        g.lineBetween(cx, baseY - h + 30, cx + 15, baseY - h + 35 - aw);

        // Legs
        const ls = Math.abs(c.velX) > 10 ? Math.sin(c.animFrame) * 8 : 0;
        g.lineBetween(cx, baseY - 20, cx - 10 - ls, baseY - 5);
        g.lineBetween(cx, baseY - 20, cx + 10 + ls, baseY - 5);
    }

    private drawProjectiles() {
        const g = this.gfx;
        for (const p of this.projectiles) {
            const projectileColor = this.getProjectilePrimaryColor(p.elementKey, p.isPlayerProjectile);
            const trailAlphaBase = 0.42;
            const trailRadiusBase = 5.2;

            // Keep one shared trail style for every projectile so host/client always see the same shape.
            for (const t of p.trail) {
                const dotAlpha = Math.max(0, t.alpha * trailAlphaBase);
                const dotRadius = Math.max(0.6, trailRadiusBase * t.alpha);
                g.fillStyle(projectileColor, dotAlpha);
                g.fillCircle(t.x, t.y, dotRadius);
            }

            if (p.sprite) {
                this.syncProjectileSpriteTransform(p);
                continue;
            }

            // Fallback orb if sprite is temporarily unavailable.
            g.fillStyle(projectileColor);
            g.fillCircle(p.x, p.y, 8);
            g.fillStyle(0xffffff, 0.7);
            g.fillCircle(p.x - 2.4, p.y - 2.4, 2.2);
        }
    }

    private drawParticles() {
        const g = this.gfx;
        for (const p of this.particles) {
            g.fillStyle(p.color, Math.max(0, p.life));
            g.fillCircle(p.x, p.y, Math.max(0.1, p.size * p.life));
        }
    }

    // ─── Block Cursor Drawing ─────────────────────────────
    private drawBlockCursor() {
        if (!this.buildMode || this.gameOver) return;
        const g = this.gfx;
        const bx = this.cursorGridX * BLOCK_SIZE;
        const by = this.cursorGridY * BLOCK_SIZE;
        const elem = ELEMENTS[this.selectedElement];

        // Pulsing animation
        this.cursorBlink += 0.06;
        const alpha = 0.3 + Math.sin(this.cursorBlink) * 0.2;

        // Cursor fill
        g.fillStyle(elem.color, alpha);
        g.fillRect(bx, by, BLOCK_SIZE, BLOCK_SIZE);

        // Cursor border (bright pulsing)
        g.lineStyle(2, 0xffffff, 0.5 + Math.sin(this.cursorBlink) * 0.3);
        g.strokeRect(bx, by, BLOCK_SIZE, BLOCK_SIZE);

        // Crosshair lines
        g.lineStyle(1, 0xffffff, 0.2);
        g.lineBetween(bx + BLOCK_SIZE / 2, by, bx + BLOCK_SIZE / 2, by + BLOCK_SIZE);
        g.lineBetween(bx, by + BLOCK_SIZE / 2, bx + BLOCK_SIZE, by + BLOCK_SIZE / 2);

        // "BUILD MODE" indicator
        g.fillStyle(0x000000, 0.7);
        g.fillRect(GAME_WIDTH / 2 - 60, 122, 120, 22);
        g.lineStyle(1, 0xffeb3b, 0.8);
        g.strokeRect(GAME_WIDTH / 2 - 60, 122, 120, 22);
    }

    // ─── UI Updates ─────────────────────────────────────────
    private updateUITexts() {
        const g = this.gfx;

        // Player HP bar
        g.fillStyle(0x222222); g.fillRect(20, 18, 200, 22);
        g.fillStyle(0x4caf50); g.fillRect(22, 20, (this.player.health / MAX_HEALTH) * 196, 18);
        g.lineStyle(1, 0xaaaaaa); g.strokeRect(20, 18, 200, 22);

        // Player mana bar
        g.fillStyle(0x1b2533); g.fillRect(20, 43, 200, 12);
        g.fillStyle(0x29b6f6); g.fillRect(22, 45, (this.player.mana / MAX_MANA) * 196, 8);
        g.lineStyle(1, 0x4fc3f7); g.strokeRect(20, 43, 200, 12);

        if (this.hasOpponent) {
            // AI HP bar
            g.fillStyle(0x222222); g.fillRect(GAME_WIDTH - 220, 18, 200, 22);
            g.fillStyle(0xf44336); g.fillRect(GAME_WIDTH - 218, 20, (this.ai.health / MAX_HEALTH) * 196, 18);
            g.lineStyle(1, 0xaaaaaa); g.strokeRect(GAME_WIDTH - 220, 18, 200, 22);

            // AI mana bar
            g.fillStyle(0x1b2533); g.fillRect(GAME_WIDTH - 220, 43, 200, 12);
            g.fillStyle(0x29b6f6); g.fillRect(GAME_WIDTH - 218, 45, (this.ai.mana / MAX_MANA) * 196, 8);
            g.lineStyle(1, 0x4fc3f7); g.strokeRect(GAME_WIDTH - 220, 43, 200, 12);
        }

        // Timer bg
        g.fillStyle(0x000000, 0.7); g.fillRect(GAME_WIDTH / 2 - 45, 10, 90, 30);
        g.lineStyle(2, this.matchTimer < 60 ? 0xf44336 : 0x4caf50);
        g.strokeRect(GAME_WIDTH / 2 - 45, 10, 90, 30);

        // Angle bg
        g.fillStyle(0x000000, 0.7); g.fillRect(GAME_WIDTH / 2 - 70, 46, 140, 40);
        g.lineStyle(1, 0x4caf50, 0.5); g.strokeRect(GAME_WIDTH / 2 - 70, 46, 140, 40);

        const currentAngle = this.getCurrentPlayerAngle();

        // Instructions bg
        g.fillStyle(0x000000, 0.6); g.fillRect(15, GAME_HEIGHT - 92, 280, 80);

        // Element panel bg
        g.fillStyle(0x000000, 0.7); g.fillRect(GAME_WIDTH - 280, GAME_HEIGHT - 90, 270, 72);

        // Element boxes
        this.selectedElementKeys.forEach((key, i) => {
            const elem = ELEMENTS[key];
            const ex = GAME_WIDTH - 275 + i * 65;
            const ey = GAME_HEIGHT - 55;
            const isSel = key === this.selectedElement;
            g.fillStyle(isSel ? elem.color : 0x333333);
            g.fillRect(ex, ey, 55, 30);
            g.lineStyle(isSel ? 2 : 1, isSel ? 0xffffff : 0x555555);
            g.strokeRect(ex, ey, 55, 30);
        });

        // Update text content
        this.uiTexts.get('playerHp')!.setText(`HP ${Math.round(this.player.health)}`);
        this.uiTexts.get('playerMana')!.setText(`MANA ${Math.floor(this.player.mana)}/${MAX_MANA}`);
        this.uiTexts.get('playerLabel')!.setText(`LOADOUT: ${this.selectedShotKeys.map((k) => ELEMENTS[k]?.symbol ?? k).join(' / ')}`);
        this.uiTexts.get('aiLabel')!.setVisible(this.hasOpponent);
        this.uiTexts.get('aiHp')!.setVisible(this.hasOpponent);
        this.uiTexts.get('aiMana')!.setVisible(this.hasOpponent);
        if (this.hasOpponent) {
            this.uiTexts.get('aiLabel')!.setText(this.battleMode === 'local-1v1' ? 'PLAYER 2' : 'AI');
            this.uiTexts.get('aiHp')!.setText(`HP ${Math.round(this.ai.health)}`);
            this.uiTexts.get('aiMana')!.setText(`MANA ${Math.floor(this.ai.mana)}/${MAX_MANA}`);
        }

        const mins = Math.floor(this.matchTimer / 60);
        const secs = this.matchTimer % 60;
        const timerText = this.uiTexts.get('timer')!;
        timerText.setText(`${mins}:${secs.toString().padStart(2, '0')}`);
        timerText.setColor(this.matchTimer < 60 ? '#f44336' : '#ffffff');

        this.uiTexts.get('angleValue')!.setText(`${currentAngle} deg`);

        if (this.isParkourTestMode && !this.hasOpponent) {
            this.uiTexts.get('inst1')!.setText('Solo Test: WASD move, CLICK shoot, Q/E cycle, SHIFT build');
            this.uiTexts.get('inst2')!.setText('Muc tieu: giu vi tri, parkour tren map dang truot');
            this.uiTexts.get('inst3')!.setText('RULE: cham vung do / roi xuong la thua ngay');
            this.uiTexts.get('inst4')!.setText('Ban block de don duong, luyen movement + aim');
        } else if (this.battleMode === 'local-1v1') {
            if (this.isParkourTestMode) {
                this.uiTexts.get('inst1')!.setText('P1: WASD move, CLICK shoot, Q/E cycle, SHIFT build');
                this.uiTexts.get('inst2')!.setText('P2: IJKL move, O shoot, N/M cycle, U build');
                this.uiTexts.get('inst3')!.setText('RULE: Roi xuong vung do hoac het HP la thua');
                this.uiTexts.get('inst4')!.setText('Map truot xuong lien tuc: vua parkour vua ban pha block');
            } else {
                this.uiTexts.get('inst1')!.setText('P1: WASD move, CLICK shoot, Q/E cycle, SHIFT build');
                this.uiTexts.get('inst2')!.setText('P2: IJKL move, O shoot, N/M cycle, U build');
                this.uiTexts.get('inst3')!.setText('P1: mouse aim | P2 auto-aim to P1');
                this.uiTexts.get('inst4')!.setText('B + arrows: move P1 build cursor');
            }
        }

        // Element counts
        this.selectedElementKeys.forEach((key) => {
            this.uiTexts.get(`elemCount_${key}`)!.setText(`×${this.player.inventory[key]}`);
        });

        const selectedElem = ELEMENTS[this.selectedElement];
        const lastShotLabel = ELEMENTS[this.lastShotElement]?.symbol ?? this.lastShotElement;
        this.uiTexts.get('elemSelectedName')!.setText(`Build: ${selectedElem.symbol} | Last shot: ${lastShotLabel}`);

        // Build mode text (created once, shown/hidden)
        if (!this.uiTexts.has('buildMode')) {
            this.uiTexts.set('buildMode', this.add.text(GAME_WIDTH / 2, 133, 'BUILD MODE', {
                fontFamily: '"Courier New", monospace', fontSize: '11px', fontStyle: 'bold', color: '#ffeb3b',
            }).setOrigin(0.5).setDepth(100));
        }
        this.uiTexts.get('buildMode')!.setVisible(this.buildMode && !this.gameOver);

        // Game over overlay
        if (this.gameOver) {
            g.fillStyle(0x000000, 0.8);
            g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

            const goTitle = this.uiTexts.get('goTitle')!;
            goTitle.setVisible(true);
            if (this.winner.includes('PLAYER')) {
                goTitle.setText('YOU WIN!').setColor('#4CAF50');
            } else if (this.winner === 'DRAW') {
                goTitle.setText('DRAW!').setColor('#ffeb3b');
            } else {
                goTitle.setText('GAME OVER').setColor('#f44336');
            }

            const goScore = this.uiTexts.get('goScore')!;
            goScore.setVisible(true).setText(
                this.hasOpponent
                    ? `Player HP: ${this.player.health}  |  AI HP: ${this.ai.health}`
                    : `Player HP: ${this.player.health}  |  Goal: Survive`,
            );

            this.uiTexts.get('goRestart')!.setVisible(true);
        }
    }
}
