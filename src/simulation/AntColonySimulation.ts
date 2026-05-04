import { PheromoneGrid } from "./PheromoneGrid";
import type { Ant, PlacedObject, SimulationStats, ToolDefinition, ToolKind, Vec2 } from "./types";

const WORLD_WIDTH = 960;
const WORLD_HEIGHT = 640;
const NEST: Vec2 = { x: 150, y: 326 };
const FOOD: Vec2 = { x: 800, y: 318 };

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  { kind: "pebble", label: "小石", icon: "●", radius: 28, cooldownMs: 160 },
  { kind: "leaf", label: "葉っぱ", icon: "◆", radius: 42, cooldownMs: 210 },
  { kind: "finger", label: "指跡", icon: "⌒", radius: 34, cooldownMs: 35 },
  { kind: "water", label: "水滴", icon: "◌", radius: 46, cooldownMs: 260 }
];

const TAU = Math.PI * 2;

export class AntColonySimulation {
  readonly width = WORLD_WIDTH;
  readonly height = WORLD_HEIGHT;
  readonly nest = NEST;
  readonly food = FOOD;
  readonly pheromones = new PheromoneGrid(WORLD_WIDTH, WORLD_HEIGHT, 10);
  readonly ants: Ant[] = [];
  readonly objects: PlacedObject[] = [];

  selectedTool: ToolKind = "pebble";
  score = 0;
  deliveredFood = 0;

  private nextAntId = 1;
  private nextObjectId = 1;
  private spawnTimer = 0;

  constructor() {
    for (let i = 0; i < 52; i += 1) {
      this.spawnAnt(Math.random() * TAU);
    }
  }

  reset(): void {
    this.ants.length = 0;
    this.objects.length = 0;
    this.pheromones.food.fill(0);
    this.pheromones.home.fill(0);
    this.pheromones.disruption.fill(0);
    this.score = 0;
    this.deliveredFood = 0;
    this.spawnTimer = 0;
    for (let i = 0; i < 52; i += 1) {
      this.spawnAnt(Math.random() * TAU);
    }
  }

  setTool(tool: ToolKind): void {
    this.selectedTool = tool;
  }

  placeTool(x: number, y: number, kind = this.selectedTool): boolean {
    if (Math.hypot(x - NEST.x, y - NEST.y) < 58 || Math.hypot(x - FOOD.x, y - FOOD.y) < 58) {
      return false;
    }

    const definition = TOOL_DEFINITIONS.find((tool) => tool.kind === kind)!;
    const ttl = kind === "finger" ? 6 : kind === "water" ? 10 : 16;
    this.objects.push({
      id: this.nextObjectId++,
      kind,
      x,
      y,
      radius: definition.radius,
      ttl,
      maxTtl: ttl
    });

    const disruption = kind === "water" ? 1.1 : kind === "finger" ? 0.86 : 0.45;
    this.pheromones.addDisruption(x, y, definition.radius * 1.15, disruption);
    this.score += kind === "finger" ? 2 : 5;
    return true;
  }

  step(deltaMs: number): void {
    const dt = Math.min(0.05, deltaMs / 1000);
    this.spawnTimer += dt;
    if (this.spawnTimer > 0.65 && this.ants.length < 95) {
      this.spawnTimer = 0;
      this.spawnAnt(this.angleTo(FOOD, NEST) + rand(-0.45, 0.45));
    }

    this.pheromones.step(dt * 60);
    this.stepObjects(dt);
    for (const ant of this.ants) {
      this.stepAnt(ant, dt);
    }
  }

  getStats(): SimulationStats {
    return {
      score: Math.round(this.score),
      deliveredFood: this.deliveredFood,
      trailIntegrity: this.calculateTrailIntegrity(),
      activeAnts: this.ants.length,
      selectedTool: this.selectedTool
    };
  }

  private stepAnt(ant: Ant, dt: number): void {
    const target = ant.mode === "forage" ? FOOD : NEST;
    const desiredField = ant.mode === "forage" ? this.pheromones.food : this.pheromones.home;
    const deposit = ant.mode === "forage" ? "home" : "food";
    const lookAhead = 20;
    const side = 14;
    const leftAngle = ant.heading - 0.55;
    const rightAngle = ant.heading + 0.55;
    const left = this.sampleField(desiredField, ant.x + Math.cos(leftAngle) * lookAhead, ant.y + Math.sin(leftAngle) * lookAhead);
    const right = this.sampleField(desiredField, ant.x + Math.cos(rightAngle) * lookAhead, ant.y + Math.sin(rightAngle) * lookAhead);
    const frontDisruption = this.pheromones.sampleDisruption(ant.x + Math.cos(ant.heading) * side, ant.y + Math.sin(ant.heading) * side);
    const weberTurn = ((right - left) / (right + left + 0.08)) * 2.25;
    const targetTurn = signedAngle(ant.heading, Math.atan2(target.y - ant.y, target.x - ant.x)) * 0.5;
    const memoryTurn = signedAngle(ant.heading, ant.memoryHeading) * 0.16;
    const noise = rand(-1.35, 1.35) * (0.42 + frontDisruption * 1.7);

    ant.heading = wrapAngle(ant.heading + (weberTurn + targetTurn + memoryTurn + noise) * dt);
    ant.speed = lerp(ant.speed, 38 + Math.max(left, right) * 13 - frontDisruption * 9, 0.08);
    ant.speed = clamp(ant.speed, 20, 62);

    this.avoidObjects(ant, dt);

    ant.x += Math.cos(ant.heading) * ant.speed * dt;
    ant.y += Math.sin(ant.heading) * ant.speed * dt;
    this.keepInWorld(ant);

    if (deposit === "home") this.pheromones.addHome(ant.x, ant.y, 0.025);
    else this.pheromones.addFood(ant.x, ant.y, 0.038);

    if (Math.hypot(ant.x - target.x, ant.y - target.y) < 28) {
      ant.mode = ant.mode === "forage" ? "return" : "forage";
      ant.memoryHeading = this.angleTo(ant.mode === "forage" ? FOOD : NEST, ant);
      ant.heading = wrapAngle(ant.heading + Math.PI + rand(-0.4, 0.4));
      if (ant.mode === "forage") {
        this.deliveredFood += 1;
        this.score += 18;
        this.pheromones.addFood(ant.x, ant.y, 0.8);
      }
    }
  }

  private avoidObjects(ant: Ant, dt: number): void {
    for (const object of this.objects) {
      const dx = ant.x - object.x;
      const dy = ant.y - object.y;
      const distance = Math.hypot(dx, dy);
      const influence = object.radius + (object.kind === "water" ? 18 : 10);
      if (distance > influence) continue;

      const away = Math.atan2(dy, dx);
      const strength = (1 - distance / influence) * (object.kind === "leaf" ? 3.2 : object.kind === "pebble" ? 4.1 : 2.1);
      ant.heading = wrapAngle(ant.heading + signedAngle(ant.heading, away) * strength * dt);
      if (object.kind === "water" || object.kind === "finger") {
        ant.heading = wrapAngle(ant.heading + rand(-1.1, 1.1) * dt * 6);
      }
    }
  }

  private stepObjects(dt: number): void {
    for (let i = this.objects.length - 1; i >= 0; i -= 1) {
      const object = this.objects[i];
      object.ttl -= dt;
      if (object.kind === "water" || object.kind === "finger") {
        this.pheromones.addDisruption(object.x, object.y, object.radius, object.kind === "water" ? 0.018 : 0.012);
      }
      if (object.ttl <= 0) {
        this.objects.splice(i, 1);
      }
    }
  }

  private calculateTrailIntegrity(): number {
    let aligned = 0;
    let counted = 0;
    const routeAngle = Math.atan2(FOOD.y - NEST.y, FOOD.x - NEST.x);
    for (const ant of this.ants) {
      const nearRoute = Math.abs(crossTrackDistance(NEST, FOOD, ant)) < 95;
      if (!nearRoute) continue;
      counted += 1;
      const expected = ant.mode === "forage" ? routeAngle : wrapAngle(routeAngle + Math.PI);
      const difference = Math.abs(signedAngle(ant.heading, expected));
      if (difference < 0.55) aligned += 1;
    }
    return counted === 0 ? 0 : Math.round((aligned / counted) * 100);
  }

  private spawnAnt(heading: number): void {
    this.ants.push({
      id: this.nextAntId++,
      x: NEST.x + rand(-18, 18),
      y: NEST.y + rand(-18, 18),
      heading,
      speed: rand(28, 45),
      mode: "forage",
      memoryHeading: this.angleTo(FOOD, NEST),
      wiggle: Math.random() * TAU
    });
  }

  private sampleField(field: Float32Array, x: number, y: number): number {
    if (field === this.pheromones.food) return this.pheromones.sampleFood(x, y);
    return this.pheromones.sampleHome(x, y);
  }

  private keepInWorld(ant: Ant): void {
    if (ant.x < 28 || ant.x > WORLD_WIDTH - 28) {
      ant.heading = Math.PI - ant.heading + rand(-0.35, 0.35);
      ant.x = clamp(ant.x, 28, WORLD_WIDTH - 28);
    }
    if (ant.y < 28 || ant.y > WORLD_HEIGHT - 28) {
      ant.heading = -ant.heading + rand(-0.35, 0.35);
      ant.y = clamp(ant.y, 28, WORLD_HEIGHT - 28);
    }
  }

  private angleTo(target: Vec2, source: Vec2): number {
    return Math.atan2(target.y - source.y, target.x - source.x);
  }
}

function crossTrackDistance(a: Vec2, b: Vec2, p: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return ((p.x - a.x) * dy - (p.y - a.y) * dx) / Math.hypot(dx, dy);
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function wrapAngle(angle: number): number {
  return PhaserMathWrap(angle, -Math.PI, Math.PI);
}

function signedAngle(from: number, to: number): number {
  return PhaserMathWrap(to - from, -Math.PI, Math.PI);
}

function PhaserMathWrap(value: number, min: number, max: number): number {
  const range = max - min;
  return ((((value - min) % range) + range) % range) + min;
}
