import { PheromoneGrid } from "./PheromoneGrid";
import { MAP_PRESETS } from "./MapPresets";
import type { Ant, MapPreset, PlacedObject, SimulationDebugSnapshot, SimulationStats, StartPattern, TerrainPatch, ToolDefinition, ToolKind, Vec2 } from "./types";

const WORLD_WIDTH = 960;
const WORLD_HEIGHT = 640;
const TIME_SCALE_STEPS = [1, 3, 5, 10, 20] as const;

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  { kind: "pebble", label: "小石", icon: "●", radius: 28, cooldownMs: 160 },
  { kind: "leaf", label: "葉っぱ", icon: "◆", radius: 42, cooldownMs: 210 },
  { kind: "finger", label: "指跡", icon: "⌒", radius: 34, cooldownMs: 35 },
  { kind: "water", label: "水滴", icon: "◌", radius: 46, cooldownMs: 260 },
  { kind: "pump", label: "水ポンプ", icon: "↯", radius: 82, cooldownMs: 780 },
  { kind: "mystery", label: "謎", icon: "?", radius: 64, cooldownMs: 520 }
];

const TAU = Math.PI * 2;
const START_PATTERNS: StartPattern[] = [
  { id: "southwest-crumb", name: "南西のひとかけら", nest: { x: 118, y: 526 }, foods: [{ x: 840, y: 112 }] },
  { id: "northwest-long", name: "北西の長い道", nest: { x: 122, y: 118 }, foods: [{ x: 790, y: 498 }] },
  { id: "east-edge", name: "東端の巣", nest: { x: 842, y: 340 }, foods: [{ x: 142, y: 138 }] },
  { id: "low-food", name: "低い食べ場", nest: { x: 178, y: 238 }, foods: [{ x: 760, y: 540 }] },
  { id: "upper-food", name: "高い食べ場", nest: { x: 420, y: 548 }, foods: [{ x: 548, y: 102 }] },
  { id: "left-to-right", name: "横切る列", nest: { x: 92, y: 366 }, foods: [{ x: 858, y: 318 }] },
  { id: "right-to-left-pair", name: "逆流する二つ", nest: { x: 850, y: 138 }, foods: [{ x: 124, y: 500 }, { x: 218, y: 170 }] },
  { id: "center-offset", name: "中央の脇道", nest: { x: 314, y: 332 }, foods: [{ x: 822, y: 480 }] },
  { id: "diagonal-short", name: "短い斜め道", nest: { x: 232, y: 486 }, foods: [{ x: 694, y: 156 }] },
  { id: "rare-double", name: "まれな二か所", nest: { x: 520, y: 520 }, foods: [{ x: 164, y: 132 }, { x: 824, y: 164 }] }
];

export class AntColonySimulation {
  readonly width = WORLD_WIDTH;
  readonly height = WORLD_HEIGHT;
  readonly maps = MAP_PRESETS;
  readonly pheromones = new PheromoneGrid(WORLD_WIDTH, WORLD_HEIGHT, 10);
  readonly ants: Ant[] = [];
  readonly objects: PlacedObject[] = [];

  selectedTool: ToolKind = "pebble";
  map: MapPreset = MAP_PRESETS[0];
  timeScale = 1;
  deliveredPieces = 0;

  private nextAntId = 1;
  private nextObjectId = 1;
  private spawnTimer = 0;
  private cargoTimer = 4;
  private pattern: StartPattern = START_PATTERNS[0];
  private patternRunId = 0;
  private readonly routeCache = new Map<string, Vec2[]>();

  constructor() {
    this.reset();
  }

  get nest(): Vec2 {
    return this.pattern.nest;
  }

  get food(): Vec2 {
    return this.pattern.foods[0];
  }

  get foods(): Vec2[] {
    return this.pattern.foods;
  }

  reset(): void {
    this.pattern = this.pickStartPattern();
    this.patternRunId += 1;
    this.routeCache.clear();
    this.ants.length = 0;
    this.objects.length = 0;
    this.pheromones.food.fill(0);
    this.pheromones.home.fill(0);
    this.pheromones.disruption.fill(0);
    this.deliveredPieces = 0;
    this.spawnTimer = 0;
    this.cargoTimer = 4;
    this.nextObjectId = 1;
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

  setTimeScale(timeScale: number): void {
    const nearest = TIME_SCALE_STEPS.reduce(
      (best, current) => (Math.abs(current - timeScale) < Math.abs(best - timeScale) ? current : best),
      TIME_SCALE_STEPS[0]
    );
    this.timeScale = nearest;
  }

  toggleTimeScale(): void {
    const currentIndex = TIME_SCALE_STEPS.indexOf(this.timeScale as (typeof TIME_SCALE_STEPS)[number]);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % TIME_SCALE_STEPS.length;
    this.timeScale = TIME_SCALE_STEPS[nextIndex];
  }

  toggleToolAt(x: number, y: number, kind = this.selectedTool, removeExisting = true): "placed" | "removed" | "blocked" {
    const removable = this.objectAt(x, y);
    if (removable && removeExisting) {
      this.objects.splice(this.objects.indexOf(removable), 1);
      this.routeCache.clear();
      this.refreshAntRouteMemory();
      return "removed";
    }
    if (removable) return "blocked";
    return this.placeTool(x, y, kind) ? "placed" : "blocked";
  }

  hasObjectAt(x: number, y: number): boolean {
    return Boolean(this.objectAt(x, y));
  }

  private placeTool(x: number, y: number, kind = this.selectedTool): boolean {
    if (Math.hypot(x - this.nest.x, y - this.nest.y) < 58 || this.foods.some((food) => Math.hypot(x - food.x, y - food.y) < 58)) {
      return false;
    }
    if (this.terrainAt(x, y)?.blocksAnts) {
      return false;
    }

    const definition = TOOL_DEFINITIONS.find((tool) => tool.kind === kind)!;
    const mysteryEffect = kind === "mystery" ? this.pickMysteryEffect(x, y) : undefined;
    const effectKind = mysteryEffect ?? kind;
    const effectRadius = effectKind === "pump" ? 82 : effectKind === "water" ? 46 : effectKind === "leaf" ? 42 : effectKind === "finger" ? 34 : definition.radius;
    this.objects.push({
      id: this.nextObjectId++,
      kind,
      x,
      y,
      radius: effectRadius,
      age: 0,
      effectKind
    });
    this.routeCache.clear();
    this.refreshAntRouteMemory();

    const disruption = effectKind === "pump" ? 1.8 : effectKind === "water" ? 1.1 : effectKind === "finger" ? 0.86 : effectKind === "leaf" ? 0.62 : 0.45;
    this.pheromones.addDisruption(x, y, effectRadius * 1.15, disruption);
    if (effectKind === "pump") {
      this.washAnts(x, y, effectRadius * 2.15);
    } else if (effectKind === "leaf") {
      this.turnNearbyAnts(x, y, effectRadius * 2.3, 1.35);
    } else if (effectKind === "finger") {
      this.turnNearbyAnts(x, y, effectRadius * 2.1, 2.2);
    }
    return true;
  }

  step(deltaMs: number): void {
    const scaledDelta = deltaMs * this.timeScale;
    const steps = Math.ceil(scaledDelta / 50);
    if (steps <= 0) return;
    const stepMs = scaledDelta / steps;
    for (let i = 0; i < steps; i += 1) {
      this.stepOnce(stepMs);
    }
  }

  getStats(): SimulationStats {
    return {
      deliveredPieces: this.deliveredPieces,
      trailIntegrity: this.calculateTrailIntegrity(),
      activeAnts: this.ants.length,
      totalAnts: this.nextAntId - 1,
      activeCargo: this.ants.filter((ant) => ant.cargoSize > 0).length,
      selectedTool: this.selectedTool,
      mapName: this.map.name,
      timeScale: this.timeScale,
      patternName: this.pattern.name
    };
  }

  getDebugSnapshot(): SimulationDebugSnapshot {
    const stats = this.getStats();
    let invalidAnts = 0;
    let minX = WORLD_WIDTH;
    let maxX = 0;
    let minY = WORLD_HEIGHT;
    let maxY = 0;
    let maxSpeed = 0;
    for (const ant of this.ants) {
      const valid =
        Number.isFinite(ant.x) &&
        Number.isFinite(ant.y) &&
        Number.isFinite(ant.heading) &&
        Number.isFinite(ant.speed) &&
        ant.x >= 0 &&
        ant.x <= WORLD_WIDTH &&
        ant.y >= 0 &&
        ant.y <= WORLD_HEIGHT;
      if (!valid) invalidAnts += 1;
      minX = Math.min(minX, ant.x);
      maxX = Math.max(maxX, ant.x);
      minY = Math.min(minY, ant.y);
      maxY = Math.max(maxY, ant.y);
      maxSpeed = Math.max(maxSpeed, ant.speed);
    }
    return {
      ...stats,
      objects: this.objects.length,
      foods: this.foods.length,
      invalidAnts,
      minX: Math.round(minX),
      maxX: Math.round(maxX),
      minY: Math.round(minY),
      maxY: Math.round(maxY),
      maxSpeed: Math.round(maxSpeed),
      maxPheromone: Math.round(this.maxPheromone() * 1000) / 1000,
      routeCacheSize: this.routeCache.size
    };
  }

  getDisplayRoutes(): Vec2[][] {
    return this.foods.flatMap((food) => [this.transformRoute(this.map.route, food), ...this.map.branches.map((branch) => this.transformRoute(branch.points, food))]);
  }

  getDominantTrail(): Vec2[] {
    const routes = this.foods.flatMap((food) => [this.applyObstacleDetours(this.transformRoute(this.map.route, food)), ...this.map.branches.map((branch) => this.applyObstacleDetours(this.transformRoute(branch.points, food)))]);
    if (routes.length === 0) return [];
    let bestRoute = routes[0];
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const route of routes) {
      const score = this.scoreTrailRoute(route);
      if (score > bestScore) {
        bestScore = score;
        bestRoute = route;
      }
    }
    return bestRoute;
  }

  private stepOnce(deltaMs: number): void {
    const dt = Math.min(0.05, deltaMs / 1000);
    this.spawnTimer += dt;
    if (this.spawnTimer > 0.65 && this.ants.length < 95) {
      this.spawnTimer = 0;
      this.spawnAnt(this.initialHeading());
    }
    this.cargoTimer -= dt;
    if (this.cargoTimer <= 0) {
      this.cargoTimer = this.markCargoAnt() ? rand(13, 22) : 1.5;
    }

    this.pheromones.step(dt * 60);
    this.stepObjects(dt);
    for (const ant of this.ants) {
      this.stepAnt(ant, dt);
    }
  }

  private stepAnt(ant: Ant, dt: number): void {
    ant.washedTtl = Math.max(0, ant.washedTtl - dt);
    const route = this.activeRoute(ant.id, ant.foodIndex);
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
    const targetDistance = Math.hypot(ant.x - target.x, ant.y - target.y);
    const routeSegment = nearestSegment(route, ant);
    const progress = ant.lastTargetDistance - targetDistance;
    if (progress < 0.28 && targetDistance > 30) ant.stalledTime += dt;
    else ant.stalledTime = Math.max(0, ant.stalledTime - dt * 2.2);
    ant.lastTargetDistance = targetDistance;

    const recovery = clamp((ant.stalledTime - 1.4) / 2.6, 0, 1);
    const offRoute = clamp((routeSegment.distance - 22) / 92, 0, 1);
    const matureTrail = clamp(this.deliveredPieces / 90, 0, 1);
    const routeRejoinTurn =
      routeSegment.distance > 16 ? signedAngle(ant.heading, Math.atan2(routeSegment.closest.y - ant.y, routeSegment.closest.x - ant.x)) * (0.28 + offRoute * 0.42 + recovery * 0.72) : 0;
    const weberTurn = ((right - left) / (right + left + 0.08)) * 2.15 * (1 - recovery * 0.42);
    const targetTurn = signedAngle(ant.heading, Math.atan2(target.y - ant.y, target.x - ant.x)) * (0.62 + offRoute * 0.34 + recovery * 0.92 + matureTrail * 0.12) * ant.routeStickiness;
    const memoryTurn = signedAngle(ant.heading, ant.memoryHeading) * (0.2 + matureTrail * 0.08) * ant.routeStickiness;
    const corridorTurn = signedAngle(ant.heading, ant.mode === "forage" ? routeSegment.angle : wrapAngle(routeSegment.angle + Math.PI)) * (0.08 + matureTrail * 0.18) * (1 - offRoute * 0.35);
    const noise = rand(-1.35, 1.35) * (0.34 + frontDisruption * 1.45 + ant.washedTtl * 0.5) * (1 - recovery * 0.56) * (1 - matureTrail * 0.26);

    ant.heading = wrapAngle(ant.heading + (weberTurn + targetTurn + memoryTurn + routeRejoinTurn + corridorTurn + noise) * dt);
    if (ant.stalledTime > 7) {
      this.recoverStalledAnt(ant, route, routeSegment);
    }
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
        ant.stalledTime = 0;
        ant.lastTargetDistance = Math.hypot(ant.x - this.routeTarget(route, ant.routeIndex).x, ant.y - this.routeTarget(route, ant.routeIndex).y);
      } else if (ant.mode === "return" && ant.routeIndex > 0) {
        ant.routeIndex -= 1;
        ant.memoryHeading = this.angleTo(this.routeTarget(route, ant.routeIndex), ant);
        ant.stalledTime = 0;
        ant.lastTargetDistance = Math.hypot(ant.x - this.routeTarget(route, ant.routeIndex).x, ant.y - this.routeTarget(route, ant.routeIndex).y);
      } else {
        ant.mode = ant.mode === "forage" ? "return" : "forage";
        ant.routeIndex = ant.mode === "forage" ? 1 : route.length - 2;
        if (ant.mode === "forage") {
          ant.foodIndex = this.pickFoodIndex(ant.id + Math.round(this.deliveredPieces * 17));
        }
        const nextRoute = this.activeRoute(ant.id, ant.foodIndex);
        ant.memoryHeading = this.angleTo(this.routeTarget(nextRoute, ant.routeIndex), ant);
        ant.heading = wrapAngle(ant.heading + Math.PI + rand(-0.4, 0.4));
        ant.stalledTime = 0;
        ant.lastTargetDistance = Math.hypot(ant.x - this.routeTarget(nextRoute, ant.routeIndex).x, ant.y - this.routeTarget(nextRoute, ant.routeIndex).y);
      }
      if (Math.hypot(ant.x - this.nest.x, ant.y - this.nest.y) < 32 && ant.mode === "forage") {
        this.deliveredPieces += ant.cargoPieces > 0 ? ant.cargoPieces : 1;
        ant.cargoSize = 0;
        ant.cargoPieces = 0;
        this.pheromones.addFood(ant.x, ant.y, 0.8);
      }
    }
  }

  private avoidObjects(ant: Ant, dt: number): void {
    const recovery = clamp((ant.stalledTime - 1.2) / 3, 0, 1);
    for (const object of this.objects) {
      const dx = ant.x - object.x;
      const dy = ant.y - object.y;
      const distance = Math.hypot(dx, dy);
      const influence = object.radius + (object.kind === "water" ? 18 : 10);
      if (distance > influence) continue;

      const away = Math.atan2(dy, dx);
      const strength = (1 - distance / influence) * (object.effectKind === "leaf" ? 3.2 : object.effectKind === "pebble" ? 4.1 : 2.1) * (1 - recovery * 0.32);
      ant.heading = wrapAngle(ant.heading + signedAngle(ant.heading, away) * strength * dt);
      if (object.effectKind === "water" || object.effectKind === "finger" || object.effectKind === "pump") {
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
      ant.memoryHeading = this.angleTo(this.routeTarget(this.activeRoute(ant.id, ant.foodIndex), ant.routeIndex), ant);
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
    for (const object of this.objects) {
      object.age += dt;
      if (object.effectKind === "water" || object.effectKind === "finger" || object.effectKind === "pump" || object.kind === "mystery") {
        const amount = object.effectKind === "pump" ? 0.014 : object.effectKind === "water" ? 0.01 : object.effectKind === "finger" ? 0.008 : 0.006;
        this.pheromones.addDisruption(object.x, object.y, object.radius, amount);
      }
    }
  }

  private objectAt(x: number, y: number): PlacedObject | undefined {
    let nearest: PlacedObject | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const object of this.objects) {
      const distance = Math.hypot(object.x - x, object.y - y);
      const hitRadius = Math.max(26, object.radius * 0.72);
      if (distance < hitRadius && distance < nearestDistance) {
        nearest = object;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  private calculateTrailIntegrity(): number {
    let score = 0;
    let counted = 0;
    for (const ant of this.ants) {
      const route = this.activeRoute(ant.id, ant.foodIndex);
      const segment = nearestSegment(route, ant);
      const nearRoute = segment.distance < 118;
      if (!nearRoute) continue;
      counted += 1;
      const expected = ant.mode === "forage" ? segment.angle : wrapAngle(segment.angle + Math.PI);
      const difference = Math.abs(signedAngle(ant.heading, expected));
      const distanceScore = clamp(1 - segment.distance / 118, 0, 1);
      const headingScore = clamp(1 - difference / 1.15, 0, 1);
      score += distanceScore * 0.46 + headingScore * 0.54;
    }
    return counted === 0 ? 0 : Math.round((score / counted) * 100);
  }

  private spawnAnt(heading: number): void {
    const id = this.nextAntId++;
    const foodIndex = this.pickFoodIndex(id);
    const route = this.activeRoute(id, foodIndex);
    this.ants.push({
      id,
      x: this.nest.x + rand(-18, 18),
      y: this.nest.y + rand(-18, 18),
      heading,
      speed: rand(28, 45),
      mode: "forage",
      routeIndex: 1,
      foodIndex,
      memoryHeading: this.angleTo(this.routeTarget(route, 1), this.nest),
      cargoSize: 0,
      cargoPieces: 0,
      washedTtl: 0,
      wiggle: Math.random() * TAU,
      lastTargetDistance: Math.hypot(this.nest.x - this.routeTarget(route, 1).x, this.nest.y - this.routeTarget(route, 1).y),
      stalledTime: 0,
      routeStickiness: rand(0.86, 1.16)
    });
  }

  private markCargoAnt(): boolean {
    const candidates = this.ants.filter((ant) => ant.mode === "return" && ant.cargoSize === 0);
    const ant = candidates[Math.floor(Math.random() * candidates.length)];
    if (!ant) {
      return false;
    }
    ant.cargoSize = rand(9, 14);
    ant.cargoPieces = Math.round(3 + ant.cargoSize * 0.35);
    ant.speed *= 0.82;
    return true;
  }

  private initialHeading(): number {
    return this.angleTo(this.routeTarget(this.transformRoute(this.map.route, this.food), 1), this.nest) + rand(-0.35, 0.35);
  }

  private sampleField(field: Float32Array, x: number, y: number): number {
    if (field === this.pheromones.food) return this.pheromones.sampleFood(x, y);
    return this.pheromones.sampleHome(x, y);
  }

  private routeTarget(route: Vec2[], routeIndex: number): Vec2 {
    const index = clamp(Math.round(routeIndex), 0, route.length - 1);
    return route[index];
  }

  private activeRoute(antId: number, foodIndex?: number): Vec2[] {
    const roll = seededUnit(antId + this.map.scatterSeed * 97);
    const resolvedFoodIndex = foodIndex ?? this.pickFoodIndex(antId);
    const branchIndex = this.pickBranchIndex(roll);
    const cacheKey = `${this.patternRunId}:${this.map.id}:${resolvedFoodIndex}:${branchIndex}`;
    const cached = this.routeCache.get(cacheKey);
    if (cached) return cached;
    const food = this.foods[resolvedFoodIndex];
    const points = branchIndex >= 0 ? this.map.branches[branchIndex].points : this.map.route;
    const route = this.applyObstacleDetours(this.transformRoute(points, food));
    this.routeCache.set(cacheKey, route);
    return route;
  }

  private scoreTrailRoute(route: Vec2[]): number {
    if (route.length < 2) return 0;
    let score = 0;
    let samples = 0;
    for (let i = 0; i < route.length - 1; i += 1) {
      const a = route[i];
      const b = route[i + 1];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(2, Math.ceil(length / 24));
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        const x = lerp(a.x, b.x, t);
        const y = lerp(a.y, b.y, t);
        score += this.pheromones.sampleFood(x, y) + this.pheromones.sampleHome(x, y) - this.pheromones.sampleDisruption(x, y) * 0.18;
        samples += 1;
      }
    }
    return samples === 0 ? 0 : score / samples;
  }

  private applyObstacleDetours(route: Vec2[]): Vec2[] {
    if (this.objects.length === 0) return route;
    const detoured: Vec2[] = [route[0]];
    for (let i = 0; i < route.length - 1; i += 1) {
      const start = detoured[detoured.length - 1];
      const end = route[i + 1];
      const blockingObjects = this.objects
        .filter((object) => object.effectKind !== "finger" && object.effectKind !== "water" && this.segmentObstacleHit(start, end, object))
        .sort((a, b) => projectionT(start, end, a) - projectionT(start, end, b));

      let cursor = start;
      for (const object of blockingObjects) {
        const detour = this.detourAroundObject(cursor, end, object);
        if (detour.length > 0) {
          detoured.push(...detour);
          cursor = detour[detour.length - 1];
        }
      }
      detoured.push(end);
    }
    return simplifyRoute(detoured);
  }

  private segmentObstacleHit(start: Vec2, end: Vec2, object: PlacedObject): boolean {
    const t = projectionT(start, end, object);
    if (t <= 0.08 || t >= 0.92) return false;
    return pointToSegmentDistance(start, end, object) < object.radius + 30;
  }

  private detourAroundObject(start: Vec2, end: Vec2, object: PlacedObject): Vec2[] {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) return [];
    const ux = dx / length;
    const uy = dy / length;
    const px = -uy;
    const py = ux;
    const t = clamp(projectionT(start, end, object), 0.12, 0.88);
    const center = { x: start.x + dx * t, y: start.y + dy * t };
    const clearance = object.radius + 42;
    const lead = Math.min(74, Math.max(36, object.radius * 0.95));
    const candidates = [1, -1].map((side) => {
      const before = this.safeDetourPoint({ x: center.x - ux * lead + px * clearance * side, y: center.y - uy * lead + py * clearance * side });
      const apex = this.safeDetourPoint({ x: center.x + px * (clearance + 18) * side, y: center.y + py * (clearance + 18) * side });
      const after = this.safeDetourPoint({ x: center.x + ux * lead + px * clearance * side, y: center.y + uy * lead + py * clearance * side });
      return {
        points: [before, apex, after],
        length: polylineLength([start, before, apex, after, end]) + this.detourPenalty([before, apex, after])
      };
    });
    candidates.sort((a, b) => a.length - b.length);
    return candidates[0].points;
  }

  private safeDetourPoint(point: Vec2): Vec2 {
    let candidate = {
      x: clamp(point.x, 36, WORLD_WIDTH - 36),
      y: clamp(point.y, 36, WORLD_HEIGHT - 36)
    };
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const terrain = this.map.terrain.find((patch) => patch.blocksAnts && normalizedEllipseDistance(candidate, patch) < 1.06);
      if (!terrain) return candidate;
      const angle = Math.atan2(candidate.y - terrain.y, candidate.x - terrain.x) || attempt * 0.7;
      candidate = {
        x: clamp(candidate.x + Math.cos(angle) * 24, 36, WORLD_WIDTH - 36),
        y: clamp(candidate.y + Math.sin(angle) * 24, 36, WORLD_HEIGHT - 36)
      };
    }
    return candidate;
  }

  private detourPenalty(points: Vec2[]): number {
    let penalty = 0;
    for (const point of points) {
      if (this.map.terrain.some((patch) => patch.blocksAnts && normalizedEllipseDistance(point, patch) < 1.15)) penalty += 240;
      if (this.objects.some((object) => Math.hypot(point.x - object.x, point.y - object.y) < object.radius + 20)) penalty += 180;
    }
    return penalty;
  }

  private refreshAntRouteMemory(): void {
    for (const ant of this.ants) {
      const route = this.activeRoute(ant.id, ant.foodIndex);
      ant.routeIndex = clamp(ant.routeIndex, 1, Math.max(1, route.length - 2));
      const target = this.routeTarget(route, ant.routeIndex);
      ant.memoryHeading = this.angleTo(target, ant);
      ant.lastTargetDistance = Math.hypot(ant.x - target.x, ant.y - target.y);
      ant.stalledTime = 0;
    }
  }

  private recoverStalledAnt(ant: Ant, route: Vec2[], segment: { index: number; closest: Vec2 }): void {
    const nextIndex = ant.mode === "forage" ? segment.index + 1 : segment.index;
    ant.routeIndex = clamp(nextIndex, ant.mode === "forage" ? 1 : 0, ant.mode === "forage" ? route.length - 1 : Math.max(0, route.length - 2));
    const target = this.routeTarget(route, ant.routeIndex);
    const dx = segment.closest.x - ant.x;
    const dy = segment.closest.y - ant.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 12) {
      const nudge = Math.min(30, distance * 0.38);
      ant.x += (dx / distance) * nudge;
      ant.y += (dy / distance) * nudge;
      this.keepInWorld(ant);
    }
    ant.memoryHeading = this.angleTo(target, ant);
    ant.heading = wrapAngle(this.angleTo(target, ant) + rand(-0.16, 0.16));
    ant.speed = Math.max(ant.speed, 42);
    ant.lastTargetDistance = Math.hypot(ant.x - target.x, ant.y - target.y);
    ant.stalledTime = 0;
  }

  private pickBranchIndex(roll: number): number {
    let threshold = 0;
    for (let i = 0; i < this.map.branches.length; i += 1) {
      const branch = this.map.branches[i];
      threshold += branch.weight;
      if (roll < threshold) return i;
    }
    return -1;
  }

  private transformRoute(points: Vec2[], food: Vec2): Vec2[] {
    const nestDelta = { x: this.nest.x - this.map.nest.x, y: this.nest.y - this.map.nest.y };
    const foodDelta = { x: food.x - this.map.food.x, y: food.y - this.map.food.y };
    return points.map((point, index) => {
      const t = points.length <= 1 ? 0 : index / (points.length - 1);
      return {
        x: clamp(point.x + lerp(nestDelta.x, foodDelta.x, t), 34, WORLD_WIDTH - 34),
        y: clamp(point.y + lerp(nestDelta.y, foodDelta.y, t), 34, WORLD_HEIGHT - 34)
      };
    });
  }

  private pickFoodIndex(seed: number): number {
    if (this.foods.length <= 1) return 0;
    return Math.floor(seededUnit(seed + this.map.scatterSeed * 13) * this.foods.length) % this.foods.length;
  }

  private terrainAt(x: number, y: number): TerrainPatch | undefined {
    return this.map.terrain.find((patch) => normalizedEllipseDistance({ x, y }, patch) <= 1);
  }

  private pickStartPattern(): StartPattern {
    const raw = START_PATTERNS[Math.floor(Math.random() * START_PATTERNS.length)];
    return {
      ...raw,
      nest: this.safePoint(raw.nest),
      foods: raw.foods.map((food) => this.safePoint(food))
    };
  }

  private maxPheromone(): number {
    let max = 0;
    for (let i = 0; i < this.pheromones.food.length; i += 1) {
      max = Math.max(max, this.pheromones.food[i], this.pheromones.home[i], this.pheromones.disruption[i]);
    }
    return max;
  }

  private safePoint(point: Vec2): Vec2 {
    let candidate = { ...point };
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const patch = this.map.terrain.find((terrain) => terrain.blocksAnts && normalizedEllipseDistance(candidate, terrain) < 1.14);
      if (!patch) return candidate;
      const angle = Math.atan2(candidate.y - patch.y, candidate.x - patch.x) || attempt * 0.9;
      candidate = {
        x: clamp(candidate.x + Math.cos(angle) * 28, 52, WORLD_WIDTH - 52),
        y: clamp(candidate.y + Math.sin(angle) * 28, 52, WORLD_HEIGHT - 52)
      };
    }
    return candidate;
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

function projectionT(a: Vec2, b: Vec2, p: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0.0001) return 0;
  return ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
}

function closestPointOnSegment(a: Vec2, b: Vec2, p: Vec2): Vec2 {
  const t = clamp(projectionT(a, b, p), 0, 1);
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t
  };
}

function pointToSegmentDistance(a: Vec2, b: Vec2, p: Vec2): number {
  const closest = closestPointOnSegment(a, b, p);
  return Math.hypot(p.x - closest.x, p.y - closest.y);
}

function nearestSegment(route: Vec2[], point: Vec2): { distance: number; angle: number; closest: Vec2; index: number } {
  let best = { distance: Number.POSITIVE_INFINITY, angle: 0, closest: route[0] ?? point, index: 0 };
  for (let i = 0; i < route.length - 1; i += 1) {
    const a = route[i];
    const b = route[i + 1];
    const closest = closestPointOnSegment(a, b, point);
    const distance = Math.hypot(point.x - closest.x, point.y - closest.y);
    if (distance < best.distance) {
      best = { distance, angle: Math.atan2(b.y - a.y, b.x - a.x), closest, index: i };
    }
  }
  return best;
}

function polylineLength(points: Vec2[]): number {
  let length = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    length += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  return length;
}

function simplifyRoute(points: Vec2[]): Vec2[] {
  const simplified: Vec2[] = [];
  for (const point of points) {
    const previous = simplified[simplified.length - 1];
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 8) {
      simplified.push(point);
    }
  }
  return simplified.length >= 2 ? simplified : points;
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
