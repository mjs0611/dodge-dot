// 노스킬 자동플레이 sim — 실제 src/main.ts를 그대로 돌린다(게임 로직 무수정).
// 방법: main.ts 소스를 읽어 SDK dynamic import·setTimeout·Date.now만 sim 시계로 치환하고,
// 모듈 스코프 상태를 읽는 훅 한 줄을 덧붙여 임시 파일로 import. DOM/Canvas는 no-op 스텁.
// 실행: bun scripts/sim.ts [runsPerBot=150] [seed=1]
// ponytail: 봇 3종(idle/casual/skilled)은 손 모델 가정치. 실기기 체감과 다르면 봇 파라미터부터 의심.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const RUNS = Number(process.argv[2] ?? 150);
let seed = Number(process.argv[3] ?? 1) >>> 0;
Math.random = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ── sim 시계 + 타이머 ──
let now = 0;
type Timer = { at: number; fn: () => void; every?: number; id: number };
let timers: Timer[] = []; let tid = 1;
const g = globalThis as any;
g.__simNow = () => now;
g.__simTimeout = (fn: () => void, ms = 0) => { const id = tid++; timers.push({ at: now + ms, fn, id }); return id; };
g.__simInterval = (fn: () => void, ms: number) => { const id = tid++; timers.push({ at: now + ms, fn, every: ms, id }); return id; };
g.__simClearInterval = (id: number) => { timers = timers.filter(t => t.id !== id); };
function runTimers() {
  for (;;) {
    const due = timers.filter(t => t.at <= now).sort((a, b) => a.at - b.at)[0];
    if (!due) return;
    if (due.every) due.at += due.every; else timers = timers.filter(t => t !== due);
    due.fn();
  }
}

// ── DOM/Canvas 스텁 ──
const W = 393, H = 780; // 393pt 폭, 토스 내비바 제외 높이 가정
const noop = () => {};
const ctxStub: any = new Proxy({ createRadialGradient: () => ({ addColorStop: noop }), measureText: () => ({ width: 0 }) }, {
  get: (t: any, p) => (p in t ? t[p] : noop), set: (t: any, p, v) => { t[p] = v; return true; },
});
const els = new Map<string, any>();
function el(id: string) {
  if (!els.has(id)) {
    const h: Record<string, Function[]> = {};
    els.set(id, {
      id, style: { setProperty: noop }, textContent: '', innerHTML: '', offsetWidth: 0, width: 0, height: 0,
      classList: { add: noop, remove: noop, contains: () => false },
      addEventListener: (t: string, fn: Function) => { (h[t] ??= []).push(fn); },
      fire: (t: string, e: any = {}) => (h[t] ?? []).forEach(fn => fn({ preventDefault: noop, ...e })),
      getContext: () => ctxStub, appendChild: noop,
    });
  }
  return els.get(id);
}
const store = new Map<string, string>();
Object.assign(g, {
  window: g, innerWidth: W, innerHeight: H,
  matchMedia: () => ({ matches: false }), addEventListener: noop,
  document: { getElementById: el, querySelector: (q: string) => el(q), createElement: () => el('c' + tid++), documentElement: el('root'), addEventListener: noop, hidden: false },
  history: { pushState: noop, go: noop },
  Image: class { complete = false; naturalWidth = 0; src = ''; },
  alert: noop,
  requestAnimationFrame: (cb: (t: number) => void) => { raf = cb; return 1; },
});
Object.defineProperty(g, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) }, configurable: true });
let raf: ((t: number) => void) | null = null;

// ── 실제 main.ts 로드 (치환은 부작용 경계만) ──
const src = resolve(import.meta.dir, '../src/main.ts');
let code = readFileSync(src, 'utf8')
  .replace("from './adSettle'", `from '${resolve(import.meta.dir, '../src/adSettle.ts')}'`)
  .replace(/import\('(@apps-in-toss\/web-framework|@capacitor-community\/admob)'\)\.then/g, "Promise.reject(new Error('sim')).then")
  .replace(/\bsetTimeout\(/g, '__simTimeout(').replace(/\bsetInterval\(/g, '__simInterval(').replace(/\bclearInterval\(/g, '__simClearInterval(')
  .replace(/Date\.now\(\)/g, '__simNow()');
code += `\n;(globalThis as any).__dd = () => ({ state, score, scoreF, gameTime, obstacles, specials, pickups, flyingCoins, player, totalCoins, sessionCoins, dangerCounter, waveCount, coinStageActive, shieldActive, ghostActiveT, invincibleT, slowmoActiveT, collidesObs, collidesSpecial });\n`;
const dir = mkdtempSync(join(tmpdir(), 'ddsim-'));
writeFileSync(join(dir, 'main.sim.ts'), code);
await import(join(dir, 'main.sim.ts'));
const dd = () => g.__dd();
const PLAY = 2, DEAD = 3, OVER = 4;
const FRAME = 1000 / 60;
function step() { now += FRAME; runTimers(); const cb = raf; raf = null; cb?.(now); }

// ── 봇 (손가락 모델) ──
type Bot = { name: string; replan: number; maxSpd: number; horizon: number; greed: number };
const BOTS: Bot[] = [
  { name: 'idle', replan: 0, maxSpd: 0, horizon: 0, greed: 0 },
  { name: 'casual', replan: 0.25, maxSpd: 450, horizon: 0.35, greed: 0.3 },   // 반응 250ms, 손가락 450px/s
  { name: 'skilled', replan: 1 / 60, maxSpd: 900, horizon: 0.6, greed: 1 },  // 매 프레임, 900px/s
];
function hazards(s: any) {
  const hz: { x: number; y: number; vx: number; vy: number; r: number; w?: number; h?: number; blast?: boolean }[] = [];
  for (const o of s.obstacles) hz.push({ x: o.x, y: o.y, vx: o.vx * 60, vy: o.vy * 60, r: o.r });
  for (const o of s.specials) {
    if (o.k === 'laser') hz.push({ x: o.x, y: o.y, vx: o.vx * 60, vy: o.vy * 60, r: 0, w: o.w, h: o.h });
    else if (o.k === 'mine' && o.exploded) hz.push({ x: o.x, y: o.y, vx: 0, vy: 0, r: o.blastR ?? 0, blast: true });
    else hz.push({ x: o.x, y: o.y, vx: o.vx * 60, vy: o.vy * 60, r: o.r });
  }
  return hz;
}
function clearance(px: number, py: number, pr: number, hz: ReturnType<typeof hazards>, t: number) {
  let m = Infinity;
  for (const o of hz) {
    const x = o.x + o.vx * t, y = o.y + o.vy * t;
    const d = o.w !== undefined ? Math.max(Math.abs(px - x) - o.w / 2, Math.abs(py - y) - o.h! / 2) - pr : Math.hypot(px - x, py - y) - o.r - pr;
    if (d < m) m = d;
  }
  return m;
}
function choose(bot: Bot, s: any): [number, number] {
  const p = s.player, hz = hazards(s);
  let best: [number, number] = [0, 0], bestScore = -Infinity;
  const dirs: [number, number][] = [[0, 0]];
  for (const k of [0.5, 1]) for (let i = 0; i < 16; i++) dirs.push([k * Math.cos(i * Math.PI / 8), k * Math.sin(i * Math.PI / 8)]);
  const targets = [...s.pickups, ...s.flyingCoins];
  const samples = [1 / 60, 0.05, 0.1, 0.2, 0.35, bot.horizon].filter(t => t <= bot.horizon);
  for (const [dx, dy] of dirs) {
    let worst = Infinity;
    for (const t of samples) {
      const px = Math.min(W - p.r, Math.max(p.r, p.x + dx * bot.maxSpd * t)), py = Math.min(H - p.r, Math.max(p.r, p.y + dy * bot.maxSpd * t));
      worst = Math.min(worst, clearance(px, py, p.r, hz, t) + t * 40); // 먼 미래 위협은 덜 무겁게
    }
    const ex = Math.min(W, Math.max(0, p.x + dx * bot.maxSpd * bot.horizon)), ey = Math.min(H, Math.max(0, p.y + dy * bot.maxSpd * bot.horizon));
    let sc = Math.min(worst, 45) * 2 - Math.hypot(ex - W / 2, ey - H / 2) * 0.03;
    if (worst > 20) for (const c of targets) sc += bot.greed * 20 / (1 + Math.hypot(ex - c.x, ey - c.y) / 30);
    if (sc > bestScore) { bestScore = sc; best = [dx, dy]; }
  }
  return best;
}

// ── 한 판 ──
type Run = { bot: string; t: number; score: number; cause: string; coins: number; stageCoins: number; nearMax: number; waves: number; mineBlasts: number; shieldSaves: number; continued: boolean; tAtCont?: number };
const B = 15; // 구간(실초)
let dens: number[] = [], densN: number[] = [], deaths: number[] = [], expo: number[] = [];
function play(bot: Bot, useContinue: boolean, cap = 600): Run {
  el('startBtn').fire('click');
  while (dd().state !== PLAY) step();
  const c = el('gameCanvas');
  let fx = 200, fy = 400, dir: [number, number] = [0, 0], plan = 0, t = 0;
  c.fire('touchstart', { touches: [{ clientX: fx, clientY: fy }] });
  let coins0 = dd().totalCoins, stageCoins = 0, nearMax = 0, mineBlasts = 0, shieldSaves = 0, cause = 'cap', continued = false, tAtCont: number | undefined;
  const seenBlast = new Set<any>(); let lastBk = -1;
  for (;;) {
    const s = dd();
    if (bot.maxSpd > 0) {
      plan -= 1 / 60;
      if (plan <= 0) { dir = choose(bot, s); plan = bot.replan; }
      fx += dir[0] * bot.maxSpd / 60; fy += dir[1] * bot.maxSpd / 60;
      c.fire('touchmove', { touches: [{ clientX: fx, clientY: fy }] });
    }
    const beforeCoins = s.totalCoins, stage = s.coinStageActive, hadShield = s.shieldActive;
    step(); t += 1 / 60;
    const a = dd();
    const bk = Math.floor(t / B);
    if (bk !== lastBk) { expo[bk] = (expo[bk] ?? 0) + 1; lastBk = bk; }
    dens[bk] = (dens[bk] ?? 0) + a.obstacles.length + a.specials.length; densN[bk] = (densN[bk] ?? 0) + 1;
    if (stage) stageCoins += Math.max(0, a.totalCoins - beforeCoins);
    nearMax = Math.max(nearMax, a.dangerCounter);
    for (const o of a.specials) if (o.k === 'mine' && o.exploded && !seenBlast.has(o)) { seenBlast.add(o); mineBlasts++; }
    if (hadShield && !a.shieldActive) shieldSaves++;
    if (a.state === DEAD) {
      deaths[bk] = (deaths[bk] ?? 0) + 1;
      const p = a.player;
      const so = a.specials.find((o: any) => a.collidesSpecial(p, o));
      const oo = a.obstacles.find((o: any) => a.collidesObs(p, o));
      cause = so ? (so.k === 'mine' && so.exploded ? 'mineBlast' : so.k) : oo ? (oo.r <= 8 ? 'obsS' : oo.r <= 16 ? 'obsM' : oo.r <= 26 ? 'obsL' : 'obsXL') : '?';
      while (dd().state !== OVER) step();
      if (useContinue && !continued) {
        continued = true; tAtCont = t;
        el('continueBtn').fire('click');
        while (dd().state !== PLAY) step(); // 무광고 폴백 5초 카운트다운
        c.fire('touchstart', { touches: [{ clientX: fx, clientY: fy }] });
        continue;
      }
      break;
    }
    if (t >= cap) { cause = 'cap'; break; }
  }
  const run: Run = { bot: bot.name, t, score: dd().score, cause, coins: dd().totalCoins - coins0, stageCoins, nearMax, waves: dd().waveCount, mineBlasts, shieldSaves, continued, tAtCont };
  el('retryBtn').fire('click');
  return run;
}

// ── 리포트 ──
const pct = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
for (const useContinue of [false, true]) {
  for (const bot of BOTS) {
    if (useContinue && bot.name === 'idle') continue;
    const runs: Run[] = []; dens = []; densN = []; deaths = []; expo = [];
    for (let i = 0; i < RUNS; i++) {
      runs.push(play(bot, useContinue));
    }
    const ts = runs.map(r => r.t), sc = runs.map(r => r.score), co = runs.map(r => r.coins);
    const causes: Record<string, number> = {};
    for (const r of runs) causes[r.cause] = (causes[r.cause] ?? 0) + 1;
    const alive = (x: number) => (runs.filter(r => r.t >= x).length / runs.length * 100).toFixed(0) + '%';
    console.log(`\n[${bot.name}${useContinue ? ' +이어하기1회' : ''}] n=${RUNS}`);
    console.log(`  생존(실초) p10/p50/p90 = ${pct(ts, .1).toFixed(1)} / ${pct(ts, .5).toFixed(1)} / ${pct(ts, .9).toFixed(1)}  평균 ${avg(ts).toFixed(1)}`);
    console.log(`  점수 p50/p90 = ${pct(sc, .5)} / ${pct(sc, .9)}   점수/실초 평균 = ${(avg(sc) / avg(ts)).toFixed(2)}`);
    console.log(`  생존율 10s ${alive(10)} 20s ${alive(20)} 30s ${alive(30)} 45s ${alive(45)} 60s ${alive(60)} 90s ${alive(90)} 120s ${alive(120)}`);
    console.log(`  사인 ${Object.entries(causes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / RUNS * 100).toFixed(0)}%`).join(', ')}`);
    console.log(`  코인/판 평균 ${avg(co).toFixed(1)} (코인웨이브분 ${avg(runs.map(r => r.stageCoins)).toFixed(1)}) p90 ${pct(co, .9)}  니어미스 최대스택 평균 ${avg(runs.map(r => r.nearMax)).toFixed(1)}`);
    console.log(`  웨이브 평균 ${avg(runs.map(r => r.waves)).toFixed(1)}  기뢰폭발/판 ${avg(runs.map(r => r.mineBlasts)).toFixed(2)}  방패소모/판 ${avg(runs.map(r => r.shieldSaves)).toFixed(2)}`);
    console.log('  구간별(15실초) 화면위 장애물 평균 / 구간 사망률: ' + dens.map((d, i) => `${i * B}s:${(d / densN[i]).toFixed(1)}/${expo[i] ? ((deaths[i] ?? 0) / expo[i] * 100).toFixed(0) : '-'}%`).slice(0, 10).join(' '));
    const perRun = avg(co);
    console.log(`  스킨 도달 판수(2배광고 없이/매판 2배) 300:${Math.ceil(300 / perRun)}/${Math.ceil(150 / perRun)} 500:${Math.ceil(500 / perRun)}/${Math.ceil(250 / perRun)} 1500:${Math.ceil(1500 / perRun)}/${Math.ceil(750 / perRun)} 전부3100:${Math.ceil(3100 / perRun)}/${Math.ceil(1550 / perRun)}`);
  }
}
