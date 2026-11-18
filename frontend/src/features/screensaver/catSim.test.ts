import { describe, expect, it } from "vitest";
import { addFood, createWorld, EAT_TIME, houseOf, nearestFood, startRain, step, type World } from "./catSim";

/** Run the simulation in 1/60 s steps, calling `each` after every step. */
const run = (world: World, seconds: number, each?: () => void) => {
  for (let t = 0; t < seconds; t += 1 / 60) {
    step(world, 1 / 60);
    each?.();
  }
};

describe("cat simulation", () => {
  it("has two cats and a ball", () => {
    const world = createWorld(800, 600, 0);
    expect(world.cats).toHaveLength(2);
    expect(world.ball.holder).toBeNull();
  });

  it("walks to the nearest food and eats it", () => {
    const world = createWorld(800, 600, 0);
    const [cat] = world.cats;
    cat.x = 400;
    cat.y = 300;
    world.cats[1].x = 50; // keep the other cat out of the way
    world.cats[1].y = 550;
    const near = addFood(world, 500, 300);
    expect(nearestFood(world, cat)?.id).toBe(near.id);

    run(world, 0.1);
    expect(cat.state).toBe("walk");
    expect(cat.dir).toBe(1);

    run(world, 2 + EAT_TIME);
    expect(world.eaten).toBe(1);
    expect(world.foods).toHaveLength(0);
  });

  it("turns round gradually in a curve instead of flipping on the spot", () => {
    const world = createWorld(900, 600, 0);
    const [cat] = world.cats;
    world.cats[1].x = 880;
    world.cats[1].y = 580;
    cat.x = 600;
    cat.y = 300;
    cat.dir = 1;
    cat.heading = 0;
    cat.facing = 1;
    addFood(world, 200, 300); // directly behind it
    step(world, 1 / 60);
    expect(cat.heading).toBeGreaterThan(-0.2); // has only just started turning
    expect(Math.abs(cat.heading)).toBeLessThan(0.2);
    expect(cat.facing).toBeGreaterThan(0.5); // still drawn facing right

    let maxSideways = 0;
    run(world, 1.5, () => (maxSideways = Math.max(maxSideways, Math.abs(cat.y - 300))));
    expect(cat.dir).toBe(-1); // now facing the food
    expect(maxSideways).toBeGreaterThan(3); // it swung round in an arc
    run(world, 6);
    expect(world.eaten).toBe(1);
  });

  it("is drawn foreshortened when walking towards or away from the viewer", () => {
    const world = createWorld(900, 600, 0);
    const [cat] = world.cats;
    world.cats[1].x = 880;
    world.cats[1].y = 580;
    cat.x = 450;
    cat.y = 550;
    cat.heading = -Math.PI / 2; // already pointing up the screen
    addFood(world, 450, 120);
    run(world, 1);
    expect(cat.state).toBe("walk");
    expect(Math.abs(cat.facing)).toBeLessThan(0.7);
  });

  it("the two cats go for different pieces of food", () => {
    const world = createWorld(800, 600, 0);
    world.cats[0].x = 300;
    world.cats[1].x = 320;
    world.cats[0].y = world.cats[1].y = 300;
    addFood(world, 400, 300);
    addFood(world, 200, 300);
    run(world, 3 / 60); // the closer cat gets dibs; the other re-picks on the next frame
    expect(world.cats[0].target).not.toBeNull();
    expect(world.cats[1].target).not.toBeNull();
    expect(world.cats[0].target).not.toBe(world.cats[1].target);
  });

  it("the closer cat gets the food, even if the other one set off first", () => {
    const world = createWorld(900, 600, 0);
    const [near, far] = world.cats;
    far.x = 880;
    far.y = 580;
    near.x = 300;
    near.y = 200;
    const f = addFood(world, 350, 150);
    world.cats.reverse(); // let the far cat pick first
    run(world, 0.1);
    world.cats.reverse();
    expect(near.target).toBe(f.id);
    expect(far.target).toBeNull();
  });

  it("two cats at the same spot with two pieces close together don't get stuck swapping targets", () => {
    const world = createWorld(766, 551, 0);
    for (const c of world.cats) {
      c.x = 77;
      c.y = 307;
    }
    addFood(world, 47, 315);
    addFood(world, 107, 299);
    run(world, 8);
    expect(world.eaten).toBe(2);
  });

  it("eats everything between them", () => {
    const world = createWorld(800, 600, 6);
    run(world, 30);
    expect(world.eaten).toBeGreaterThanOrEqual(6);
  });

  it("plays catch when there is no food: the ball goes back and forth to different spots", () => {
    const world = createWorld(900, 600, 0);
    const holders: number[] = [];
    const catchSpots: string[] = [];
    run(world, 25, () => {
      const h = world.ball.holder;
      if (h !== null && holders[holders.length - 1] !== h) {
        holders.push(h);
        catchSpots.push(`${Math.round(world.cats[h].x / 40)},${Math.round(world.cats[h].y / 40)}`);
      }
    });
    expect(holders.length).toBeGreaterThanOrEqual(4); // several catches
    for (let i = 1; i < holders.length; i++) expect(holders[i]).not.toBe(holders[i - 1]); // they take turns
    expect(new Set(catchSpots).size).toBeGreaterThan(2); // from different places
  });

  it("drops the ball and goes to eat when food turns up mid-game", () => {
    const world = createWorld(900, 600, 0);
    // wait until someone is holding the ball
    for (let i = 0; i < 20 * 60 && world.ball.holder === null; i++) step(world, 1 / 60);
    expect(world.ball.holder).not.toBeNull();
    addFood(world, 450, 300);
    step(world, 1 / 60);
    expect(world.ball.holder).toBeNull();
    run(world, 6);
    expect(world.eaten).toBe(1);
  });

  it("never adds food on its own once it is gone: they just keep playing", () => {
    const world = createWorld(800, 600, 0);
    run(world, 90);
    expect(world.foods).toHaveLength(0);
    expect(world.eaten).toBe(0);
  });

  it("runs home when it rains, waits it out, then comes back out and carries on", () => {
    const world = createWorld(900, 600, 0);
    run(world, 3); // playing
    startRain(world, 10);
    run(world, 8);
    expect(world.cats.every((c) => c.inside)).toBe(true);
    expect(world.ball.holder).toBeNull(); // dropped the ball

    addFood(world, 600, 300); // food dropped in the rain waits until it stops
    run(world, 1.5);
    expect(world.eaten).toBe(0);

    run(world, 3); // rain stops at 10 s; they come out one after the other
    expect(world.rain.on).toBe(false);
    expect(world.cats.every((c) => !c.inside)).toBe(true);
    run(world, 10);
    expect(world.eaten).toBe(1);
  });

  it("rains every now and then on its own", () => {
    const world = createWorld(900, 600, 0);
    let rained = false;
    let dried = false;
    run(world, 100, () => {
      if (world.rain.on) rained = true;
      else if (rained) dried = true;
    });
    expect(rained).toBe(true);
    expect(dried).toBe(true);
  });

  it("food clicked onto the house lands beside it", () => {
    const world = createWorld(900, 600, 0);
    const H = houseOf(world);
    const f = addFood(world, H.doorX, H.bottom - 10);
    expect(f.x).toBeGreaterThan(H.x + H.w);
  });

  it("keeps clicked food inside the screen", () => {
    const world = createWorld(800, 600, 0);
    const f = addFood(world, -50, 9999);
    expect(f.x).toBeGreaterThan(0);
    expect(f.y).toBeLessThan(600);
  });
});
