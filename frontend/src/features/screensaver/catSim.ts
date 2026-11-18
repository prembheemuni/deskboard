// Cat screensaver simulation. Two cats share the screen:
//  - when there is food, each walks to the nearest piece the other isn't after and eats it;
//  - every so often it rains: they run home to their house in the corner and come back out after;
//  - when there is none, they play catch (no food appears on its own; a click drops more): one throws the ball towards the other, who walks over,
//    picks it up and throws it back once the first cat has moved to a new spot.
// Pure state + step function (no DOM), so it can be tested and drawn by any renderer.

export type FoodKind = 0 | 1 | 2; // fish, kibble, treat
export type CatState = "walk" | "eat" | "sit" | "throw";

export interface Food {
  id: number;
  x: number;
  y: number;
  kind: FoodKind;
  age: number; // seconds since it appeared (for the pop-in animation)
  bite: number; // 0..1 how much has been eaten
}

export interface Crumb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface Cat {
  id: number; // index in world.cats
  coat: number; // which fur palette to draw with
  x: number; // feet position
  y: number;
  dir: 1 | -1; // facing right / left
  heading: number; // direction of travel in radians (cats steer, they don't snap)
  facing: number; // drawn width -1..1: eases through 0 when turning round, shrinks when walking to/from the viewer
  state: CatState;
  stateT: number; // seconds in the current state
  phase: number; // position in the walk cycle, 0..1 (advances with distance walked, so paws never slide)
  full: number; // 0..1, the cat gets rounder as it eats and slims back down
  target: number | null; // id of the food it is going for / eating
  goal: Point | null; // where it is walking to during play
  inside: boolean; // sheltering in the house (not drawn, just eyes in the doorway)
  outAt: number; // world time at which it comes back out after the rain
}

export interface Ball {
  x: number; // ground position
  y: number;
  z: number; // height above the ground
  vx: number;
  vy: number;
  vz: number;
  spin: number; // rotation, for drawing
  holder: number | null; // cat id holding it in its mouth
  receiver: number | null; // cat id that should go and fetch it
}

export interface World {
  w: number;
  h: number;
  scale: number; // cat/food size multiplier for the screen size
  foods: Food[];
  crumbs: Crumb[];
  cats: Cat[];
  ball: Ball;
  eaten: number;
  nextId: number;
  time: number;
  rain: Rain;
}

export interface Rain {
  on: boolean;
  left: number; // seconds until the weather changes
  level: number; // 0..1, eases in and out, for drawing
}

/** The cats' house in the bottom-left corner. (x, bottom) is its front-left corner on the ground. */
export interface House {
  x: number;
  bottom: number;
  w: number;
  h: number;
  doorX: number;
}

export const WALK_SPEED = 80; // px per second, before scaling (an unhurried cat walk, ~2 steps a second)
export const EAT_TIME = 1.3;
export const THROW_TIME = 0.4; // wind-up before the ball leaves the mouth
export const BALL_RADIUS = 7; // before scaling
/** Distance the body moves in one full walk cycle (all four paws stepping once), before scaling. */
export const STRIDE = 40;
const PAUSE_AFTER_EAT = 0.45;
const WAIT_BEFORE_THROW = 0.6;
const GRAVITY = 900;
const ROLL_FRICTION = 3.2;
const TURN_RATE = 3; // radians per second a walking cat can turn
const RUN_FACTOR = 1.9; // how much faster than a walk they trot home in the rain
const RAIN_FIRST = [30, 70]; // seconds until the first shower
const RAIN_GAP = [45, 100]; // dry spell between showers
const RAIN_LENGTH = [12, 22];
const CRUMB_COLORS = ["#f8d3a8", "#c9a27a", "#9cc3de"];

const sizeFor = (w: number, h: number) => Math.max(0.8, Math.min(1.7, Math.min(w, h) / 480));

/**
 * Perspective: things higher up the screen are further away, so they're drawn smaller and move slower.
 * 0.78 at the top of the ground, 1.1 at the bottom.
 */
export function depth(world: World, y: number): number {
  const top = topMargin(world);
  const k = Math.min(1, Math.max(0, (y - top) / Math.max(1, world.h - top)));
  return 0.78 + 0.32 * k;
}

/** Distance from the cat's feet to its mouth, horizontally, for a cat standing at height y. */
export const mouthOffset = (world: World, y: number) => 36 * world.scale * depth(world, y);

function makeCat(id: number, x: number, y: number, dir: 1 | -1): Cat {
  const heading = dir === 1 ? 0 : Math.PI;
  return {
    id,
    coat: id,
    x,
    y,
    dir,
    heading,
    facing: dir,
    state: "sit",
    stateT: 0,
    phase: 0,
    full: 0,
    target: null,
    goal: null,
    inside: false,
    outAt: 0,
  };
}

export function createWorld(w: number, h: number, initialFood = 7, rand = Math.random): World {
  const scale = sizeFor(w, h);
  const world: World = {
    w,
    h,
    scale,
    foods: [],
    crumbs: [],
    cats: [makeCat(0, w * 0.35, h * 0.6, 1), makeCat(1, w * 0.65, h * 0.64, -1)],
    ball: { x: w / 2, y: h * 0.78, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, holder: null, receiver: null },
    eaten: 0,
    nextId: 1,
    time: 0,
    rain: { on: false, left: between(RAIN_FIRST, rand), level: 0 },
  };
  scatterFood(world, initialFood, rand);
  return world;
}

const between = ([lo, hi]: number[], rand: () => number) => lo + rand() * (hi - lo);

const topMargin = (world: World) => 72 * world.scale; // room for a cat's head above its feet
const sideMargin = (world: World) => 22 * world.scale;

function clampToGround(world: World, x: number, y: number): [number, number] {
  const pad = sideMargin(world);
  return [Math.min(world.w - pad, Math.max(pad, x)), Math.min(world.h - pad, Math.max(topMargin(world), y))];
}

export function houseOf(world: World): House {
  const w = 120 * world.scale;
  const h = 100 * world.scale;
  const x = 14 * world.scale;
  return { x, bottom: world.h - sideMargin(world), w, h, doorX: x + w * 0.5 };
}

/** Is (x, y) on the patch of ground the house stands on (plus a margin)? */
function onHouse(world: World, x: number, y: number, margin: number): boolean {
  const H = houseOf(world);
  return x < H.x + H.w + margin && y > H.bottom - H.h * 0.55 - margin;
}

export function addFood(world: World, x: number, y: number, kind?: FoodKind, rand = Math.random): Food {
  let [fx, fy] = clampToGround(world, x, y);
  if (onHouse(world, fx, fy, 8 * world.scale)) fx = houseOf(world).x + houseOf(world).w + 18 * world.scale; // drop it beside the house
  const food: Food = { id: world.nextId++, x: fx, y: fy, kind: kind ?? (Math.floor(rand() * 3) as FoodKind), age: 0, bite: 0 };
  world.foods.push(food);
  return food;
}

export function scatterFood(world: World, count: number, rand = Math.random): void {
  for (let i = 0; i < count; i++) addFood(world, rand() * world.w, rand() * world.h, undefined, rand);
}

export function resizeWorld(world: World, w: number, h: number): void {
  world.w = w;
  world.h = h;
  world.scale = sizeFor(w, h);
  for (const f of world.foods) [f.x, f.y] = clampToGround(world, f.x, f.y);
  for (const c of world.cats) {
    [c.x, c.y] = clampToGround(world, c.x, c.y);
    if (c.goal) [c.goal.x, c.goal.y] = clampToGround(world, c.goal.x, c.goal.y);
  }
  [world.ball.x, world.ball.y] = clampToGround(world, world.ball.x, world.ball.y);
}

function setState(cat: Cat, state: CatState): void {
  if (cat.state === state) return;
  cat.state = state;
  cat.stateT = 0;
}

/** Turn to face x (for a cat that isn't walking); the drawing animates the turn. */
const faceTowards = (cat: Cat, x: number, deadZone: number) => {
  if (Math.abs(x - cat.x) > deadZone) cat.dir = x > cat.x ? 1 : -1;
  cat.heading = cat.dir === 1 ? 0 : Math.PI;
};

const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/**
 * Walk towards (gx, gy), steering like a cat: it turns at a limited rate (so it curves round instead of
 * snapping), slows down for sharp turns, and heads straight in for the last few steps. Returns true once there.
 */
function walkTo(world: World, cat: Cat, gx: number, gy: number, dt: number, speedFactor: number): boolean {
  const dx = gx - cat.x;
  const dy = gy - cat.y;
  const dist = Math.hypot(dx, dy);
  const d = depth(world, cat.y);
  const speed = WALK_SPEED * world.scale * d * speedFactor;
  if (dist <= speed * dt + 0.5) {
    cat.x = gx;
    cat.y = gy;
    return true;
  }
  setState(cat, "walk");

  const want = Math.atan2(dy, dx);
  if (dist < 26 * world.scale * d) {
    cat.heading = want; // final approach: line up exactly
  } else {
    const turn = TURN_RATE * speedFactor * dt;
    cat.heading += Math.max(-turn, Math.min(turn, angleDiff(want, cat.heading)));
  }
  // nearly stop to turn round, ease off for sharp turns
  const turning = Math.abs(angleDiff(want, cat.heading));
  const slow = turning > Math.PI / 2 ? 0.35 : 0.5 + 0.5 * Math.cos(turning);
  const move = speed * slow * dt;
  [cat.x, cat.y] = clampToGround(world, cat.x + Math.cos(cat.heading) * move, cat.y + Math.sin(cat.heading) * move);
  // which way the body points (with a little hysteresis so it doesn't flicker when walking straight up/down)
  const c = Math.cos(cat.heading);
  if (Math.abs(c) > 0.2) cat.dir = c > 0 ? 1 : -1;
  cat.phase = (cat.phase + move / (STRIDE * world.scale * d)) % 1;
  return false;
}

/** Ease the drawn width towards where the cat is facing; walking towards/away from the viewer foreshortens it. */
function updateFacing(cat: Cat, dt: number): void {
  const foreshorten = cat.state === "walk" ? Math.max(0.5, Math.abs(Math.cos(cat.heading))) : 1;
  const target = cat.dir * foreshorten;
  cat.facing += (target - cat.facing) * Math.min(1, dt * 7);
}

/**
 * Has another cat got dibs on this food? Yes if it's already eating it, or going for it and clearly
 * closer. On a near-tie the lower id keeps it, so two cats never keep swapping targets.
 */
function takenByOther(world: World, food: Food, cat: Cat): boolean {
  const margin = 12 * world.scale;
  const mine = Math.hypot(food.x - cat.x, food.y - cat.y);
  return world.cats.some((other) => {
    if (other === cat || other.inside || other.target !== food.id) return false;
    if (other.state === "eat") return true;
    const theirs = Math.hypot(food.x - other.x, food.y - other.y);
    return theirs + margin < mine || (Math.abs(theirs - mine) <= margin && other.id < cat.id);
  });
}

/** The food this cat should go for: it sticks with its current pick unless that's been taken, else the nearest free one. */
export function nearestFood(world: World, cat: Cat): Food | null {
  const current = cat.target === null ? undefined : world.foods.find((f) => f.id === cat.target);
  if (current && !takenByOther(world, current, cat)) return current;
  let best: Food | null = null;
  let bestD = Infinity;
  for (const f of world.foods) {
    if (takenByOther(world, f, cat)) continue;
    const d = Math.hypot(f.x - cat.x, f.y - cat.y);
    if (d < bestD) [best, bestD] = [f, d];
  }
  return best;
}

function burst(world: World, x: number, y: number, rand: () => number, count = 9): void {
  for (let i = 0; i < count; i++) {
    const a = -Math.PI * (0.15 + 0.7 * rand());
    const v = (60 + rand() * 90) * world.scale;
    world.crumbs.push({
      x,
      y: y - 4 * world.scale,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: 0.5 + rand() * 0.4,
      color: CRUMB_COLORS[Math.floor(rand() * CRUMB_COLORS.length)],
    });
  }
}

/**
 * Where a cat should stand to put its mouth on something at (x, y): on the side it is already on,
 * unless that would be off-screen (e.g. food against the right edge), then the other side.
 */
function standingSpot(world: World, cat: Cat, x: number, y: number): { x: number; side: 1 | -1 } {
  const m = mouthOffset(world, y);
  const pad = sideMargin(world);
  let side: 1 | -1 = x >= cat.x ? 1 : -1;
  const sx = x - side * m;
  if (sx < pad || sx > world.w - pad) side = side === 1 ? -1 : 1;
  return { x: x - side * m, side };
}

// ---------- eating ----------

function feed(world: World, cat: Cat, dt: number, speedFactor: number, rand: () => number): void {
  if (cat.state === "eat") {
    const food = world.foods.find((f) => f.id === cat.target);
    if (!food) {
      cat.target = null;
      setState(cat, "sit");
      return;
    }
    food.bite = Math.min(1, cat.stateT / EAT_TIME);
    if (cat.stateT >= EAT_TIME) {
      world.foods = world.foods.filter((f) => f.id !== food.id);
      world.eaten++;
      cat.full = Math.min(1, cat.full + 0.07);
      cat.target = null;
      burst(world, food.x, food.y, rand);
      setState(cat, "sit");
    } else if (Math.floor(cat.stateT * 3) !== Math.floor((cat.stateT - dt) * 3)) {
      burst(world, food.x, food.y, rand, 3); // little crumbs while munching
    }
    return;
  }

  if (cat.state === "sit" && cat.stateT < PAUSE_AFTER_EAT && cat.full > 0) return; // a moment to swallow

  const food = nearestFood(world, cat);
  cat.target = food?.id ?? null;
  if (!food) {
    setState(cat, "sit");
    return;
  }
  const { x: spotX, side } = standingSpot(world, cat, food.x, food.y);
  if (walkTo(world, cat, spotX, food.y, dt, speedFactor)) {
    cat.dir = side;
    cat.heading = side === 1 ? 0 : Math.PI;
    setState(cat, "eat");
  }
}

// ---------- playing catch ----------

/** A random spot well away from `from`, so every throw is to a different place. */
export function pickSpot(world: World, from: Point, rand: () => number): Point {
  const padX = 60 * world.scale;
  const top = 90 * world.scale;
  const bottom = world.h - 30 * world.scale;
  // far enough to be a proper throw, near enough that the walk there doesn't drag on (wide screens)
  const want = Math.min(world.w, world.h) * 0.45;
  const most = Math.max(want * 1.8, 330 * world.scale);
  let best: Point = { x: world.w / 2, y: (top + bottom) / 2 };
  let bestMiss = Infinity;
  for (let i = 0; i < 16; i++) {
    const p = { x: padX + rand() * Math.max(0, world.w - 2 * padX), y: top + rand() * Math.max(0, bottom - top) };
    if (onHouse(world, p.x, p.y, 30 * world.scale)) continue;
    const d = Math.hypot(p.x - from.x, p.y - from.y);
    const miss = d < want ? want - d : d > most ? d - most : 0;
    if (miss === 0) return p;
    if (miss < bestMiss) [best, bestMiss] = [p, miss];
  }
  return best;
}

function mouthOf(world: World, cat: Cat): Point {
  return { x: cat.x + cat.dir * mouthOffset(world, cat.y), y: cat.y };
}

function throwBall(world: World, thrower: Cat, catcher: Cat, rand: () => number): void {
  const { ball, scale } = world;
  // the sitting cat holds the ball just in front of its face
  const from = { x: thrower.x + thrower.dir * 24 * scale * depth(world, thrower.y), y: thrower.y };
  const to = mouthOf(world, catcher);
  // aim a bit short of the catcher: the ball bounces and rolls the rest of the way
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const short = Math.min(dist * 0.4, 70 * scale);
  const [lx, ly] = clampToGround(
    world,
    to.x - (dx / dist) * short + (rand() - 0.5) * 30 * scale,
    to.y - (dy / dist) * short + (rand() - 0.5) * 20 * scale,
  );
  const t = Math.max(0.55, Math.min(1.1, dist / (330 * scale)));
  const g = GRAVITY * scale;
  ball.x = from.x;
  ball.y = from.y;
  ball.z = 36 * scale * depth(world, thrower.y);
  ball.vx = (lx - from.x) / t;
  ball.vy = (ly - from.y) / t;
  ball.vz = (0.5 * g * t * t - ball.z) / t; // lands at (lx, ly) after t seconds
  ball.holder = null;
  ball.receiver = catcher.id;
  // the thrower heads off somewhere new while the other one fetches
  thrower.goal = pickSpot(world, catcher, rand);
  setState(thrower, "sit");
}

function goToGoal(world: World, cat: Cat, dt: number, speedFactor: number): void {
  if (!cat.goal) {
    setState(cat, "sit");
    return;
  }
  if (walkTo(world, cat, cat.goal.x, cat.goal.y, dt, speedFactor)) {
    cat.goal = null;
    setState(cat, "sit");
  }
}

function play(world: World, dt: number, speedFactor: number, rand: () => number): void {
  const { ball, cats } = world;

  if (ball.holder === null) {
    // someone fetches the ball: the one it was thrown to, or whoever is closest
    if (ball.receiver === null) {
      const d = (c: Cat) => Math.hypot(c.x - ball.x, c.y - ball.y);
      ball.receiver = cats.reduce((a, b) => (d(b) < d(a) ? b : a)).id;
    }
    const fetcher = cats[ball.receiver];
    for (const c of cats) {
      if (c === fetcher) continue;
      goToGoal(world, c, dt, speedFactor);
      if (!c.goal) faceTowards(c, ball.x, 6 * world.scale); // watch the ball
    }

    const { x: spotX, side } = standingSpot(world, fetcher, ball.x, ball.y);
    const reach = 8 * world.scale;
    const slow = Math.hypot(ball.vx, ball.vy) < 60 * world.scale && ball.z < 6 * world.scale;
    const close = Math.hypot(spotX - fetcher.x, ball.y - fetcher.y) <= reach;
    if (close && slow) {
      fetcher.dir = side;
      fetcher.heading = side === 1 ? 0 : Math.PI;
      ball.holder = fetcher.id;
      ball.receiver = null;
      ball.vx = ball.vy = ball.vz = 0;
      setState(fetcher, "sit");
      fetcher.stateT = 0;
      // the other cat moves somewhere new to be thrown to (if it isn't already on its way)
      for (const c of cats) if (c !== fetcher && !c.goal) c.goal = pickSpot(world, fetcher, rand);
    } else if (!close) {
      walkTo(world, fetcher, spotX, ball.y, dt, speedFactor);
    } else {
      setState(fetcher, "sit"); // right there, waiting for it to stop rolling
    }
    return;
  }

  const holder = cats[ball.holder];
  const others = cats.filter((c) => c !== holder);
  for (const c of others) {
    goToGoal(world, c, dt, speedFactor);
    if (!c.goal) faceTowards(c, holder.x, 6 * world.scale); // ready to be thrown to
  }
  const catcher = others[0];
  if (!catcher) return;

  if (holder.state === "throw") {
    if (holder.stateT >= THROW_TIME) throwBall(world, holder, catcher, rand);
    return;
  }
  if (holder.state === "walk") setState(holder, "sit");
  faceTowards(holder, catcher.x, 4 * world.scale);
  if (!catcher.goal && catcher.state === "sit" && holder.stateT > WAIT_BEFORE_THROW) setState(holder, "throw");
}

/** Drop the ball and forget the game, e.g. because food turned up. */
function stopPlaying(world: World): void {
  const { ball } = world;
  if (ball.holder !== null) {
    const cat = world.cats[ball.holder];
    const m = mouthOf(world, cat);
    [ball.x, ball.y] = clampToGround(world, m.x, m.y);
    ball.z = 14 * world.scale; // it falls out of the mouth
    ball.vx = ball.vy = ball.vz = 0;
    ball.holder = null;
  }
  ball.receiver = null;
  for (const c of world.cats) {
    c.goal = null;
    if (c.state === "throw") setState(c, "sit");
  }
}

function stepBall(world: World, dt: number): void {
  const { ball, scale } = world;
  if (ball.holder !== null) return;
  const g = GRAVITY * scale;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  if (ball.z > 0 || ball.vz > 0) {
    ball.vz -= g * dt;
    ball.z += ball.vz * dt;
    if (ball.z <= 0) {
      ball.z = 0;
      ball.vz = Math.abs(ball.vz) > 80 * scale ? -ball.vz * 0.45 : 0; // bounce, then settle
    }
  }
  if (ball.z === 0) {
    const k = Math.exp(-ROLL_FRICTION * dt);
    ball.vx *= k;
    ball.vy *= k;
    if (Math.hypot(ball.vx, ball.vy) < 4 * scale) ball.vx = ball.vy = 0;
  }
  // bounce off the screen edges
  const pad = sideMargin(world);
  if (ball.x < pad || ball.x > world.w - pad) {
    ball.x = Math.min(world.w - pad, Math.max(pad, ball.x));
    ball.vx *= -0.6;
  }
  const top = topMargin(world);
  if (ball.y < top || ball.y > world.h - pad) {
    ball.y = Math.min(world.h - pad, Math.max(top, ball.y));
    ball.vy *= -0.6;
  }
  // and off the house
  const H = houseOf(world);
  if (onHouse(world, ball.x, ball.y, 0) && ball.z < H.h * 0.8) {
    ball.x = H.x + H.w + 1;
    ball.vx = Math.abs(ball.vx) * 0.6;
  }
  ball.spin += (Math.hypot(ball.vx, ball.vy) * dt) / (BALL_RADIUS * scale);
}

// ---------- weather ----------

/** Start a shower now (lasting `seconds`, or a random length). */
export function startRain(world: World, seconds?: number, rand = Math.random): void {
  world.rain.on = true;
  world.rain.left = seconds ?? between(RAIN_LENGTH, rand);
}

/** Stop the rain now; the cats come out one after the other. */
export function stopRain(world: World, rand = Math.random): void {
  world.rain.on = false;
  world.rain.left = between(RAIN_GAP, rand);
  for (const c of world.cats) c.outAt = world.time + 0.6 + c.id * 1.1;
}

function stepWeather(world: World, dt: number, rand: () => number): void {
  const r = world.rain;
  r.left -= dt;
  if (r.left <= 0) {
    if (r.on) stopRain(world, rand);
    else startRain(world, undefined, rand);
  }
  r.level += ((r.on ? 1 : 0) - r.level) * Math.min(1, dt * 1.2);
}

/** Trot to the house door; disappear inside on arrival. */
function goHome(world: World, cat: Cat, dt: number, speedFactor: number): void {
  const H = houseOf(world);
  cat.target = null;
  cat.goal = null;
  if (walkTo(world, cat, H.doorX, H.bottom, dt, speedFactor * RUN_FACTOR)) {
    cat.inside = true;
    cat.outAt = Infinity;
    setState(cat, "sit");
  }
}

function comeOut(world: World, cat: Cat): void {
  const H = houseOf(world);
  cat.inside = false;
  cat.x = H.doorX;
  cat.y = H.bottom;
  cat.dir = 1;
  cat.heading = 0;
  cat.facing = 0.3; // stepping out of the doorway, turning to face the room
  cat.state = "sit";
  cat.stateT = 0;
}

/** Advance the simulation by dt seconds. `speedFactor` < 1 for reduced motion. */
export function step(world: World, dt: number, speedFactor = 1, rand = Math.random): void {
  world.time += dt;
  for (const c of world.cats) {
    c.stateT += dt;
    c.full = Math.max(0, c.full - dt * 0.005);
  }
  for (const f of world.foods) f.age += dt;
  stepWeather(world, dt, rand);

  if (world.rain.on) {
    // everyone home: drop the ball, leave the food
    stopPlaying(world);
    for (const c of world.cats) if (!c.inside) goHome(world, c, dt, speedFactor);
  } else {
    for (const c of world.cats) if (c.inside && world.time >= c.outAt) comeOut(world, c);
    const out = world.cats.filter((c) => !c.inside);
    if (world.foods.length > 0) {
      stopPlaying(world);
      for (const c of out) feed(world, c, dt, speedFactor, rand);
    } else {
      for (const c of out) {
        if (c.state === "eat") setState(c, "sit");
        c.target = null;
      }
      if (out.length === world.cats.length) play(world, dt, speedFactor, rand);
      else for (const c of out) setState(c, "sit"); // wait for the other one to come out
    }
  }

  stepBall(world, dt * speedFactor);

  const g = 420 * world.scale;
  for (const c of world.crumbs) {
    c.vy += g * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.life -= dt;
  }
  world.crumbs = world.crumbs.filter((c) => c.life > 0);
  for (const c of world.cats) updateFacing(c, dt);
}
