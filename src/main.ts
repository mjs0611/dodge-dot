// ── AIT (리더보드 + 전면광고, 토스 앱 환경에서만 동작) ──────────────────────────────
const AIT_AD_GROUP_ID = 'ait.v2.live.PLACEHOLDER_DODGE_DOT';
// TODO: 앱인토스 콘솔에서 dodge-dot 앱 등록 후 실제 ID로 교체

type AitModule = {
  submitGameCenterLeaderBoardScore: typeof import('@apps-in-toss/web-framework').submitGameCenterLeaderBoardScore;
  openGameCenterLeaderboard: typeof import('@apps-in-toss/web-framework').openGameCenterLeaderboard;
  loadFullScreenAd: typeof import('@apps-in-toss/web-framework').loadFullScreenAd;
  showFullScreenAd: typeof import('@apps-in-toss/web-framework').showFullScreenAd;
  generateHapticFeedback: typeof import('@apps-in-toss/web-framework').generateHapticFeedback;
  getUserKeyForGame: typeof import('@apps-in-toss/web-framework').getUserKeyForGame;
};
let ait: AitModule | null = null;
let aitAdLoaded = false;

// ── 유저 식별자 ───────────────────────────────────────────────────────────────
let userHash: string | null = localStorage.getItem('userHash');

function getRetriesKey()     { return `freeRetries_${userHash ?? 'guest'}`; }
function getRetriesDateKey() { return `freeRetriesDate_${userHash ?? 'guest'}`; }

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
  m.getUserKeyForGame().then((result) => {
    if (result && result !== 'INVALID_CATEGORY' && result !== 'ERROR' && result.type === 'HASH') {
      userHash = result.hash;
      localStorage.setItem('userHash', result.hash);
      freeRetries = loadFreeRetries();
      updateRetryBtn();
    }
  }).catch(() => {});
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

// ── AdMob ────────────────────────────────────────────────────────────────────
const ADMOB_INTERSTITIAL_ID = 'ca-app-pub-PLACEHOLDER/PLACEHOLDER';
// TODO: 원스토어 빌드 후 AdMob 앱 등록하고 ID 교체
type AdMobType = typeof import('@capacitor-community/admob').AdMob;
type InterstitialEventsType = typeof import('@capacitor-community/admob').InterstitialAdPluginEvents;
let AdMobPlugin: AdMobType | null = null;
let InterstitialEvents: InterstitialEventsType | null = null;
import('@capacitor-community/admob').then((m) => {
  AdMobPlugin = m.AdMob;
  InterstitialEvents = m.InterstitialAdPluginEvents;
  AdMobPlugin.initialize({}).then(() => preloadAd()).catch(() => {});
}).catch(() => {});

// ── Color ─────────────────────────────────────────────────────────────────────
const COLORS = ['#000000', '#FF2D78', '#00F0FF', '#39FF14', '#FFE600', '#BF00FF', '#FF6B00'];
let colorIdx = 0;
let gameColor = COLORS[0];

function colorWithAlpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}
function fgAlpha(a: number) { return colorWithAlpha(gameColor, a); }
function bgAlpha(a: number) { return `rgba(255,255,255,${a})`; }

function applyColor() {
  document.documentElement.style.setProperty('--game-color', gameColor);
}

// ── Canvas ────────────────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx    = canvas.getContext('2d')!;
let W: number, H: number;

function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
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

// ── Obstacles (dot only, 4방향 랜덤) ─────────────────────────────────────────
type DotObs = { x: number; y: number; r: number; vx: number; vy: number };
let obstacles: DotObs[] = [];

function makeObs(fullH: boolean): DotObs {
  const pad  = 35;
  const diff = fullH ? 0 : Math.min(score / 20, 4);
  const earlyEase = score < 10 ? 0.8 : 1.0;
  const graceMult = 1 - waveGrace * 0.35; // wave 직후 최대 35% 속도 감소
  const baseSpd = rand(
    (3.5 + diff * 2.0) * earlyEase * graceMult,
    (6.0 + diff * 2.0) * earlyEase * graceMult,
  );

  // 크기 티어: 작은 dot은 빠르게, 큰 dot은 느리게
  const roll = Math.random();
  let r: number, spdMult: number;
  if      (roll < 0.35) { r = rand(4, 8);   spdMult = 1.25; }
  else if (roll < 0.70) { r = rand(9, 16);  spdMult = 1.0;  }
  else if (roll < 0.90) { r = rand(17, 26); spdMult = 0.78; }
  else                  { r = rand(27, 40); spdMult = 0.55; }
  const spd = baseSpd * spdMult;

  // 드리프트(수직방향 속도 비율): 난이도에 따라 증가 → 대각선 탄환 등장
  const drift = Math.min(0.7, 0.1 + diff * 0.15);

  if (fullH) {
    // 인트로 데모: 좌우에서만 수평 직선
    const y = rand(pad, H - pad);
    if (Math.random() < 0.5) return { x: -r - 10, y, r, vx:  spd, vy: 0 };
    else                     return { x: W + r + 10, y, r, vx: -spd, vy: 0 };
  }

  // 플레이 중: 4방향 랜덤
  const side = Math.floor(Math.random() * 4);

  // aimed dot: diff > 2에서 18% 확률로 플레이어 방향 조준
  const aimed = diff > 2 && Math.random() < 0.18;

  let x = 0, y = 0, vx = 0, vy = 0;
  if (side === 0) {
    // 왼쪽 → 오른쪽
    x = -r - 10; y = rand(pad, H - pad);
    if (aimed) { const a = Math.atan2(player.y - y, player.x - x); vx = Math.cos(a) * spd; vy = Math.sin(a) * spd; }
    else       { vx = spd; vy = rand(-drift, drift) * spd; }
  } else if (side === 1) {
    // 오른쪽 → 왼쪽
    x = W + r + 10; y = rand(pad, H - pad);
    if (aimed) { const a = Math.atan2(player.y - y, player.x - x); vx = Math.cos(a) * spd; vy = Math.sin(a) * spd; }
    else       { vx = -spd; vy = rand(-drift, drift) * spd; }
  } else if (side === 2) {
    // 위 → 아래
    x = rand(pad, W - pad); y = -r - 10;
    if (aimed) { const a = Math.atan2(player.y - y, player.x - x); vx = Math.cos(a) * spd; vy = Math.sin(a) * spd; }
    else       { vx = rand(-drift, drift) * spd; vy = spd; }
  } else {
    // 아래 → 위
    x = rand(pad, W - pad); y = H + r + 10;
    if (aimed) { const a = Math.atan2(player.y - y, player.x - x); vx = Math.cos(a) * spd; vy = Math.sin(a) * spd; }
    else       { vx = rand(-drift, drift) * spd; vy = -spd; }
  }
  return { x, y, r, vx, vy };
}

function updateObs() {
  for (const o of obstacles) { o.x += o.vx; o.y += o.vy; }
  obstacles = obstacles.filter(o =>
    o.x > -200 && o.x < W + 200 && o.y > -200 && o.y < H + 200,
  );
}

function drawObs() {
  ctx.fillStyle = gameColor;
  for (const o of obstacles) {
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
  }
}

function collidesObs(dot: { x: number; y: number; r: number }, o: DotObs): boolean {
  return Math.hypot(dot.x - o.x, dot.y - o.y) < dot.r + o.r;
}

// ── Screen Shake + Wave ───────────────────────────────────────────────────────
let shakeIntensity = 0;
let shakeX = 0, shakeY = 0;
let gameTime  = 0;
let nextWave  = 15; // 첫 웨이브까지 15초
let waveGrace = 0;  // 웨이브 직후 난이도 완화 (1→0으로 감소)
let waveHintAlpha = 0;

function updateShake(dt: number) {
  if (shakeIntensity > 0) {
    shakeIntensity = Math.max(0, shakeIntensity - dt * 1.2);
    const mag = shakeIntensity * 28;
    shakeX = (Math.random() - 0.5) * mag;
    shakeY = (Math.random() - 0.5) * mag;
  } else {
    shakeX = 0; shakeY = 0;
  }
}

function triggerWave() {
  shakeIntensity = 1;
  obstacles = []; // 기존 장애물 클리어
  waveGrace = 1.0; // 3초 난이도 완화 시작
  waveHintAlpha = 1;
  // 색상 전환
  colorIdx = (colorIdx + 1) % COLORS.length;
  gameColor = COLORS[colorIdx];
  applyColor();
  ait?.generateHapticFeedback({ type: 'wiggle' });
  const pulseEl = document.getElementById('dirPulse')!;
  pulseEl.classList.remove('pulse');
  void (pulseEl as HTMLElement).offsetWidth; // reflow
  pulseEl.classList.add('pulse');
}

// ── Auto-pilot ────────────────────────────────────────────────────────────────
const auto = {
  x: 0, y: 0, r: 6, vx: 0, vy: 0,
  reset() { this.x = W * 0.5; this.y = H * 0.5; this.vx = 0; this.vy = 0; },
  update() {
    let fx = 0, fy = 0;
    const sense = 160;
    for (const o of obstacles) {
      const ddx = this.x - o.x, ddy = this.y - o.y;
      const d = Math.hypot(ddx, ddy);
      if (d < sense && d > 0) {
        const f = Math.pow((sense - d) / sense, 2) * 10;
        fx += (ddx / d) * f; fy += (ddy / d) * f;
      }
    }
    fx += (W * 0.5 - this.x) * 0.004;
    fy += (H * 0.5 - this.y) * 0.004;
    const bp = 70;
    if (this.x < bp)     fx += (bp - this.x) * 0.1;
    if (this.x > W - bp) fx -= (this.x - (W - bp)) * 0.1;
    if (this.y < bp)     fy += (bp - this.y) * 0.1;
    if (this.y > H - bp) fy -= (this.y - (H - bp)) * 0.1;
    this.vx = (this.vx + fx) * 0.82;
    this.vy = (this.vy + fy) * 0.82;
    const spd = Math.hypot(this.vx, this.vy);
    if (spd > 5) { this.vx = this.vx / spd * 5; this.vy = this.vy / spd * 5; }
    this.x += this.vx; this.y += this.vy;
  },
};

// ── Player ────────────────────────────────────────────────────────────────────
const player = { x: 0, y: 0, r: 6 };

function getPlayerR(): number {
  if (score < 20)  return 6;
  if (score < 50)  return 8;
  if (score < 90)  return 10;
  if (score < 140) return 12;
  return 14;
}

function resetPlayer() { player.x = W * 0.5; player.y = H * 0.5; player.r = 6; }

// ── Particles ─────────────────────────────────────────────────────────────────
type Particle = { x: number; y: number; vx: number; vy: number; r: number; life: number; decay: number };
let particles: Particle[] = [];

function explode(x: number, y: number) {
  for (let i = 0; i < 32; i++) {
    const a = Math.random() * Math.PI * 2, spd = rand(1, 7);
    particles.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: rand(1, 3), life: 1, decay: rand(0.012, 0.025) });
  }
}
function updateParticles() {
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.18; p.vx *= 0.96; p.vy *= 0.96;
    p.life -= p.decay;
  }
  particles = particles.filter(p => p.life > 0);
}
function drawParticles() {
  ctx.fillStyle = gameColor;
  for (const p of particles) {
    ctx.globalAlpha = p.life * p.life;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ── Score (생존 시간, 초) ──────────────────────────────────────────────────────
let score = 0, scoreF = 0;
const scoreEl = document.getElementById('score')!;
function tickScore(dt: number) {
  scoreF += dt;
  score = Math.floor(scoreF);
  scoreEl.textContent = score + 's';
}

// ── Obstacle Spawner ──────────────────────────────────────────────────────────
let obsTimer = 0, introObsTimer = 0;
function spawnTick(dt: number) {
  if (waveGrace > 0) waveGrace = Math.max(0, waveGrace - dt / 3);
  const diff = Math.min(score / 20, 4);
  const baseInterval = score < 10
    ? Math.max(0.25, 1.2 - diff * 0.42)
    : Math.max(0.14, 1.0 - diff * 0.42);
  const interval = baseInterval * (1 + waveGrace * 0.8); // wave 직후 최대 80% 간격 증가
  obsTimer += dt;
  if (obsTimer >= interval) {
    obsTimer = 0;
    obstacles.push(makeObs(false));
    if (diff > 0.5 && Math.random() < 0.5) obstacles.push(makeObs(false));
    if (diff > 1.5 && Math.random() < 0.4) obstacles.push(makeObs(false));
  }
}

// ── Controls ─────────────────────────────────────────────────────────────────
let drag = false, dragX = 0, dragY = 0;

function onDown(cx: number, cy: number) {
  if (state !== S.PLAY) return;
  drag = true; dragX = cx; dragY = cy;
  hintAlpha = 0;
}
function onMove(cx: number, cy: number) {
  if (!drag || state !== S.PLAY) return;
  player.x = clamp(player.x + (cx - dragX), player.r, W - player.r);
  player.y = clamp(player.y + (cy - dragY), player.r, H - player.r);
  dragX = cx; dragY = cy;
  hintAlpha = 0;
}
function onUp() { drag = false; }

canvas.addEventListener('touchstart', e => { e.preventDefault(); const t = e.touches[0]; onDown(t.clientX, t.clientY); }, { passive: false });
canvas.addEventListener('touchmove',  e => { e.preventDefault(); const t = e.touches[0]; onMove(t.clientX, t.clientY); }, { passive: false });
canvas.addEventListener('touchend',   e => { e.preventDefault(); onUp(); }, { passive: false });
canvas.addEventListener('mousedown',  e => onDown(e.clientX, e.clientY));
canvas.addEventListener('mousemove',  e => onMove(e.clientX, e.clientY));
window.addEventListener('mouseup',    onUp);

// ── Hint ─────────────────────────────────────────────────────────────────────
let hintAlpha = 1;
function startHintFade() { setTimeout(() => { hintAlpha = 0; }, 3000); }

// ── Zoom ──────────────────────────────────────────────────────────────────────
let zoomT = 0;
const ZOOM_DUR = 0.85;
let zoomFX = 0, zoomFY = 0;
let deadT = 0;

// ── Draw Helpers ──────────────────────────────────────────────────────────────
function drawDot(x: number, y: number, r: number) {
  ctx.fillStyle = gameColor;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

// 게임 시작 직후 드래그 안내 (In Line의 drawControlArea 힌트와 동일 구조)
function drawHintArea() {
  if (hintAlpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = hintAlpha;
  const cx = W / 2, cy = H / 2;

  // 중앙 플레이어 점
  ctx.fillStyle = gameColor;
  ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();

  // 좌우 화살표 + 점선
  const arrowOff = 36;
  ctx.strokeStyle = fgAlpha(0.35);
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(cx - 9, cy); ctx.lineTo(cx - arrowOff + 8, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 9, cy); ctx.lineTo(cx + arrowOff - 8, cy); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(cx - arrowOff + 8, cy - 5); ctx.lineTo(cx - arrowOff, cy); ctx.lineTo(cx - arrowOff + 8, cy + 5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + arrowOff - 8, cy - 5); ctx.lineTo(cx + arrowOff, cy); ctx.lineTo(cx + arrowOff - 8, cy + 5); ctx.stroke();

  // 상하 화살표
  const arrowOffV = 28;
  ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy - arrowOffV + 8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy + 9); ctx.lineTo(cx, cy + arrowOffV - 8); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(cx - 5, cy - arrowOffV + 8); ctx.lineTo(cx, cy - arrowOffV); ctx.lineTo(cx + 5, cy - arrowOffV + 8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 5, cy + arrowOffV - 8); ctx.lineTo(cx, cy + arrowOffV); ctx.lineTo(cx + 5, cy + arrowOffV - 8); ctx.stroke();

  ctx.fillStyle = fgAlpha(0.3);
  ctx.font = '700 10px "Space Grotesk", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('DRAG TO MOVE', cx, cy + arrowOffV + 16);
  ctx.restore();
}

// 웨이브 전환 시 화면 플래시 표시
function drawWaveFlash() {
  if (shakeIntensity > 0.5) {
    ctx.fillStyle = fgAlpha((shakeIntensity - 0.5) * 0.12);
    ctx.fillRect(0, 0, W, H);
  }
}

// 웨이브 전환 힌트 (× 기호 페이드아웃 — In Line의 방향 화살표와 동일 구조)
function drawWaveHint() {
  if (waveHintAlpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = waveHintAlpha * 0.28;
  ctx.fillStyle = gameColor;
  const sz = Math.min(W, H) * 0.38;
  ctx.font = `900 ${sz}px "Space Grotesk", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('\u00d7', W / 2, H / 2); // ×
  ctx.restore();
  waveHintAlpha = Math.max(0, waveHintAlpha - 0.03);
}

// ── Game Loop ─────────────────────────────────────────────────────────────────
let lastT = 0;
function loop(ts: number) {
  const dt = Math.min((ts - lastT) / 1000, 0.05);
  lastT = ts;
  ctx.clearRect(0, 0, W, H);

  if (state === S.INTRO) {
    introObsTimer += dt;
    if (introObsTimer > 1.1) {
      introObsTimer = 0;
      obstacles.push(makeObs(true));
    }
    updateObs(); auto.update();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    drawObs();
    drawDot(auto.x, auto.y, auto.r);
  }
  else if (state === S.ZOOM) {
    zoomT += dt / ZOOM_DUR;
    updateObs(); auto.update();
    const t = easeOut(Math.min(zoomT, 1));
    const scale = 1 + t * 14;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(scale, scale);
    ctx.translate(-zoomFX, -zoomFY);
    drawObs();
    drawDot(auto.x, auto.y, auto.r);
    ctx.restore();
    if (t > 0.55) {
      ctx.fillStyle = bgAlpha((t - 0.55) / 0.45);
      ctx.fillRect(0, 0, W, H);
    }
    if (zoomT >= 1) startGame();
  }
  else if (state === S.PLAY) {
    tickScore(dt);
    spawnTick(dt);
    updateObs();
    updateShake(dt);

    // 플레이어 크기 단계 업데이트 (시간이 길어질수록 커짐 → 맞기 쉬워짐)
    player.r = getPlayerR();

    // 웨이브 트리거
    gameTime += dt;
    if (gameTime >= nextWave) {
      nextWave = gameTime + rand(12, 22);
      triggerWave();
    }

    if (drag) hintAlpha = 0;

    if (obstacles.some(o => collidesObs(player, o))) {
      explode(player.x, player.y);
      ait?.generateHapticFeedback({ type: 'error' });
      state = S.DEAD; deadT = 0;
    }

    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawObs();
    drawWaveFlash();
    drawWaveHint();
    drawDot(player.x, player.y, player.r);
    ctx.restore();
    drawHintArea();
  }
  else if (state === S.DEAD) {
    deadT += dt;
    updateObs(); updateParticles();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    drawObs(); drawParticles();
    if (deadT > 1.8) { state = S.OVER; showGameOver(); }
  }
  else if (state === S.OVER) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  }
  requestAnimationFrame(loop);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
function startZoom() {
  zoomFX = auto.x; zoomFY = auto.y; zoomT = 0;
  state = S.ZOOM;
  document.getElementById('intro')!.classList.add('hidden');
}

function startGame() {
  obstacles = []; particles = [];
  score = 0; scoreF = 0;
  obsTimer = 0; hintAlpha = 1;
  gameTime = 0; nextWave = 15;
  waveGrace = 0; waveHintAlpha = 0;
  shakeIntensity = 0;
  colorIdx = 0; gameColor = COLORS[0]; applyColor();
  resetPlayer();
  state = S.PLAY;
  scoreEl.style.display = 'block';
  startHintFade();
  preloadAd();
}

async function showGameOver() {
  document.getElementById('goScore')!.textContent = String(score);
  updateRetryBtn();
  document.getElementById('gameOver')!.classList.add('show');
  try {
    const result = await ait?.submitGameCenterLeaderBoardScore({ score: String(score) });
    if (result && result.statusCode !== 'SUCCESS') console.warn('리더보드 점수 제출 실패:', result.statusCode);
  } catch (e) { console.warn('리더보드 점수 제출 오류:', e); }
}

function resetToIntro() {
  obstacles = []; particles = [];
  auto.reset(); introObsTimer = 0;
  scoreEl.style.display = 'none';
  state = S.INTRO;
  document.getElementById('intro')!.classList.remove('hidden');
}

// ── 광고 ─────────────────────────────────────────────────────────────────────
let adLoaded = false;

function todayStr() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}
function loadFreeRetries(): number {
  const saved = localStorage.getItem(getRetriesKey());
  const lastDate = localStorage.getItem(getRetriesDateKey());
  if (lastDate !== todayStr()) {
    localStorage.setItem(getRetriesKey(), '3');
    localStorage.setItem(getRetriesDateKey(), todayStr());
    return 3;
  }
  return saved !== null ? parseInt(saved, 10) : 3;
}
function saveFreeRetries(n: number) {
  localStorage.setItem(getRetriesKey(), String(n));
  localStorage.setItem(getRetriesDateKey(), todayStr());
}

let freeRetries = loadFreeRetries();

const retryBtn = document.getElementById('retryBtn')!;
function updateRetryBtn() {
  retryBtn.textContent = freeRetries > 0 ? '다시 도전' : '(광고 보고) 다시 도전';
}

async function preloadAd() {
  if (!AdMobPlugin) return;
  try {
    await AdMobPlugin.prepareInterstitial({ adId: ADMOB_INTERSTITIAL_ID });
    adLoaded = true;
  } catch (e) { console.warn('광고 로드 실패:', e); }
}

async function showAitAd() {
  // AIT 환경 (토스 앱): 리워드 전면광고 우선
  if (ait && aitAdLoaded) {
    aitAdLoaded = false;
    ait.showFullScreenAd({
      options: { adGroupId: AIT_AD_GROUP_ID },
      onEvent: (event) => {
        if (event.type === 'dismissed') {
          document.getElementById('gameOver')!.classList.remove('show');
          resetToIntro();
          preloadAitAd();
        } else if (event.type === 'failedToShow') {
          showAdFallback();
        }
      },
      onError: () => { showAdFallback(); },
    });
    return;
  }

  // AdMob (Android Capacitor)
  if (!AdMobPlugin || !InterstitialEvents || !adLoaded) { showAdFallback(); return; }
  adLoaded = false;
  try {
    const dismissed = await AdMobPlugin.addListener(InterstitialEvents.Dismissed, () => {
      document.getElementById('gameOver')!.classList.remove('show');
      resetToIntro();
      preloadAd();
      dismissed.remove();
    });
    const failed = await AdMobPlugin.addListener(InterstitialEvents.FailedToShow, () => {
      showAdFallback();
      failed.remove();
      dismissed.remove();
    });
    await AdMobPlugin.showInterstitial();
  } catch (e) { console.warn('광고 표시 실패:', e); showAdFallback(); }
}

let adFallbackInterval: ReturnType<typeof setInterval> | null = null;
function showAdFallback() {
  const el = document.getElementById('adScreen')!;
  el.classList.add('show');
  let cnt = 5;
  document.getElementById('adCount')!.textContent = String(cnt);
  adFallbackInterval = setInterval(() => {
    cnt--;
    document.getElementById('adCount')!.textContent = String(cnt);
    if (cnt <= 0) {
      clearInterval(adFallbackInterval!);
      el.classList.remove('show');
      document.getElementById('gameOver')!.classList.remove('show');
      resetToIntro();
    }
  }, 1000);
}

// ── 버튼 ─────────────────────────────────────────────────────────────────────
document.getElementById('startBtn')!.addEventListener('click', startZoom);
retryBtn.addEventListener('click', () => {
  if (freeRetries > 0) {
    freeRetries--;
    saveFreeRetries(freeRetries);
    updateRetryBtn();
    document.getElementById('gameOver')!.classList.remove('show');
    resetToIntro();
  } else {
    showAitAd();
  }
});
document.getElementById('leaderboardBtn')!.addEventListener('click', async () => {
  try {
    await ait?.openGameCenterLeaderboard();
    if (!ait) throw new Error('ait null');
  } catch {
    const text = `Dodge Dot에서 ${score}초 버텼어요 🔴 사방에서 점이 날아온다, 피할 수 있어?`;
    if (navigator.share) navigator.share({ title: 'Dodge Dot', text }).catch(() => {});
    else navigator.clipboard.writeText(text).then(() => alert('클립보드에 복사됐어요!')).catch(() => alert(text));
  }
});

// ── 종료 확인 ──────────────────────────────────────────────────────────────────
history.pushState({ dodgedot: true }, '');
window.addEventListener('popstate', () => {
  history.pushState({ dodgedot: true }, '');
  document.getElementById('closeConfirm')!.classList.add('show');
});
document.getElementById('closeNo')!.addEventListener('click', () => {
  document.getElementById('closeConfirm')!.classList.remove('show');
});
document.getElementById('closeYes')!.addEventListener('click', () => {
  document.getElementById('closeConfirm')!.classList.remove('show');
  import('@apps-in-toss/web-framework').then((m: any) => m.closeView?.()).catch(() => history.go(-2));
});

// ── 백그라운드 일시정지 ────────────────────────────────────────────────────────
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) lastT = 0; // 복귀 시 dt 스파이크 방지
});

// ── Init ──────────────────────────────────────────────────────────────────────
applyColor();
auto.reset();
requestAnimationFrame(loop);
