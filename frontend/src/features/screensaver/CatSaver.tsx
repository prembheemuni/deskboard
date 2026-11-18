import { useEffect, useRef } from "react";
import {
  addFood,
  BALL_RADIUS,
  createWorld,
  depth,
  EAT_TIME,
  resizeWorld,
  step,
  STRIDE,
  THROW_TIME,
  type Ball,
  type Cat,
  type Food,
  type House,
  type World,
  houseOf,
} from "./catSim";

interface Coat {
  fur: string;
  dark: string;
  belly: string;
}

const COATS: Coat[] = [
  { fur: "#f0a35e", dark: "#c47836", belly: "#f8d6ad" }, // orange tabby
  { fur: "#a3abb9", dark: "#6f7889", belly: "#e3e7ee" }, // grey tabby
];
const PINK = "#e9879a";
const EYE = "#1d1a17";
const SHADOW = "rgba(255,255,255,0.08)"; // soft grey ground shadow, visible on the black background
const BALL = "#ff5d73";
const BALL_STRIPE = "#ffe1e6";

type Ctx = CanvasRenderingContext2D;

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function poly(ctx: Ctx, pts: number[], fill: string) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawFood(ctx: Ctx, f: Food, scale: number) {
  // pop in with a little overshoot, shrink while being eaten
  const t = Math.min(1, f.age * 4);
  const pop = t < 1 ? 1 + Math.sin(t * Math.PI) * 0.3 : 1;
  const s = scale * pop * Math.max(0.05, 1 - f.bite);
  ctx.save();
  ctx.translate(f.x, f.y);
  ellipse(ctx, 0, 2 * scale, 12 * scale * Math.max(0.3, 1 - f.bite), 3.5 * scale, SHADOW);
  ctx.scale(s, s);
  if (f.kind === 0) {
    // fish
    poly(ctx, [-9, -5, -17, -11, -17, 1], "#5f97bf");
    ellipse(ctx, 0, -5, 11, 6, "#8cc0e2");
    ellipse(ctx, 6, -6, 1.6, 1.6, EYE);
    ctx.strokeStyle = "#5f97bf";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(1, -5, 4, -1.1, 1.1);
    ctx.stroke();
  } else if (f.kind === 1) {
    // kibble pile
    ellipse(ctx, -5, -3, 4.5, 3.5, "#9b6a3a");
    ellipse(ctx, 4, -3, 4.5, 3.5, "#ad7a45");
    ellipse(ctx, 0, -7.5, 4.5, 3.5, "#c08a52");
  } else {
    // heart treat
    ctx.beginPath();
    ctx.moveTo(0, -1);
    ctx.bezierCurveTo(-11, -8, -6, -17, 0, -11);
    ctx.bezierCurveTo(6, -17, 11, -8, 0, -1);
    ctx.fillStyle = "#e98aa6";
    ctx.fill();
  }
  ctx.restore();
}

/** The ball itself, centred on (x, y), in whatever units the context is scaled to. */
function drawBallShape(ctx: Ctx, x: number, y: number, r: number, spin: number) {
  ellipse(ctx, x, y, r, r, BALL);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = BALL_STRIPE;
  ctx.lineWidth = r * 0.35;
  ctx.beginPath();
  ctx.ellipse(x, y, r * Math.abs(Math.cos(spin)) + 0.5, r * 1.2, 0.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ellipse(ctx, x - r * 0.35, y - r * 0.4, r * 0.28, r * 0.2, "rgba(255,255,255,0.6)"); // shine
}

function drawLooseBall(ctx: Ctx, ball: Ball, scale: number) {
  const r = BALL_RADIUS * scale;
  const lift = Math.min(1, ball.z / (90 * scale));
  ellipse(ctx, ball.x, ball.y + 1 * scale, r * (1.1 - 0.5 * lift), r * 0.35 * (1.1 - 0.5 * lift), SHADOW);
  drawBallShape(ctx, ball.x, ball.y - ball.z - r, r, ball.spin);
}

function drawHead(ctx: Ctx, coat: Coat, hx: number, hy: number, eyesClosed: boolean, blink: boolean) {
  // ears
  poly(ctx, [hx - 11, hy - 6, hx - 7, hy - 21, hx, hy - 11], coat.fur);
  poly(ctx, [hx + 1, hy - 11, hx + 8, hy - 21, hx + 12, hy - 5], coat.fur);
  poly(ctx, [hx - 9, hy - 8, hx - 7, hy - 16, hx - 3, hy - 11], PINK);
  poly(ctx, [hx + 4, hy - 11, hx + 8, hy - 16, hx + 10, hy - 8], PINK);
  ellipse(ctx, hx, hy, 13, 12, coat.fur);
  ellipse(ctx, hx + 6, hy + 4, 7, 5, coat.belly); // muzzle
  // stripes on the forehead
  ctx.strokeStyle = coat.dark;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(hx - 3, hy - 10);
  ctx.lineTo(hx - 2, hy - 6);
  ctx.moveTo(hx + 2, hy - 11);
  ctx.lineTo(hx + 2, hy - 7);
  ctx.stroke();
  // eye
  ctx.strokeStyle = EYE;
  if (eyesClosed || blink) {
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(hx + 5, hy - 2, 2.6, 0.2, Math.PI - 0.2);
    ctx.stroke();
  } else {
    ellipse(ctx, hx + 5, hy - 2, 2.2, 2.8, EYE);
    ellipse(ctx, hx + 5.8, hy - 3, 0.8, 0.8, "#fff");
  }
  poly(ctx, [hx + 11, hy + 1, hx + 14, hy + 1, hx + 12.5, hy + 3], PINK); // nose
  // whiskers
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(hx + 10, hy + 4);
  ctx.lineTo(hx + 22, hy + 2);
  ctx.moveTo(hx + 10, hy + 5);
  ctx.lineTo(hx + 22, hy + 7);
  ctx.stroke();
}

function drawTail(ctx: Ctx, coat: Coat, x: number, y: number, sway: number) {
  ctx.strokeStyle = coat.fur;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x - 14, y - 4, x - 22 + sway, y - 18, x - 14 + sway * 1.4, y - 34);
  ctx.stroke();
  ctx.strokeStyle = coat.dark;
  ctx.beginPath();
  ctx.arc(x - 14 + sway * 1.4, y - 34, 0.1, 0, Math.PI * 2);
  ctx.stroke();
}

// ---------- walking legs ----------

const TAU = Math.PI * 2;
const STANCE = 0.62; // share of the cycle each paw spends planted on the ground
const LIFT = 5; // how high a paw lifts while swinging forward
const HIND_X = -14; // where the paws sit under the body when standing
const FRONT_X = 13;
const HIND = { upper: 14.5, lower: 13.5, bend: 1 }; // bends backwards at the hock
const FRONT = { upper: 12.5, lower: 11.8, bend: -1 }; // wrist folds so the paw trails while lifted

/**
 * Paw position for a leg at cycle position p. While planted the paw moves backwards relative to the
 * body exactly as fast as the body moves forwards (so it stays put on the ground), then it lifts and
 * swings forward to the next footfall.
 */
function stepFoot(p: number, home: number): [number, number] {
  const sweep = STRIDE * STANCE;
  const u = ((p % 1) + 1) % 1;
  if (u < STANCE) return [home + sweep / 2 - sweep * (u / STANCE), 0];
  const k = (u - STANCE) / (1 - STANCE);
  const ease = k * k * (3 - 2 * k);
  return [home - sweep / 2 + sweep * ease, -LIFT * Math.sin(Math.PI * k)];
}

/** Two-bone leg from the hip/shoulder (rx, ry) to the paw, solved with simple inverse kinematics. */
function drawLeg(
  ctx: Ctx,
  rx: number,
  ry: number,
  [fx, fy]: [number, number],
  bones: { upper: number; lower: number; bend: number },
  color: string,
) {
  const { upper: a, lower: b, bend } = bones;
  const th = Math.atan2(fy - ry, fx - rx);
  const d = Math.max(Math.abs(a - b) + 0.01, Math.min(a + b - 0.01, Math.hypot(fx - rx, fy - ry)));
  const al = Math.acos((a * a + d * d - b * b) / (2 * a * d));
  const jx = rx + a * Math.cos(th + bend * al);
  const jy = ry + a * Math.sin(th + bend * al);
  const ex = rx + Math.cos(th) * d;
  const ey = ry + Math.sin(th) * d;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineWidth = 5.6;
  ctx.beginPath();
  ctx.moveTo(rx, ry);
  ctx.lineTo(jx, jy);
  ctx.stroke();
  ctx.lineWidth = 4.3;
  ctx.beginPath();
  ctx.moveTo(jx, jy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ellipse(ctx, ex + 1.2, ey - 1.4, 3.2, 2.1, color); // paw
}

function drawCat(ctx: Ctx, cat: Cat, scale: number, time: number, ball: Ball | null) {
  const coat = COATS[cat.coat % COATS.length];
  const fat = cat.full;
  const t = time + cat.id * 1.7; // so the two cats don't swish and blink in sync
  const sway = Math.sin(t * 2.2) * 5;
  const blink = t % 4.2 < 0.12;

  ctx.save();
  ctx.translate(cat.x, cat.y);
  // the shadow narrows with the body when the cat is turning or walking towards/away from you
  const width = Math.abs(cat.facing);
  ellipse(ctx, 0, 1 * scale, (30 + fat * 8) * scale * (0.45 + 0.55 * width), 5 * scale, SHADOW);
  // facing eases through 0 when the cat turns round, so the turn shows instead of an instant flip
  const sx = Math.sign(cat.facing || cat.dir) * Math.max(0.22, width);
  ctx.scale(sx * scale, scale);
  ctx.lineCap = "round";

  if (cat.state === "sit" || cat.state === "throw") {
    // throwing: lean back, then flick the head up and forward
    const p = cat.state === "throw" ? Math.min(1, cat.stateT / THROW_TIME) : 0;
    const flick = p < 0.6 ? -p * 6 : (p - 0.6) * 25 - 3.6;
    drawTail(ctx, coat, -12, -6, sway);
    ellipse(ctx, -2, -20, 15 + fat * 6, 20 + fat * 2, coat.fur);
    ellipse(ctx, 3, -18, 8 + fat * 3, 13, coat.belly);
    ellipse(ctx, 4, -2, 5, 3.5, coat.fur); // front paws
    ellipse(ctx, 12, -2, 5, 3.5, coat.fur);
    const hx = 8 + flick;
    const hy = -44 - Math.abs(flick) * 0.8;
    drawHead(ctx, coat, hx, hy, false, blink && !ball);
    if (ball) drawBallShape(ctx, hx + 15, hy + 6, BALL_RADIUS, 0);
  } else {
    // Standing / walking / eating. Feet are at y = 0, the cat faces +x.
    const walking = cat.state === "walk";
    const ph = cat.phase;
    // hips and shoulders rise and fall twice per cycle, out of step with each other, so the body rocks slightly
    const hipY = -24 + (walking ? Math.sin(TAU * (ph * 2)) * 0.9 : 0);
    const shY = -23 + (walking ? Math.sin(TAU * (ph * 2 + 0.25)) * 0.9 : 0);
    const tilt = (shY - hipY - 1) / 28;
    const midY = (hipY + shY) / 2;
    const foot = (home: number, offset: number): [number, number] => (walking ? stepFoot(ph + offset, home) : [home, 0]);
    const eating = cat.state === "eat";

    // far-side legs, darker, behind the body (lateral-sequence gait: back, front, back, front a quarter apart)
    drawLeg(ctx, -15, hipY, foot(HIND_X, 0), HIND, coat.dark);
    drawLeg(ctx, 13, shY, foot(FRONT_X, 0.25), FRONT, coat.dark);

    drawTail(ctx, coat, -25, hipY - 3, walking ? Math.sin(t * 1.4) * 4 : sway);

    // body: haunch + barrel + chest, then belly and neck
    ellipse(ctx, -14, hipY - 1, 11, 11 + fat * 3, coat.fur);
    ellipse(ctx, -1, midY - 1.5, 22 + fat * 6, 10 + fat * 5, coat.fur, tilt);
    ellipse(ctx, 12, shY - 1, 11, 10.5 + fat * 3, coat.fur);
    ellipse(ctx, 0, midY + 5 + fat * 4, 15 + fat * 4, 4.5 + fat * 2, coat.belly, tilt);
    if (eating) ellipse(ctx, 22, -19, 7, 8.5, coat.fur);
    else ellipse(ctx, 20, shY - 7, 7.5, 8, coat.fur);

    // back stripes
    ctx.strokeStyle = coat.dark;
    ctx.lineWidth = 2.2;
    for (const sx of [-12, -4, 4]) {
      const y = midY - 10 - fat * 3.5 + sx * tilt;
      ctx.beginPath();
      ctx.moveTo(sx, y);
      ctx.lineTo(sx + 2, y + 6);
      ctx.stroke();
    }

    // near-side legs on top, with the haunch and shoulder over their tops
    drawLeg(ctx, -15, hipY, foot(HIND_X, 0.5), HIND, coat.fur);
    drawLeg(ctx, 13, shY, foot(FRONT_X, 0.75), FRONT, coat.fur);
    ellipse(ctx, -15, hipY - 2, 9, 9.5 + fat * 2, coat.fur);
    ellipse(ctx, 12.5, shY - 2, 6.5, 7.5, coat.fur);

    if (eating) {
      const munch = Math.sin(cat.stateT * 16) * 1.8;
      drawHead(ctx, coat, 30, -14 + munch, cat.stateT < EAT_TIME * 0.9, false);
    } else {
      // head carried low, about level with the back, with a gentle nod in time with the steps
      const nod = walking ? Math.sin(TAU * (ph * 2 + 0.1)) * 0.7 : 0;
      const hx = 29;
      const hy = shY - 13 + nod;
      drawHead(ctx, coat, hx, hy, false, blink);
      if (ball) drawBallShape(ctx, hx + 15, hy + 6, BALL_RADIUS, 0);
    }
  }
  ctx.restore();
}

// ---------- house ----------

function drawHouse(ctx: Ctx, H: House, scale: number, world: World) {
  const { x, bottom, w, h, doorX } = H;
  const wallTop = bottom - h * 0.6;
  ellipse(ctx, x + w / 2, bottom + 2 * scale, w * 0.62, 7 * scale, SHADOW);

  // walls with planks
  ctx.fillStyle = "#7a4f33";
  ctx.fillRect(x, wallTop, w, bottom - wallTop);
  ctx.strokeStyle = "#5e3b25";
  ctx.lineWidth = 1.5 * scale;
  for (let py = wallTop + 11 * scale; py < bottom - 2 * scale; py += 11 * scale) {
    ctx.beginPath();
    ctx.moveTo(x + 2 * scale, py);
    ctx.lineTo(x + w - 2 * scale, py);
    ctx.stroke();
  }

  // roof with a little overhang
  const over = 10 * scale;
  poly(ctx, [x - over, wallTop + 3 * scale, x + w / 2, bottom - h, x + w + over, wallTop + 3 * scale], "#b0503a");
  ctx.strokeStyle = "#7f3527";
  ctx.lineWidth = 3 * scale;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x - over, wallTop + 3 * scale);
  ctx.lineTo(x + w / 2, bottom - h);
  ctx.lineTo(x + w + over, wallTop + 3 * scale);
  ctx.stroke();
  // round window in the gable, with a paw print
  ellipse(ctx, x + w / 2, wallTop - 14 * scale, 8 * scale, 8 * scale, "#f3d9a4");
  ellipse(ctx, x + w / 2, wallTop - 12 * scale, 2.6 * scale, 2.2 * scale, "#b0503a");
  for (const [dx, dy] of [[-3, -4.5], [0, -6], [3, -4.5]]) ellipse(ctx, x + w / 2 + dx * scale, wallTop - 12 * scale + dy * scale, 1.2 * scale, 1.2 * scale, "#b0503a");

  // arched doorway
  const dw = w * 0.36;
  const dh = h * 0.42;
  ctx.beginPath();
  ctx.moveTo(doorX - dw / 2, bottom);
  ctx.lineTo(doorX - dw / 2, bottom - dh + dw / 2);
  ctx.arc(doorX, bottom - dh + dw / 2, dw / 2, Math.PI, 0);
  ctx.lineTo(doorX + dw / 2, bottom);
  ctx.closePath();
  ctx.fillStyle = "#120c09";
  ctx.fill();
  // doormat
  ctx.fillStyle = "#4d5a3c";
  ctx.fillRect(doorX - dw * 0.62, bottom - 1 * scale, dw * 1.24, 5 * scale);

  // eyes glowing in the dark doorway for each cat that's inside
  const inside = world.cats.filter((c) => c.inside);
  inside.forEach((c, i) => {
    const ex = doorX + (inside.length === 1 ? 0 : (i - 0.5) * dw * 0.45);
    const ey = bottom - dh * 0.45 - (i % 2) * 4 * scale;
    const blink = (world.time + c.id * 1.3) % 3.7 < 0.15;
    for (const side of [-1, 1]) ellipse(ctx, ex + side * 4.4 * scale, ey, 2.5 * scale, (blink ? 0.5 : 3.2) * scale, c.coat === 0 ? "#d9f56b" : "#9fe0ff");
  });
}

// ---------- rain ----------

interface Drop {
  x: number;
  y: number;
  ground: number; // where it hits the ground
  speed: number;
  len: number;
}

interface Splash {
  x: number;
  y: number;
  t: number;
}

/** Rain particles live in the renderer: they're decoration, the simulation only knows whether it rains. */
export class RainFx {
  drops: Drop[] = [];
  splashes: Splash[] = [];

  update(world: World, dt: number, speedFactor: number) {
    const target = Math.round(world.rain.level * (world.w * world.h) / 1900);
    const spawn = (): Drop => ({
      x: Math.random() * (world.w + 120),
      y: -Math.random() * world.h * 0.6,
      ground: world.h * (0.15 + Math.random() * 0.85),
      speed: (650 + Math.random() * 350) * speedFactor,
      len: 10 + Math.random() * 10,
    });
    while (this.drops.length < target && world.rain.on) this.drops.push(spawn());
    const keep: Drop[] = [];
    for (const d of this.drops) {
      d.y += d.speed * dt;
      d.x -= d.speed * 0.18 * dt; // a little wind
      if (d.y < d.ground) {
        keep.push(d);
        continue;
      }
      if (Math.random() < 0.5) this.splashes.push({ x: d.x, y: d.ground, t: 0 });
      if (keep.length + 1 <= target) keep.push(spawn()); // recycle while it's still raining
    }
    this.drops = keep;
    for (const sp of this.splashes) sp.t += dt;
    this.splashes = this.splashes.filter((sp) => sp.t < 0.3);
  }

  draw(ctx: Ctx, world: World) {
    const level = world.rain.level;
    if (level < 0.01 && this.drops.length === 0) return;
    ctx.fillStyle = `rgba(12, 20, 36, ${0.38 * level})`; // overcast
    ctx.fillRect(0, 0, world.w, world.h);
    ctx.strokeStyle = "rgba(170, 192, 225, 0.55)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const d of this.drops) {
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + d.len * 0.18, d.y - d.len);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
    for (const sp of this.splashes) {
      const k = sp.t / 0.3;
      ctx.strokeStyle = `rgba(170, 192, 225, ${0.5 * (1 - k)})`;
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y, 2 + k * 7, 1 + k * 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function draw(ctx: Ctx, world: World, rain: RainFx) {
  ctx.clearRect(0, 0, world.w, world.h);
  const { ball, scale } = world;
  const H = houseOf(world);
  // draw back-to-front so things lower on screen overlap things above them
  const items: { y: number; paint: () => void }[] = world.foods.map((f) => ({ y: f.y, paint: () => drawFood(ctx, f, scale * depth(world, f.y)) }));
  items.push({ y: H.bottom - 0.5, paint: () => drawHouse(ctx, H, scale, world) });
  for (const cat of world.cats) {
    if (cat.inside) continue;
    const holding = ball.holder === cat.id ? ball : null;
    items.push({ y: cat.y + 0.1, paint: () => drawCat(ctx, cat, scale * depth(world, cat.y), world.time, holding) });
  }
  if (ball.holder === null) items.push({ y: ball.y + 0.2, paint: () => drawLooseBall(ctx, ball, scale * depth(world, ball.y)) });
  items.sort((a, b) => a.y - b.y).forEach((i) => i.paint());

  for (const c of world.crumbs) {
    ctx.globalAlpha = Math.min(1, c.life * 2.5);
    ellipse(ctx, c.x, c.y, 2 * scale, 2 * scale, c.color);
  }
  ctx.globalAlpha = 1;

  rain.draw(ctx, world);

  ctx.fillStyle = "rgba(154,169,191,0.6)";
  ctx.font = "600 14px system-ui, sans-serif";
  ctx.fillText(`🐟 eaten: ${world.eaten}`, 18, 26);
}

/** Two cats that eat the food lying around, play catch when it's gone and hide in their house when it rains. Click / tap to drop food. */
export function CatSaver({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World | null>(null); // survives tab switches
  const rainRef = useRef(new RainFx());

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (worldRef.current) resizeWorld(worldRef.current, w, h);
      else worldRef.current = createWorld(w, h);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const rain = rainRef.current;
    let frame = 0;
    let last = -1; // first frame just records the timestamp
    const loop = (t: number) => {
      const dt = last < 0 ? 0 : Math.max(0, Math.min(0.05, (t - last) / 1000));
      last = t;
      const world = worldRef.current;
      if (world) {
        step(world, dt, reduced ? 0.4 : 1);
        rain.update(world, dt, reduced ? 0.4 : 1);
        draw(ctx, world, rain);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    const onPointer = (e: PointerEvent) => {
      const world = worldRef.current;
      if (!world) return;
      const r = canvas.getBoundingClientRect();
      addFood(world, e.clientX - r.left, e.clientY - r.top);
    };
    canvas.addEventListener("pointerdown", onPointer);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointer);
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="cat-canvas"
      aria-label="Two cats eating food and playing catch with a ball, and sheltering in their house when it rains. Click to drop more food."
      className="block h-full w-full touch-none"
    />
  );
}
