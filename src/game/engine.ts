import a1 from "../assets/sprites/angler/hover-1.png";
import a2 from "../assets/sprites/angler/hover-2.png";
import a3 from "../assets/sprites/angler/hover-3.png";
import a4 from "../assets/sprites/angler/hover-4.png";
import s1 from "../assets/sprites/shark/hover-1.png";
import s2 from "../assets/sprites/shark/hover-2.png";
import s3 from "../assets/sprites/shark/hover-3.png";
import s4 from "../assets/sprites/shark/hover-4.png";
import j1 from "../assets/sprites/jelly/hover-1.png";
import j2 from "../assets/sprites/jelly/hover-2.png";
import j3 from "../assets/sprites/jelly/hover-3.png";
import j4 from "../assets/sprites/jelly/hover-4.png";
import { seaAudio } from "./audio";

export type Phase = "boot" | "menu" | "play" | "power" | "upgrade" | "results";
export type Weapon = "laser" | "missile" | "bomb";
export type RunEnd = "lives" | "cleared";

export type BoardRow = {
  score: number;
  time: number;
  sharks: number;
  distance: number;
  won: boolean;
};

export type Hud = {
  phase: Phase;
  score: number;
  best: number;
  charge: number;
  pendingPowers: number;
  level: number;
  lives: number;
  sharks: number;
  depth: number;
  time: number;
  combo: number;
  muted: boolean;
  paused: boolean;
  newBest: boolean;
  error: string | null;
  weapon: Weapon | null;
  weaponRank: number;
  laserLeft: number;
  poopLeft: number;
  mode: "course" | "boss";
  bossHp: number;
  bossMax: number;
  shell: boolean;
  reason: RunEnd | null;
  board: BoardRow[];
};

const INITIAL: Hud = {
  phase: "boot",
  score: 0,
  best: 0,
  charge: 0,
  pendingPowers: 0,
  level: 1,
  lives: 3,
  sharks: 0,
  depth: 0,
  time: 0,
  combo: 0,
  muted: false,
  paused: false,
  newBest: false,
  error: null,
  weapon: null,
  weaponRank: 0,
  laserLeft: 0,
  poopLeft: 0,
  mode: "course",
  bossHp: 0,
  bossMax: 0,
  shell: false,
  reason: null,
  board: [],
};

let hud: Hud = INITIAL;
const listeners = new Set<() => void>();

export function subscribeHud(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getHud() {
  return hud;
}

function publish(next: Hud) {
  hud = next;
  for (const listener of listeners) listener();
}

const BEST_KEY = "lure-best";
const MUTE_KEY = "lure-muted";
const BOARD_KEY = "lure-board";
const LEVELS = 10;
const COURSE_SECS = 42;
const STEP = 1 / 60;
const SHARK_SCALE = [0.85, 1.15, 1.55, 2.05];
const SHARK_PTS = [40, 90, 160, 250];

const SRC = {
  angler: [a1, a2, a3, a4],
  shark: [s1, s2, s3, s4],
  jelly: [j1, j2, j3, j4],
};

const CONTENT = {
  angler: { w: 0.641, h: 0.503 },
  shark: { w: 0.775, h: 0.3 },
  jelly: { w: 0.7, h: 0.716 },
};

type Kind = "shark" | "jelly" | "fish" | "diver" | "turtle";

type Ent = {
  kind: Kind;
  x: number;
  y: number;
  scale: number;
  anim: number;
  eaten: boolean;
  eatT: number;
  bob: number;
  vy: number;
  pts: number;
  size: number;
  used: boolean;
};

type Shot = {
  kind: "missile" | "bomb";
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  rank: number;
};

type Boss = {
  t: number;
  hp: number;
  max: number;
  biteLock: number;
  x: number;
};

type Mote = { x: number; y: number; z: number; s: number };
type Particle = {
  on: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  kind: 0 | 1 | 2 | 3;
};
type Floater = { on: boolean; x: number; y: number; life: number; text: string };

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function readNum(key: string) {
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}
function writeNum(key: string, n: number) {
  try {
    localStorage.setItem(key, String(n));
  } catch {
    /* private mode */
  }
}
function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}
function readBoard(): BoardRow[] {
  try {
    const raw = JSON.parse(localStorage.getItem(BOARD_KEY) || "[]") as BoardRow[];
    if (!Array.isArray(raw)) return [];
    return raw.filter((r) => r && typeof r.score === "number").slice(0, 6);
  } catch {
    return [];
  }
}
function writeBoard(rows: BoardRow[]) {
  try {
    localStorage.setItem(BOARD_KEY, JSON.stringify(rows.slice(0, 6)));
  } catch {
    /* private mode */
  }
}
function loadImages(srcs: string[]) {
  return Promise.all(
    srcs.map(
      (src) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(src));
          img.src = src;
        }),
    ),
  );
}
function ellHit(
  ax: number,
  ay: number,
  arx: number,
  ary: number,
  bx: number,
  by: number,
  brx: number,
  bry: number,
) {
  const rx = arx + brx;
  const ry = ary + bry;
  if (rx <= 0 || ry <= 0) return false;
  const dx = ax - bx;
  const dy = ay - by;
  return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) < 1;
}

export type LureApi = {
  pointer: () => void;
  toggleMute: () => void;
  togglePause: () => void;
  diveAgain: () => void;
  surface: () => void;
  choosePower: (kind: "laser" | "poop") => void;
  chooseWeapon: (kind: Weapon) => void;
  fire: () => void;
  useStored: (kind: "laser" | "poop") => void;
  destroy: () => void;
};

export function mountLure(canvas: HTMLCanvasElement): LureApi {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas");
  const ctx: CanvasRenderingContext2D = context;
  const audio = seaAudio();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduceMotion = reduce.matches;
  const onReduce = () => {
    reduceMotion = reduce.matches;
  };
  reduce.addEventListener("change", onReduce);

  const sprites: Record<"angler" | "shark" | "jelly", HTMLImageElement[]> = {
    angler: [],
    shark: [],
    jelly: [],
  };
  const particles: Particle[] = Array.from({ length: 180 }, () => ({
    on: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    max: 1,
    size: 2,
    kind: 0,
  }));
  let pCursor = 0;
  const floaters: Floater[] = Array.from({ length: 12 }, () => ({
    on: false,
    x: 0,
    y: 0,
    life: 0,
    text: "",
  }));
  let fCursor = 0;
  const motes: Mote[] = Array.from({ length: 36 }, () => ({
    x: Math.random(),
    y: Math.random(),
    z: 0.25 + Math.random() * 0.75,
    s: 0.6 + Math.random() * 1.6,
  }));

  const ents: Ent[] = [];
  const decor: Ent[] = [];
  const shots: Shot[] = [];

  let W = 1;
  let H = 1;
  let dpr = 1;
  let raf = 0;
  let stopped = false;
  let last = performance.now();
  let acc = 0;

  let phase: Phase = "boot";
  let paused = false;
  let score = 0;
  let best = 0;
  let bestAtStart = 0;
  let pendingPowers = 0;
  let level = 1;
  let lives = 3;
  let sharks = 0;
  let meters = 0;
  let runTime = 0;
  let combo = 0;
  let lastEat = -10;
  let reason: RunEnd | null = null;
  let newBest = false;
  let board: BoardRow[] = [];
  let mode: "course" | "boss" = "course";
  let courseT = 0;
  let banner = 0;
  let weapon: Weapon | null = null;
  const ranks: Record<Weapon, number> = { laser: 0, missile: 0, bomb: 0 };
  let cool = 0;
  let laserLeft = 0;
  let poopLeft = 0;
  let laserTime = 0;
  let laserTick = 0;
  let coralFlat = 0;
  let poopFlash = 0;
  let queuedScene: "upgrade" | "results" | null = null;
  let boss: Boss | null = null;
  let diverSpawned = false;
  let turtleSpawned = false;
  let spawnIn = 1;
  let time = 0;
  let drift = 0;
  let trauma = 0;
  let shakeT = 0;
  let wantFlap = false;
  let flapLock = 0;
  let bubbleIn = 0.4;

  const player = {
    x: 120,
    y: 300,
    vy: 0,
    rot: 0,
    anim: 0,
    alive: true,
    iframes: 0,
    shell: 0,
    chomp: 0,
  };

  function snap(): Hud {
    const rank = weapon ? ranks[weapon] : 0;
    return {
      phase,
      score,
      best,
      charge: ((score % 1000) + 1000) % 1000,
      pendingPowers,
      level,
      lives,
      sharks,
      depth: Math.floor(meters),
      time: Math.floor(runTime),
      combo: combo >= 2 && time - lastEat < 2.2 ? combo : 0,
      muted: audio.muted,
      paused,
      newBest,
      error: null,
      weapon,
      weaponRank: rank,
      laserLeft,
      poopLeft,
      mode,
      bossHp: boss ? Math.max(0, boss.hp) : 0,
      bossMax: boss ? boss.max : 0,
      shell: player.shell > 0,
      reason,
      board,
    };
  }
  function sync() {
    publish(snap());
  }

  function emit(x: number, y: number, kind: Particle["kind"], count: number, speed: number) {
    for (let i = 0; i < count; i++) {
      const p = particles[pCursor];
      pCursor = (pCursor + 1) % particles.length;
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.35 + Math.random());
      p.on = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.life = 0.3 + Math.random() * 0.35;
      p.max = p.life;
      p.size = 2 + Math.random() * 3.5;
      p.kind = kind;
    }
  }
  function floater(x: number, y: number, text: string) {
    const f = floaters[fCursor];
    fCursor = (fCursor + 1) % floaters.length;
    f.on = true;
    f.x = x;
    f.y = y;
    f.life = 0.75;
    f.text = text;
  }

  function fishX() {
    return clamp(W * 0.24, 78, Math.min(220, W * 0.32));
  }
  function anglerVisualH() {
    return H * 0.075;
  }
  function sizes(kind: "angler" | "shark" | "jelly", visualH: number) {
    const c = CONTENT[kind];
    const drawH = visualH / c.h;
    return { drawH, visualW: drawH * c.w, visualH };
  }
  function scrollSpeed() {
    return H * (0.3 + (level - 1) * 0.016);
  }
  function coralH(index: number) {
    const n = Math.sin(index * 0.71) * 0.55 + Math.sin(index * 0.23 + 1.7) * 0.45;
    const amp = mode === "boss" ? 0.35 : 1;
    const flat = coralFlat > 0 ? 0.15 : 1;
    const grow = 1 + (level - 1) * 0.035;
    return H * (0.045 + (n * 0.5 + 0.5) * 0.2 * grow) * amp * flat;
  }
  function coralTop(screenX: number) {
    const world = screenX + drift;
    const spacing = 34;
    const i = world / spacing;
    const i0 = Math.floor(i);
    const t = i - i0;
    const h0 = coralH(i0);
    const h1 = coralH(i0 + 1);
    return H - lerp(h0, h1, t);
  }

  function addEnt(partial: Partial<Ent> & Pick<Ent, "kind" | "x" | "y">, list = ents) {
    list.push({
      scale: 1,
      anim: Math.random() * 4,
      eaten: false,
      eatT: 0,
      bob: Math.random() * Math.PI * 2,
      vy: 0,
      pts: 0,
      size: 1,
      used: false,
      ...partial,
    });
  }

  function addScore(pts: number) {
    if (pts <= 0) return;
    const before = score;
    score += pts;
    if (score > best) {
      best = score;
      writeNum(BEST_KEY, best);
    }
    const steps = Math.floor(score / 100) - Math.floor(before / 100);
    if (steps > 0 && lives > 0 && phase === "play") {
      pendingPowers += steps;
      floater(player.x, player.y - H * 0.07, "rush");
    }
    sync();
  }

  function mouthPos() {
    const visualH = anglerVisualH();
    const { visualW } = sizes("angler", visualH);
    const lx = visualW * 0.34;
    const ly = visualH * 0.08;
    const c = Math.cos(player.rot);
    const s = Math.sin(player.rot);
    return {
      x: player.x + lx * c - ly * s,
      y: player.y + lx * s + ly * c,
      visualW,
      visualH,
    };
  }
  function lurePos() {
    const visualH = anglerVisualH();
    const { visualW } = sizes("angler", visualH);
    const sway = Math.sin(time * 4.6) * visualW * 0.55 + Math.sin(time * 2.1) * visualW * 0.2;
    const bob = Math.cos(time * 5.4) * visualH * 0.7 + Math.sin(time * 3.3) * visualH * 0.35;
    const lx = visualW * 0.05 + sway;
    const ly = -visualH * 0.55 + bob;
    const c = Math.cos(player.rot);
    const s = Math.sin(player.rot);
    const hx = visualW * 0.02;
    const hy = -visualH * 0.05;
    return {
      x: player.x + lx * c - ly * s,
      y: player.y + lx * s + ly * c,
      hx: player.x + hx * c - hy * s,
      hy: player.y + hx * s + hy * c,
    };
  }

  function bodyOf(kind: "angler" | "shark" | "jelly", x: number, y: number, scale: number) {
    const base = kind === "angler" ? anglerVisualH() : kind === "shark" ? H * 0.15 : H * 0.075;
    const visualH = base * scale;
    const { visualW } = sizes(kind, visualH);
    if (kind === "shark") return { x, y, rx: visualW * 0.4, ry: visualH * 0.48, visualH, visualW };
    if (kind === "jelly") return { x, y, rx: visualW * 0.26, ry: visualH * 0.3, visualH, visualW };
    return { x, y: y + visualH * 0.06, rx: visualW * 0.3, ry: visualH * 0.32, visualH, visualW };
  }

  function hurt() {
    if (player.iframes > 0 || !player.alive || banner > 0) return;
    if (player.shell > 0) {
      player.shell = 0;
      player.iframes = 0.7;
      floater(player.x, player.y - H * 0.05, "shell");
      return;
    }
    lives -= 1;
    player.iframes = 1.15;
    if (!reduceMotion) trauma = Math.min(1, trauma + 0.45);
    audio.sting();
    emit(player.x, player.y, 2, 10, H * 0.2);
    player.vy = Math.min(player.vy, -H * 0.15);
    if (lives <= 0) endRun(false);
    else sync();
  }

  function awardEat(e: Ent) {
    const chain = time - lastEat < 2.2;
    combo = chain ? combo + 1 : 1;
    lastEat = time;
    const bonus = (combo - 1) * 8;
    if (e.kind === "shark") sharks += 1;
    addScore(e.pts + bonus);
    player.chomp = 1;
    if (!reduceMotion) trauma = Math.min(1, trauma + 0.16);
    emit(e.x, e.y, 0, 8, H * 0.2);
    floater(e.x, e.y - H * 0.03, combo >= 2 ? `+${e.pts + bonus}` : `+${e.pts}`);
    audio.bite(combo);
  }

  function catchDiver(e: Ent) {
    e.used = true;
    addScore(500);
    if (lives < 3) lives += 1;
    emit(e.x, e.y, 1, 14, H * 0.25);
    floater(e.x, e.y, "+500");
    audio.bite(1);
    sync();
  }

  function saveRun(won: boolean) {
    const row: BoardRow = {
      score,
      time: Math.floor(runTime),
      sharks,
      distance: Math.floor(meters),
      won,
    };
    board = [...board, row].sort((a, b) => b.score - a.score).slice(0, 6);
    writeBoard(board);
    newBest = score > bestAtStart;
    reason = won ? "cleared" : "lives";
  }
  function endRun(won: boolean) {
    player.alive = false;
    saveRun(won);
    queuedScene = null;
    pendingPowers = 0;
    phase = "results";
    sync();
  }

  function onBossDown() {
    if (!boss) return;
    boss.hp = 0;
    addScore(160 + level * 25);
    emit(boss.x, H * 0.4, 2, 24, H * 0.35);
    audio.boom();
    if (level >= LEVELS) {
      saveRun(true);
      if (phase === "power") queuedScene = "results";
      else phase = "results";
    } else if (phase === "power") queuedScene = "upgrade";
    else phase = "upgrade";
    sync();
  }

  function beamHit(thick: number, dmg: number) {
    const y = lurePos().y;
    for (let i = ents.length - 1; i >= 0; i--) {
      const e = ents[i];
      if (e.used || e.x < player.x) continue;
      if (Math.abs(e.y - y) > thick) continue;
      if (e.kind === "shark" || e.kind === "fish") {
        if (!e.eaten) {
          e.eaten = true;
          e.eatT = 0.12;
          player.chomp = 1;
        }
      } else if (e.kind === "jelly") {
        emit(e.x, e.y, 2, 6, H * 0.15);
        ents.splice(i, 1);
      }
    }
    if (boss && mode === "boss") {
      boss.hp -= dmg;
      if (boss.hp <= 0) onBossDown();
    }
  }

  function firePoop() {
    audio.boom();
    poopFlash = 0.45;
    coralFlat = 1.7;
    emit(player.x - H * 0.02, player.y + anglerVisualH() * 0.2, 3, 28, H * 0.45);
    for (let i = ents.length - 1; i >= 0; i--) {
      const e = ents[i];
      if (e.kind === "diver" || e.kind === "turtle") continue;
      if ((e.kind === "shark" || e.kind === "fish") && !e.eaten) {
        e.eaten = true;
        e.eatT = 0.08;
      } else if (e.kind === "jelly") ents.splice(i, 1);
    }
    player.chomp = 0.4;
    if (boss && mode === "boss") {
      boss.hp -= 3;
      if (boss.hp <= 0) onBossDown();
    }
  }

  function fireEquipped() {
    if (phase !== "play" || paused || !weapon || cool > 0 || !player.alive) return;
    const rank = ranks[weapon];
    const mouth = mouthPos();
    if (weapon === "laser") {
      cool = Math.max(0.4, 0.9 - rank * 0.15);
      beamHit(H * (0.03 + rank * 0.008), rank);
      laserTick = 0.12;
      audio.zap();
    } else if (weapon === "missile") {
      cool = Math.max(0.45, 1.15 - rank * 0.18);
      const n = rank >= 3 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        shots.push({
          kind: "missile",
          x: mouth.x,
          y: mouth.y + (i - (n - 1) / 2) * H * 0.04,
          vx: H * 0.35,
          vy: 0,
          life: 2.4,
          rank,
        });
      }
      audio.zap();
    } else {
      cool = Math.max(0.8, 2.3 - rank * 0.35);
      shots.push({
        kind: "bomb",
        x: mouth.x,
        y: mouth.y,
        vx: H * 0.22,
        vy: H * 0.08,
        life: 0.42,
        rank,
      });
      audio.flap();
    }
    sync();
  }

  function explode(x: number, y: number, radius: number, dmg: number) {
    audio.boom();
    emit(x, y, 0, 16, H * 0.3);
    for (let i = ents.length - 1; i >= 0; i--) {
      const e = ents[i];
      const dx = e.x - x;
      const dy = e.y - y;
      if (dx * dx + dy * dy > radius * radius) continue;
      if (e.kind === "shark" || e.kind === "fish") {
        if (!e.eaten) {
          e.eaten = true;
          e.eatT = 0.1;
        }
      } else if (e.kind === "jelly") ents.splice(i, 1);
    }
    if (boss && mode === "boss") {
      boss.hp -= dmg;
      if (boss.hp <= 0) onBossDown();
    }
  }

  function spawnShark(x: number, y: number, size: number) {
    addEnt({
      kind: "shark",
      x,
      y,
      size,
      scale: SHARK_SCALE[size],
      pts: SHARK_PTS[size],
    });
  }
  function spawnWave() {
    const t = (level - 1) / 9;
    const x = W + H * 0.12;
    const lane = clamp(player.y + Math.sin(courseT * 0.8) * H * 0.08, H * 0.22, H * 0.7);
    const r = Math.random();
    const jellyP = lerp(0.14, 0.28, t);
    if (r < 0.48) spawnShark(x, lane, rollSize());
    else if (r < 0.48 + jellyP) {
      addEnt({
        kind: "jelly",
        x,
        y: clamp(lane + (Math.random() < 0.5 ? -1 : 1) * H * 0.28, H * 0.18, H * 0.72),
        scale: 0.85 + Math.random() * 0.3,
      });
    } else if (r < 0.84) {
      for (let i = 0; i < 3; i++) {
        addEnt({
          kind: "fish",
          x: x + i * H * 0.05,
          y: lane + (i - 1) * H * 0.045,
          scale: 0.7 + Math.random() * 0.3,
          pts: 20,
        });
      }
    } else {
      spawnShark(x, lane, rollSize());
      addEnt({
        kind: "jelly",
        x,
        y: clamp(lane + H * 0.3, H * 0.2, H * 0.74),
        scale: 0.9,
      });
    }
  }
  function rollSize() {
    const t = (level - 1) / 9;
    const r = Math.random();
    if (r < lerp(0.46, 0.12, t)) return 0;
    if (r < lerp(0.78, 0.42, t)) return 1;
    if (r < lerp(0.94, 0.72, t)) return 2;
    return 3;
  }

  function startLevel() {
    mode = "course";
    courseT = 0;
    banner = 1.5;
    ents.length = 0;
    shots.length = 0;
    boss = null;
    diverSpawned = false;
    turtleSpawned = false;
    spawnIn = 1.05;
    player.alive = true;
    player.y = H * 0.42;
    player.vy = 0;
    player.rot = -0.1;
    player.x = fishX();
    player.iframes = 0.4;
    phase = "play";
    sync();
  }

  function begin() {
    score = 0;
    pendingPowers = 0;
    level = 1;
    lives = 3;
    sharks = 0;
    meters = 0;
    runTime = 0;
    combo = 0;
    lastEat = -10;
    reason = null;
    newBest = false;
    bestAtStart = best;
    mode = "course";
    weapon = null;
    ranks.laser = 0;
    ranks.missile = 0;
    ranks.bomb = 0;
    cool = 0;
    laserLeft = 0;
    poopLeft = 0;
    laserTime = 0;
    coralFlat = 0;
    queuedScene = null;
    paused = false;
    time = 0;
    player.shell = 0;
    player.chomp = 0;
    startLevel();
  }

  function gapY() {
    if (!boss) return H * 0.45;
    return H * (0.26 + 0.48 * (0.5 + 0.5 * Math.sin(boss.t * 0.85)));
  }
  function bossVuln() {
    if (!boss) return false;
    const m = boss.t % 5;
    return m > 3.35 && m < 4.75;
  }

  function update(dt: number) {
    if (phase === "boot") return;
    time += dt;
    shakeT += dt;
    trauma = Math.max(0, trauma - dt * 1.5);
    poopFlash = Math.max(0, poopFlash - dt);
    coralFlat = Math.max(0, coralFlat - dt);
    player.chomp = Math.max(0, player.chomp - dt * 3.1);
    flapLock = Math.max(0, flapLock - dt);
    bubbleIn -= dt;
    if (bubbleIn <= 0) {
      bubbleIn = 0.45 + Math.random() * 0.5;
      emit(Math.random() * W, H * 0.8, 1, 1, H * 0.04);
    }
    for (const p of particles) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.on = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (const f of floaters) {
      if (!f.on) continue;
      f.life -= dt;
      f.y -= H * 0.06 * dt;
      if (f.life <= 0) f.on = false;
    }

    if (phase === "menu") {
      player.x = W * 0.5;
      player.y = H * 0.28 + Math.sin(time * 1.2) * H * 0.012;
      player.rot = Math.sin(time * 0.7) * 0.08;
      player.anim += dt * 6;
      drift += H * 0.05 * dt;
      if (decor.length === 0) {
        addEnt({ kind: "shark", x: W * 0.7, y: H * 0.55, scale: 1.1, size: 1, pts: 90 }, decor);
        addEnt({ kind: "jelly", x: W * 0.3, y: H * 0.62, scale: 0.8 }, decor);
      }
      for (const e of decor) {
        e.x -= H * 0.05 * dt;
        e.anim += dt * 5;
        if (e.x < -H * 0.3) e.x = W + H * 0.2;
      }
      return;
    }

    if (paused || phase === "upgrade" || phase === "results") return;
    if (!player.alive && phase === "play") return;

    const scroll = scrollSpeed();
    drift += scroll * dt;
    runTime += dt;
    meters += (scroll / Math.max(H, 1)) * 8 * dt;
    player.iframes = Math.max(0, player.iframes - dt);
    cool = Math.max(0, cool - dt);
    banner = Math.max(0, banner - dt);
    if (laserTime > 0) {
      laserTime -= dt;
      laserTick -= dt;
      if (laserTick <= 0) {
        laserTick = 0.16;
        beamHit(H * 0.07, 1);
      }
    }

    if (wantFlap && flapLock <= 0) {
      wantFlap = false;
      flapLock = 0.09;
      player.vy = -H * 0.56;
      audio.flap();
      emit(player.x - H * 0.03, player.y, 1, 3, H * 0.08);
    }

    player.vy = Math.min(H * 0.68, player.vy + H * 1.65 * dt);
    player.y += player.vy * dt;
    const targetRot = clamp(player.vy / (H * 0.9), -0.45, 0.7);
    player.rot += (targetRot - player.rot) * (1 - Math.exp(-8 * dt));
    player.anim += dt * 7;
    player.x = fishX();

    const ceiling = H * 0.07;
    if (player.y - anglerVisualH() * 0.45 < ceiling) {
      player.y = ceiling + anglerVisualH() * 0.5;
      player.vy = Math.abs(player.vy) * 0.25;
      hurt();
    }
    const floor = coralTop(player.x);
    if (player.y + anglerVisualH() * 0.42 > floor) {
      player.y = floor - anglerVisualH() * 0.46;
      player.vy = -Math.abs(player.vy) * 0.2 - H * 0.05;
      hurt();
    }

    if (mode === "course") {
      courseT += dt;
      if (!diverSpawned && courseT > 15) {
        diverSpawned = true;
        addEnt({ kind: "diver", x: player.x + W * 0.28, y: -H * 0.05, vy: H * 1.05, pts: 500 });
      }
      if (!turtleSpawned && courseT > 27) {
        turtleSpawned = true;
        addEnt({ kind: "turtle", x: W + H * 0.1, y: H * (0.3 + Math.random() * 0.3), scale: 1 });
      }
      if (banner <= 0) {
        spawnIn -= dt;
        const interval = lerp(1.4, 0.78, (level - 1) / 9);
        if (spawnIn <= 0) {
          spawnWave();
          spawnIn = interval;
        }
      }
      if (courseT >= COURSE_SECS) {
        mode = "boss";
        boss = { t: 0, hp: 4 + level, max: 4 + level, biteLock: 0, x: W + H * 0.2 };
        ents.length = 0;
        banner = 1.2;
        sync();
      }
    } else if (boss && phase === "play") {
      boss.t += dt;
      boss.biteLock = Math.max(0, boss.biteLock - dt);
      boss.x += (W * 0.78 - boss.x) * (1 - Math.exp(-2.5 * dt));
      const gy = gapY();
      const vuln = bossVuln();
      if (vuln && boss.biteLock <= 0 && Math.abs(player.y - gy) < H * 0.07) {
        boss.hp -= 1;
        boss.biteLock = 0.85;
        player.chomp = 1;
        audio.bite(2);
        emit(player.x + H * 0.05, gy, 0, 8, H * 0.16);
        floater(player.x, gy - H * 0.04, "bite");
        if (boss.hp <= 0) onBossDown();
        else sync();
      } else if (!vuln) {
        const span = H * 0.045;
        for (let i = 0; i < 5; i++) {
          const y = H * (0.18 + i * 0.15) + Math.sin(boss.t * 1.5 + i * 1.3) * H * 0.05;
          if (Math.abs(y - gy) < H * 0.1) continue;
          if (Math.abs(player.y - y) < span) hurt();
        }
      }
    }

    const body = bodyOf("angler", player.x, player.y, 1);
    for (let i = ents.length - 1; i >= 0; i--) {
      const e = ents[i];
      if (e.kind === "diver") {
        e.y += e.vy * dt;
        e.x -= scroll * 0.15 * dt;
      } else if (!e.eaten) {
        e.x -= scroll * dt * (e.kind === "turtle" ? 0.55 : 1);
      }
      e.anim += dt * (e.kind === "jelly" ? 5 : 8);
      if (e.eaten && (e.kind === "shark" || e.kind === "fish")) {
        e.eatT -= dt;
        const m = mouthPos();
        const pull = Math.min(1, dt * 22);
        e.x += (m.x - e.x) * pull;
        e.y += (m.y - e.y) * pull;
        e.scale *= Math.exp(-10 * dt);
        const swallowed = Math.hypot(e.x - m.x, e.y - m.y) < H * 0.015;
        if (e.eatT <= 0 || swallowed) {
          awardEat(e);
          ents.splice(i, 1);
        }
        continue;
      }
      const bob = Math.sin(time * 2 + e.bob) * H * 0.006;
      if (e.kind === "shark") {
        const hit = bodyOf("shark", e.x, e.y + bob, e.scale);
        if (ellHit(body.x, body.y, body.rx, body.ry, hit.x, hit.y, hit.rx, hit.ry)) {
          player.chomp = 1;
          awardEat(e);
          ents.splice(i, 1);
          continue;
        }
      } else if (e.kind === "fish") {
        const rx = H * 0.03 * e.scale;
        if (ellHit(body.x, body.y, body.rx, body.ry, e.x, e.y, rx, rx * 0.6)) {
          player.chomp = 1;
          awardEat(e);
          ents.splice(i, 1);
          continue;
        }
      } else if (e.kind === "jelly") {
        const hit = bodyOf("jelly", e.x, e.y + bob, e.scale);
        if (ellHit(body.x, body.y, body.rx, body.ry, hit.x, hit.y, hit.rx, hit.ry)) hurt();
      } else if (e.kind === "diver" && !e.used) {
        if (ellHit(body.x, body.y, body.rx, body.ry, e.x, e.y, H * 0.04, H * 0.05)) {
          catchDiver(e);
          ents.splice(i, 1);
          continue;
        }
      } else if (e.kind === "turtle" && !e.used) {
        if (ellHit(body.x, body.y, body.rx, body.ry, e.x, e.y, H * 0.05, H * 0.03)) {
          e.used = true;
          if (player.shell <= 0) {
            player.shell = 1;
            floater(e.x, e.y, "shell");
            sync();
          }
        }
      }
      if (e.x < -H * 0.4 || e.y > H + 40) ents.splice(i, 1);
    }

    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.life -= dt;
      if (s.kind === "missile") {
        let tx = s.x + H;
        let ty = s.y;
        let bestD = 1e9;
        for (const e of ents) {
          if (e.eaten || e.kind === "turtle" || e.kind === "diver") continue;
          const d = (e.x - s.x) ** 2 + (e.y - s.y) ** 2;
          if (e.x > player.x && d < bestD) {
            bestD = d;
            tx = e.x;
            ty = e.y;
          }
        }
        if (boss && mode === "boss") {
          const gy = gapY();
          const d = (boss.x - s.x) ** 2 + (gy - s.y) ** 2;
          if (d < bestD) {
            tx = boss.x;
            ty = gy;
          }
        }
        const dx = tx - s.x;
        const dy = ty - s.y;
        const mag = Math.hypot(dx, dy) || 1;
        const spd = H * (0.75 + s.rank * 0.08);
        s.vx += (dx / mag) * spd * dt * 3;
        s.vy += (dy / mag) * spd * dt * 3;
        const vm = Math.hypot(s.vx, s.vy) || 1;
        s.vx = (s.vx / vm) * spd;
        s.vy = (s.vy / vm) * spd;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        let hit = false;
        for (let k = ents.length - 1; k >= 0 && !hit; k--) {
          const e = ents[k];
          if (e.eaten || e.kind === "turtle" || e.kind === "diver") continue;
          if ((e.x - s.x) ** 2 + (e.y - s.y) ** 2 < (H * 0.05) ** 2) {
            if (e.kind === "jelly") ents.splice(k, 1);
            else {
              e.eaten = true;
              e.eatT = 0.1;
            }
            hit = true;
          }
        }
        if (!hit && boss && (boss.x - s.x) ** 2 + (gapY() - s.y) ** 2 < (H * 0.08) ** 2) {
          boss.hp -= 1;
          hit = true;
          if (boss.hp <= 0) onBossDown();
        }
        if (hit || s.life <= 0 || s.x > W + 20) shots.splice(i, 1);
      } else {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.life <= 0) {
          explode(s.x, s.y, H * (0.16 + s.rank * 0.03), 1 + Math.floor(s.rank / 2));
          shots.splice(i, 1);
        }
      }
    }

    if (Math.floor(runTime) !== hud.time) sync();
  }

  function frameOf(kind: "angler" | "shark" | "jelly", anim: number) {
    const frames = sprites[kind];
    if (!frames.length) return undefined;
    const i = Math.floor(anim) % frames.length;
    return frames[(i + frames.length) % frames.length];
  }
  function drawSprite(
    img: HTMLImageElement | undefined,
    x: number,
    y: number,
    visualH: number,
    kind: "angler" | "shark" | "jelly",
    rot: number,
    alpha: number,
    sx = 1,
    sy = 1,
  ) {
    if (!img) return;
    const { drawH } = sizes(kind, visualH);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(sx, sy);
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, -drawH / 2, -drawH / 2, drawH, drawH);
    ctx.restore();
  }

  function drawCoral() {
    const spacing = 34;
    const start = Math.floor(drift / spacing) - 1;
    const count = Math.ceil(W / spacing) + 3;
    for (let n = 0; n < count; n++) {
      const index = start + n;
      const x = index * spacing - drift;
      const top = H - coralH(index);
      ctx.fillStyle = n % 2 === 0 ? "#0f4d42" : "#146356";
      ctx.beginPath();
      ctx.moveTo(x, H + 8);
      ctx.lineTo(x + 4, top + 16);
      ctx.quadraticCurveTo(x + 16, top - 6, x + 28, top + 18);
      ctx.lineTo(x + 34, H + 8);
      ctx.fill();
      ctx.fillStyle = "#e7b15a";
      ctx.beginPath();
      ctx.arc(x + 16, top + 2, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFishShape(x: number, y: number, s: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#9fd7e2";
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 1.4, s * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-s * 1.2, 0);
    ctx.lineTo(-s * 2, -s * 0.45);
    ctx.lineTo(-s * 2, s * 0.45);
    ctx.fill();
    ctx.restore();
  }
  function drawDiver(x: number, y: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#d7efe8";
    ctx.fillRect(-7, -16, 14, 22);
    ctx.fillStyle = "#163848";
    ctx.fillRect(-8, -6, 6, 16);
    ctx.beginPath();
    ctx.arc(0, -22, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#8fd0ea";
    ctx.fill();
    ctx.fillStyle = "#e7f4f0";
    ctx.fillRect(-10, 6, 8, 4);
    ctx.fillRect(2, 6, 8, 4);
    ctx.restore();
  }
  function drawTurtle(x: number, y: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#1f8a62";
    ctx.beginPath();
    ctx.ellipse(0, 0, 22, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d7efe8";
    ctx.beginPath();
    ctx.arc(16, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBoss() {
    if (!boss) return;
    const gy = gapY();
    const vuln = bossVuln();
    const homeX = boss.x;
    const sailX = vuln ? player.x + H * 0.09 : homeX;
    const sailY = vuln ? gy : H * 0.34;
    ctx.strokeStyle = "rgba(186, 120, 220, 0.85)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      const y = H * (0.18 + i * 0.15) + Math.sin(boss.t * 1.5 + i * 1.3) * H * 0.05;
      if (vuln && Math.abs(y - gy) < H * 0.11) continue;
      ctx.beginPath();
      ctx.moveTo(homeX, H * 0.3);
      ctx.quadraticCurveTo(homeX - W * 0.18, y, player.x + H * 0.02, y);
      ctx.stroke();
    }
    ctx.fillStyle = vuln ? "rgba(240, 180, 41, 0.35)" : "rgba(120, 70, 170, 0.25)";
    ctx.beginPath();
    ctx.ellipse(sailX, sailY, H * 0.09, H * 0.07, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = vuln ? "#f0b429" : "#c9a0e0";
    ctx.beginPath();
    ctx.ellipse(sailX, sailY - H * 0.01, H * 0.07, H * 0.045, -0.5, Math.PI, 0);
    ctx.fill();
    if (vuln) {
      ctx.fillStyle = "#07141c";
      ctx.font = `600 ${Math.round(H * 0.028)}px Outfit, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("BITE", sailX, sailY + 4);
    }
  }

  function drawWorld() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1a6d86");
    g.addColorStop(0.16, "#0e4558");
    g.addColorStop(0.5, "#123844");
    g.addColorStop(1, "#062028");
    ctx.fillStyle = g;
    ctx.fillRect(-30, -30, W + 60, H + 60);

    for (const m of motes) {
      const px = ((m.x * W - drift * m.z * 0.12) % (W + 20) + W + 20) % (W + 20);
      ctx.globalAlpha = 0.2 + m.z * 0.3;
      ctx.fillStyle = m.z > 0.75 ? "#f0b429" : "#c5ebe4";
      ctx.beginPath();
      ctx.arc(px, m.y * H, m.s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const top = H * 0.07;
    ctx.fillStyle = "rgba(210, 244, 236, 0.16)";
    ctx.fillRect(0, 0, W, top);
    ctx.strokeStyle = "rgba(232, 244, 240, 0.4)";
    ctx.beginPath();
    ctx.moveTo(0, top);
    ctx.lineTo(W, top);
    ctx.stroke();

    drawCoral();

    const lists = phase === "menu" ? decor : ents;
    for (const e of lists) {
      if (e.kind === "jelly") {
        const bob = Math.sin(time * 2 + e.bob) * 4;
        const vh = H * 0.075 * e.scale;
        drawSprite(frameOf("jelly", e.anim), e.x, e.y + bob, vh, "jelly", 0, 1);
      }
    }
    for (const e of lists) {
      const bob = Math.sin(time * 2 + e.bob) * 4;
      if (e.kind === "shark") {
        const vh = H * 0.15 * e.scale;
        drawSprite(frameOf("shark", e.anim), e.x, e.y + bob, vh, "shark", e.eaten ? 0.4 : 0, e.eaten ? 0.85 : 1);
      } else if (e.kind === "fish") drawFishShape(e.x, e.y, H * 0.018 * e.scale);
      else if (e.kind === "diver") drawDiver(e.x, e.y);
      else if (e.kind === "turtle") drawTurtle(e.x, e.y);
    }

    if (mode === "boss") drawBoss();

    const lure = lurePos();
    const pulse = 0.7 + Math.sin(time * 6) * 0.3;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const glow = ctx.createRadialGradient(lure.x, lure.y, 0, lure.x, lure.y, H * 0.055);
    glow.addColorStop(0, `rgba(240, 180, 41, ${0.7 * pulse})`);
    glow.addColorStop(1, "rgba(240, 180, 41, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(lure.x, lure.y, H * 0.055, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const stretch = clamp(player.vy / (H * 0.8), -0.25, 0.3);
    const img = frameOf("angler", player.anim);
    const alpha = player.iframes > 0 && Math.sin(time * 40) > 0 ? 0.55 : 1;
    ctx.filter = "drop-shadow(0 0 10px rgba(186, 230, 220, 0.8))";
    drawSprite(img, player.x, player.y, anglerVisualH(), "angler", player.rot, alpha, 1 - stretch * 0.2, 1 + stretch * 0.2);
    ctx.filter = "none";

    if (player.chomp > 0.05) {
      const open = Math.sin(Math.min(1, player.chomp) * Math.PI);
      const m = mouthPos();
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(player.rot);
      ctx.fillStyle = "#1a0a10";
      ctx.beginPath();
      ctx.ellipse(0, 0, m.visualW * 0.28 * open + 2, m.visualH * 0.55 * open + 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f0b429";
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-2, side * 2);
        ctx.lineTo(m.visualW * 0.16 * open, side * m.visualH * 0.28 * open);
        ctx.lineTo(4, side * 3);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.strokeStyle = "#f0b429";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lure.hx, lure.hy);
    ctx.quadraticCurveTo((lure.hx + lure.x) / 2, lure.hy - H * 0.02, lure.x, lure.y);
    ctx.stroke();
    ctx.fillStyle = "#ffe7a3";
    ctx.beginPath();
    ctx.arc(lure.x, lure.y, 4 + pulse * 3, 0, Math.PI * 2);
    ctx.fill();

    if (laserTime > 0 || laserTick > 0) {
      ctx.strokeStyle = "rgba(240, 180, 41, 0.9)";
      ctx.lineWidth = laserTime > 0 ? 8 : 3;
      ctx.beginPath();
      ctx.moveTo(lure.x, lure.y);
      ctx.lineTo(W + 10, lure.y);
      ctx.stroke();
    }

    for (const s of shots) {
      if (s.kind === "missile") {
        ctx.fillStyle = "#f0b429";
        ctx.beginPath();
        ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = "#163848";
        ctx.beginPath();
        ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#f0b429";
        ctx.stroke();
      }
    }

    for (const p of particles) {
      if (!p.on) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.kind === 0 ? "#f0b429" : p.kind === 2 ? "#c6f24e" : p.kind === 3 ? "#8a5a32" : "#d5f4ee";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.font = `600 ${Math.round(H * 0.03)}px Fraunces, Georgia, serif`;
    for (const f of floaters) {
      if (!f.on) continue;
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.fillStyle = "#f0b429";
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    if (banner > 0 && phase === "play") {
      ctx.fillStyle = "#e7f4f0";
      ctx.font = `600 ${Math.round(H * 0.05)}px Fraunces, Georgia, serif`;
      ctx.fillText(mode === "boss" ? "Man-of-war" : `Level ${level}`, W / 2, H * 0.2);
    }
    if (poopFlash > 0) {
      ctx.fillStyle = `rgba(90, 54, 30, ${poopFlash * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.75);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  function render() {
    if (W < 2) return;
    const mag = reduceMotion ? 0 : trauma * trauma * Math.min(W, H) * 0.014;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(Math.sin(shakeT * 40) * mag, Math.cos(shakeT * 33) * mag);
    drawWorld();
    ctx.restore();
  }

  function frame(now: number) {
    if (stopped) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += dt;
    const simulate = !paused || phase === "menu";
    while (acc >= STEP) {
      if (simulate) update(STEP);
      acc -= STEP;
    }
    render();
    raf = requestAnimationFrame(frame);
  }

  function layout() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    player.x = phase === "menu" || phase === "boot" ? W * 0.5 : fishX();
  }
  const ro = new ResizeObserver(() => layout());
  ro.observe(canvas);
  layout();

  function onHide() {
    if (document.hidden && phase === "play" && !paused) {
      paused = true;
      sync();
    } else audio.resume();
  }
  document.addEventListener("visibilitychange", onHide);

  void (async () => {
    try {
      const [angler, shark, jelly] = await Promise.all([
        loadImages(SRC.angler),
        loadImages(SRC.shark),
        loadImages(SRC.jelly),
      ]);
      if (stopped) return;
      sprites.angler = angler;
      sprites.shark = shark;
      sprites.jelly = jelly;
      best = readNum(BEST_KEY);
      bestAtStart = best;
      board = readBoard();
      audio.muted = readMuted();
      audio.setMuted(audio.muted);
      phase = "menu";
      sync();
    } catch {
      if (!stopped) publish({ ...INITIAL, error: "The abyss wouldn't load. Reload to try again." });
    }
  })();

  raf = requestAnimationFrame(frame);

  const api: LureApi = {
    pointer() {
      if (stopped || phase === "boot") return;
      audio.unlock();
      if (phase === "menu") {
        begin();
        wantFlap = true;
        return;
      }
      if (phase !== "play" || paused || !player.alive) return;
      wantFlap = true;
    },
    toggleMute() {
      audio.unlock();
      audio.setMuted(!audio.muted);
      try {
        localStorage.setItem(MUTE_KEY, audio.muted ? "1" : "0");
      } catch {
        /* ignore */
      }
      sync();
    },
    togglePause() {
      if (phase !== "play") return;
      paused = !paused;
      sync();
    },
    diveAgain() {
      audio.unlock();
      begin();
      wantFlap = true;
    },
    surface() {
      audio.unlock();
      phase = "menu";
      paused = false;
      reason = null;
      player.alive = true;
      player.vy = 0;
      ents.length = 0;
      shots.length = 0;
      boss = null;
      decor.length = 0;
      sync();
    },
    choosePower(kind) {
      if (phase !== "play" || paused || pendingPowers <= 0) return;
      pendingPowers -= 1;
      if (kind === "poop") {
        firePoop();
      } else if (laserTime <= 0) {
        laserTime = 2.2;
        laserTick = 0;
        audio.zap();
      } else {
        laserLeft += 1;
      }
      sync();
    },
    chooseWeapon(kind) {
      if (phase !== "upgrade") return;
      ranks[kind] = Math.min(3, ranks[kind] + 1);
      weapon = kind;
      cool = 0.2;
      level += 1;
      startLevel();
    },
    fire() {
      audio.unlock();
      fireEquipped();
    },
    useStored(kind) {
      if (phase !== "play" || paused) return;
      if (kind === "poop" && poopLeft > 0) {
        poopLeft -= 1;
        firePoop();
        sync();
      } else if (kind === "laser" && laserLeft > 0 && laserTime <= 0) {
        laserLeft -= 1;
        laserTime = 3.4;
        laserTick = 0;
        audio.zap();
        sync();
      }
    },
    destroy() {
      stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      reduce.removeEventListener("change", onReduce);
      document.removeEventListener("visibilitychange", onHide);
    },
  };
  return api;
}
