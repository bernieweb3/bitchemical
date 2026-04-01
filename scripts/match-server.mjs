import { createServer } from 'node:http';
import { Server } from 'socket.io';

const PORT = Number(process.env.PORT || 3001);

const MODE_SIZE = {
    'pvp-1v1': 2,
};

const ARENA = {
    width: 1600,
    height: 900,
};

const PLAYER_WIDTH = 30;
const PLAYER_HEIGHT = 46;
const PLAYER_SPEED = 230;
const PLAYER_CROUCH_MOVE_SCALE = 0.55;
const PLAYER_GROUND_ACCEL = 1800;
const PLAYER_AIR_ACCEL = 950;
const PLAYER_GROUND_DECEL = 2400;
const PLAYER_AIR_DECEL = 700;
const PLAYER_JUMP_FORCE = -450;
const PLAYER_GRAVITY = 800;
const SHOT_SPEED = 550;
const SHOT_SPEED_MULTIPLIER = 1.25;
const SHOT_RADIUS = 8;
const PROJECTILE_GRAVITY_SCALE = 0.18;
const SHOT_DAMAGE = 15;
const SHOT_COOLDOWN_MS = 180;
const MATCH_DURATION_MS = 3 * 60 * 1000;
const BLOCK_SIZE = 32;
const BLOCK_PLACE_COOLDOWN_MS = 160;
const BLOCK_COST_MANA = 20;
const SHOT_COST_MANA = 20;
const MANA_REGEN_PER_SECOND = 20;
const BLOCK_DAMAGE = 30;
const MAX_HEALTH = 1000;
const MAX_MANA = 100;

const DEFAULT_LOADOUT = ['Fe', 'Cu', 'Zn'];
const STARTING_INVENTORY = {
    Fe: 5,
    Cu: 4,
    Zn: 4,
    K: 4,
    Br: 4,
    Kr: 3,
    Ag: 3,
    Xe: 3,
    Fr: 2,
    Ra: 2,
    Rf: 2,
};

const ELEMENTS = {
    Fe: { color: 0xa8a8a8, hp: 60, special: null },
    Cu: { color: 0xc8834a, hp: 46, special: null },
    Zn: { color: 0xc8c8d4, hp: 42, special: null },
    K: { color: 0xd1c46a, hp: 38, special: null },
    Br: { color: 0xb86a43, hp: 35, special: 'explode' },
    Kr: { color: 0x86d5cf, hp: 42, special: null },
    Ag: { color: 0xd9dce3, hp: 46, special: null },
    Xe: { color: 0x8cced6, hp: 43, special: null },
    Fr: { color: 0xe6d99f, hp: 36, special: null },
    Ra: { color: 0xd9b77d, hp: 45, special: null },
    Rf: { color: 0xd19fc0, hp: 58, special: null },
};

function ensureLoadout(loadout) {
    const incoming = Array.isArray(loadout)
        ? loadout.map((v) => String(v || '').trim()).filter(Boolean)
        : [];
    const unique = [];
    for (const key of incoming) {
        if (!unique.includes(key)) unique.push(key);
        if (unique.length >= 3) break;
    }
    while (unique.length < 3) {
        const fallback = DEFAULT_LOADOUT[unique.length] ?? DEFAULT_LOADOUT[0];
        if (!unique.includes(fallback)) unique.push(fallback);
        else break;
    }
    return unique.slice(0, 3);
}

function getElementDef(symbol) {
    const known = ELEMENTS[symbol];
    if (known) return known;
    let hash = 0;
    for (let i = 0; i < symbol.length; i++) {
        hash = ((hash << 5) - hash) + symbol.charCodeAt(i);
        hash |= 0;
    }
    const hue = Math.abs(hash) % 360;
    const color = Number.parseInt(`0x${hsvToHex(hue / 360, 0.66, 0.9)}`, 16);
    return { color, hp: 42, special: null };
}

function getCharacterHitbox(player) {
    const baseX = player.x + player.w / 2;
    const baseY = player.y + player.h + 2;
    const hitboxWidth = 52;
    const hitboxHeight = player.crouching ? 92 : 102;

    return {
        x: baseX - hitboxWidth / 2,
        y: baseY - hitboxHeight,
        w: hitboxWidth,
        h: hitboxHeight,
    };
}

function getGunMuzzlePosition(player) {
    const spriteX = player.x + player.w / 2;
    const spriteBaseY = player.y + player.h + 2;
    const muzzleXOffset = player.facingRight ? 18 : -18;
    const muzzleYOffset = player.crouching ? -50 : -60;

    return {
        x: spriteX + muzzleXOffset,
        y: spriteBaseY + muzzleYOffset,
    };
}

function getAimAngleDeg(player, aimX, aimY) {
    const muzzle = getGunMuzzlePosition(player);
    const dx = aimX - muzzle.x;
    const dy = aimY - muzzle.y;
    const angleRad = Math.atan2(-dy, Math.max(1, Math.abs(dx)));
    const angleDeg = angleRad * (180 / Math.PI);
    return Math.max(0, Math.min(90, angleDeg));
}

function getNearestEnemy(players, self) {
    let nearest = null;
    let best = Infinity;
    for (const other of players.values()) {
        if (!other.alive || other.team === self.team) continue;
        const d = Math.abs((other.x + other.w / 2) - (self.x + self.w / 2));
        if (d < best) {
            best = d;
            nearest = other;
        }
    }
    return nearest;
}

function approach(current, target, maxDelta) {
    if (current < target) return Math.min(current + maxDelta, target);
    if (current > target) return Math.max(current - maxDelta, target);
    return target;
}

function hsvToHex(h, s, v) {
    let r = 0;
    let g = 0;
    let b = 0;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }
    const toHex = (value) => Math.round(value * 255).toString(16).padStart(2, '0');
    return `${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const GROUND_Y = 700;
const LEFT_ZONE_WIDTH = 520;
const CENTER_GAP_WIDTH = 560;
const RIGHT_ZONE_START = LEFT_ZONE_WIDTH + CENTER_GAP_WIDTH;

const PLATFORMS = [
    { x: 0, y: GROUND_Y, width: LEFT_ZONE_WIDTH, height: 200 },
    { x: LEFT_ZONE_WIDTH, y: GROUND_Y, width: CENTER_GAP_WIDTH, height: 200 },
    { x: 70, y: 580, width: 130, height: 22 },
    { x: 240, y: 500, width: 150, height: 22 },
    { x: 100, y: 410, width: 130, height: 22 },
    { x: 300, y: 320, width: 130, height: 22 },
    { x: RIGHT_ZONE_START, y: GROUND_Y, width: LEFT_ZONE_WIDTH, height: 200 },
    { x: 1410, y: 580, width: 130, height: 22 },
    { x: 1210, y: 500, width: 150, height: 22 },
    { x: 1370, y: 410, width: 130, height: 22 },
    { x: 1170, y: 320, width: 130, height: 22 },
];

const httpServer = createServer();
const io = new Server(httpServer, {
    cors: {
        origin: '*',
    },
});

const queues = {
    'pvp-1v1': [],
};

function upsertQueueEntry(mode, socketId) {
    const queue = queues[mode];
    const idx = queue.findIndex((entry) => entry.socketId === socketId);
    if (idx >= 0) {
        return;
    }
    queue.push({ socketId });
}

const rooms = new Map();
const customRooms = new Map();

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

function getPlayerNameBySocketId(socketId) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) return `Player-${socketId.slice(0, 4)}`;
    return socket.data.nickname || `Player-${socketId.slice(0, 4)}`;
}

function getCustomRoomPayload(room) {
    return {
        roomCode: room.roomCode,
        mode: room.mode,
        hostId: room.hostId,
        requiredPlayers: MODE_SIZE[room.mode],
        members: room.members.map((socketId) => ({
            id: socketId,
            name: getPlayerNameBySocketId(socketId),
        })),
    };
}

function emitCustomRoomUpdate(roomCode) {
    const room = customRooms.get(roomCode);
    if (!room) return;
    const payload = getCustomRoomPayload(room);
    for (const memberId of room.members) {
        io.to(memberId).emit('room_update', payload);
    }
}

function leaveCustomRoomBySocketId(socketId) {
    const socket = io.sockets.sockets.get(socketId);
    const roomCode = socket?.data.customRoomCode;
    if (!roomCode) return;

    const room = customRooms.get(roomCode);
    if (!room) {
        if (socket) delete socket.data.customRoomCode;
        return;
    }

    room.members = room.members.filter((id) => id !== socketId);
    if (socket) delete socket.data.customRoomCode;

    if (room.members.length === 0) {
        customRooms.delete(roomCode);
        return;
    }

    if (room.hostId === socketId) {
        room.hostId = room.members[0];
    }

    emitCustomRoomUpdate(roomCode);
}

function teamForIndex(idx, mode) {
    const half = MODE_SIZE[mode] / 2;
    return idx < half ? 'A' : 'B';
}

function spawnPoint(team, slot, mode) {
    const half = MODE_SIZE[mode] / 2;
    const perTeamIndex = slot % half;
    const spacing = 120;
    const y = GROUND_Y - PLAYER_HEIGHT - perTeamIndex * spacing;
    return {
        x: team === 'A' ? 160 : ARENA.width - 160,
        y,
    };
}

function createRoom(mode, sockets) {
    const roomId = `room_${mode}_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
    const required = MODE_SIZE[mode];
    const participants = sockets.slice(0, required);

    const room = {
        roomId,
        mode,
        startAt: Date.now(),
        over: false,
        players: new Map(),
        projectiles: [],
        blocks: [],
    };

    participants.forEach((socketId, idx) => {
        const socket = io.sockets.sockets.get(socketId);
        if (!socket) return;

        const team = teamForIndex(idx, mode);
        const pos = spawnPoint(team, idx, mode);
        const name = socket.data.nickname || `Player-${socketId.slice(0, 4)}`;

        const selectedElements = ensureLoadout(socket.data.selectedElements);
        const inventory = {};
        for (const symbol of selectedElements) {
            inventory[symbol] = STARTING_INVENTORY[symbol] ?? 3;
        }

        room.players.set(socketId, {
            id: socketId,
            name,
            team,
            x: pos.x,
            y: pos.y,
            w: PLAYER_WIDTH,
            h: PLAYER_HEIGHT,
            vx: 0,
            vy: 0,
            onGround: true,
            facingRight: team === 'A',
            crouching: false,
            hp: MAX_HEALTH,
            mana: MAX_MANA,
            alive: true,
            selectedElements,
            selectedElement: selectedElements[0],
            inventory,
            input: {
                left: false,
                right: false,
                up: false,
                down: false,
                shoot: false,
                build: false,
                aimX: pos.x,
                aimY: pos.y,
                selectedElement: selectedElements[0],
            },
            lastShotAt: 0,
            lastBuildAt: 0,
        });

        socket.join(roomId);
        socket.data.roomId = roomId;
    });

    rooms.set(roomId, room);

    const players = Array.from(room.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
    }));

    for (const player of room.players.values()) {
        if (player.isBot) continue;
        io.to(player.id).emit('match_found', {
            roomId,
            mode,
            playerId: player.id,
            team: player.team,
            players,
        });
    }
}

function updateBotInput(room, player, dtMs) {
    if (!player.isBot || !player.alive) return;

    const enemy = getNearestEnemy(room.players, player);
    if (!enemy) return;

    const centerX = player.x + player.w / 2;
    const centerY = player.y + player.h / 2;
    const enemyX = enemy.x + enemy.w / 2;
    const enemyY = enemy.y + enemy.h / 2;
    const dx = enemyX - centerX;
    const dy = enemyY - centerY;
    const absDx = Math.abs(dx);

    player.input.left = false;
    player.input.right = false;
    player.input.down = false;
    player.input.up = false;

    // Keep spacing like duel AI: approach from far, retreat when too close.
    if (absDx > 260) {
        player.input.right = dx > 0;
        player.input.left = dx < 0;
    } else if (absDx < 130) {
        player.input.right = dx < 0;
        player.input.left = dx > 0;
    } else {
        player.input.down = Math.random() < 0.15;
    }

    // Simple jump logic to contest high ground.
    if (player.onGround && enemy.y + enemy.h < player.y + player.h - 28 && absDx < 240 && Math.random() < 0.08) {
        player.input.up = true;
    }

    player.input.aimX = enemyX + (enemy.vx ?? 0) * 0.12;
    player.input.aimY = enemyY + dy * 0.1;

    player.aiShootTimer += dtMs;
    const shootWindowMs = player.mana >= SHOT_COST_MANA ? 340 : 700;
    if (player.aiShootTimer >= shootWindowMs) {
        player.input.shoot = true;
        player.aiShootTimer = 0;
    }

    player.aiTimer += dtMs;
    if (player.aiTimer >= 900) {
        player.aiTimer = 0;
        const pick = player.selectedElements[Math.floor(Math.random() * player.selectedElements.length)] ?? player.selectedElement;
        player.selectedElement = pick;
        player.input.selectedElement = pick;

        const inv = player.inventory[pick] ?? 0;
        if (player.mana >= BLOCK_COST_MANA && inv > 0 && Math.random() < 0.22) {
            player.input.build = true;
        }
    }
}

function updateRoom(room, dtMs) {
    if (room.over) return;

    const now = Date.now();

    for (const p of room.players.values()) {
        if (!p.alive) continue;

        if (p.isBot) {
            updateBotInput(room, p, dtMs);
        }

        p.mana = Math.min(MAX_MANA, p.mana + MANA_REGEN_PER_SECOND * (dtMs / 1000));
        p.crouching = Boolean(p.input.down);

        if (p.input.selectedElement && p.selectedElements.includes(p.input.selectedElement)) {
            p.selectedElement = p.input.selectedElement;
        }

        const moveInputX = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
        const moveSpeedScale = p.crouching ? PLAYER_CROUCH_MOVE_SCALE : 1;
        const targetVx = moveInputX * PLAYER_SPEED * moveSpeedScale;
        const accel = p.onGround ? PLAYER_GROUND_ACCEL : PLAYER_AIR_ACCEL;
        const decel = p.onGround ? PLAYER_GROUND_DECEL : PLAYER_AIR_DECEL;
        const rate = moveInputX === 0 ? decel : accel;
        p.vx = approach(p.vx, targetVx, rate * (dtMs / 1000));

        if (moveInputX > 0) p.facingRight = true;
        else if (moveInputX < 0) p.facingRight = false;

        if (p.input.up && p.onGround) {
            p.vy = PLAYER_JUMP_FORCE;
            p.onGround = false;
        }

        p.vy += PLAYER_GRAVITY * (dtMs / 1000);
        p.x += p.vx * (dtMs / 1000);
        p.y += p.vy * (dtMs / 1000);

        p.onGround = false;
        for (const plat of PLATFORMS) {
            if (
                p.x < plat.x + plat.width &&
                p.x + p.w > plat.x &&
                p.y + p.h >= plat.y &&
                p.y + p.h <= plat.y + plat.height + p.vy * (dtMs / 1000) + 5 &&
                p.vy > 0
            ) {
                p.y = plat.y - p.h;
                p.vy = 0;
                p.onGround = true;
            }
        }

        for (const blk of room.blocks) {
            if (
                p.x < blk.x + blk.w &&
                p.x + p.w > blk.x &&
                p.y + p.h >= blk.y &&
                p.y + p.h <= blk.y + blk.h + p.vy * (dtMs / 1000) + 5 &&
                p.vy > 0
            ) {
                p.y = blk.y - p.h;
                p.vy = 0;
                p.onGround = true;
            }
        }

        p.x = Math.max(0, Math.min(ARENA.width - p.w, p.x));
        p.y = Math.max(0, Math.min(ARENA.height - p.h, p.y));

        if (moveInputX === 0 && p.isBot) {
            const nearestEnemy = getNearestEnemy(room.players, p);
            if (nearestEnemy) {
                p.facingRight = (nearestEnemy.x + nearestEnemy.w / 2) >= (p.x + p.w / 2);
            }
        }

        if (p.input.build && now - p.lastBuildAt >= BLOCK_PLACE_COOLDOWN_MS && p.mana >= BLOCK_COST_MANA) {
            const elementKey = p.selectedElement;
            const inventoryCount = p.inventory[elementKey] ?? 0;
            if (inventoryCount > 0) {
                const bx = (p.facingRight
                    ? Math.floor((p.x + p.w) / BLOCK_SIZE)
                    : Math.floor((p.x - BLOCK_SIZE) / BLOCK_SIZE)) * BLOCK_SIZE;
                const by = Math.floor((p.y + p.h - BLOCK_SIZE) / BLOCK_SIZE) * BLOCK_SIZE;

                const blocked = room.blocks.some((blk) => blk.x === bx && blk.y === by);
                if (!blocked && bx >= 0 && bx <= ARENA.width - BLOCK_SIZE && by >= 0 && by <= ARENA.height - BLOCK_SIZE) {
                    const def = getElementDef(elementKey);
                    room.blocks.push({
                        x: bx,
                        y: by,
                        w: BLOCK_SIZE,
                        h: BLOCK_SIZE,
                        element: elementKey,
                        hp: def.hp,
                        maxHp: def.hp,
                        team: p.team,
                    });
                    p.inventory[elementKey] = Math.max(0, inventoryCount - 1);
                    p.mana = Math.max(0, p.mana - BLOCK_COST_MANA);
                    p.lastBuildAt = now;
                }
            }
        }

        if (p.input.shoot && now - p.lastShotAt >= SHOT_COOLDOWN_MS && p.mana >= SHOT_COST_MANA) {
            if (moveInputX > 0) p.facingRight = true;
            else if (moveInputX < 0) p.facingRight = false;
            else p.facingRight = p.input.aimX >= (p.x + p.w / 2);
            const muzzle = getGunMuzzlePosition(p);
            const angle = getAimAngleDeg(p, p.input.aimX, p.input.aimY);
            const rad = (angle * Math.PI) / 180;
            const dir = p.facingRight ? 1 : -1;
            const speed = SHOT_SPEED * SHOT_SPEED_MULTIPLIER;
            const shotElement = p.selectedElements[Math.floor(Math.random() * p.selectedElements.length)] ?? p.selectedElement;

            room.projectiles.push({
                id: `${p.id}_${now}_${Math.floor(Math.random() * 999)}`,
                ownerId: p.id,
                team: p.team,
                x: muzzle.x,
                y: muzzle.y,
                vx: Math.cos(rad) * speed * dir,
                vy: -Math.sin(rad) * speed,
                element: shotElement,
            });

            p.lastShotAt = now;
            p.mana = Math.max(0, p.mana - SHOT_COST_MANA);
        }

        p.input.shoot = false;
        p.input.build = false;
    }

    const nextProjectiles = [];
    for (const b of room.projectiles) {
        b.vy += PLAYER_GRAVITY * PROJECTILE_GRAVITY_SCALE * (dtMs / 1000);
        b.x += (b.vx * dtMs) / 1000;
        b.y += (b.vy * dtMs) / 1000;

        if (b.x < -20 || b.x > ARENA.width + 20 || b.y < -20 || b.y > ARENA.height + 20) {
            continue;
        }

        let consumed = false;

        for (const plat of PLATFORMS) {
            if (
                b.x >= plat.x &&
                b.x <= plat.x + plat.width &&
                b.y >= plat.y &&
                b.y <= plat.y + plat.height
            ) {
                consumed = true;
                break;
            }
        }

        if (consumed) {
            continue;
        }

        for (let i = room.blocks.length - 1; i >= 0; i--) {
            const blk = room.blocks[i];
            if (
                b.x >= blk.x &&
                b.x <= blk.x + blk.w &&
                b.y >= blk.y &&
                b.y <= blk.y + blk.h
            ) {
                blk.hp -= BLOCK_DAMAGE;
                if (blk.hp <= 0) {
                    if (getElementDef(blk.element).special === 'explode') {
                        for (const p of room.players.values()) {
                            if (!p.alive) continue;
                            const dx = (p.x + p.w / 2) - (blk.x + blk.w / 2);
                            const dy = (p.y + p.h / 2) - (blk.y + blk.h / 2);
                            if (Math.hypot(dx, dy) < 80) {
                                p.hp = Math.max(0, p.hp - 20);
                                if (p.hp <= 0) p.alive = false;
                            }
                        }
                    }
                    room.blocks.splice(i, 1);
                }
                consumed = true;
                break;
            }
        }

        if (consumed) {
            continue;
        }

        for (const p of room.players.values()) {
            if (!p.alive || p.team === b.team) continue;
            const hitbox = getCharacterHitbox(p);
            const hit =
                b.x >= hitbox.x &&
                b.x <= hitbox.x + hitbox.w &&
                b.y >= hitbox.y &&
                b.y <= hitbox.y + hitbox.h;
            if (hit) {
                p.hp = Math.max(0, p.hp - SHOT_DAMAGE);
                if (p.hp <= 0) p.alive = false;
                consumed = true;
                break;
            }
        }

        if (!consumed) {
            nextProjectiles.push(b);
        }
    }
    room.projectiles = nextProjectiles;

    const teamAAlive = Array.from(room.players.values()).some((p) => p.team === 'A' && p.alive);
    const teamBAlive = Array.from(room.players.values()).some((p) => p.team === 'B' && p.alive);

    const elapsed = now - room.startAt;
    const remainingMs = Math.max(0, MATCH_DURATION_MS - elapsed);

    if (!teamAAlive || !teamBAlive || remainingMs <= 0) {
        room.over = true;

        let winnerTeam = 'draw';
        if (teamAAlive && !teamBAlive) winnerTeam = 'A';
        if (!teamAAlive && teamBAlive) winnerTeam = 'B';

        if (winnerTeam === 'draw') {
            const teamAHp = Array.from(room.players.values()).filter((p) => p.team === 'A').reduce((sum, p) => sum + p.hp, 0);
            const teamBHp = Array.from(room.players.values()).filter((p) => p.team === 'B').reduce((sum, p) => sum + p.hp, 0);
            if (teamAHp > teamBHp) winnerTeam = 'A';
            else if (teamBHp > teamAHp) winnerTeam = 'B';
        }

        io.to(room.roomId).emit('game_over', {
            roomId: room.roomId,
            winnerTeam,
        });

        // Schedule room cleanup after a short delay so clients receive game_over
        setTimeout(() => {
            rooms.delete(room.roomId);
        }, 5000);

        return; // Stop broadcasting state_update once game is over
    }

    io.to(room.roomId).emit('state_update', {
        roomId: room.roomId,
        state: {
            players: Array.from(room.players.values()).map((p) => ({
                id: p.id,
                name: p.name,
                x: p.x,
                y: p.y,
                vx: p.vx,
                vy: p.vy,
                w: p.w,
                h: p.h,
                hp: p.hp,
                mana: p.mana,
                team: p.team,
                alive: p.alive,
                facingRight: p.facingRight,
                crouching: p.crouching,
                selectedElements: p.selectedElements,
                selectedElement: p.selectedElement,
                inventory: p.inventory,
            })),
            projectiles: room.projectiles.map((b) => ({ id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy, team: b.team, element: b.element })),
            blocks: room.blocks.map((blk) => ({
                x: blk.x,
                y: blk.y,
                w: blk.w,
                h: blk.h,
                element: blk.element,
                hp: blk.hp,
                maxHp: blk.maxHp,
                team: blk.team,
            })),
            remainingMs,
        },
    });
}

function trimQueue(mode) {
    queues[mode] = queues[mode].filter((entry) => io.sockets.sockets.has(entry.socketId));
}

function tryMatch(mode) {
    trimQueue(mode);
    const required = MODE_SIZE[mode];
    while (queues[mode].length >= required) {
        const entries = queues[mode].splice(0, required);
        const sockets = entries.map((entry) => entry.socketId);
        createRoom(mode, sockets);
    }

    io.emit('queue_update', { mode, count: queues[mode].length });
}

function removeQueueEntriesBySocket(socketId) {
    for (const m of Object.keys(queues)) {
        queues[m] = queues[m].filter((entry) => entry.socketId !== socketId);
    }
}

function emitQueueCounts() {
    for (const m of Object.keys(queues)) {
        io.emit('queue_update', { mode: m, count: queues[m].length });
    }
}

function removeSocketFromQueues(socketId) {
    removeQueueEntriesBySocket(socketId);
    emitQueueCounts();
}

function startCustomRoomMatch(roomCode, starterId) {
    const room = customRooms.get(roomCode);
    if (!room) {
        io.to(starterId).emit('room_error', { message: 'Phong khong ton tai.' });
        return;
    }

    if (room.hostId !== starterId) {
        io.to(starterId).emit('room_error', { message: 'Chi chu phong moi duoc bat dau.' });
        return;
    }

    const required = MODE_SIZE[room.mode];
    if (room.members.length < required) {
        io.to(starterId).emit('room_error', { message: `Can du ${required} nguoi de bat dau phong nay.` });
        return;
    }

    customRooms.delete(roomCode);

    // Clean up customRoomCode data from all members before starting the match
    for (const memberId of room.members) {
        const memberSocket = io.sockets.sockets.get(memberId);
        if (memberSocket) delete memberSocket.data.customRoomCode;
    }

    createRoom(room.mode, room.members);
}

io.on('connection', (socket) => {
    socket.on('join_queue', ({ mode, nickname }) => {
        if (!MODE_SIZE[mode]) return;
        socket.data.nickname = String(nickname || '').slice(0, 24) || `Player-${socket.id.slice(0, 4)}`;

        leaveCustomRoomBySocketId(socket.id);
        removeQueueEntriesBySocket(socket.id);
        emitQueueCounts();

        upsertQueueEntry(mode, socket.id);

        tryMatch(mode);
    });

    socket.on('leave_queue', ({ mode }) => {
        if (!mode || !queues[mode]) return;
        queues[mode] = queues[mode].filter((entry) => entry.socketId !== socket.id);
        io.emit('queue_update', { mode, count: queues[mode].length });
    });

    socket.on('create_custom_room', ({ mode, nickname }) => {
        if (!MODE_SIZE[mode]) return;
        socket.data.nickname = String(nickname || '').slice(0, 24) || `Player-${socket.id.slice(0, 4)}`;

        leaveCustomRoomBySocketId(socket.id);
        removeSocketFromQueues(socket.id);

        let roomCode = generateRoomCode();
        while (customRooms.has(roomCode)) {
            roomCode = generateRoomCode();
        }

        const room = {
            roomCode,
            mode,
            hostId: socket.id,
            members: [socket.id],
        };

        customRooms.set(roomCode, room);
        socket.data.customRoomCode = roomCode;
        io.to(socket.id).emit('room_created', getCustomRoomPayload(room));
    });

    socket.on('join_custom_room', ({ roomCode, mode, nickname }) => {
        socket.data.nickname = String(nickname || '').slice(0, 24) || `Player-${socket.id.slice(0, 4)}`;
        const normalizedCode = String(roomCode || '').trim().toUpperCase();
        const room = customRooms.get(normalizedCode);

        if (!room) {
            io.to(socket.id).emit('room_error', { message: 'Khong tim thay phong.' });
            return;
        }

        if (mode && room.mode !== mode) {
            io.to(socket.id).emit('room_error', { message: 'Phong dang o che do khac.' });
            return;
        }

        leaveCustomRoomBySocketId(socket.id);
        removeSocketFromQueues(socket.id);

        const required = MODE_SIZE[room.mode];
        if (room.members.length >= required) {
            io.to(socket.id).emit('room_error', { message: 'Phong da day.' });
            return;
        }

        if (!room.members.includes(socket.id)) {
            room.members.push(socket.id);
        }
        socket.data.customRoomCode = normalizedCode;
        emitCustomRoomUpdate(normalizedCode);
    });

    socket.on('leave_custom_room', () => {
        leaveCustomRoomBySocketId(socket.id);
    });

    socket.on('start_custom_room', ({ roomCode }) => {
        const normalizedCode = String(roomCode || '').trim().toUpperCase();
        startCustomRoomMatch(normalizedCode, socket.id);
    });

    socket.on('join_room_runtime', ({ roomId, selectedElements }) => {
        if (!roomId || !rooms.has(roomId)) return;
        socket.join(roomId);
        const room = rooms.get(roomId);
        const player = room?.players.get(socket.id);
        if (player) {
            const loadout = ensureLoadout(selectedElements);
            player.selectedElements = loadout;
            player.selectedElement = loadout[0];
            const nextInventory = {};
            for (const symbol of loadout) {
                nextInventory[symbol] = player.inventory[symbol] ?? STARTING_INVENTORY[symbol] ?? 3;
            }
            player.inventory = nextInventory;
            socket.data.selectedElements = loadout;
        }
    });

    socket.on('player_input', ({ roomId, playerId, input }) => {
        const room = rooms.get(roomId);
        if (!room || room.over) return;
        const player = room.players.get(socket.id) ?? room.players.get(playerId);
        if (!player || player.isBot) return;

        player.input = {
            left: Boolean(input.left),
            right: Boolean(input.right),
            up: Boolean(input.up),
            down: Boolean(input.down),
            shoot: Boolean(input.shoot),
            build: Boolean(input.build),
            aimX: Number(input.aimX || 0),
            aimY: Number(input.aimY || 0),
            selectedElement: String(input.selectedElement || ''),
        };
    });

    socket.on('disconnect', () => {
        leaveCustomRoomBySocketId(socket.id);
        removeSocketFromQueues(socket.id);

        for (const room of rooms.values()) {
            if (room.players.has(socket.id)) {
                const p = room.players.get(socket.id);
                p.alive = false;
                p.hp = 0;
            }
        }
    });
});

let lastTick = Date.now();
setInterval(() => {
    const now = Date.now();
    const dtMs = now - lastTick;
    lastTick = now;

    for (const room of rooms.values()) {
        updateRoom(room, dtMs);
    }
}, 16);

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[match-server] listening on 0.0.0.0:${PORT}`);
});
