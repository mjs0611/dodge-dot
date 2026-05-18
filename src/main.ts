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
  grantPromotionRewardForGame: typeof import('@apps-in-toss/web-framework').grantPromotionRewardForGame;
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
    grantPromotionRewardForGame: m.grantPromotionRewardForGame,
  };
  document.getElementById('leaderboardBtn')!.style.display = 'block';
  preloadAitAd();
  preloadAitRewardAd();
  preloadAitRewardPoint();
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

// ── 토스포인트 프로모션 ────────────────────────────────────────────────────────
const AIT_PROMO_CODE      = '01KQAHD4H897QF24PD0XZNKYR8';
const AIT_AD_REWARD_POINT = 'ait.v2.live.d1c6d14bf41e42f8'; // 일일 한도 연장 (보상형)
const HAS_PROMO = AIT_PROMO_CODE.length > 0;
let aitRewardPointLoaded = false;

function preloadAitRewardPoint() {
  if (!ait || !AIT_AD_REWARD_POINT) return;
  aitRewardPointLoaded = false;
  ait.loadFullScreenAd({
    options: { adGroupId: AIT_AD_REWARD_POINT },
    onEvent: () => { aitRewardPointLoaded = true; },
    onError: () => { aitRewardPointLoaded = false; },
  });
}

// Daily Toss Point Limit
interface DailyData { date: string; earned: number; extra: number; }
const KEY_DAILY    = 'dd_daily';
const KEY_TUTORIAL = 'dd_tutorialSeen';

function todayStr(): string { return new Date().toISOString().slice(0, 10); }
function loadDaily(): DailyData {
  try {
    const raw = localStorage.getItem(KEY_DAILY);
    if (raw) {
      const d: DailyData = JSON.parse(raw);
      if (d.date === todayStr()) return d;
    }
  } catch {}
  return { date: todayStr(), earned: 0, extra: 0 };
}
function saveDaily(d: DailyData) { localStorage.setItem(KEY_DAILY, JSON.stringify(d)); }
function dailyLimit(d: DailyData): number { return 5 + d.extra * 5; }
function canEarnToday(d: DailyData): boolean { return d.earned < dailyLimit(d); }

const POINT_PER_RUN_MAX = 3;
let runPointsEarned = 0;

function refreshGoPointsRow() {
  const row = document.getElementById('goPointsRow');
  if (!row) return;
  if (!HAS_PROMO) { row.style.display = 'none'; return; }
  const daily = loadDaily();
  if (daily.earned > 0) {
    row.textContent = `🔵 오늘 받은 토스포인트 ${daily.earned}원`;
    row.style.display = '';
  } else {
    row.style.display = 'none';
  }
}

async function grantTossPoint() {
  if (!HAS_PROMO) return;
  const daily = loadDaily();
  if (!canEarnToday(daily) || runPointsEarned >= POINT_PER_RUN_MAX) return;

  if (!ait?.grantPromotionRewardForGame) return;
  try {
    const result = await ait.grantPromotionRewardForGame({ params: { promotionCode: AIT_PROMO_CODE, amount: 1 } });
    const success = result && typeof result === 'object' && 'key' in result;
    if (success) {
      runPointsEarned++;
      daily.earned++;
      saveDaily(daily);
      ait?.generateHapticFeedback({ type: 'success' }).catch(() => {});
    }
  } catch {}
}

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
        ait?.generateHapticFeedback({ type: 'success' }).catch(() => {});
      } else if (totalCoins >= skin.price) {
        totalCoins -= skin.price; saveCoins(totalCoins);
        ownedSkins.push(skin.id); saveOwnedSkins(ownedSkins);
        equippedIdx = idx; saveEquippedSkin(idx); updateShopUI();
        ait?.generateHapticFeedback({ type: 'success' }).catch(() => {});
      } else {
        ait?.generateHapticFeedback({ type: 'error' }).catch(() => {});
        div.style.transform = 'translateX(-4px)';
        setTimeout(() => div.style.transform = 'translateX(4px)', 50);
        setTimeout(() => div.style.transform = '', 100);
      }
    });
    grid.appendChild(div);
  });
}

function openShop()  { updateShopUI(); document.getElementById('shopOverlay')!.classList.add('show'); }
function closeShop() { document.getElementById('shopOverlay')!.classList.remove('show'); }
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
type PickupType = 'coin' | 'shield' | 'slowmo' | 'magnet' | 'ghost' | 'tosspoint';
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
  const daily    = loadDaily();
  const canPoint = HAS_PROMO && canEarnToday(daily) && runPointsEarned < POINT_PER_RUN_MAX;
  const roll     = Math.random();
  let k: PickupType;

  if (canPoint) {
    // tosspoint 10% 확률로 등장
    if      (roll < 0.50) k = 'coin';
    else if (roll < 0.63) k = 'slowmo';
    else if (roll < 0.75) k = 'magnet';
    else if (roll < 0.85) k = 'shield';
    else if (roll < 0.90) k = 'ghost';
    else                  k = 'tosspoint';
  } else {
    if      (roll < 0.60) k = 'coin';
    else if (roll < 0.73) k = 'slowmo';
    else if (roll < 0.85) k = 'magnet';
    else if (roll < 0.95) k = 'shield';
    else                  k = 'ghost';
  }

  pickups.push({
    k,
    x: rand(55, W - 55),
    y: rand(70, H - 70),
    r: 16,
    life: k === 'coin' ? 8.0 : k === 'tosspoint' ? 9.0 : 6.5,
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
  ctx.fillStyle = gameColor;
  for (const o of obstacles) {
    ctx.beginPath();
    switch (o.shape) {
      case 'circle':   ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); break;
      case 'square':   { const s = o.r * 1.5; ctx.rect(o.x - s, o.y - s, s * 2, s * 2); break; }
      case 'triangle': {
        const h = o.r * 1.6;
        ctx.moveTo(o.x, o.y - h); ctx.lineTo(o.x + h * 0.866, o.y + h * 0.5); ctx.lineTo(o.x - h * 0.866, o.y + h * 0.5); ctx.closePath(); break;
      }
      case 'diamond': {
        const d = o.r * 1.5;
        ctx.moveTo(o.x, o.y - d); ctx.lineTo(o.x + d, o.y); ctx.lineTo(o.x, o.y + d); ctx.lineTo(o.x - d, o.y); ctx.closePath(); break;
      }
    }
    ctx.fill();
  }
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
        if (o.life <= 0 && !o.exploded) { o.exploded = true; o.blastR = 0; triggerShake(0.6); ait?.generateHapticFeedback({ type: 'error' }).catch(() => {}); }
      }
      if (o.exploded && o.blastR !== undefined) o.blastR += dt * 320;
    }
  }
  specials = specials.filter(o => {
    if (o.k === 'mine' && o.exploded) return (o.blastR ?? 0) < Math.hypot(W, H);
    return o.x > -300 && o.x < W + 300 && o.y > -300 && o.y < H + 300;
  });
}

function drawSpecials() {
  for (const o of specials) {
    ctx.save();
    ctx.translate(o.x, o.y); ctx.rotate(o.rot);
    if (o.k === 'homing') {
      ctx.beginPath(); ctx.arc(0, 0, o.r, 0, Math.PI * 2);
      ctx.fillStyle = gameColor; ctx.fill();
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
      ctx.closePath(); ctx.fillStyle = gameColor; ctx.fill();
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
type ImagedPickup = Exclude<PickupType, 'tosspoint'>;
const PICKUP_IMGS: Record<ImagedPickup, HTMLImageElement> = {
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
    ctx.save();
    ctx.globalAlpha = alpha;

    if (p.k === 'tosspoint') {
      // 파란 원 + ₩ 텍스트로 직접 렌더
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = '#3182F6'; ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `900 ${Math.floor(r * 1.05)}px "Space Grotesk", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('₩', p.x, p.y + 1);
      ctx.textAlign = 'left';
    } else {
      const img = PICKUP_IMGS[p.k as ImagedPickup];
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, p.x - r, p.y - r, r * 2, r * 2);
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#FFB300'; ctx.fill();
      }
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
  if (p.k === 'coin') {
    coinCombo++;
    coinComboTimer = 3.0;
    const bonus  = coinCombo >= 5 ? 2 : coinCombo >= 3 ? 1 : 0;
    const earned = 1 + bonus;
    sessionCoins += earned; totalCoins += earned; saveCoins(totalCoins);
    document.getElementById('sessionCoinVal')!.textContent = String(sessionCoins);
    ait?.generateHapticFeedback({ type: 'success' }).catch(() => {});
    if (coinCombo >= 3) toast = { text: `🟡 COMBO ×${coinCombo}${bonus > 0 ? ` +${bonus}!` : '!'}`, alpha: 1, y: H * 0.42 };
  } else if (p.k === 'shield') {
    shieldActive = true;
    ait?.generateHapticFeedback({ type: 'success' }).catch(() => {});
  } else if (p.k === 'slowmo') {
    slowmoActiveT = SLOWMO_DUR;
    ait?.generateHapticFeedback({ type: 'success' }).catch(() => {});
  } else if (p.k === 'magnet') {
    magnetActiveT = MAGNET_DUR;
    ait?.generateHapticFeedback({ type: 'success' }).catch(() => {});
  } else if (p.k === 'ghost') {
    ghostActiveT = GHOST_DUR;
    ait?.generateHapticFeedback({ type: 'success' }).catch(() => {});
  } else if (p.k === 'tosspoint') {
    unlockToast = { text: '🔵 토스포인트 +1원!', alpha: 1 };
    ait?.generateHapticFeedback({ type: 'confetti' }).catch(() => {});
    grantTossPoint();
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

function triggerShake(intensity: number) { shakeIntensity = Math.max(shakeIntensity, intensity); }

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
  ait?.generateHapticFeedback({ type: 'basicMedium' }).catch(() => {});
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

function getPlayerR(): number {
  if (score < 20)  return 6;  if (score < 50)  return 8;
  if (score < 90)  return 10; if (score < 140) return 12;
  return 14;
}
function resetPlayer() { player.x = W * 0.5; player.y = H * 0.5; player.r = 6; }

// ── Trail ─────────────────────────────────────────────────────────────────────
type TrailDot = { x: number; y: number; r: number; life: number; color: string };
let trailDots: TrailDot[] = [];
let posHistory: { x: number; y: number }[] = [];
const POS_HISTORY_MAX = 30;

function updateTrail(dt: number) {
  const style = getTrailStyle();
  const pc    = getPlayerColor();
  if (style === 'comet') {
    trailDots.push({ x: player.x, y: player.y, r: player.r * 0.85, life: 1, color: pc });
  } else if (style === 'shadow') {
    posHistory.push({ x: player.x, y: player.y });
    if (posHistory.length > POS_HISTORY_MAX) posHistory.shift();
  }
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

// ── Particles ─────────────────────────────────────────────────────────────────
type Particle = { x: number; y: number; vx: number; vy: number; r: number; life: number; decay: number };
let particles: Particle[] = [];

function explode(x: number, y: number) {
  for (let i = 0; i < 32; i++) {
    const a = Math.random() * Math.PI * 2, spd = rand(1, 7);
    particles.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: rand(1, 3), life: 1, decay: rand(0.012, 0.025) });
  }
}
function updateParticles(dt: number) {
  const s = dt * 60;
  for (const p of particles) { p.x += p.vx * s; p.y += p.vy * s; p.vy += 0.18 * s; p.vx *= Math.pow(0.96, s); p.vy *= Math.pow(0.96, s); p.life -= p.decay * s; }
  particles = particles.filter(p => p.life > 0);
}
function drawParticles() {
  ctx.fillStyle = gameColor;
  for (const p of particles) { ctx.globalAlpha = p.life * p.life; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;
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
    if (prev < MILESTONES[milestoneIdx]) { toast = { text: MILESTONES[milestoneIdx] + 's !', alpha: 1, y: H * 0.38 }; ait?.generateHapticFeedback({ type: 'confetti' }).catch(() => {}); }
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
  ait?.generateHapticFeedback({ type: 'confetti' }).catch(() => {});
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
    if (pickupTimer >= rand(5, 10)) { pickupTimer = 0; spawnPickup(); }
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
      ait?.generateHapticFeedback({ type: 'basicMedium' }).catch(() => {});
    }
  }
  pickupTimer += dt;
  if (pickupTimer >= rand(5, 10)) { pickupTimer = 0; spawnPickup(); }
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
  ctx.fillStyle = color ?? gameColor;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
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
    drawObs(); drawDot(auto.x, auto.y, auto.r);
  }
  else if (state === S.ZOOM) {
    zoomT += rawDt / ZOOM_DUR;
    updateObs(rawDt); auto.update(rawDt);
    const t = easeOut(Math.min(zoomT, 1)), scale = 1 + t * 14;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
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
        ait?.generateHapticFeedback({ type: 'success' }).catch(() => {});
      }
    }

    // 충돌 판정 (ghost = 무적, ghostActiveT > 0이면 스킵)
    if (invincibleT <= 0 && ghostActiveT <= 0) {
      const hit = obstacles.some(o => collidesObs(player, o)) || specials.some(o => collidesSpecial(player, o));
      if (hit) {
        if (shieldActive) {
          shieldActive = false; invincibleT = 1.0; triggerShake(0.5);
          ait?.generateHapticFeedback({ type: 'error' }).catch(() => {});
        } else {
          explode(player.x, player.y);
          ait?.generateHapticFeedback({ type: 'error' }).catch(() => {});
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
      let closestGap = Infinity;
      for (const o of obstacles) {
        const gap = Math.hypot(player.x - o.x, player.y - o.y) - player.r - o.r;
        if (gap > 0 && gap < NEAR_DIST) closestGap = Math.min(closestGap, gap);
      }
      if (closestGap < NEAR_DIST) {
        nearMissCooldown = 0.35;
        nearMissFlash    = 1.0;
        dangerCounter    = Math.min(10, dangerCounter + 1);
        dangerDecayTimer = 0;
        ait?.generateHapticFeedback({ type: 'basicMedium' }).catch(() => {});
        const mult = (1 + dangerCounter * 0.2).toFixed(1);
        toast = { text: dangerCounter >= 3 ? `CLOSE! ×${mult}` : 'CLOSE!', alpha: 1, y: H * 0.42 };
      }
    }

    const ghostAlpha  = ghostActiveT > 0 ? 0.4 : 1;
    const showPlayer  = invincibleT <= 0 || Math.floor(invincibleT * 8) % 2 === 0;

    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(shakeX, shakeY);
    drawTrail();
    drawObs();
    drawSpecials();
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
        ctx.beginPath(); ctx.arc(player.x, player.y, ringR, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      // Ghost: 크로마틱 어버레이션
      if (ghostActiveT > 0) {
        const off = 5 + Math.sin(Date.now() * 0.02) * 2;
        ctx.save();
        ctx.globalAlpha = ghostAlpha * 0.45;
        ctx.fillStyle = '#FF2D78';
        ctx.beginPath(); ctx.arc(player.x - off, player.y, player.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#00F0FF';
        ctx.beginPath(); ctx.arc(player.x + off, player.y, player.r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = ghostAlpha;
      drawDot(player.x, player.y, player.r, getPlayerColor());
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    drawHintArea();
  }
  else if (state === S.DEAD) {
    deadT += rawDt;
    updateObs(rawDt); updateSpecials(rawDt); updateParticles(rawDt);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    drawObs(); drawSpecials(); drawParticles();
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
  obstacles = []; specials = []; pickups = []; particles = []; trailDots = []; posHistory = []; flyingCoins = [];
  score = 0; scoreF = 0;
  obsTimer = 0; specialTimer = 0; pickupTimer = 0; patternTimer = 0;
  nextSpecialInterval = rand(8, 12);
  coinStageActive = false; coinStageT = 0; nextCoinStageIn = rand(20, 45); coinStageObsTimer = 0;
  hintAlpha = 1; gameTime = 0; nextWave = 15;
  waveGrace = 0; waveHintAlpha = 0; waveCount = 0; shakeIntensity = 0;
  colorIdx = 0; gameColor = COLORS[0]; currentShape = 'circle'; applyColor();
  milestoneIdx = 0; toast = null; unlockToast = null;
  Object.keys(UNLOCKED).forEach(k => UNLOCKED[k] = false);
  invincibleT = 0; hasContinued = false;
  shieldActive = false; slowmoActiveT = 0; magnetActiveT = 0; ghostActiveT = 0;
  sessionCoins = 0; runPointsEarned = 0;
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

  // 토스포인트 현황 표시
  refreshGoPointsRow();
  const extraPointBtn = document.getElementById('extraPointBtn')!;
  if (HAS_PROMO && AIT_AD_REWARD_POINT) {
    const daily = loadDaily();
    extraPointBtn.style.display = !canEarnToday(daily) ? '' : 'none';
  } else {
    extraPointBtn.style.display = 'none';
  }

  document.getElementById('gameOver')!.classList.add('show');
  try {
    const result = await ait?.submitGameCenterLeaderBoardScore({ score: String(score) });
    if (result && result.statusCode !== 'SUCCESS') console.warn('리더보드 점수 제출 실패:', result.statusCode);
  } catch (e) { console.warn('리더보드 점수 제출 오류:', e); }
}

function resetToIntro() {
  obstacles = []; specials = []; particles = []; trailDots = []; posHistory = []; flyingCoins = [];
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
  obstacles = []; specials = []; particles = []; trailDots = []; posHistory = [];
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
    aitAdLoaded = false; let rewardEarned = false;
    ait.showFullScreenAd({
      options: { adGroupId: AIT_AD_GROUP_ID },
      onEvent: (event) => {
        if      (event.type === 'userEarnedReward') rewardEarned = true;
        else if (event.type === 'dismissed')        { if (rewardEarned) onComplete(); preloadAitAd(); }
        else if (event.type === 'failedToShow')     showAdFallback(onComplete);
      },
      onError: () => showAdFallback(onComplete),
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
    ait.showFullScreenAd({
      options: { adGroupId: AIT_REWARD_AD_GROUP_ID },
      onEvent: (event) => {
        if      (event.type === 'dismissed')    { onComplete(); preloadAitRewardAd(); }
        else if (event.type === 'failedToShow') showAdFallback(onComplete);
      },
      onError: () => showAdFallback(onComplete),
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

// ── 버튼 ─────────────────────────────────────────────────────────────────────
document.getElementById('startBtn')!.addEventListener('click', startZoom);
document.getElementById('continueBtn')!.addEventListener('click', () => { showAitAd(continueGame); });
document.getElementById('doubleCoinsBtn')!.addEventListener('click', () => {
  showRewardAd(() => {
    totalCoins += sessionCoins; saveCoins(totalCoins);
    document.getElementById('doubleCoinsBtn')!.style.display = 'none';
    const el = document.querySelector('.go-coins')!;
    (el as HTMLElement).innerHTML = `2배 획득! 🟡 <span id="goCoins">${sessionCoins * 2}</span>`;
    ait?.generateHapticFeedback({ type: 'success' }).catch(() => {});
  });
});
document.getElementById('retryBtn')!.addEventListener('click', () => {
  document.getElementById('gameOver')!.classList.remove('show'); resetToIntro();
});
document.getElementById('leaderboardBtn')!.addEventListener('click', async () => {
  try { await ait?.openGameCenterLeaderboard(); if (!ait) throw new Error(); }
  catch {
    const text = `Dodge Dot에서 ${score}초 버텼어요 🔴 사방에서 날아오는 점을 피할 수 있어?`;
    if (navigator.share) navigator.share({ title: 'Dodge Dot', text }).catch(() => {});
    else navigator.clipboard.writeText(text).then(() => alert('클립보드에 복사됐어요!')).catch(() => alert(text));
  }
});

// 포인트 한도 연장 (리워드 광고)
document.getElementById('extraPointBtn')!.addEventListener('click', () => {
  if (!ait || !AIT_AD_REWARD_POINT || !aitRewardPointLoaded) return;
  aitRewardPointLoaded = false;
  (document.getElementById('extraPointBtn') as HTMLButtonElement).disabled = true;
  ait.showFullScreenAd({
    options: { adGroupId: AIT_AD_REWARD_POINT },
    onEvent: (event) => {
      if (event.type === 'dismissed') {
        const daily = loadDaily();
        daily.extra++;
        saveDaily(daily);
        refreshGoPointsRow();
        document.getElementById('extraPointBtn')!.style.display = 'none';
        preloadAitRewardPoint();
      } else if (event.type === 'failedToShow') {
        (document.getElementById('extraPointBtn') as HTMLButtonElement).disabled = false;
        preloadAitRewardPoint();
      }
    },
    onError: () => {
      (document.getElementById('extraPointBtn') as HTMLButtonElement).disabled = false;
      preloadAitRewardPoint();
    },
  });
});

// ── 튜토리얼 ──────────────────────────────────────────────────────────────────
function showTutorial() {
  const modal = document.getElementById('tutorialModal')!;
  // HAS_PROMO 아닐 때 포인트 섹션 숨김
  const pointSec = document.getElementById('tutPointSection');
  if (pointSec) pointSec.style.display = HAS_PROMO ? '' : 'none';
  modal.classList.add('show');
}
function hideTutorial() {
  document.getElementById('tutorialModal')!.classList.remove('show');
  localStorage.setItem(KEY_TUTORIAL, '1');
}
document.getElementById('tutorialCloseBtn')!.addEventListener('click', hideTutorial);
document.getElementById('tutorialBtn')!.addEventListener('click', showTutorial);
// 최초 1회 자동 표시
if (!localStorage.getItem(KEY_TUTORIAL)) showTutorial();

// ── 종료 확인 ──────────────────────────────────────────────────────────────────
history.pushState({ dodgedot: true }, '');
window.addEventListener('popstate', () => { history.pushState({ dodgedot: true }, ''); document.getElementById('closeConfirm')!.classList.add('show'); });
document.getElementById('closeNo')!.addEventListener('click',  () => { document.getElementById('closeConfirm')!.classList.remove('show'); });
document.getElementById('closeYes')!.addEventListener('click', () => {
  document.getElementById('closeConfirm')!.classList.remove('show');
  import('@apps-in-toss/web-framework').then((m: any) => m.closeView?.()).catch(() => history.go(-2));
});

// ── 백그라운드 ────────────────────────────────────────────────────────────────
document.addEventListener('visibilitychange', () => { if (!document.hidden) lastT = 0; });

// ── Init ──────────────────────────────────────────────────────────────────────
applyColor();
auto.reset();
requestAnimationFrame(loop);
