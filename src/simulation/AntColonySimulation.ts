import { PheromoneGrid } from "./PheromoneGrid";
import { MAP_PRESETS } from "./MapPresets";
import type { Ant, MapPreset, PlacedObject, SimulationStats, TerrainPatch, ToolDefinition, ToolKind, Vec2 } from "./types";

const WORLD_WIDTH = 960;
const WORLD_HEIGHT = 640;

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  { kind: "pebble", label: "小石", icon: "●", radius: 28, cooldownMs: 160 },
  { kind: "leaf", label: "葉っぱ", icon: "◆", radius: 42, cooldownMs: 210 },
  { kind: "finger", label: "指跡", icon: "⌒", radius: 34, cooldownMs: 35 },
  { kind: "water", label: "水滴", icon: "◌", radius: 46, cooldownMs: 260 },
  { kind: "pump", label: "水ポンプ", icon: "↯", radius: 82, cooldownMs: 780 },
  { kind: "mystery", label: "謎", icon: "?", radius: 64, cooldownMs: 520 }
];

const TAU = Math.PI * 2;

export class AntColonySimulation {
  readonly width = WORLD_WIDTH;
  readonly height = WORLD_HEIGHT;
  readonly maps = MAP_PRESETS;
  readonly pheromones = new PheromoneGrid(WORLD_WIDTH, WORLD_HEIGHT, 10);
  readonly ants: Ant[] = [];
  readonly objects: PlacedObject[] = [];

  selectedTool: ToolKind = "pebble";
  map: MapPreset = MAP_PRESETS[0];
  score = 0;
  deliveredFood = 0;
  combo = 0;

  private nextAntId = 1;
  private nextObjectId = 1;
  private spawnTimer = 0;
  private hasInteracted = false;
  private challengePhase: "disturb" | "recover" = "disturb";
  private reactionText = "行列の流れを見て、効きそうな場所に置いてみよう";
  private reactionTimer = 3;

  constructor() {
    for (let i = 0; i < 52; i += 1) {
      this.spawnAnt(this.initialHeading());
    }
  }

  get nest(): Vec2 {
    return this.map.nest;
  }

  get food(): Vec2 {
    return this.map.food;
  }

  reset(): void {
    this.ants.length = 0;
    this.objects.length = 0;
    this.pheromones.food.fill(0);
    this.pheromones.home.fill(0);
    this.pheromones.disruption.fill(0);
    this.score = 0;
    this.deliveredFood = 0;
    this.combo = 0;
    this.spawnTimer = 0;
    this.hasInteracted = false;
    this.challengePhase = "disturb";
    this.reactionText = "行列の流れを見て、効きそうな場所に置いてみよう";
    this.reactionTimer = 3;
    for (let i = 0; i < 52; i += 1) {
      this.spawnAnt(this.initialHeading());
    }
  }

  setMap(mapId: string): void {
    const nextMap = this.maps.find((map) => map.id === mapId);
    if (!nextMap || nextMap.id === this.map.id) return;
    this.map = nextMap;
    this.reset();
  }

  setTool(tool: ToolKind): void {
    this.selectedTool = tool;
  }

  placeTool(x: number, y: number, kind = this.selectedTool): boolean {
    if (Math.hypot(x - this.nest.x, y - this.nest.y) < 58 || Math.hypot(x - this.food.x, y - this.food.y) < 58) {
      return false;
    }
    if (this.terrainAt(x, y)?.blocksAnts) {
      return false;
    }

    const definition = TOOL_DEFINITIONS.find((tool) => tool.kind === kind)!;
    const mysteryEffect = kind === "mystery" ? this.pickMysteryEffect(x, y) : undefined;
    const effectKind = mysteryEffect ?? kind;
    const effectRadius = effectKind === "pump" ? 82 : effectKind === "water" ? 46 : effectKind === "leaf" ? 42 : effectKind === "finger" ? 34 : definition.radius;
    const nearbyAnts = this.ants.filter((ant) => Math.hypot(ant.x - x, ant.y - y) < effectRadius * 2.2).length;
    const ttl = kind === "mystery" ? 2.8 : effectKind === "finger" ? 6 : effectKind === "water" ? 10 : effectKind === "pump" ? 2.4 : 16;
    this.objects.push({
      id: this.nextObjectId++,
      kind,
      x,
      y,
      radius: effectRadius,
      ttl,
      maxTtl: ttl
    });

    const disruption = effectKind === "pump" ? 1.8 : effectKind === "water" ? 1.1 : effectKind === "finger" ? 0.86 : effectKind === "leaf" ? 0.62 : 0.45;
    this.pheromones.addDisruption(x, y, effectRadius * 1.15, disruption);
    if (effectKind === "pump") {
      this.washAnts(x, y, effectRadius * 2.15);
    } else if (effectKind === "leaf") {
      this.turnNearbyAnts(x, y, effectRadius * 2.3, 1.35);
    } else if (effectKind === "finger") {
      this.turnNearbyAnts(x, y, effectRadius * 2.1, 2.2);
    }
    this.hasInteracted = true;
    this.combo = nearbyAnts > 0 ? Math.min(9, this.combo + 1) : 0;
    const baseScore = effectKind === "finger" ? 2 : effectKind === "pump" ? 12 : kind === "mystery" ? 9 : 5;
    const impactScore = nearbyAnts * (effectKind === "pump" ? 7 : effectKind === "water" ? 4 : effectKind === "leaf" ? 3 : 2);
    this.score += baseScore + impactScore + this.combo * 2;
    if (kind === "mystery") this.setReaction(this.mysteryReaction(effectKind, nearbyAnts));
    else if (effectKind === "pump" && nearbyAnts > 0) this.setReaction(`${nearbyAnts}匹がざっと流された。派手だけどすぐ立て直す。`);
    else this.setReaction(nearbyAnts > 0 ? `${nearbyAnts}匹が迷った。いい邪魔。` : "そこは少し静か。流れの近くを狙うと効く。");
    return true;
  }

  step(deltaMs: number): void {
    const dt = Math.min(0.05, deltaMs / 1000);
    this.spawnTimer += dt;
    if (this.spawnTimer > 0.65 && this.ants.length < 95) {
      this.spawnTimer = 0;
      this.spawnAnt(this.angleTo(this.routeTarget(this.map.route, 1), this.nest) + rand(-0.45, 0.45));
    }

    this.pheromones.step(dt * 60);
    this.stepObjects(dt);
    for (const ant of this.ants) {
      this.stepAnt(ant, dt);
    }
    this.stepChallenge(dt);
  }

  getStats(): SimulationStats {
    return {
      score: Math.round(this.score),
      deliveredFood: this.deliveredFood,
      trailIntegrity: this.calculateTrailIntegrity(),
      activeAnts: this.ants.length,
      selectedTool: this.selectedTool,
      mapName: this.map.name,
      challengeText: this.challengeText(),
      reactionText: this.reactionText,
      combo: this.combo
    };
  }

  private stepAnt(ant: Ant, dt: number): void {
    ant.washedTtl = Math.max(0, ant.washedTtl - dt);
    const route = this.activeRoute(ant.id);
    const target = this.routeTarget(route, ant.routeIndex);
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
    const noise = rand(-1.35, 1.35) * (0.42 + frontDisruption * 1.7 + ant.washedTtl * 0.55);

    ant.heading = wrapAngle(ant.heading + (weberTurn + targetTurn + memoryTurn + noise) * dt);
    ant.speed = lerp(ant.speed, 38 + Math.max(left, right) * 13 - frontDisruption * 9 + ant.washedTtl * 18, 0.08);
    ant.speed = clamp(ant.speed, 20, 62);

    this.avoidObjects(ant, dt);
    this.avoidTerrain(ant, dt);

    ant.x += Math.cos(ant.heading) * ant.speed * dt;
    ant.y += Math.sin(ant.heading) * ant.speed * dt;
    this.keepInWorld(ant);

    if (deposit === "home") this.pheromones.addHome(ant.x, ant.y, 0.025);
    else this.pheromones.addFood(ant.x, ant.y, 0.038);

    if (Math.hypot(ant.x - target.x, ant.y - target.y) < 28) {
      if (ant.mode === "forage" && ant.routeIndex < route.length - 1) {
        ant.routeIndex += 1;
        ant.memoryHeading = this.angleTo(this.routeTarget(route, ant.routeIndex), ant);
      } else if (ant.mode === "return" && ant.routeIndex > 0) {
        ant.routeIndex -= 1;
        ant.memoryHeading = this.angleTo(this.routeTarget(route, ant.routeIndex), ant);
      } else {
        ant.mode = ant.mode === "forage" ? "return" : "forage";
        ant.routeIndex = ant.mode === "forage" ? 1 : route.length - 2;
        ant.memoryHeading = this.angleTo(this.routeTarget(route, ant.routeIndex), ant);
        ant.heading = wrapAngle(ant.heading + Math.PI + rand(-0.4, 0.4));
      }
      if (Math.hypot(ant.x - this.nest.x, ant.y - this.nest.y) < 32 && ant.mode === "forage") {
        this.deliveredFood += 1;
        this.score += 18;
        if (this.challengePhase === "recover" && this.hasInteracted) {
          this.score += 6;
          this.setReaction("行列が戻ってきた。観察ボーナス。");
        }
        this.pheromones.addFood(ant.x, ant.y, 0.8);
      }
    }
  }

  private stepChallenge(dt: number): void {
    this.reactionTimer -= dt;
    if (this.reactionTimer <= 0 && this.reactionText !== this.challengeText()) {
      this.reactionText = this.challengeText();
    }
    if (!this.hasInteracted) return;

    const integrity = this.calculateTrailIntegrity();
    if (this.challengePhase === "disturb" && integrity <= 38) {
      this.challengePhase = "recover";
      this.score += 60;
      if (this.reactionTimer < 2.1) {
        this.setReaction("行列がほどけた。今度は立て直しを眺めよう。");
      }
    } else if (this.challengePhase === "recover" && integrity >= 62) {
      this.challengePhase = "disturb";
      this.score += 90;
      this.combo = Math.min(9, this.combo + 2);
      if (this.reactionTimer < 2.1) {
        this.setReaction("立て直し成功。もう一度、別の場所を試そう。");
      }
    }
  }

  private challengeText(): string {
    if (!this.hasInteracted) return "お題: 行列の肩をそっと崩す";
    if (this.challengePhase === "disturb") return "お題: 安定度を38%以下にする";
    return "お題: 手を止めて62%以上まで戻す";
  }

  private setReaction(text: string): void {
    this.reactionText = text;
    this.reactionTimer = 2.8;
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

  private washAnts(x: number, y: number, radius: number): void {
    for (const ant of this.ants) {
      const dx = ant.x - x;
      const dy = ant.y - y;
      const distance = Math.hypot(dx, dy);
      if (distance > radius) continue;
      const force = 1 - distance / radius;
      const angle = Math.atan2(dy, dx) + rand(-0.35, 0.35);
      ant.x += Math.cos(angle) * force * 78;
      ant.y += Math.sin(angle) * force * 78;
      ant.heading = angle + rand(-0.8, 0.8);
      ant.speed = 70 + force * 52;
      ant.washedTtl = Math.max(ant.washedTtl, 1.4 + force * 0.9);
      ant.memoryHeading = this.angleTo(this.routeTarget(this.activeRoute(ant.id), ant.routeIndex), ant);
      this.keepInWorld(ant);
    }
  }

  private turnNearbyAnts(x: number, y: number, radius: number, strength: number): void {
    for (const ant of this.ants) {
      const distance = Math.hypot(ant.x - x, ant.y - y);
      if (distance > radius) continue;
      const force = 1 - distance / radius;
      ant.heading = wrapAngle(ant.heading + rand(-strength, strength) * (0.4 + force));
      ant.speed = Math.max(ant.speed, 48 + force * 18);
      ant.washedTtl = Math.max(ant.washedTtl, force * 0.45);
    }
  }

  private pickMysteryEffect(x: number, y: number): ToolKind {
    const nearby = this.ants.filter((ant) => Math.hypot(ant.x - x, ant.y - y) < 130).length;
    const roll = Math.random();
    if (nearby >= 10 && roll < 0.38) return "pump";
    if (roll < 0.32) return "water";
    if (roll < 0.58) return "leaf";
    if (roll < 0.8) return "finger";
    return "pebble";
  }

  private mysteryReaction(effectKind: ToolKind, nearbyAnts: number): string {
    if (effectKind === "pump") return nearbyAnts > 0 ? `謎の水圧。${nearbyAnts}匹が流された。` : "謎の水しぶき。でも少し外れた。";
    if (effectKind === "water") return nearbyAnts > 0 ? `謎の湿り気。${nearbyAnts}匹が足を止めた。` : "謎の湿り気だけが残った。";
    if (effectKind === "leaf") return nearbyAnts > 0 ? `謎の葉っぱ。${nearbyAnts}匹の道がふさがった。` : "謎の葉っぱがひらり。";
    if (effectKind === "finger") return nearbyAnts > 0 ? `謎のなぞり跡。${nearbyAnts}匹がぐるっと迷った。` : "謎の線だけが残った。";
    return nearbyAnts > 0 ? `謎の小石。${nearbyAnts}匹が迂回した。` : "謎の小石。静かな場所に落ちた。";
  }

  private avoidTerrain(ant: Ant, dt: number): void {
    for (const patch of this.map.terrain) {
      if (!patch.blocksAnts) continue;
      const distance = normalizedEllipseDistance(ant, patch);
      if (distance > 1.22) continue;
      const away = Math.atan2(ant.y - patch.y, ant.x - patch.x);
      const strength = (1.22 - distance) * (patch.kind === "river" ? 3.7 : 4.6);
      ant.heading = wrapAngle(ant.heading + signedAngle(ant.heading, away) * strength * dt);
      if (distance < 0.92) {
        ant.speed *= 0.86;
        ant.heading = wrapAngle(ant.heading + rand(-0.65, 0.65) * dt * 5);
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
    const route = this.map.route;
    for (const ant of this.ants) {
      const segment = nearestSegment(route, ant);
      const nearRoute = segment.distance < 88;
      if (!nearRoute) continue;
      counted += 1;
      const expected = ant.mode === "forage" ? segment.angle : wrapAngle(segment.angle + Math.PI);
      const difference = Math.abs(signedAngle(ant.heading, expected));
      if (difference < 0.55) aligned += 1;
    }
    return counted === 0 ? 0 : Math.round((aligned / counted) * 100);
  }

  private spawnAnt(heading: number): void {
    const id = this.nextAntId++;
    const route = this.activeRoute(id);
    this.ants.push({
      id,
      x: this.nest.x + rand(-18, 18),
      y: this.nest.y + rand(-18, 18),
      heading,
      speed: rand(28, 45),
      mode: "forage",
      routeIndex: 1,
      memoryHeading: this.angleTo(this.routeTarget(route, 1), this.nest),
      washedTtl: 0,
      wiggle: Math.random() * TAU
    });
  }

  private initialHeading(): number {
    return this.angleTo(this.routeTarget(this.map.route, 1), this.nest) + rand(-0.35, 0.35);
  }

  private sampleField(field: Float32Array, x: number, y: number): number {
    if (field === this.pheromones.food) return this.pheromones.sampleFood(x, y);
    return this.pheromones.sampleHome(x, y);
  }

  private routeTarget(route: Vec2[], routeIndex: number): Vec2 {
    const index = clamp(Math.round(routeIndex), 0, route.length - 1);
    return route[index];
  }

  private activeRoute(antId: number): Vec2[] {
    const roll = seededUnit(antId + this.map.scatterSeed * 97);
    let threshold = 0;
    for (const branch of this.map.branches) {
      threshold += branch.weight;
      if (roll < threshold) return branch.points;
    }
    return this.map.route;
  }

  private terrainAt(x: number, y: number): TerrainPatch | undefined {
    return this.map.terrain.find((patch) => normalizedEllipseDistance({ x, y }, patch) <= 1);
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

function nearestSegment(route: Vec2[], point: Vec2): { distance: number; angle: number } {
  let best = { distance: Number.POSITIVE_INFINITY, angle: 0 };
  for (let i = 0; i < route.length - 1; i += 1) {
    const a = route[i];
    const b = route[i + 1];
    const distance = Math.abs(crossTrackDistance(a, b, point));
    if (distance < best.distance) {
      best = { distance, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
  }
  return best;
}

function normalizedEllipseDistance(point: Vec2, patch: TerrainPatch): number {
  const rotation = -(patch.rotation ?? 0);
  const dx = point.x - patch.x;
  const dy = point.y - patch.y;
  const localX = Math.cos(rotation) * dx - Math.sin(rotation) * dy;
  const localY = Math.sin(rotation) * dx + Math.cos(rotation) * dy;
  return Math.hypot(localX / patch.rx, localY / patch.ry);
}

function seededUnit(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
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
