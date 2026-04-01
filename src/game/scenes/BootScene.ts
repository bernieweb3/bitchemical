import Phaser from 'phaser';
import { ELEMENTS } from '../data/elements';

const rawElementImageUrls = import.meta.glob('../../../img/nguyento/*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
}) as Record<string, string>;

const rawIdleImageUrls = import.meta.glob('../../../img/player/dungyen/*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
}) as Record<string, string>;

const rawRunImageUrls = import.meta.glob('../../../img/player/chay/*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
}) as Record<string, string>;

const SYMBOL_IMAGE_HINTS: Record<string, string[]> = {
    K: ['potassium', 'k'], Ca: ['calcium', 'ca'], Sc: ['scandium', 'sc'], Ti: ['titanium', 'ti'],
    V: ['vanadium', 'v'], Cr: ['chramium', 'chromium', 'cr'], Mn: ['mangaese', 'manganese', 'mn'],
    Fe: ['iron', 'fe'], Co: ['cobalt', 'co'], Ni: ['nickel', 'ni'], Cu: ['capper', 'copper', 'cu'],
    Zn: ['zinc', 'zn'], Ga: ['gallium', 'ga'], Ge: ['germanium', 'ge'], As: ['arsenic', 'as'],
    Se: ['selenium', 'se'], Br: ['bromine', 'br'], Kr: ['krypton', 'kr'], Rb: ['rubidium', 'rb'],
    Sr: ['strontium', 'sr'], Y: ['yttrium', 'y'], Zr: ['zirconium', 'zr'], Nb: ['niobium', 'nb'],
    Mo: ['molybdenum', 'mo'], Tc: ['technetium', 'tc'], Ru: ['ruthenium', 'ru'], Rh: ['rhodium', 'rh'],
    Pd: ['palladium', 'pd'], Ag: ['silver', 'ag'], Cd: ['cadmium', 'cd'], In: ['indium', 'in'],
    Sn: ['tin', 'sn'], Sb: ['antimony', 'sb'], Te: ['tellurium', 'te'], I: ['iodine', 'i'],
    Xe: ['xenon', 'xe'], Cs: ['caesium', 'cesium', 'cs'], Ba: ['barium', 'bari', 'ba'],
    Hf: ['hafnium', 'hf'], Ta: ['tantalum', 'ta'], W: ['tungsten', 'wolfram', 'w'], Re: ['rhenium', 're'],
    Os: ['osmium', 'os'], Ir: ['iridium', 'ir'], Pt: ['platinum', 'pt'], Au: ['gold', 'aurum', 'au'],
    Hg: ['mercury', 'hydrargyrum', 'hg'], Tl: ['thallium', 'tl'], Pb: ['lead', 'plumbum', 'pb'],
    Bi: ['bismuth', 'bi'], Po: ['polonium', 'po'], At: ['astatine', 'at'], Rn: ['radon', 'rn'],
    Fr: ['francium', 'fr'], Ra: ['radium', 'ra'], Ac: ['actinideum', 'actinium', 'ac'],
    Rf: ['rutherfordium', 'rf'], Db: ['dubnium', 'db'], Sg: ['seaborgium', 'sg'], Bh: ['bohrium', 'bh'],
    Hs: ['hassium', 'hs'], Mt: ['meitnerium', 'mt'], Ds: ['darmsardtium', 'darmstadtium', 'ds'],
    Rg: ['roentgenium', 'rg'], Cn: ['copernicium', 'cn'], Nh: ['ununtri', 'nihonium', 'nh'],
    Fl: ['flerovi', 'flerovium', 'fl'], Mc: ['ununpenti', 'moscovium', 'mc'], Lv: ['livermorium', 'lv'],
};

const ELEMENT_FILE_ALIASES: Record<string, string[]> = {
    Cr: ['Chramium'],
    Cu: ['Capper'],
    Mn: ['Mangaese'],
    Ds: ['Darmsardtium'],
    Fl: ['Flerovi'],
    Mc: ['Ununpenti'],
    Nh: ['Ununtri'],
};

function normalizeAssetName(text: string) {
    return text
        .toLowerCase()
        .replace(/\.svg$/g, '')
        .replace(/[^a-z0-9]/g, '');
}

function tokenizeAssetName(text: string) {
    return text
        .toLowerCase()
        .replace(/\.svg$/g, '')
        .split(/[^a-z0-9]+/g)
        .filter(Boolean);
}

function buildSymbolImageMap() {
    const files = Object.entries(rawElementImageUrls).map(([path, url]) => {
        const fileName = path.split('/').pop() ?? path;
        const baseName = fileName.toLowerCase().replace(/\.svg$/, '').trim();
        const normalized = normalizeAssetName(baseName);
        const suffixMatch = baseName.match(/_([a-z]{1,2})$/);
        const prefixMatch = baseName.match(/^([a-z]{1,2})_/);
        return {
            normalized,
            baseName,
            suffixSymbol: suffixMatch?.[1] ?? null,
            prefixSymbol: prefixMatch?.[1] ?? null,
            url,
        };
    });

    const map: Record<string, string> = {};
    Object.keys(SYMBOL_IMAGE_HINTS).forEach((symbol) => {
        const lower = symbol.toLowerCase();
        const bySuffix = files.find((f) => f.suffixSymbol === lower);
        if (bySuffix) {
            map[symbol] = bySuffix.url;
            return;
        }
        const byPrefix = files.find((f) => f.prefixSymbol === lower);
        if (byPrefix) {
            map[symbol] = byPrefix.url;
            return;
        }

        const hints = SYMBOL_IMAGE_HINTS[symbol] ?? [];
        const normalizedHints = hints.map((h) => normalizeAssetName(h)).filter((h) => h.length >= 2);
        const byHint = files.find((f) => normalizedHints.some((h) => f.normalized.includes(h) || f.baseName.includes(h)));
        if (byHint) {
            map[symbol] = byHint.url;
        }
    });

    return map;
}

const SYMBOL_IMAGE_URLS = buildSymbolImageMap();

function resolveElementImageUrl(symbol: string) {
    const cleanSymbol = symbol.trim();
    const exactMapped = SYMBOL_IMAGE_URLS[cleanSymbol];
    if (exactMapped) return exactMapped;

    const def = ELEMENTS[cleanSymbol];

    const normalizedSymbol = normalizeAssetName(cleanSymbol);
    const normalizedName = def ? normalizeAssetName(def.name) : '';

    const entries = Object.entries(rawElementImageUrls).map(([path, url]) => {
        const fileName = path.split('/').pop() ?? path;
        const normalizedFile = normalizeAssetName(fileName);
        const tokens = tokenizeAssetName(fileName);
        return { fileName, normalizedFile, tokens, url };
    });

    const aliasNames = ELEMENT_FILE_ALIASES[symbol] ?? [];
    for (const alias of aliasNames) {
        const normalizedAlias = normalizeAssetName(alias);
        const byAlias = entries.find((e) => e.normalizedFile.includes(normalizedAlias));
        if (byAlias) return byAlias.url;
    }

    const bySymbolToken = entries.find((e) => e.tokens.includes(cleanSymbol.toLowerCase()));
    if (bySymbolToken) return bySymbolToken.url;

    if (def) {
        const byNameToken = entries.find((e) => e.tokens.includes(def.name.toLowerCase()));
        if (byNameToken) return byNameToken.url;
    }

    if (normalizedName) {
        const byName = entries.find((e) => e.normalizedFile.includes(normalizedName));
        if (byName) return byName.url;
    }

    const bySymbol = entries.find((e) => e.normalizedFile.includes(normalizedSymbol));
    if (bySymbol) return bySymbol.url;

    return null;
}

const IDLE_FRAME_KEY_PREFIX = 'scientist_idle_frame_';
const RUN_FRAME_KEY_PREFIX = 'scientist_run_frame_';
const IDLE_ANIM_KEY = 'scientist_idle';
const RUN_ANIM_KEY = 'scientist_run';

function buildSortedFrameAssets(rawUrls: Record<string, string>) {
    return Object.entries(rawUrls)
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
        .map(([path, url]) => {
            const fileName = path.split('/').pop() ?? path;
            return { fileName, url };
        });
}

function pickEvenlySpacedFrames<T>(frames: T[], desiredCount: number) {
    if (frames.length <= desiredCount) return frames;
    const result: T[] = [];
    const maxIndex = frames.length - 1;
    for (let i = 0; i < desiredCount; i++) {
        const idx = Math.round((i * maxIndex) / Math.max(1, desiredCount - 1));
        result.push(frames[idx]);
    }
    return result;
}

const IDLE_FRAME_ASSETS = buildSortedFrameAssets(rawIdleImageUrls);
const RUN_FRAME_ASSETS = buildSortedFrameAssets(rawRunImageUrls);
const RUN_ANIMATION_FRAME_ASSETS = pickEvenlySpacedFrames(RUN_FRAME_ASSETS, 6);

export class BootScene extends Phaser.Scene {
    private projectileSymbolsToPrepare: string[] = [];

    constructor() {
        super({ key: 'BootScene' });
    }

    preload() {
        IDLE_FRAME_ASSETS.forEach((asset, index) => {
            this.load.image(`${IDLE_FRAME_KEY_PREFIX}${index}`, asset.url);
        });
        RUN_ANIMATION_FRAME_ASSETS.forEach((asset, index) => {
            this.load.image(`${RUN_FRAME_KEY_PREFIX}${index}`, asset.url);
        });

        const selectedElements = (this.registry.get('selectedElements') as string[] | undefined) ?? [];
        const selectedSymbols = selectedElements.slice(0, 3).map((s) => s.trim()).filter(Boolean);
        const knownSymbols = Object.keys(ELEMENTS);
        this.projectileSymbolsToPrepare = Array.from(new Set([...selectedSymbols, ...knownSymbols]));

        const selectedElementImageUrls = (this.registry.get('selectedElementImageUrls') as Record<string, string> | undefined) ?? {};
        this.projectileSymbolsToPrepare.forEach((symbol) => {
            const url = selectedElementImageUrls[symbol] ?? resolveElementImageUrl(symbol);
            if (url) {
                this.load.image(`projectile_${symbol}`, url);
                if (!this.textures.exists(`projectile_${symbol.toLowerCase()}`)) {
                    this.load.image(`projectile_${symbol.toLowerCase()}`, url);
                }
                if (!this.textures.exists(`projectile_${symbol.toUpperCase()}`)) {
                    this.load.image(`projectile_${symbol.toUpperCase()}`, url);
                }
            } else {
                console.warn(`[BootScene] Missing projectile SVG for element ${symbol}`);
            }
        });
    }

    create() {
        this.createCharacterAnimation();
        this.projectileSymbolsToPrepare.forEach((symbol) => {
            this.createProjectileDisplayTexture(symbol);
        });
        const selectedElements = this.registry.get('selectedElements') as string[] | undefined;
        const battleMode = (this.registry.get('battleMode') as 'vs-ai' | 'local-1v1' | 'local-1v1-host' | 'local-1v1-client' | undefined) ?? 'vs-ai';
        const localRealtimeMatch = (this.registry.get('localRealtimeMatch') as Record<string, unknown> | undefined) ?? null;

            const syncedLoadoutsByPlayer = this.registry.get('syncedLoadoutsByPlayer') as Record<string, string[]> | undefined;
            this.scene.start('BattleScene', { selectedElements, syncedLoadoutsByPlayer, battleMode, localRealtimeMatch });
    }

    private createProjectileDisplayTexture(symbol: string) {
        const sourceCandidates = [`projectile_${symbol}`, `projectile_${symbol.toLowerCase()}`, `projectile_${symbol.toUpperCase()}`];
        const sourceKey = sourceCandidates.find((key) => this.textures.exists(key));
        if (!sourceKey) return;

        const sourceTexture = this.textures.get(sourceKey);
        const sourceImage = sourceTexture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
        const sourceWidth = (sourceImage as HTMLImageElement).naturalWidth ?? sourceImage.width;
        const sourceHeight = (sourceImage as HTMLImageElement).naturalHeight ?? sourceImage.height;
        if (!sourceWidth || !sourceHeight) return;

        const scanSize = 512;
        const scanCanvas = document.createElement('canvas');
        scanCanvas.width = scanSize;
        scanCanvas.height = scanSize;
        const scanCtx = scanCanvas.getContext('2d');
        if (!scanCtx) return;

        scanCtx.clearRect(0, 0, scanSize, scanSize);
        const containScale = Math.min(scanSize / sourceWidth, scanSize / sourceHeight);
        const containW = sourceWidth * containScale;
        const containH = sourceHeight * containScale;
        const containX = (scanSize - containW) / 2;
        const containY = (scanSize - containH) / 2;
        scanCtx.drawImage(sourceImage, containX, containY, containW, containH);

        const scanImage = scanCtx.getImageData(0, 0, scanSize, scanSize);
        const imageData = scanImage.data;

        // Remove edge-connected background by color similarity to corner average.
        const c1 = 0;
        const c2 = (scanSize - 1) * 4;
        const c3 = ((scanSize - 1) * scanSize) * 4;
        const c4 = (((scanSize - 1) * scanSize) + (scanSize - 1)) * 4;
        const bgR = Math.round((imageData[c1] + imageData[c2] + imageData[c3] + imageData[c4]) / 4);
        const bgG = Math.round((imageData[c1 + 1] + imageData[c2 + 1] + imageData[c3 + 1] + imageData[c4 + 1]) / 4);
        const bgB = Math.round((imageData[c1 + 2] + imageData[c2 + 2] + imageData[c3 + 2] + imageData[c4 + 2]) / 4);
        const bgThresholdSq = 48 * 48;
        const visited = new Uint8Array(scanSize * scanSize);
        const stack: number[] = [];

        const tryPush = (x: number, y: number) => {
            const p = y * scanSize + x;
            if (visited[p]) return;
            const off = p * 4;
            if (imageData[off + 3] <= 8) {
                visited[p] = 1;
                return;
            }
            const dr = imageData[off] - bgR;
            const dg = imageData[off + 1] - bgG;
            const db = imageData[off + 2] - bgB;
            if ((dr * dr + dg * dg + db * db) > bgThresholdSq) return;
            visited[p] = 1;
            stack.push(p);
        };

        for (let x = 0; x < scanSize; x++) {
            tryPush(x, 0);
            tryPush(x, scanSize - 1);
        }
        for (let y = 1; y < scanSize - 1; y++) {
            tryPush(0, y);
            tryPush(scanSize - 1, y);
        }

        while (stack.length > 0) {
            const p = stack.pop()!;
            const x = p % scanSize;
            const y = Math.floor(p / scanSize);
            const off = p * 4;
            imageData[off + 3] = 0;

            if (x > 0) tryPush(x - 1, y);
            if (x < scanSize - 1) tryPush(x + 1, y);
            if (y > 0) tryPush(x, y - 1);
            if (y < scanSize - 1) tryPush(x, y + 1);
        }

        scanCtx.putImageData(scanImage, 0, 0);

        let minX = scanSize;
        let minY = scanSize;
        let maxX = -1;
        let maxY = -1;

        for (let y = 0; y < scanSize; y++) {
            for (let x = 0; x < scanSize; x++) {
                const alpha = imageData[(y * scanSize + x) * 4 + 3];
                if (alpha > 8) {
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                }
            }
        }

        const displayKey = `projectile_display_${symbol}`;
        if (this.textures.exists(displayKey)) {
            this.textures.remove(displayKey);
        }
        const canvasTexture = this.textures.createCanvas(displayKey, 128, 128);
        if (!canvasTexture) return;
        const ctx = canvasTexture.getContext();
        ctx.clearRect(0, 0, 128, 128);

        if (maxX < minX || maxY < minY) {
            const coverScale = Math.max(128 / sourceWidth, 128 / sourceHeight);
            const drawW = sourceWidth * coverScale;
            const drawH = sourceHeight * coverScale;
            ctx.drawImage(sourceImage, (128 - drawW) / 2, (128 - drawH) / 2, drawW, drawH);
            canvasTexture.refresh();
            return;
        }

        const cropX = minX;
        const cropY = minY;
        const cropW = Math.max(1, maxX - minX + 1);
        const cropH = Math.max(1, maxY - minY + 1);
        const paddedSize = 128 * 0.86;
        const fitScale = Math.min(paddedSize / cropW, paddedSize / cropH);
        const drawW = cropW * fitScale;
        const drawH = cropH * fitScale;
        const drawX = (128 - drawW) / 2;
        const drawY = (128 - drawH) / 2;

        ctx.drawImage(scanCanvas, cropX, cropY, cropW, cropH, drawX, drawY, drawW, drawH);
        canvasTexture.refresh();
    }

    private createCharacterAnimation() {
        if (!this.anims.exists(IDLE_ANIM_KEY) && IDLE_FRAME_ASSETS.length > 0) {
            this.anims.create({
                key: IDLE_ANIM_KEY,
                frames: IDLE_FRAME_ASSETS.map((_, index) => ({ key: `${IDLE_FRAME_KEY_PREFIX}${index}` })),
                frameRate: 4,
                repeat: -1,
            });
        }

        if (!this.anims.exists(RUN_ANIM_KEY) && RUN_ANIMATION_FRAME_ASSETS.length > 0) {
            this.anims.create({
                key: RUN_ANIM_KEY,
                frames: RUN_ANIMATION_FRAME_ASSETS.map((_, index) => ({ key: `${RUN_FRAME_KEY_PREFIX}${index}` })),
                frameRate: 14,
                repeat: -1,
            });
        }
    }
}
