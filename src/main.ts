import { adSettler } from './adSettle';
// ── AIT (리더보드 + 전면광고 + 리워드광고) ────────────────────────────────────
const AIT_AD_GROUP_ID        = 'ait.v2.live.a66b039476b04755'; // 이어하기 (전면)
const AIT_REWARD_AD_GROUP_ID = 'ait.v2.live.1f4e00858f124ea8'; // 코인 2배 (리워드)

type AitModule = {
  submitGameCenterLeaderBoardScore: typeof import('@apps-in-toss/web-framework').submitGameCenterLeaderBoardScore;
  openGameCenterLeaderboard: typeof import('@apps-in-toss/web-framework').openGameCenterLeaderboard;
  loadFullScreenAd: typeof import('@apps-in-toss/web-framework').loadFullScreenAd;
  showFullScreenAd: typeof import('@apps-in-toss/web-framework').showFullScreenAd;
  generateHapticFeedback: typeof import('@apps-in-toss/web-framework').generateHapticFeedback;
  getUserKeyForGame: typeof import('@apps-in-toss/web-framework').getUserKeyForGame;
};
let ait: AitModule | null = null;
let aitAdLoaded       = false;
let aitRewardAdLoaded = false;

import('@apps-in-toss/web-framework').then((m) => {
  ait = {
    submitGameCenterLeaderBoardScore: m.submitGameCenterLeaderBoardScore,
    openGameCenterLeaderboard: m.openGameCenterLeaderboard,
    loadFullScreenAd: m.loadFullScreenAd,
    showFullScreenAd: m.showFullScreenAd,
    generateHapticFeedback: m.generateHapticFeedback,
    getUserKeyForGame: m.getUserKeyForGame,
  };
  document.getElementById('leaderboardBtn')!.style.display = 'block';
  preloadAitAd();
  preloadAitRewardAd();
  m.getUserKeyForGame().catch(() => {});
}).catch(() => {});

function preloadAitAd() {
  if (!ait) return;
  aitAdLoaded = false;
  ait.loadFullScreenAd({
    options: { adGroupId: AIT_AD_GROUP_ID },
    onEvent: () => { aitAdLoaded = true; },
    onError: () => { aitAdLoaded = false; },
  });
}

function preloadAitRewardAd() {
  if (!ait) return;
  aitRewardAdLoaded = false;
  ait.loadFullScreenAd({
    options: { adGroupId: AIT_REWARD_AD_GROUP_ID },
    onEvent: () => { aitRewardAdLoaded = true; },
    onError: () => { aitRewardAdLoaded = false; },
  });
}

const KEY_TUTORIAL = 'dd_tutorialSeen';

// ── 햅틱 그래머 (틱 80ms / 굵은 이벤트 180ms 스로틀, 탭당 1개) ───────────────
type HapticType = 'tickWeak' | 'tap' | 'tickMedium' | 'softMedium' | 'basicWeak' | 'basicMedium' | 'success' | 'error' | 'wiggle' | 'confetti';
const TICK_HAPTICS = new Set<HapticType>(['tickWeak', 'tap', 'tickMedium']);
let lastTickHapticAt = 0, lastHeavyHapticAt = 0;
function haptic(type: HapticType) {
  const now = performance.now();
  if (TICK_HAPTICS.has(type)) {
    if (now - lastTickHapticAt < 80) return;
    lastTickHapticAt = now;
  } else {
    if (now - lastHeavyHapticAt < 180) return;
    lastHeavyHapticAt = now;
  }
  ait?.generateHapticFeedback({ type }).catch(() => {});
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── AdMob ────────────────────────────────────────────────────────────────────
const ADMOB_REWARD_ID     = 'ca-app-pub-4557219410513767/7207079398';
type AdMobType            = typeof import('@capacitor-community/admob').AdMob;
type RewardEventsType     = typeof import('@capacitor-community/admob').RewardAdPluginEvents;
let AdMobPlugin: AdMobType | null       = null;
let RewardEvents: RewardEventsType | null = null;
import('@capacitor-community/admob').then((m) => {
  AdMobPlugin  = m.AdMob;
  RewardEvents = m.RewardAdPluginEvents;
  AdMobPlugin.initialize({}).then(() => preloadAd()).catch(() => {});
}).catch(() => {});

// ── Persistence ───────────────────────────────────────────────────────────────
const BEST_KEY          = 'dd_bestScore';
const COIN_KEY          = 'dd_coins';
const OWNED_SKINS_KEY   = 'dd_ownedSkins';
const EQUIPPED_SKIN_KEY = 'dd_equippedSkin';

function loadBest():    number   { return parseInt(localStorage.getItem(BEST_KEY) ?? '0', 10); }
function saveBest(n:    number)  { localStorage.setItem(BEST_KEY, String(n)); }
function loadCoins():   number   { return parseInt(localStorage.getItem(COIN_KEY) ?? '0', 10); }
function saveCoins(n:   number)  { localStorage.setItem(COIN_KEY, String(n)); }
function loadOwnedSkins(): string[] {
  try { return JSON.parse(localStorage.getItem(OWNED_SKINS_KEY) ?? '["default"]'); }
  catch { return ['default']; }
}
function saveOwnedSkins(arr: string[]) { localStorage.setItem(OWNED_SKINS_KEY, JSON.stringify(arr)); }
function loadEquippedSkin(): number { return parseInt(localStorage.getItem(EQUIPPED_SKIN_KEY) ?? '0', 10); }
function saveEquippedSkin(i: number) { localStorage.setItem(EQUIPPED_SKIN_KEY, String(i)); }

let totalCoins   = loadCoins();
let sessionCoins = 0;
let ownedSkins   = loadOwnedSkins();
let equippedIdx  = loadEquippedSkin();

// ── Skins (플레이어 컬러 + 트레일 세트 — 점 형태 정체성 유지) ─────────────────
type TrailStyle = 'none' | 'comet' | 'shadow';
type SkinDef = { id: string; name: string; price: number; color: string; trail: TrailStyle; desc: string };
const SKINS: SkinDef[] = [
  { id: 'default', name: 'DEFAULT', price: 0,    color: '#000000', trail: 'none',   desc: '클래식 블랙, 트레일 없음' },
  { id: 'crimson', name: 'CRIMSON', price: 300,  color: '#FF2D78', trail: 'comet',  desc: '핫핑크 도트 + 혜성 꼬리' },
  { id: 'azure',   name: 'AZURE',   price: 500,  color: '#3182F6', trail: 'comet',  desc: '파란 도트 + 혜성 꼬리' },
  { id: 'neon',    name: 'NEON',    price: 800,  color: '#39FF14', trail: 'shadow', desc: '형광 초록 + 잔상 분신' },
  { id: 'gold',    name: 'GOLD',    price: 1500, color: '#FFB300', trail: 'shadow', desc: '황금 도트 + 잔상 분신' },
];

function getActiveSkin(): SkinDef { return SKINS[equippedIdx] ?? SKINS[0]; }
function getPlayerColor(): string  { return getActiveSkin().color; }
function getTrailStyle(): TrailStyle { return getActiveSkin().trail; }

// ── Shop UI ───────────────────────────────────────────────────────────────────
function updateShopUI() {
  document.getElementById('shopCoinVal')!.textContent = String(totalCoins);
  const grid = document.getElementById('playerSkinsGrid')!;
  grid.innerHTML = '';
  SKINS.forEach((skin, idx) => {
    const isOwned    = ownedSkins.includes(skin.id);
    const isEquipped = equippedIdx === idx;
    const div = document.createElement('div');
    div.className = `sku-item ${isEquipped ? 'active' : ''} ${!isOwned ? 'locked' : ''}`;

    // 도트 미리보기: SVG 원
    const dotPreview = `<svg width="36" height="36" viewBox="0 0 36 36" style="flex-shrink:0">
      <circle cx="18" cy="18" r="12" fill="${skin.color}"/>
      ${skin.trail !== 'none' ? `<circle cx="10" cy="22" r="6" fill="${skin.color}" opacity="0.4"/>
      <circle cx="4" cy="26" r="3" fill="${skin.color}" opacity="0.2"/>` : ''}
    </svg>`;

    const priceHTML = isOwned
      ? `<span class="sku-owned">보유</span>`
      : `<span class="sku-price">🟡 ${skin.price}</span>`;
    const checkHTML = isEquipped ? `<div class="sku-check">✓</div>` : '';

    div.innerHTML = `
      ${dotPreview}
      <div class="sku-info">
        <div class="sku-name">${skin.name}</div>
        <div class="sku-desc">${skin.desc}</div>
      </div>
      ${priceHTML}${checkHTML}`;

    div.addEventListener('click', () => {
      if (isOwned) {
        equippedIdx = idx; saveEquippedSkin(idx); updateShopUI();
        haptic('success');
      } else if (totalCoins >= skin.price) {
        totalCoins -= skin.price; saveCoins(totalCoins);
        ownedSkins.push(skin.id); saveOwnedSkins(ownedSkins);
        equippedIdx = idx; saveEquippedSkin(idx); updateShopUI();
        haptic('success');
      } else {
        haptic('error');
        div.classList.remove('shake'); void div.offsetWidth; div.classList.add('shake');
      }
    });
    grid.appendChild(div);
  });
}

function openShop()  { haptic('tap'); updateShopUI(); document.getElementById('shopOverlay')!.classList.add('show'); }
function closeShop() { haptic('tap'); document.getElementById('shopOverlay')!.classList.remove('show'); }
document.getElementById('shopBtn')!.addEventListener('click', openShop);
document.getElementById('shopCloseBtn')!.addEventListener('click', closeShop);

// ── Color (장애물/UI 색상 — 웨이브마다 전환) ──────────────────────────────────
const COLORS = ['#000000', '#FF2D78', '#00F0FF', '#39FF14', '#FFE600', '#BF00FF', '#FF6B00'];
let colorIdx  = 0;
let gameColor = COLORS[0]; // 장애물 색상

function colorWithAlpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}
function applyColor() { document.documentElement.style.setProperty('--game-color', gameColor); }

function mixHex(hex: string, target: number, t: number): string {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * (1 - t) + target * t);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * (1 - t) + target * t);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * (1 - t) + target * t);
  return `rgb(${r},${g},${b})`;
}
const lighten = (hex: string, t: number) => mixHex(hex, 255, t);
const darken  = (hex: string, t: number) => mixHex(hex, 0, t);

// ── Canvas ────────────────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx    = canvas.getContext('2d')!;
let W: number, H: number;

function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
resize();
window.addEventListener('resize', resize);

// ── State ─────────────────────────────────────────────────────────────────────
const S = { INTRO: 0, ZOOM: 1, PLAY: 2, DEAD: 3, OVER: 4 } as const;
type GameState = typeof S[keyof typeof S];
let state: GameState = S.INTRO;

// ── Utilities ─────────────────────────────────────────────────────────────────
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const rand    = (a: number, b: number) => a + Math.random() * (b - a);
const clamp   = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ── 기본 장애물 ───────────────────────────────────────────────────────────────
type Shape = 'circle' | 'square' | 'triangle' | 'diamond';
const SHAPES: Shape[] = ['circle', 'square', 'triangle', 'diamond', 'circle', 'square', 'triangle'];
let currentShape: Shape = 'circle';

type DotObs = { x: number; y: number; r: number; vx: number; vy: number; spin: number; shape: Shape };
let obstacles: DotObs[] = [];

// ── Pseudo-3D 스프라이트 캐시 (볼륨 그라데이션 + 림라이트 + 스펙큘러 + AO 섀도) ──
const SPR = 160, SPR_C = 80, SPR_U = 48; // 스프라이트 크기 / 중심 / 단위 반지름(px)
const spriteCache = new Map<string, HTMLCanvasElement>();

function shapePath(c: CanvasRenderingContext2D, shape: Shape | 'sphere', u: number) {
  c.beginPath();
  switch (shape) {
    case 'sphere':
    case 'circle': c.arc(0, 0, u, 0, Math.PI * 2); break;
    case 'square': { const s = u * 1.5; c.rect(-s, -s, s * 2, s * 2); break; }
    case 'triangle': {
      const h = u * 1.6;
      c.moveTo(0, -h); c.lineTo(h * 0.866, h * 0.5); c.lineTo(-h * 0.866, h * 0.5); c.closePath(); break;
    }
    case 'diamond': {
      const d = u * 1.5;
      c.moveTo(0, -d); c.lineTo(d, 0); c.lineTo(0, d); c.lineTo(-d, 0); c.closePath(); break;
    }
  }
}

function getBodySprite(shape: Shape | 'sphere', color: string): HTMLCanvasElement {
  const key = `${shape}|${color}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas'); cv.width = SPR; cv.height = SPR;
  const c = cv.getContext('2d')!;
  c.translate(SPR_C, SPR_C);
  // 좌상단 광원 볼륨 셰이딩
  const g = c.createRadialGradient(-SPR_U * 0.4, -SPR_U * 0.45, SPR_U * 0.1, 0, 0, SPR_U * 1.75);
  g.addColorStop(0, lighten(color, 0.55));
  g.addColorStop(0.35, lighten(color, 0.18));
  g.addColorStop(0.75, color);
  g.addColorStop(1, darken(color, 0.3));
  shapePath(c, shape, SPR_U);
  c.fillStyle = g; c.fill();
  // 림라이트
  shapePath(c, shape, SPR_U);
  c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = 2.5; c.stroke();
  // 스펙큘러 하이라이트
  c.save();
  shapePath(c, shape, SPR_U); c.clip();
  c.beginPath(); c.ellipse(-SPR_U * 0.38, -SPR_U * 0.45, SPR_U * 0.3, SPR_U * 0.18, -0.6, 0, Math.PI * 2);
  c.fillStyle = 'rgba(255,255,255,0.5)'; c.fill();
  c.restore();
  spriteCache.set(key, cv);
  return cv;
}

function getShadowSprite(): HTMLCanvasElement {
  const hit = spriteCache.get('shadow');
  if (hit) return hit;
  const cv = document.createElement('canvas'); cv.width = SPR; cv.height = SPR;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(SPR_C, SPR_C, 0, SPR_C, SPR_C, SPR_C * 0.72);
  g.addColorStop(0, 'rgba(15,20,30,0.32)');
  g.addColorStop(0.6, 'rgba(15,20,30,0.14)');
  g.addColorStop(1, 'rgba(15,20,30,0)');
  c.fillStyle = g; c.fillRect(0, 0, SPR, SPR);
  spriteCache.set('shadow', cv);
  return cv;
}

// extent = 시각 반경(px). 광원 좌상단 → 그림자는 우하단 오프셋으로 호출부에서 지정
function drawShadow(x: number, y: number, extent: number, alpha: number) {
  const d = extent * 3.8;
  ctx.globalAlpha = alpha;
  ctx.drawImage(getShadowSprite(), x - d / 2, y - d / 2, d, d);
  ctx.globalAlpha = 1;
}

function drawBody(shape: Shape | 'sphere', color: string, x: number, y: number, r: number) {
  const k = r / SPR_U;
  ctx.drawImage(getBodySprite(shape, color), x - SPR_C * k, y - SPR_C * k, SPR * k, SPR * k);
}

// ── 특수 장애물 (시간 경과 해금) ──────────────────────────────────────────────
type SpecialType = 'homing' | 'blade' | 'laser' | 'mine';
type Special = {
  k: SpecialType;
  x: number; y: number; vx: number; vy: number;
  r: number; rot: number; vRot: number;
  w?: number; h?: number;
  stopX?: number; stopY?: number;
  life?: number;
  exploded?: boolean;
  blastR?: number;
};
let specials: Special[] = [];

// ── 픽업 아이템 ───────────────────────────────────────────────────────────────
type PickupType = 'coin' | 'shield' | 'slowmo' | 'magnet' | 'ghost';
type Pickup = { k: PickupType; x: number; y: number; r: number; life: number };
let pickups: Pickup[] = [];

// ── 코인 스테이지 ─────────────────────────────────────────────────────────────
type FlyingCoin = { x: number; y: number; vx: number; vy: number; r: number };
let flyingCoins: FlyingCoin[] = [];
let coinStageActive = false;
let coinStageT      = 0;
let nextCoinStageIn = 0;
let coinStageObsTimer = 0;

const COIN_STAGE_DUR = 6.0;

// ── Near-Miss 배율 ────────────────────────────────────────────────────────────
let dangerCounter   = 0;  // 누적 아슬아슬 횟수 (최대 10)
let dangerDecayTimer = 0; // 마지막 near-miss 이후 경과 시간
let nearMissCooldown = 0; // 연속 트리거 방지 쿨다운
let nearMissFlash    = 0; // 링 flash intensity (0~1)

// ── 코인 콤보 ─────────────────────────────────────────────────────────────────
let coinCombo      = 0;
let coinComboTimer = 0;

// 파워업 활성 상태
let shieldActive  = false;
let slowmoActiveT = 0;   // 남은 시간 (초)
let magnetActiveT = 0;
let ghostActiveT  = 0;

const SLOWMO_DUR = 3.5;
const MAGNET_DUR = 5.0;
const GHOST_DUR  = 2.5;
const MAGNET_R   = 130;

// ── 기본 장애물 생성 ───────────────────────────────────────────────────────────
function perimeterPoint(angle: number): [number, number] {
  const cx = W / 2, cy = H / 2;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const tx = cos !== 0 ? (cos > 0 ? (W - cx) : -cx) / cos : Infinity;
  const ty = sin !== 0 ? (sin > 0 ? (H - cy) : -cy) / sin : Infinity;
  const t  = Math.min(Math.abs(tx), Math.abs(ty));
  return [cx + cos * t, cy + sin * t];
}

function makeObs(fullH: boolean): DotObs {
  const pad       = 35;
  const diff      = fullH ? 0 : Math.min(score / 25, 4); // 난이도 가속 완화 (15→25)
  const graceMult = 1 - waveGrace * 0.35;
  const baseSpd   = rand((4.0 + diff * 2.0) * graceMult, (6.5 + diff * 2.0) * graceMult); // 초반 속도 하향
  const roll = Math.random();
  let r: number, spdMult: number;
  if      (roll < 0.35) { r = rand(4, 8);   spdMult = 1.25; }
  else if (roll < 0.70) { r = rand(9, 16);  spdMult = 1.0; }
  else if (roll < 0.90) { r = rand(17, 26); spdMult = 0.78; }
  else                  { r = rand(27, 40); spdMult = 0.55; }
  const spd   = baseSpd * spdMult;
  const spin  = diff > 1.5 && Math.random() < 0.2
    ? (Math.random() < 0.5 ? 1 : -1) * rand(0.018, 0.038)
    : 0;
  const drift = Math.min(0.7, 0.1 + diff * 0.15);

  if (fullH) {
    const y = rand(pad, H - pad);
    return Math.random() < 0.5
      ? { x: -r - 10, y, r, vx:  spd, vy: 0, spin: 0, shape: 'circle' }
      : { x: W + r + 10, y, r, vx: -spd, vy: 0, spin: 0, shape: 'circle' };
  }

  const useCorner = diff > 0.6 && Math.random() < 0.28; // 코너 등장 늦춤
  const aimed     = diff > 2.0 && Math.random() < 0.18; // 조준탄 등장 늦춤
  let x = 0, y = 0, vx = 0, vy = 0;

  if (useCorner) {
    const corner = Math.floor(Math.random() * 4);
    const cx = corner % 2 === 0 ? -r - 10 : W + r + 10;
    const cy = corner < 2       ? -r - 10  : H + r + 10;
    x = cx; y = cy;
    if (aimed) { const a = Math.atan2(player.y - y, player.x - x); vx = Math.cos(a) * spd; vy = Math.sin(a) * spd; }
    else       { const ba = Math.atan2(H / 2 - cy, W / 2 - cx); const a = ba + rand(-0.4, 0.4); vx = Math.cos(a) * spd; vy = Math.sin(a) * spd; }
  } else {
    const side = Math.floor(Math.random() * 4);
    if (side === 0) {
      x = -r - 10; y = rand(pad, H - pad);
      if (aimed) { const a = Math.atan2(player.y - y, player.x - x); vx = Math.cos(a) * spd; vy = Math.sin(a) * spd; }
      else { vx = spd; vy = rand(-drift, drift) * spd; }
    } else if (side === 1) {
      x = W + r + 10; y = rand(pad, H - pad);
      if (aimed) { const a = Math.atan2(player.y - y, player.x - x); vx = Math.cos(a) * spd; vy = Math.sin(a) * spd; }
      else { vx = -spd; vy = rand(-drift, drift) * spd; }
    } else if (side === 2) {
      x = rand(pad, W - pad); y = -r - 10;
      if (aimed) { const a = Math.atan2(player.y - y, player.x - x); vx = Math.cos(a) * spd; vy = Math.sin(a) * spd; }
      else { vx = rand(-drift, drift) * spd; vy = spd; }
    } else {
      x = rand(pad, W - pad); y = H + r + 10;
      if (aimed) { const a = Math.atan2(player.y - y, player.x - x); vx = Math.cos(a) * spd; vy = Math.sin(a) * spd; }
      else { vx = rand(-drift, drift) * spd; vy = -spd; }
    }
  }
  return { x, y, r, vx, vy, spin, shape: currentShape };
}

// ── 특수 장애물 생성 (20s homing → 30s blade → 45s laser → 60s mine) ─────────
function makeSpecial(): Special {
  const diff = Math.min(score / 15, 4);
  const pad  = 50;
  const spd  = rand(3.5 + diff * 0.8, 5.5 + diff * 0.8);

  let types: SpecialType[];
  if      (score < 30) types = ['homing'];
  else if (score < 45) types = ['homing', 'blade'];
  else if (score < 60) types = ['homing', 'blade', 'laser'];
  else                 types = ['homing', 'blade', 'laser', 'mine'];
  const k = types[Math.floor(Math.random() * types.length)];

  const side = Math.floor(Math.random() * 4);
  let x = 0, y = 0, vx = 0, vy = 0;
  if      (side === 0) { x = -50;    y = rand(pad, H - pad); vx =  spd; }
  else if (side === 1) { x = W + 50; y = rand(pad, H - pad); vx = -spd; }
  else if (side === 2) { x = rand(pad, W - pad); y = -50;    vy =  spd; }
  else                 { x = rand(pad, W - pad); y = H + 50; vy = -spd; }

  const laserLen = rand(80 + diff * 30, 180 + diff * 50);
  return {
    k, x, y, vx, vy,
    r: k === 'mine' ? rand(10, 16) : k === 'blade' ? rand(18, 30) : k === 'homing' ? rand(5, 9) : 12,
    rot:  Math.random() * Math.PI * 2,
    vRot: k === 'blade' ? 0.14 : 0,
    w: k === 'laser' ? (vx !== 0 ? laserLen : 14) : undefined,
    h: k === 'laser' ? (vy !== 0 ? laserLen : 14) : undefined,
    stopX: k === 'mine' ? rand(W * 0.2, W * 0.8) : undefined,
    stopY: k === 'mine' ? rand(pad, H - pad) : undefined,
    life:  k === 'mine' ? 3.5 : undefined,
    exploded: false,
  };
}

// ── 픽업 생성 (확률 분포) ────────────────────────────────────────────────────
// coin 60% / slowmo 13% / magnet 12% / shield 10% / ghost 5%
function spawnPickup() {
  const roll = Math.random();
  let k: PickupType;

  if      (roll < 0.60) k = 'coin';
  else if (roll < 0.73) k = 'slowmo';
  else if (roll < 0.85) k = 'magnet';
  else if (roll < 0.95) k = 'shield';
  else                  k = 'ghost';

  pickups.push({
    k,
    x: rand(55, W - 55),
    y: rand(70, H - 70),
    r: 16,
    life: k === 'coin' ? 8.0 : 6.5,
  });
}

// ── 기본 장애물 업데이트/드로우/충돌 ─────────────────────────────────────────
function updateObs(dt: number) {
  const s = dt * 60;
  for (const o of obstacles) {
    if (o.spin !== 0) {
      const spd = Math.hypot(o.vx, o.vy);
      const ang = Math.atan2(o.vy, o.vx) + o.spin * s;
      o.vx = Math.cos(ang) * spd; o.vy = Math.sin(ang) * spd;
    }
    o.x += o.vx * s; o.y += o.vy * s;
  }
  obstacles = obstacles.filter(o => o.x > -200 && o.x < W + 200 && o.y > -200 && o.y < H + 200);
}

function drawObs() {
  // 섀도 패스 (AO — 우하단 오프셋) → 바디 패스 (2패스라 그림자가 바디를 덮지 않음)
  const sh = getShadowSprite();
  ctx.globalAlpha = 0.28;
  for (const o of obstacles) {
    const e = o.r * (o.shape === 'circle' ? 1 : 1.45);
    const d = e * 3.4;
    ctx.drawImage(sh, o.x + o.r * 0.22 + 2 - d / 2, o.y + o.r * 0.3 + 3 - d / 2, d, d);
  }
  ctx.globalAlpha = 1;
  for (const o of obstacles) drawBody(o.shape, gameColor, o.x, o.y, o.r);
}

function collidesObs(dot: { x: number; y: number; r: number }, o: DotObs): boolean {
  return Math.hypot(dot.x - o.x, dot.y - o.y) < dot.r + o.r;
}

// ── 특수 장애물 업데이트/드로우/충돌 ─────────────────────────────────────────
function updateSpecials(dt: number) {
  for (const o of specials) {
    o.rot += o.vRot * dt * 60;
    if (o.k === 'homing') {
      const dx = player.x - o.x, dy = player.y - o.y, d = Math.hypot(dx, dy);
      if (d > 0) {
        const spd = Math.hypot(o.vx, o.vy);
        const turnRate = 0.025;
        o.vx += (dx / d) * turnRate * spd * dt * 60; o.vy += (dy / d) * turnRate * spd * dt * 60;
        const ns = Math.hypot(o.vx, o.vy);
        if (ns > 7.5) { o.vx = o.vx / ns * 7.5; o.vy = o.vy / ns * 7.5; }
      }
      o.x += o.vx * dt * 60; o.y += o.vy * dt * 60;
    } else if (o.k === 'blade') {
      o.x += o.vx * dt * 60; o.y += o.vy * dt * 60;
      if (o.y < o.r + 20 || o.y > H - o.r - 20) { o.vy *= -1; o.y = clamp(o.y, o.r + 20, H - o.r - 20); }
    } else if (o.k === 'laser') {
      o.x += o.vx * dt * 60; o.y += o.vy * dt * 60;
    } else if (o.k === 'mine') {
      if (o.stopX !== undefined && o.stopY !== undefined) {
        const dx = o.stopX - o.x, dy = o.stopY - o.y, d = Math.hypot(dx, dy);
        if (d > 3) { const spd = Math.min(d * 0.06, 2.5); o.vx = (dx / d) * spd; o.vy = (dy / d) * spd; }
        else       { o.vx = 0; o.vy = 0; o.x = o.stopX; o.y = o.stopY; }
      }
      o.x += o.vx * dt * 60; o.y += o.vy * dt * 60;
      if (o.life !== undefined && Math.hypot(o.vx, o.vy) < 0.1) {
        o.life -= dt;
        if (o.life <= 0 && !o.exploded) { o.exploded = true; o.blastR = 0; triggerShake(0.6); sparkBurst(o.x, o.y, gameColor, 14, 2, 8); haptic('error'); }
      }
      if (o.exploded && o.blastR !== undefined) o.blastR += dt * 320;
    }
  }
  specials = specials.filter(o => {
    if (o.k === 'mine' && o.exploded) return (o.blastR ?? 0) < Math.hypot(W, H);
    return o.x > -300 && o.x < W + 300 && o.y > -300 && o.y < H + 300;
  });
}

// 로컬 좌표(중심 0,0) 볼륨 그라데이션 — 특수 장애물 수가 적어 프레임당 생성 허용
function localGrad(r: number): CanvasGradient {
  const g = ctx.createRadialGradient(-r * 0.4, -r * 0.45, r * 0.1, 0, 0, r * 1.7);
  g.addColorStop(0, lighten(gameColor, 0.5));
  g.addColorStop(0.4, lighten(gameColor, 0.15));
  g.addColorStop(0.8, gameColor);
  g.addColorStop(1, darken(gameColor, 0.28));
  return g;
}

function drawSpecials() {
  for (const o of specials) {
    // AO 섀도 (레이저/폭발 링 제외)
    if (o.k !== 'laser' && !(o.k === 'mine' && o.exploded)) {
      drawShadow(o.x + o.r * 0.25 + 2, o.y + o.r * 0.35 + 3, o.r * (o.k === 'mine' ? 1.4 : 1.1), 0.3);
    }
    ctx.save();
    ctx.translate(o.x, o.y); ctx.rotate(o.rot);
    if (o.k === 'homing') {
      ctx.beginPath(); ctx.arc(0, 0, o.r, 0, Math.PI * 2);
      ctx.fillStyle = localGrad(o.r); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, o.r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = '#FF2D78'; ctx.lineWidth = 1.5; ctx.stroke();
    } else if (o.k === 'blade') {
      const teeth = 8, ir = o.r * 0.55;
      ctx.beginPath();
      for (let i = 0; i < teeth * 2; i++) {
        const angle = (i / (teeth * 2)) * Math.PI * 2 - Math.PI / 2;
        const r2 = i % 2 === 0 ? o.r : ir;
        i === 0 ? ctx.moveTo(Math.cos(angle) * r2, Math.sin(angle) * r2)
                : ctx.lineTo(Math.cos(angle) * r2, Math.sin(angle) * r2);
      }
      ctx.closePath(); ctx.fillStyle = localGrad(o.r); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, ir * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
    } else if (o.k === 'laser') {
      ctx.strokeStyle = gameColor; ctx.lineWidth = 2;
      ctx.strokeRect(-(o.w ?? 0) / 2, -(o.h ?? 0) / 2, o.w ?? 0, o.h ?? 0);
      ctx.fillStyle = colorWithAlpha(gameColor, 0.18);
      ctx.fillRect(-(o.w ?? 0) / 2, -(o.h ?? 0) / 2, o.w ?? 0, o.h ?? 0);
    } else if (o.k === 'mine') {
      if (o.exploded) {
        const br = o.blastR ?? 0;
        ctx.beginPath(); ctx.arc(0, 0, br, 0, Math.PI * 2);
        ctx.strokeStyle = colorWithAlpha(gameColor, Math.max(0, 1 - br / 200));
        ctx.lineWidth = 4; ctx.stroke();
      } else {
        const pulse = 1 + Math.sin(Date.now() * 0.008) * 0.1;
        const mr = o.r * pulse;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.moveTo(Math.cos(a) * mr, Math.sin(a) * mr);
          ctx.lineTo(Math.cos(a) * (mr + mr * 0.4), Math.sin(a) * (mr + mr * 0.4));
        }
        ctx.strokeStyle = gameColor; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, mr, 0, Math.PI * 2);
        ctx.fillStyle = gameColor; ctx.fill();
        if (o.life !== undefined && Math.hypot(o.vx, o.vy) < 0.1) {
          const urgency = Math.max(0, 1 - o.life / 3.5);
          ctx.beginPath(); ctx.arc(0, 0, mr + 8, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,45,120,${urgency * 0.7})`; ctx.lineWidth = 2; ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
}

function collidesSpecial(dot: { x: number; y: number; r: number }, o: Special): boolean {
  if (o.k === 'mine' && o.exploded) return Math.hypot(dot.x - o.x, dot.y - o.y) < (o.blastR ?? 0) + dot.r;
  if (o.k === 'laser' && o.w !== undefined && o.h !== undefined)
    return Math.abs(dot.x - o.x) < o.w / 2 + dot.r && Math.abs(dot.y - o.y) < o.h / 2 + dot.r;
  return Math.hypot(dot.x - o.x, dot.y - o.y) < dot.r + o.r;
}

// ── 픽업 업데이트/드로우/충돌 ────────────────────────────────────────────────
const PICKUP_IMGS: Record<PickupType, HTMLImageElement> = {
  coin:   Object.assign(new Image(), { src: '/assets/coin.png' }),
  shield: Object.assign(new Image(), { src: '/assets/shield.png' }),
  slowmo: Object.assign(new Image(), { src: '/assets/slowmo.png' }),
  magnet: Object.assign(new Image(), { src: '/assets/magnet.png' }),
  ghost:  Object.assign(new Image(), { src: '/assets/ghost.png' }),
};

function updatePickups(dt: number) {
  // 마그넷: 픽업 흡수 (코인만)
  if (magnetActiveT > 0) {
    for (const p of pickups) {
      if (p.k !== 'coin') continue;
      const dx = player.x - p.x, dy = player.y - p.y, d = Math.hypot(dx, dy);
      if (d < MAGNET_R && d > 0) { p.x += (dx / d) * 5; p.y += (dy / d) * 5; }
    }
  }
  for (const p of pickups) p.life -= dt;
  pickups = pickups.filter(p => p.life > 0);
}

function drawPickups() {
  for (const p of pickups) {
    const pulse = 1 + Math.sin(Date.now() * 0.008) * 0.12;
    const r     = p.r * pulse;
    const alpha = Math.min(1, p.life * 0.7);
    drawShadow(p.x + r * 0.2 + 2, p.y + r * 0.3 + 3, r, 0.2 * alpha);
    ctx.save();
    ctx.globalAlpha = alpha;

    const img = PICKUP_IMGS[p.k];
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, p.x - r, p.y - r, r * 2, r * 2);
    } else {
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = '#FFB300'; ctx.fill();
    }

    // 마그넷 활성 중 범위 링 표시
    if (p.k === 'magnet' && magnetActiveT > 0) {
      ctx.beginPath(); ctx.arc(p.x, p.y, MAGNET_R, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(236,72,153,0.15)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.restore();
  }
}

function collectPickup(p: Pickup) {
  // 실시간 픽업은 진동 금지 (코인) — 시각 팝 + 스파크로 대체. 파워업만 굵은 이벤트 햅틱
  if (p.k === 'coin') {
    coinCombo++;
    coinComboTimer = 3.0;
    const bonus  = coinCombo >= 5 ? 2 : coinCombo >= 3 ? 1 : 0;
    const earned = 1 + bonus;
    sessionCoins += earned; totalCoins += earned; saveCoins(totalCoins);
    document.getElementById('sessionCoinVal')!.textContent = String(sessionCoins);
    sparkBurst(p.x, p.y, '#FFB300', 4, 1.5, 4);
    squashImpulse(0.7);
    if (coinCombo >= 3) toast = { text: `🟡 COMBO ×${coinCombo}${bonus > 0 ? ` +${bonus}!` : '!'}`, alpha: 1, y: H * 0.42 };
  } else {
    if      (p.k === 'shield') shieldActive  = true;
    else if (p.k === 'slowmo') slowmoActiveT = SLOWMO_DUR;
    else if (p.k === 'magnet') magnetActiveT = MAGNET_DUR;
    else if (p.k === 'ghost')  ghostActiveT  = GHOST_DUR;
    squashImpulse(1.2);
    haptic('success');
  }
}

function collidesPickup(dot: { x: number; y: number; r: number }, p: Pickup): boolean {
  return Math.hypot(dot.x - p.x, dot.y - p.y) < dot.r + p.r + 4;
}

// ── 파워업 HUD 업데이트 ────────────────────────────────────────────────────────
function updatePowerupHUD() {
  const icons: [string, boolean | number][] = [
    ['shieldIcon',  shieldActive],
    ['slowmoIcon',  slowmoActiveT > 0],
    ['magnetIcon',  magnetActiveT > 0],
    ['ghostIcon',   ghostActiveT  > 0],
  ];
  for (const [id, active] of icons) {
    const el = document.getElementById(id);
    if (el) el.style.display = active ? 'flex' : 'none';
  }
}

// ── 화면 흔들림 + 웨이브 ──────────────────────────────────────────────────────
let shakeIntensity = 0, shakeX = 0, shakeY = 0;
let gameTime  = 0, nextWave  = 15, waveGrace = 0, waveHintAlpha = 0, waveCount = 0;

function triggerShake(intensity: number) { if (reducedMotion) return; shakeIntensity = Math.max(shakeIntensity, intensity); }

function updateShake(dt: number) {
  if (shakeIntensity > 0) {
    shakeIntensity = Math.max(0, shakeIntensity - dt * 1.2);
    const mag = shakeIntensity * 28;
    shakeX = (Math.random() - 0.5) * mag; shakeY = (Math.random() - 0.5) * mag;
  } else { shakeX = 0; shakeY = 0; }
}

function triggerWave() {
  obstacles = []; specials = [];
  waveCount++;
  waveGrace = 1.0; waveHintAlpha = 1.0;
  colorIdx  = (colorIdx + 1) % COLORS.length;
  gameColor = COLORS[colorIdx]; currentShape = SHAPES[colorIdx]; applyColor();
  triggerShake(0.6);
  toast = { text: `✦ WAVE ${waveCount + 1}`, alpha: 1, y: H * 0.38 };
  haptic('basicMedium');
  const pulseEl = document.getElementById('dirPulse')!;
  pulseEl.classList.remove('pulse');
  void (pulseEl as HTMLElement).offsetWidth;
  pulseEl.classList.add('pulse');
}

// ── Auto-pilot ────────────────────────────────────────────────────────────────
const auto = {
  x: 0, y: 0, r: 6, vx: 0, vy: 0,
  reset() { this.x = W * 0.5; this.y = H * 0.5; this.vx = 0; this.vy = 0; },
  update(dt: number) {
    let fx = 0, fy = 0;
    const sense = 160;
    for (const o of obstacles) {
      const dx = this.x - o.x, dy = this.y - o.y, d = Math.hypot(dx, dy);
      if (d < sense && d > 0) { const f = Math.pow((sense - d) / sense, 2) * 10; fx += (dx / d) * f; fy += (dy / d) * f; }
    }
    fx += (W * 0.5 - this.x) * 0.004; fy += (H * 0.5 - this.y) * 0.004;
    const bp = 70;
    if (this.x < bp)     fx += (bp - this.x) * 0.1;
    if (this.x > W - bp) fx -= (this.x - (W - bp)) * 0.1;
    if (this.y < bp)     fy += (bp - this.y) * 0.1;
    if (this.y > H - bp) fy -= (this.y - (H - bp)) * 0.1;
    this.vx = (this.vx + fx) * 0.82; this.vy = (this.vy + fy) * 0.82;
    const spd = Math.hypot(this.vx, this.vy);
    if (spd > 5) { this.vx = this.vx / spd * 5; this.vy = this.vy / spd * 5; }
    this.x += this.vx * dt * 60; this.y += this.vy * dt * 60;
  },
};

// ── Player ────────────────────────────────────────────────────────────────────
const player = { x: 0, y: 0, r: 6 };

// ── 플레이어 시각 물리 (프레젠테이션 전용 — 판정은 player.x/y 그대로) ─────────
// 관성 오프셋은 8px 클램프: 시각이 판정 위치를 크게 속이지 않게
const pvis = {
  ox: 0, oy: 0, ovx: 0, ovy: 0, // 관성 오프셋 + 스프링 속도
  vex: 0, vey: 0,               // 속도 추정 (스트레치 방향)
  sq: 0, sqv: 0,                // 스쿼시 감쇠 스프링
  px: 0, py: 0,                 // 이전 논리 위치
  reset() {
    this.ox = this.oy = this.ovx = this.ovy = 0;
    this.vex = this.vey = this.sq = this.sqv = 0;
    this.px = player.x; this.py = player.y;
  },
};
// v≈1.0 → 스케일 피크 +0.07 (ω=17.9, ζ=0.45 기준)
function squashImpulse(v: number) { if (!reducedMotion) pvis.sqv += v * 2; }

function updatePlayerVisual(dt: number) {
  const dx = player.x - pvis.px, dy = player.y - pvis.py;
  pvis.px = player.x; pvis.py = player.y;
  if (dt <= 0) return;
  const a = 1 - Math.exp(-dt * 12);
  pvis.vex += (dx / dt - pvis.vex) * a;
  pvis.vey += (dy / dt - pvis.vey) * a;
  if (reducedMotion) { pvis.ox = pvis.oy = 0; pvis.sq = 0; return; }
  // 관성: 이동분 일부를 시각 오프셋으로 흡수 → 감쇠 스프링 복원 (오버슛 허용)
  pvis.ox -= dx * 0.42; pvis.oy -= dy * 0.42;
  const K = 340, C = 2 * Math.sqrt(K) * 0.62;
  pvis.ovx += (-K * pvis.ox - C * pvis.ovx) * dt;
  pvis.ovy += (-K * pvis.oy - C * pvis.ovy) * dt;
  pvis.ox += pvis.ovx * dt; pvis.oy += pvis.ovy * dt;
  const om = Math.hypot(pvis.ox, pvis.oy), OMAX = 8;
  if (om > OMAX) { pvis.ox *= OMAX / om; pvis.oy *= OMAX / om; }
  // 스쿼시 스프링
  const KS = 320, CS = 2 * Math.sqrt(KS) * 0.45;
  pvis.sqv += (-KS * pvis.sq - CS * pvis.sqv) * dt;
  pvis.sq += pvis.sqv * dt;
}

function drawPlayer(alpha: number) {
  const x = player.x + pvis.ox, y = player.y + pvis.oy, r = player.r;
  const spd = Math.hypot(pvis.vex, pvis.vey);
  const stretch = reducedMotion ? 0 : Math.min(spd / 1600, 1) * 0.2;
  const sq = reducedMotion ? 0 : pvis.sq;
  const sx = clamp(1 + stretch + sq, 0.8, 1.22);
  const sy = clamp(1 - stretch * 0.6 + sq, 0.8, 1.22);
  const ang = Math.atan2(pvis.vey, pvis.vex);
  drawShadow(x + r * 0.25 + 2, y + r * 0.35 + 3, r, 0.34 * alpha);
  ctx.save();
  ctx.globalAlpha = alpha;
  // 속도축 스트레치: R(a)·S·R(-a) — 스프라이트 방향은 유지, 스케일 축만 회전
  ctx.translate(x, y); ctx.rotate(ang); ctx.scale(sx, sy); ctx.rotate(-ang);
  drawBody('sphere', getPlayerColor(), 0, 0, r);
  ctx.restore();
}

// 스피드 모션 트레일 (스킨 트레일과 별개, 속도 비례 잔상)
function drawSpeedTrail(alpha: number) {
  if (reducedMotion) return;
  const spd = Math.hypot(pvis.vex, pvis.vey);
  if (spd < 260) return;
  const pc = getPlayerColor(), n = posHistory.length;
  const idxs = [4, 9, 15];
  for (let i = 0; i < idxs.length; i++) {
    const p = posHistory[n - 1 - idxs[i]];
    if (!p) continue;
    ctx.globalAlpha = alpha * (0.1 - i * 0.03) * Math.min(spd / 900, 1);
    ctx.fillStyle = pc;
    ctx.beginPath(); ctx.arc(p.x, p.y, player.r * (0.85 - i * 0.15), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function getPlayerR(): number {
  if (score < 20)  return 6;  if (score < 50)  return 8;
  if (score < 90)  return 10; if (score < 140) return 12;
  return 14;
}
function resetPlayer() { player.x = W * 0.5; player.y = H * 0.5; player.r = 6; pvis.reset(); }

// ── Trail ─────────────────────────────────────────────────────────────────────
type TrailDot = { x: number; y: number; r: number; life: number; color: string };
let trailDots: TrailDot[] = [];
let posHistory: { x: number; y: number }[] = [];
const POS_HISTORY_MAX = 30;

function updateTrail(dt: number) {
  const style = getTrailStyle();
  const pc    = getPlayerColor();
  const vx = player.x + pvis.ox, vy = player.y + pvis.oy;
  if (style === 'comet') {
    trailDots.push({ x: vx, y: vy, r: player.r * 0.85, life: 1, color: pc });
  }
  posHistory.push({ x: vx, y: vy }); // 스피드 트레일 + shadow 스킨 공용
  if (posHistory.length > POS_HISTORY_MAX) posHistory.shift();
  for (const t of trailDots) t.life -= dt * 4;
  trailDots = trailDots.filter(t => t.life > 0);
}

function drawTrail() {
  const style = getTrailStyle();
  if (style === 'comet') {
    for (const t of trailDots) {
      ctx.globalAlpha = t.life * 0.45;
      ctx.fillStyle   = t.color;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r * t.life, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (style === 'shadow') {
    const step = 5;
    for (let i = 0; i < posHistory.length; i += step) {
      ctx.globalAlpha = (i / posHistory.length) * 0.3;
      ctx.fillStyle   = getPlayerColor();
      ctx.beginPath(); ctx.arc(posHistory[i].x, posHistory[i].y, player.r * 0.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// ── Particles (중력 + 화면 에지 바운스, restitution 0.38~0.52) ────────────────
type Particle = { x: number; y: number; vx: number; vy: number; r: number; life: number; decay: number; rest: number; color?: string };
let particles: Particle[] = [];

function explode(x: number, y: number) {
  for (let i = 0; i < 32; i++) {
    const a = Math.random() * Math.PI * 2, spd = rand(1, 7);
    particles.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: rand(1, 3), life: 1, decay: rand(0.012, 0.025), rest: rand(0.38, 0.52) });
  }
}
function sparkBurst(x: number, y: number, color: string, n: number, spd0: number, spd1: number) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, spd = rand(spd0, spd1);
    particles.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 1.2, r: rand(1, 2.5), life: 1, decay: rand(0.02, 0.04), rest: rand(0.38, 0.52), color });
  }
}
function updateParticles(dt: number) {
  const s = dt * 60;
  for (const p of particles) {
    p.x += p.vx * s; p.y += p.vy * s;
    p.vy += 0.22 * s;
    p.vx *= Math.pow(0.96, s); p.vy *= Math.pow(0.96, s);
    if (p.y > H - p.r && p.vy > 0) { p.y = H - p.r; p.vy *= -p.rest; p.vx *= 0.82; }
    if (p.x < p.r && p.vx < 0)     { p.x = p.r;     p.vx *= -p.rest; }
    if (p.x > W - p.r && p.vx > 0) { p.x = W - p.r; p.vx *= -p.rest; }
    p.life -= p.decay * s;
  }
  particles = particles.filter(p => p.life > 0);
}
function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = p.life * p.life;
    ctx.fillStyle = p.color ?? gameColor;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ── 쇼크링 (니어미스/피격 임팩트) ────────────────────────────────────────────
type ShockRing = { x: number; y: number; r: number; vr: number; alpha: number; color?: string };
let shockRings: ShockRing[] = [];
function spawnShockRing(x: number, y: number, r0: number, vr: number, alpha: number, color?: string) {
  shockRings.push({ x, y, r: r0, vr, alpha, color });
}
function updateShockRings(dt: number) {
  for (const s of shockRings) { s.r += s.vr * dt; s.alpha -= dt * 2.2; }
  shockRings = shockRings.filter(s => s.alpha > 0);
}
function drawShockRings() {
  for (const s of shockRings) {
    ctx.globalAlpha = Math.max(0, s.alpha);
    ctx.strokeStyle = s.color ?? gameColor;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ── 공간 깊이: 패럴랙스 그리드 + 다이내믹 비네트 ─────────────────────────────
let vinX = 0, vinY = 0;
function drawEnvironment(fx: number, fy: number) {
  const layers: [number, number, string][] = [
    [88, 0.028, 'rgba(20,26,40,0.03)'],
    [176, 0.055, 'rgba(20,26,40,0.05)'],
  ];
  for (const [gap, f, col] of layers) {
    const ox = (-fx * f) % gap, oy = (-fy * f) % gap;
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ox - gap; x < W + gap; x += gap) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = oy - gap; y < H + gap; y += gap) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }
}
function drawVignette(fx: number, fy: number, dt: number) {
  // 광원이 플레이어를 따라오는 다이내믹 라이팅 — 초점에서 멀수록 어둡게, 위험도에 반응
  const a = 1 - Math.exp(-dt * 5);
  vinX += (fx - vinX) * a; vinY += (fy - vinY) * a;
  const base = 0.05 + Math.min(dangerCounter, 10) * 0.006 + nearMissFlash * 0.05;
  const R = Math.hypot(W, H) * 0.75;
  const g = ctx.createRadialGradient(vinX, vinY, R * 0.25, vinX, vinY, R);
  g.addColorStop(0, 'rgba(10,14,26,0)');
  g.addColorStop(1, `rgba(10,14,26,${base.toFixed(3)})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// ── Score & Milestone ─────────────────────────────────────────────────────────
let score = 0, scoreF = 0;
const scoreEl = document.getElementById('score')!;
const MILESTONES = [10, 20, 30, 60, 120, 180];
let milestoneIdx = 0;
type Toast = { text: string; alpha: number; y: number };
let toast: Toast | null = null;

function updateToast(dt: number) { if (!toast) return; toast.alpha = Math.max(0, toast.alpha - dt * 0.9); toast.y -= dt * 28; if (toast.alpha <= 0) toast = null; }
function drawToast() {
  if (!toast) return;
  ctx.save(); ctx.globalAlpha = toast.alpha * toast.alpha;
  ctx.fillStyle = gameColor;
  ctx.font = `900 ${Math.floor(Math.min(W, H) * 0.13)}px "Space Grotesk", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(toast.text, W / 2, toast.y); ctx.restore();
}

// 신규 장애물 해금 알림
type UnlockToast = { text: string; alpha: number };
let unlockToast: UnlockToast | null = null;
const UNLOCKED: Record<string, boolean> = { homing: false, blade: false, laser: false, mine: false };

function checkUnlocks() {
  if (!UNLOCKED.homing && score >= 20) { UNLOCKED.homing = true; unlockToast = { text: 'NEW: ⚠️ TRACKER', alpha: 1 }; }
  else if (!UNLOCKED.blade  && score >= 30) { UNLOCKED.blade  = true; unlockToast = { text: 'NEW: ⚙️ BLADE',   alpha: 1 }; }
  else if (!UNLOCKED.laser  && score >= 45) { UNLOCKED.laser  = true; unlockToast = { text: 'NEW: ⚡ LASER',   alpha: 1 }; }
  else if (!UNLOCKED.mine   && score >= 60) { UNLOCKED.mine   = true; unlockToast = { text: 'NEW: 💣 MINE',    alpha: 1 }; }
}
function updateUnlockToast(dt: number) { if (!unlockToast) return; unlockToast.alpha = Math.max(0, unlockToast.alpha - dt * 0.5); if (unlockToast.alpha <= 0) unlockToast = null; }
function drawUnlockToast() {
  if (!unlockToast) return;
  ctx.save(); ctx.globalAlpha = unlockToast.alpha;
  ctx.fillStyle = '#FF2D78';
  ctx.font = `900 ${Math.floor(Math.min(W, H) * 0.055)}px "Space Grotesk", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(unlockToast.text, W / 2, H * 0.2); ctx.restore();
}

function tickScore(dt: number) {
  const dangerMult = 1 + Math.min(dangerCounter, 10) * 0.2;
  scoreF += dt * dangerMult;
  const prev = score; score = Math.floor(scoreF);
  scoreEl.textContent = score + 's';
  const multEl = document.getElementById('multHUD')!;
  if (dangerCounter > 0) {
    multEl.textContent = `×${dangerMult.toFixed(1)}`;
    multEl.style.display = '';
  } else {
    multEl.style.display = 'none';
  }
  while (milestoneIdx < MILESTONES.length && score >= MILESTONES[milestoneIdx]) {
    if (prev < MILESTONES[milestoneIdx]) { toast = { text: MILESTONES[milestoneIdx] + 's !', alpha: 1, y: H * 0.38 }; haptic('confetti'); }
    milestoneIdx++;
  }
  checkUnlocks();
}

// ── 코인 스테이지 함수 ────────────────────────────────────────────────────────
function spawnFlyingCoin() {
  const side = Math.floor(Math.random() * 4);
  const spd  = rand(5, 9);
  let x: number, y: number, vx: number, vy: number;
  if (side === 0) {
    x = rand(0, W); y = -16;
    const a = Math.PI / 2 + rand(-0.5, 0.5);
    vx = Math.cos(a) * spd; vy = Math.sin(a) * spd;
  } else if (side === 1) {
    x = W + 16; y = rand(0, H);
    const a = Math.PI + rand(-0.5, 0.5);
    vx = Math.cos(a) * spd; vy = Math.sin(a) * spd;
  } else if (side === 2) {
    x = rand(0, W); y = H + 16;
    const a = -Math.PI / 2 + rand(-0.5, 0.5);
    vx = Math.cos(a) * spd; vy = Math.sin(a) * spd;
  } else {
    x = -16; y = rand(0, H);
    const a = rand(-0.5, 0.5);
    vx = Math.cos(a) * spd; vy = Math.sin(a) * spd;
  }
  flyingCoins.push({ x, y, vx, vy, r: 14 });
}

function startCoinStage() {
  coinStageActive   = true;
  coinStageT        = COIN_STAGE_DUR;
  coinStageObsTimer = 0;
  obstacles = []; specials = [];
  toast = { text: '🟡 COIN WAVE!', alpha: 1, y: H * 0.38 };
  haptic('confetti');
}

function updateFlyingCoins(dt: number) {
  if (magnetActiveT > 0) {
    for (const c of flyingCoins) {
      const dx = player.x - c.x, dy = player.y - c.y, d = Math.hypot(dx, dy);
      if (d < MAGNET_R && d > 0) { c.x += (dx / d) * 6 * dt * 60; c.y += (dy / d) * 6 * dt * 60; }
    }
  }
  for (const c of flyingCoins) { c.x += c.vx * dt * 60; c.y += c.vy * dt * 60; }
  flyingCoins = flyingCoins.filter(c => c.x > -60 && c.x < W + 60 && c.y > -60 && c.y < H + 60);
}

function drawFlyingCoins() {
  const img = PICKUP_IMGS['coin'];
  for (const c of flyingCoins) {
    const pulse = 1 + Math.sin(Date.now() * 0.01 + c.x) * 0.1;
    const r = c.r * pulse;
    drawShadow(c.x + r * 0.2 + 2, c.y + r * 0.3 + 3, r, 0.18);
    ctx.save();
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, c.x - r, c.y - r, r * 2, r * 2);
    } else {
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.fillStyle = '#FFB300'; ctx.fill();
    }
    ctx.restore();
  }
}

// ── Spawner ────────────────────────────────────────────────────────────────────
let obsTimer = 0, introObsTimer = 0, specialTimer = 0, pickupTimer = 0, patternTimer = 0;
// 픽업 간격은 스폰마다 한 번 뽑는다. 매 프레임 rand(5,10)를 다시 뽑으면 실제 평균이 약 5.3초로 쏠리고 프레임률에 따라 달라졌다. 기존 체감(평균 약 5.5초)을 유지하도록 5~6초.
const nextPickupDelay = () => rand(5, 6);
let pickupDue = nextPickupDelay();
let nextSpecialInterval = rand(20, 30);

function spawnTick(dt: number) {
  if (waveGrace > 0) waveGrace = Math.max(0, waveGrace - dt / 3);

  // 코인 스테이지 카운트다운
  if (!coinStageActive && score >= 5) {
    nextCoinStageIn -= dt;
    if (nextCoinStageIn <= 0) startCoinStage();
  }

  // 코인 스테이지 진행 중
  if (coinStageActive) {
    coinStageT -= dt;
    coinStageObsTimer += dt;
    if (coinStageObsTimer >= 0.22) {
      coinStageObsTimer = 0;
      spawnFlyingCoin();
    }
    if (coinStageT <= 0) {
      coinStageActive = false;
      nextCoinStageIn = rand(30, 70);
      flyingCoins = [];
    }
    // 코인 스테이지 중 일반 장애물/특수 스폰 중단
    pickupTimer += dt;
    if (pickupTimer >= pickupDue) { pickupTimer = 0; pickupDue = nextPickupDelay(); spawnPickup(); }
    return;
  }

  const diff         = Math.min(score / 25, 4); // makeObs와 동일하게 25
  const baseInterval = Math.max(0.18, 1.1 - diff * 0.35); // 초반 스폰 간격 늘림
  const interval     = baseInterval * (1 + waveGrace * 0.8);
  obsTimer += dt;
  if (obsTimer >= interval) {
    obsTimer = 0;
    obstacles.push(makeObs(false));
    if (diff > 0.8 && Math.random() < 0.5) obstacles.push(makeObs(false));  // 20s~ 다중 스폰
    if (diff > 1.6 && Math.random() < 0.4) obstacles.push(makeObs(false));  // 40s~
    if (diff > 2.8 && Math.random() < 0.3) obstacles.push(makeObs(false));  // 70s~
  }
  if (score >= 20) {
    patternTimer += dt;
    const patternInterval = Math.max(8, 14 - diff * 1.5);
    if (patternTimer >= patternInterval) { patternTimer = 0; triggerPattern(); }
  }
  if (score >= 10) {
    specialTimer += dt;
    if (specialTimer >= nextSpecialInterval) {
      specialTimer = 0;
      nextSpecialInterval = rand(Math.max(8, 18 - diff * 2), Math.max(12, 25 - diff * 2));
      specials.push(makeSpecial());
      haptic('basicMedium');
    }
  }
  pickupTimer += dt;
  if (pickupTimer >= pickupDue) { pickupTimer = 0; pickupDue = nextPickupDelay(); spawnPickup(); }
}

// ── Pattern Spawner ────────────────────────────────────────────────────────────
function spawnPinwheel(diff: number) {
  const arms = Math.floor(rand(5, 8)), spd = (3.5 + diff) * 0.8, r = rand(5, 13);
  const base = Math.random() * Math.PI * 2, spread = 0.18;
  for (let i = 0; i < arms; i++) {
    setTimeout(() => {
      if (state !== S.PLAY) return;
      const angle = base + (i / arms) * Math.PI * 2;
      const [px, py] = perimeterPoint(angle);
      const toCenter = Math.atan2(H / 2 - py, W / 2 - px);
      const shotAngle = toCenter + rand(-spread, spread);
      const spin = (Math.random() < 0.5 ? 1 : -1) * rand(0.01, 0.025);
      obstacles.push({ x: px, y: py, r, vx: Math.cos(shotAngle) * spd, vy: Math.sin(shotAngle) * spd, spin, shape: currentShape });
    }, i * 110);
  }
}
function spawnFan(diff: number) {
  const count = Math.floor(rand(5, 8)), spd = (4 + diff) * 0.85, r = rand(5, 14), fanAngle = Math.PI / 2.5;
  const side = Math.floor(Math.random() * 4);
  let x: number, y: number, baseA: number;
  if      (side === 0) { x = rand(W * 0.2, W * 0.8); y = -20;    baseA =  Math.PI / 2; }
  else if (side === 1) { x = W + 20;                  y = rand(H * 0.2, H * 0.8); baseA = Math.PI; }
  else if (side === 2) { x = rand(W * 0.2, W * 0.8); y = H + 20; baseA = -Math.PI / 2; }
  else                 { x = -20;                     y = rand(H * 0.2, H * 0.8); baseA = 0; }
  for (let i = 0; i < count; i++) {
    const a = baseA + (i / (count - 1) - 0.5) * fanAngle;
    obstacles.push({ x, y, r, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, spin: (Math.random() < 0.5 ? 1 : -1) * rand(0, 0.02), shape: currentShape });
  }
}
function spawnSpiral(diff: number) {
  const count      = Math.floor(rand(6, 11));
  const spd        = (3.5 + diff) * 0.9;
  const r          = rand(4, 13);
  const startAngle = Math.random() * Math.PI * 2;
  const turns      = rand(0.9, 1.7);
  const cw         = Math.random() < 0.5 ? 1 : -1;
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      if (state !== S.PLAY) return;
      const angle     = startAngle + cw * (i / count) * turns * Math.PI * 2;
      const [px, py]  = perimeterPoint(angle);
      const toCenter  = Math.atan2(H / 2 - py, W / 2 - px);
      const shotAngle = toCenter + cw * 0.32;
      obstacles.push({ x: px, y: py, r, vx: Math.cos(shotAngle) * spd, vy: Math.sin(shotAngle) * spd, spin: cw * rand(0.006, 0.018), shape: currentShape });
    }, i * 130);
  }
}

function triggerPattern() {
  const diff = Math.min(score / 20, 4);
  const roll = Math.random();
  if      (roll < 0.38) spawnPinwheel(diff);
  else if (roll < 0.70) spawnFan(diff);
  else                  spawnSpiral(diff);
}

// ── Controls ─────────────────────────────────────────────────────────────────
let drag = false, dragX = 0, dragY = 0, hintAlpha = 1;
function onDown(cx: number, cy: number) { if (state !== S.PLAY) return; drag = true; dragX = cx; dragY = cy; hintAlpha = 0; }
function onMove(cx: number, cy: number) {
  if (!drag || state !== S.PLAY) return;
  player.x = clamp(player.x + (cx - dragX), player.r, W - player.r);
  player.y = clamp(player.y + (cy - dragY), player.r, H - player.r);
  dragX = cx; dragY = cy; hintAlpha = 0;
}
function onUp() { drag = false; }

canvas.addEventListener('touchstart', e => { e.preventDefault(); const t = e.touches[0]; onDown(t.clientX, t.clientY); }, { passive: false });
canvas.addEventListener('touchmove',  e => { e.preventDefault(); const t = e.touches[0]; onMove(t.clientX, t.clientY); }, { passive: false });
canvas.addEventListener('touchend',   e => { e.preventDefault(); onUp(); }, { passive: false });
canvas.addEventListener('mousedown',  e => onDown(e.clientX, e.clientY));
canvas.addEventListener('mousemove',  e => onMove(e.clientX, e.clientY));
window.addEventListener('mouseup',    onUp);
function startHintFade() { setTimeout(() => { hintAlpha = 0; }, 3000); }

// ── Zoom ──────────────────────────────────────────────────────────────────────
let zoomT = 0, ZOOM_DUR = 0.85, zoomFX = 0, zoomFY = 0, deadT = 0;

// ── Draw Helpers ──────────────────────────────────────────────────────────────
function drawDot(x: number, y: number, r: number, color?: string) {
  drawShadow(x + r * 0.25 + 2, y + r * 0.35 + 3, r, 0.32);
  drawBody('sphere', color ?? gameColor, x, y, r);
}

function drawHintArea() {
  if (hintAlpha <= 0) return;
  ctx.save(); ctx.globalAlpha = hintAlpha;
  const cx = W / 2, cy = H / 2;
  ctx.fillStyle = getPlayerColor();
  ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
  const arrowOff = 36;
  ctx.strokeStyle = colorWithAlpha(getPlayerColor(), 0.35); ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(cx - 9, cy); ctx.lineTo(cx - arrowOff + 8, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 9, cy); ctx.lineTo(cx + arrowOff - 8, cy); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(cx - arrowOff + 8, cy - 5); ctx.lineTo(cx - arrowOff, cy); ctx.lineTo(cx - arrowOff + 8, cy + 5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + arrowOff - 8, cy - 5); ctx.lineTo(cx + arrowOff, cy); ctx.lineTo(cx + arrowOff - 8, cy + 5); ctx.stroke();
  const av = 28; ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy - av + 8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy + 9); ctx.lineTo(cx, cy + av - 8); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(cx - 5, cy - av + 8); ctx.lineTo(cx, cy - av); ctx.lineTo(cx + 5, cy - av + 8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 5, cy + av - 8); ctx.lineTo(cx, cy + av); ctx.lineTo(cx + 5, cy + av - 8); ctx.stroke();
  ctx.fillStyle = colorWithAlpha(getPlayerColor(), 0.3);
  ctx.font = '700 10px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('DRAG TO MOVE', cx, cy + av + 16); ctx.restore();
}

function drawWaveFlash() { if (shakeIntensity > 0.7) { ctx.fillStyle = colorWithAlpha(gameColor, (shakeIntensity - 0.7) * 0.15); ctx.fillRect(0, 0, W, H); } }
function drawWaveHint() {
  if (waveHintAlpha <= 0) return;
  const progress = 1 - waveHintAlpha, maxR = Math.hypot(W, H) * 0.55;
  ctx.save(); ctx.strokeStyle = gameColor;
  for (let i = 0; i < 2; i++) {
    const t = Math.max(0, progress - i * 0.18);
    ctx.globalAlpha = (1 - t) * waveHintAlpha * 0.45; ctx.lineWidth = 3 - i;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, t * maxR, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore(); waveHintAlpha = Math.max(0, waveHintAlpha - 0.025);
}

// ── 슬로우모 오버레이 ─────────────────────────────────────────────────────────
function drawSlowmoOverlay() {
  if (slowmoActiveT <= 0) return;
  const alpha = Math.min(slowmoActiveT, 1) * 0.06;
  ctx.fillStyle = `rgba(139,92,246,${alpha})`; ctx.fillRect(0, 0, W, H);
  // 테두리 링
  ctx.strokeStyle = `rgba(139,92,246,${alpha * 5})`; ctx.lineWidth = 3;
  ctx.strokeRect(3, 3, W - 6, H - 6);
}

// ── 고스트 오버레이 ───────────────────────────────────────────────────────────
function drawGhostOverlay() {
  if (ghostActiveT <= 0) return;
  const alpha = Math.min(ghostActiveT, 1) * 0.04;
  ctx.fillStyle = `rgba(148,163,184,${alpha})`; ctx.fillRect(0, 0, W, H);
}

// ── Game Loop ─────────────────────────────────────────────────────────────────
let lastT = 0;
function loop(ts: number) {
  const rawDt = Math.min((ts - lastT) / 1000, 0.05);
  lastT = ts;
  ctx.clearRect(0, 0, W, H);

  if (state === S.INTRO) {
    introObsTimer += rawDt;
    if (introObsTimer > 1.1) { introObsTimer = 0; obstacles.push(makeObs(true)); }
    updateObs(rawDt); auto.update(rawDt);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    drawEnvironment(auto.x, auto.y);
    drawObs(); drawDot(auto.x, auto.y, auto.r);
    drawVignette(auto.x, auto.y, rawDt);
  }
  else if (state === S.ZOOM) {
    zoomT += rawDt / ZOOM_DUR;
    updateObs(rawDt); auto.update(rawDt);
    const t = easeOut(Math.min(zoomT, 1)), scale = 1 + t * 14;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    drawEnvironment(auto.x, auto.y);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(scale, scale); ctx.translate(-zoomFX, -zoomFY);
    drawObs(); drawDot(auto.x, auto.y, auto.r); ctx.restore();
    if (t > 0.55) { ctx.fillStyle = `rgba(255,255,255,${(t - 0.55) / 0.45})`; ctx.fillRect(0, 0, W, H); }
    if (zoomT >= 1) startGame();
  }
  else if (state === S.PLAY) {
    // 파워업 타이머 업데이트
    if (slowmoActiveT > 0) slowmoActiveT = Math.max(0, slowmoActiveT - rawDt);
    if (magnetActiveT > 0) magnetActiveT = Math.max(0, magnetActiveT - rawDt);
    if (ghostActiveT  > 0) ghostActiveT  = Math.max(0, ghostActiveT  - rawDt);

    const dt = slowmoActiveT > 0 ? rawDt * 0.45 : rawDt; // slowmo 적용

    tickScore(rawDt); // 점수는 실제 시간 기준
    spawnTick(dt);
    updateObs(dt);
    updateSpecials(dt);
    updatePickups(dt);
    updateFlyingCoins(dt);
    updateShake(dt);
    updatePlayerVisual(rawDt);
    updateParticles(rawDt);
    updateShockRings(rawDt);
    updateTrail(rawDt);
    updateToast(rawDt);
    updateUnlockToast(rawDt);
    updatePowerupHUD();

    player.r = getPlayerR();
    gameTime += dt;
    if (gameTime >= nextWave) { nextWave = gameTime + rand(12, 22); triggerWave(); }

    if (drag) hintAlpha = 0;
    if (invincibleT > 0) invincibleT = Math.max(0, invincibleT - rawDt);

    // 픽업 충돌
    for (let i = pickups.length - 1; i >= 0; i--) {
      if (collidesPickup(player, pickups[i])) {
        collectPickup(pickups[i]); pickups.splice(i, 1);
      }
    }

    // 코인 스테이지 플라잉 코인 충돌
    for (let i = flyingCoins.length - 1; i >= 0; i--) {
      const c = flyingCoins[i];
      if (Math.hypot(player.x - c.x, player.y - c.y) < player.r + c.r + 4) {
        flyingCoins.splice(i, 1);
        sessionCoins++; totalCoins++; saveCoins(totalCoins);
        document.getElementById('sessionCoinVal')!.textContent = String(sessionCoins);
        sparkBurst(c.x, c.y, '#FFB300', 2, 1, 3); // 픽업당 진동 금지 — 시각 팝만
        squashImpulse(0.5);
      }
    }

    // 충돌 판정 (ghost = 무적, ghostActiveT > 0이면 스킵)
    if (invincibleT <= 0 && ghostActiveT <= 0) {
      const hit = obstacles.some(o => collidesObs(player, o)) || specials.some(o => collidesSpecial(player, o));
      if (hit) {
        if (shieldActive) {
          shieldActive = false; invincibleT = 1.0; triggerShake(0.5);
          spawnShockRing(player.x, player.y, player.r + 6, 380, 0.55, '#3182F6');
          squashImpulse(-1.4);
          haptic('error');
        } else {
          explode(player.x, player.y);
          spawnShockRing(player.x, player.y, player.r + 4, 420, 0.6);
          triggerShake(1.0);
          haptic('error');
          state = S.DEAD; deadT = 0;
        }
      }
    }

    // ── Near-miss 감지 + 타이머 ────────────────────────────────────────────────
    nearMissCooldown = Math.max(0, nearMissCooldown - rawDt);
    nearMissFlash    = Math.max(0, nearMissFlash - rawDt * 2.5);
    if (coinComboTimer > 0) { coinComboTimer -= rawDt; if (coinComboTimer <= 0) coinCombo = 0; }
    if (dangerCounter > 0) {
      dangerDecayTimer += rawDt;
      if (dangerDecayTimer > 4.5) { dangerDecayTimer = 0; dangerCounter = Math.max(0, dangerCounter - 1); }
    }
    if (nearMissCooldown <= 0 && invincibleT <= 0 && ghostActiveT <= 0 && state === S.PLAY) {
      const NEAR_DIST = 20;
      let closestGap = Infinity, closestObs: DotObs | null = null;
      for (const o of obstacles) {
        const gap = Math.hypot(player.x - o.x, player.y - o.y) - player.r - o.r;
        if (gap > 0 && gap < NEAR_DIST && gap < closestGap) { closestGap = gap; closestObs = o; }
      }
      if (closestObs) {
        nearMissCooldown = 0.35;
        nearMissFlash    = 1.0;
        dangerCounter    = Math.min(10, dangerCounter + 1);
        dangerDecayTimer = 0;
        // 스칠 때 연출: 접점 쇼크링 + 스파크 + 스쿼시 + 셰이크 미러링 + 햅틱 (같은 프레임)
        const o = closestObs;
        const d = Math.hypot(player.x - o.x, player.y - o.y) || 1;
        const cx2 = o.x + (player.x - o.x) / d * o.r;
        const cy2 = o.y + (player.y - o.y) / d * o.r;
        spawnShockRing(cx2, cy2, 4, 300, 0.45);
        sparkBurst(cx2, cy2, gameColor, 5, 1.5, 4.5);
        squashImpulse(0.9);
        triggerShake(0.12);
        haptic('basicMedium');
        const mult = (1 + dangerCounter * 0.2).toFixed(1);
        toast = { text: dangerCounter >= 3 ? `CLOSE! ×${mult}` : 'CLOSE!', alpha: 1, y: H * 0.42 };
      }
    }

    const ghostAlpha  = ghostActiveT > 0 ? 0.4 : 1;
    const showPlayer  = invincibleT <= 0 || Math.floor(invincibleT * 8) % 2 === 0;

    const pvx = player.x + pvis.ox, pvy = player.y + pvis.oy;

    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(shakeX, shakeY);
    drawEnvironment(pvx, pvy);
    drawTrail();
    drawSpeedTrail(showPlayer ? ghostAlpha : 0);
    drawObs();
    drawSpecials();
    drawParticles();
    drawShockRings();
    drawPickups();
    drawFlyingCoins();
    drawWaveFlash();
    drawWaveHint();
    drawSlowmoOverlay();
    drawGhostOverlay();
    drawToast();
    drawUnlockToast();
    if (showPlayer) {
      // Near-miss 위험 배율 링
      if (dangerCounter > 0) {
        const ringAlpha = Math.min(1, (dangerCounter / 10) * 0.65 + nearMissFlash * 0.35);
        const ringR     = player.r + 5 + dangerCounter * 2;
        ctx.save();
        ctx.globalAlpha    = ringAlpha * ghostAlpha;
        ctx.strokeStyle    = getPlayerColor();
        ctx.lineWidth      = 1.5 + nearMissFlash * 1.5;
        ctx.shadowBlur     = 12; ctx.shadowColor = getPlayerColor();
        ctx.beginPath(); ctx.arc(pvx, pvy, ringR, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      // Ghost: 크로마틱 어버레이션
      if (ghostActiveT > 0) {
        const off = 5 + Math.sin(Date.now() * 0.02) * 2;
        ctx.save();
        ctx.globalAlpha = ghostAlpha * 0.45;
        ctx.fillStyle = '#FF2D78';
        ctx.beginPath(); ctx.arc(pvx - off, pvy, player.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#00F0FF';
        ctx.beginPath(); ctx.arc(pvx + off, pvy, player.r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      drawPlayer(ghostAlpha);
    }
    ctx.restore();
    drawVignette(player.x, player.y, rawDt);
    drawHintArea();
  }
  else if (state === S.DEAD) {
    deadT += rawDt;
    updateObs(rawDt); updateSpecials(rawDt); updateParticles(rawDt); updateShake(rawDt); updateShockRings(rawDt);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    drawEnvironment(player.x, player.y);
    ctx.save(); ctx.translate(shakeX, shakeY);
    drawObs(); drawSpecials(); drawParticles(); drawShockRings();
    ctx.restore();
    drawVignette(player.x, player.y, rawDt);
    if (deadT > 1.8) { state = S.OVER; showGameOver(); }
  }
  else if (state === S.OVER) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); }

  requestAnimationFrame(loop);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
function startZoom() {
  zoomFX = auto.x; zoomFY = auto.y; zoomT = 0;
  state = S.ZOOM;
  document.getElementById('intro')!.classList.add('hidden');
}

let invincibleT = 0, hasContinued = false;

function startGame() {
  obstacles = []; specials = []; pickups = []; particles = []; trailDots = []; posHistory = []; flyingCoins = []; shockRings = [];
  score = 0; scoreF = 0;
  obsTimer = 0; specialTimer = 0; pickupTimer = 0; patternTimer = 0; pickupDue = nextPickupDelay();
  nextSpecialInterval = rand(8, 12);
  coinStageActive = false; coinStageT = 0; nextCoinStageIn = rand(20, 45); coinStageObsTimer = 0;
  hintAlpha = 1; gameTime = 0; nextWave = 15;
  waveGrace = 0; waveHintAlpha = 0; waveCount = 0; shakeIntensity = 0;
  colorIdx = 0; gameColor = COLORS[0]; currentShape = 'circle'; applyColor();
  milestoneIdx = 0; toast = null; unlockToast = null;
  Object.keys(UNLOCKED).forEach(k => UNLOCKED[k] = false);
  invincibleT = 0; hasContinued = false;
  shieldActive = false; slowmoActiveT = 0; magnetActiveT = 0; ghostActiveT = 0;
  sessionCoins = 0;
  dangerCounter = 0; dangerDecayTimer = 0; nearMissCooldown = 0; nearMissFlash = 0;
  coinCombo = 0; coinComboTimer = 0;
  document.getElementById('sessionCoinVal')!.textContent = '0';
  updatePowerupHUD();
  resetPlayer();
  state = S.PLAY;
  scoreEl.style.display = 'block';
  document.getElementById('coinCountHUD')!.style.display = 'flex';
  startHintFade();
  preloadAd();
}

async function showGameOver() {
  document.getElementById('goScore')!.textContent = String(score);
  document.getElementById('goCoins')!.textContent = String(sessionCoins);
  document.getElementById('continueBtn')!.style.display    = hasContinued ? 'none' : '';
  document.getElementById('doubleCoinsBtn')!.style.display = sessionCoins > 0 ? '' : 'none';

  const best = loadBest(), goBestEl = document.getElementById('goBest')!;
  if (score > best) { saveBest(score); goBestEl.textContent = 'NEW BEST!'; goBestEl.className = 'newbest'; }
  else if (best > 0) { goBestEl.textContent = best - score > 0 ? `BEST ${best}s · ${best - score}s 남았어요` : `BEST ${best}s`; goBestEl.className = ''; }
  else { goBestEl.textContent = ''; goBestEl.className = ''; }

  document.getElementById('gameOver')!.classList.add('show');
  try {
    const result = await ait?.submitGameCenterLeaderBoardScore({ score: String(score) });
    if (result && result.statusCode !== 'SUCCESS') console.warn('리더보드 점수 제출 실패:', result.statusCode);
  } catch (e) { console.warn('리더보드 점수 제출 오류:', e); }
}

function resetToIntro() {
  obstacles = []; specials = []; particles = []; trailDots = []; posHistory = []; flyingCoins = []; shockRings = [];
  coinStageActive = false;
  auto.reset(); introObsTimer = 0;
  scoreEl.style.display = 'none';
  document.getElementById('coinCountHUD')!.style.display = 'none';
  state = S.INTRO;
  document.getElementById('intro')!.classList.remove('hidden');
}

// ── 광고 ─────────────────────────────────────────────────────────────────────
let adLoaded = false;

function continueGame() {
  hasContinued = true;
  document.getElementById('gameOver')!.classList.remove('show');
  obstacles = []; specials = []; particles = []; trailDots = []; posHistory = []; shockRings = [];
  obsTimer = 0; specialTimer = 0; waveGrace = 1.5; invincibleT = 2.0; hintAlpha = 0;
  resetPlayer(); state = S.PLAY;
  preloadAitAd(); preloadAd();
}

async function preloadAd() {
  if (!AdMobPlugin) return;
  try { await AdMobPlugin.prepareRewardVideoAd({ adId: ADMOB_REWARD_ID }); adLoaded = true; }
  catch (e) { console.warn('광고 로드 실패:', e); }
}

async function showAitAd(onComplete: () => void) {
  if (ait && aitAdLoaded) {
    aitAdLoaded = false;
    // 이어하기 = 전면 광고 그룹 → userEarnedReward 없음, 닫힘에서 완료
    const settle = adSettler(false, onComplete, () => showAdFallback(onComplete), preloadAitAd);
    ait.showFullScreenAd({
      options: { adGroupId: AIT_AD_GROUP_ID },
      onEvent: (event) => settle(event.type),
      onError: () => settle('error'),
    });
    return;
  }
  if (!AdMobPlugin || !RewardEvents || !adLoaded) { showAdFallback(onComplete); return; }
  adLoaded = false; let rewardEarned = false;
  try {
    const rewarded  = await AdMobPlugin.addListener(RewardEvents.Rewarded,     () => { rewardEarned = true; });
    const dismissed = await AdMobPlugin.addListener(RewardEvents.Dismissed,    () => { if (rewardEarned) onComplete(); preloadAd(); rewarded.remove(); dismissed.remove(); });
    const failed    = await AdMobPlugin.addListener(RewardEvents.FailedToShow, () => { showAdFallback(onComplete); rewarded.remove(); dismissed.remove(); failed.remove(); });
    await AdMobPlugin.showRewardVideoAd();
  } catch (e) { showAdFallback(onComplete); }
}

async function showRewardAd(onComplete: () => void) {
  if (ait && aitRewardAdLoaded) {
    aitRewardAdLoaded = false;
    const settle = adSettler(true, onComplete, () => showAdFallback(onComplete), preloadAitRewardAd);
    ait.showFullScreenAd({
      options: { adGroupId: AIT_REWARD_AD_GROUP_ID },
      onEvent: (event) => settle(event.type),
      onError: () => settle('error'),
    });
    return;
  }
  showAdFallback(onComplete);
}

let adFallbackInterval: ReturnType<typeof setInterval> | null = null;
function showAdFallback(onComplete: () => void) {
  const el = document.getElementById('adScreen')!; el.classList.add('show');
  let cnt = 5; document.getElementById('adCount')!.textContent = String(cnt);
  adFallbackInterval = setInterval(() => {
    cnt--; document.getElementById('adCount')!.textContent = String(cnt);
    if (cnt <= 0) { clearInterval(adFallbackInterval!); el.classList.remove('show'); onComplete(); }
  }, 1000);
}

// ── 버튼 (탭당 햅틱 1개) ──────────────────────────────────────────────────────
document.getElementById('startBtn')!.addEventListener('click', () => { haptic('tap'); startZoom(); });
document.getElementById('continueBtn')!.addEventListener('click', () => { haptic('tap'); showAitAd(continueGame); });
document.getElementById('doubleCoinsBtn')!.addEventListener('click', () => {
  haptic('tap');
  showRewardAd(() => {
    totalCoins += sessionCoins; saveCoins(totalCoins);
    document.getElementById('doubleCoinsBtn')!.style.display = 'none';
    const el = document.querySelector('.go-coins')!;
    (el as HTMLElement).innerHTML = `2배 획득! 🟡 <span id="goCoins">${sessionCoins * 2}</span>`;
    haptic('success');
  });
});
document.getElementById('retryBtn')!.addEventListener('click', () => {
  haptic('tap');
  document.getElementById('gameOver')!.classList.remove('show'); resetToIntro();
});
document.getElementById('leaderboardBtn')!.addEventListener('click', async () => {
  haptic('tap');
  try { await ait?.openGameCenterLeaderboard(); if (!ait) throw new Error(); }
  catch {
    const text = `Dodge Dot에서 ${score}초 버텼어요 🔴 사방에서 날아오는 점을 피할 수 있어?`;
    if (navigator.share) navigator.share({ title: 'Dodge Dot', text }).catch(() => {});
    else navigator.clipboard.writeText(text).then(() => alert('클립보드에 복사됐어요!')).catch(() => alert(text));
  }
});

// ── 튜토리얼 ──────────────────────────────────────────────────────────────────
function showTutorial() {
  const modal = document.getElementById('tutorialModal')!;
  modal.classList.add('show');
}
function hideTutorial() {
  document.getElementById('tutorialModal')!.classList.remove('show');
  localStorage.setItem(KEY_TUTORIAL, '1');
}
document.getElementById('tutorialCloseBtn')!.addEventListener('click', () => { haptic('tap'); hideTutorial(); });
document.getElementById('tutorialBtn')!.addEventListener('click', () => { haptic('tap'); showTutorial(); });
// 최초 1회 자동 표시
if (!localStorage.getItem(KEY_TUTORIAL)) showTutorial();

// ── 종료 확인 ──────────────────────────────────────────────────────────────────
history.pushState({ dodgedot: true }, '');
window.addEventListener('popstate', () => { history.pushState({ dodgedot: true }, ''); document.getElementById('closeConfirm')!.classList.add('show'); });
document.getElementById('closeNo')!.addEventListener('click',  () => { haptic('tap'); document.getElementById('closeConfirm')!.classList.remove('show'); });
document.getElementById('closeYes')!.addEventListener('click', () => {
  haptic('tap');
  document.getElementById('closeConfirm')!.classList.remove('show');
  import('@apps-in-toss/web-framework').then((m: any) => m.closeView?.()).catch(() => history.go(-2));
});

// ── 백그라운드 ────────────────────────────────────────────────────────────────
document.addEventListener('visibilitychange', () => { if (!document.hidden) lastT = 0; });

// ── Canvas 컨텍스트 유실 대응 ─────────────────────────────────────────────────
canvas.addEventListener('contextlost', (e) => e.preventDefault());
canvas.addEventListener('contextrestored', () => { spriteCache.clear(); lastT = 0; });

// ── Init ──────────────────────────────────────────────────────────────────────
applyColor();
auto.reset();
vinX = window.innerWidth / 2; vinY = window.innerHeight / 2;
requestAnimationFrame(loop);
