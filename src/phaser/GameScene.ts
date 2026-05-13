import Phaser from "phaser";
import { AntColonySimulation, TOOL_DEFINITIONS } from "../simulation/AntColonySimulation";
import type { HudController } from "../ui/HudController";
import type { MapPreset, PlacedObject, TerrainPatch, ToolKind, Vec2 } from "../simulation/types";

declare global {
  interface Window {
    __antDebug?: () => ReturnType<AntColonySimulation["getDebugSnapshot"]>;
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

export class GameScene extends Phaser.Scene {
  private readonly simulation = new AntColonySimulation();
  private readonly hud: HudController;
  private ground!: Phaser.GameObjects.Graphics;
  private pheromoneLayer!: Phaser.GameObjects.Graphics;
  private objectLayer!: Phaser.GameObjects.Graphics;
  private antLayer!: Phaser.GameObjects.Graphics;
  private fxLayer!: Phaser.GameObjects.Graphics;
  private previewLayer!: Phaser.GameObjects.Graphics;
  private lastPlaceAt = 0;
  private preferredTimeScale = 1;

  constructor(hud: HudController) {
    super("game");
    this.hud = hud;
  }

  create(): void {
    this.ground = this.add.graphics();
    this.pheromoneLayer = this.add.graphics();
    this.objectLayer = this.add.graphics();
    this.antLayer = this.add.graphics();
    this.fxLayer = this.add.graphics();
    this.previewLayer = this.add.graphics();

    this.drawGround();
    this.hud.mount({
      tools: TOOL_DEFINITIONS,
      maps: this.simulation.maps,
      onToolSelect: (tool) => this.simulation.setTool(tool),
      onToolCycle: () => this.cycleTool(),
      onMapSelect: (mapId) => {
        this.simulation.setMap(mapId);
        this.simulation.setTimeScale(this.preferredTimeScale);
        this.drawGround();
      },
      onReset: () => {
        this.simulation.reset();
        this.simulation.setTimeScale(this.preferredTimeScale);
        this.drawGround();
      },
      onTimeScaleToggle: () => {
        this.simulation.toggleTimeScale();
        this.preferredTimeScale = this.simulation.timeScale;
      }
    });
    window.__antDebug = () => this.simulation.getDebugSnapshot();
    window.render_game_to_text = () =>
      JSON.stringify({
        coordinateSystem: "origin top-left, x right, y down",
        stats: this.simulation.getDebugSnapshot(),
        foods: this.simulation.foods,
        dominantTrailPoints: this.simulation.getDominantTrail().length,
        dominantTrailStrength: Math.round(this.simulation.getDominantTrailStrength() * 100) / 100,
        cargoAnts: this.simulation.ants.filter((ant) => ant.cargoSize > 0).length,
        objects: this.simulation.objects.map((object) => ({ kind: object.kind, x: Math.round(object.x), y: Math.round(object.y), radius: Math.round(object.radius) }))
      });
    window.advanceTime = (ms: number) => {
      this.simulation.step(ms);
      this.renderWorld();
      this.hud.update(this.simulation.getStats());
    };

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.tryPlace(pointer, true));
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown && this.simulation.selectedTool === "finger") {
        this.tryPlace(pointer, false);
      }
    });
  }

  update(_time: number, delta: number): void {
    this.simulation.step(delta);
    this.renderWorld();
    this.hud.update(this.simulation.getStats());
  }

  private tryPlace(pointer: Phaser.Input.Pointer, primaryClick: boolean): void {
    const now = performance.now();
    const tool = TOOL_DEFINITIONS.find((entry) => entry.kind === this.simulation.selectedTool)!;
    if (now - this.lastPlaceAt < tool.cooldownMs) return;
    this.lastPlaceAt = now;
    const result = this.simulation.toggleToolAt(pointer.worldX, pointer.worldY, this.simulation.selectedTool, primaryClick);
    if (result === "placed" && primaryClick) {
      this.pulse(pointer.worldX, pointer.worldY, this.simulation.selectedTool);
    } else if (result === "removed" && primaryClick) {
      this.removePulse(pointer.worldX, pointer.worldY);
      this.floatText(pointer.worldX, pointer.worldY - 18, "取った", 0x59694b);
    } else if (result === "blocked" && primaryClick) {
      this.deniedPulse(pointer.worldX, pointer.worldY);
      this.floatText(pointer.worldX, pointer.worldY - 18, "置けない", 0x8d5f52);
    }
  }

  private cycleTool(): void {
    const currentIndex = TOOL_DEFINITIONS.findIndex((tool) => tool.kind === this.simulation.selectedTool);
    const nextTool = TOOL_DEFINITIONS[(currentIndex + 1) % TOOL_DEFINITIONS.length];
    this.simulation.setTool(nextTool.kind);
  }

  private drawGround(): void {
    const map = this.simulation.map;
    this.ground.clear();
    this.ground.fillStyle(map.background, 1);
    this.ground.fillRect(0, 0, this.simulation.width, this.simulation.height);

    if (map.id === "scramble") {
      this.drawScrambleCityBase();
    }

    for (let i = 0; i < 180; i += 1) {
      const x = seededRange(map.scatterSeed, i * 2, 0, this.simulation.width);
      const y = seededRange(map.scatterSeed, i * 2 + 1, 0, this.simulation.height);
      const color = i % 3 === 0 ? 0xb6aa91 : i % 3 === 1 ? 0xd4c9b1 : 0xaeb18f;
      this.ground.fillStyle(color, 0.24);
      this.ground.fillCircle(x, y, 1 + seededRange(map.scatterSeed, i + 400, 0, 2.2));
    }

    this.drawTerrain(map);
    this.drawMapRoutes(map);

    this.ground.fillStyle(0x84725f, 1);
    this.ground.fillCircle(this.simulation.nest.x, this.simulation.nest.y, 31);
    this.ground.fillStyle(0x5c5148, 0.48);
    this.ground.fillCircle(this.simulation.nest.x + 3, this.simulation.nest.y + 2, 19);

    for (const food of this.simulation.foods) {
      this.drawFoodPile(food);
    }
  }

  private drawMapRoutes(map: MapPreset): void {
    if (map.id === "scramble") {
      this.drawScrambleCrosswalks();
    }
  }

  private drawTerrain(map: MapPreset): void {
    if (map.id === "scramble") return;
    for (const patch of map.terrain) {
      if (patch.kind === "plaza") {
        this.drawRotatedEllipse(patch, 0xd8d0ba, 0.42);
        this.ground.lineStyle(2, 0xefe8d6, 0.25);
        this.strokeRotatedEllipse(patch);
      }
      if (patch.kind === "hill") {
        this.drawRotatedEllipse(patch, 0x8d9273, 0.58);
        this.drawRotatedEllipse({ ...patch, rx: patch.rx * 0.56, ry: patch.ry * 0.5 }, 0xa8aa86, 0.46);
      }
      if (patch.kind === "river") {
        this.drawRotatedEllipse(patch, 0x8ca4a6, 0.5);
        this.drawRotatedEllipse({ ...patch, rx: patch.rx * 0.92, ry: patch.ry * 0.55 }, 0xb6cac7, 0.32);
      }
      if (patch.kind === "root") {
        this.drawRotatedEllipse(patch, 0x746b58, 0.42);
        this.drawRotatedEllipse({ ...patch, rx: patch.rx * 0.75, ry: patch.ry * 0.42 }, 0x94876f, 0.28);
      }
    }
  }

  private drawScrambleCityBase(): void {
    this.ground.fillStyle(0x7c7974, 1);
    this.ground.fillRect(0, 0, this.simulation.width, this.simulation.height);

    this.ground.fillStyle(0xa49d91, 1);
    this.ground.fillRect(0, 0, this.simulation.width, 122);
    this.ground.fillRect(0, 512, this.simulation.width, 128);
    this.ground.fillRect(0, 0, 138, this.simulation.height);
    this.ground.fillRect(814, 0, 146, this.simulation.height);

    const roads = [
      { x: 482, y: 338, width: 1080, height: 154, rotation: -0.48 },
      { x: 492, y: 344, width: 1040, height: 146, rotation: 0.38 },
      { x: 500, y: 332, width: 940, height: 136, rotation: -1.49 },
      { x: 494, y: 368, width: 820, height: 126, rotation: 0.02 },
      { x: 594, y: 396, width: 660, height: 112, rotation: 1.08 }
    ];
    for (const road of roads) {
      this.drawRotatedRect(road.x, road.y, road.width, road.height, road.rotation, 0x6f6f6d, 1);
    }
    this.drawRotatedRect(494, 348, 374, 254, -0.12, 0x787671, 1);

    this.ground.lineStyle(2, 0xd8d1be, 0.16);
    for (const lane of roads) {
      this.drawRotatedLaneLines(lane.x, lane.y, lane.width, lane.rotation);
    }

    this.drawScrambleBuildings();
    this.drawScrambleCars();
    this.drawScrambleTrees();
  }

  private drawRotatedLaneLines(x: number, y: number, width: number, rotation: number): void {
    for (const offset of [-42, 42]) {
      this.ground.save();
      this.ground.translateCanvas(x, y);
      this.ground.rotateCanvas(rotation);
      for (let segment = -width / 2; segment < width / 2; segment += 72) {
        this.ground.lineBetween(segment, offset, segment + 34, offset);
      }
      this.ground.restore();
    }
  }

  private drawWindowBand(x: number, y: number, width: number, rotation: number, color: number): void {
    this.ground.save();
    this.ground.translateCanvas(x, y);
    this.ground.rotateCanvas(rotation);
    for (let i = -width / 2; i < width / 2; i += 18) {
      this.ground.fillStyle(i % 36 === 0 ? color : 0xefe1b5, 0.38);
      this.ground.fillRoundedRect(i, -6, 10, 12, 2);
    }
    this.ground.restore();
  }

  private drawScrambleCrosswalks(): void {
    const crossings = [
      { x: 492, y: 402, length: 352, stripe: 17, rotation: -0.04 },
      { x: 608, y: 294, length: 318, stripe: 16, rotation: -0.52 },
      { x: 374, y: 314, length: 306, stripe: 16, rotation: 0.42 },
      { x: 492, y: 228, length: 304, stripe: 15, rotation: 1.38 },
      { x: 260, y: 500, length: 230, stripe: 14, rotation: 0.1 },
      { x: 740, y: 440, length: 262, stripe: 15, rotation: -0.36 },
      { x: 778, y: 174, length: 220, stripe: 14, rotation: 0.48 }
    ];
    for (const crossing of crossings) {
      this.drawCrosswalk(crossing.x, crossing.y, crossing.length, crossing.stripe, crossing.rotation);
    }

    this.ground.lineStyle(5, 0xf0eadb, 0.68);
    this.ground.strokeEllipse(492, 346, 238, 164);
    this.drawPedestrianCrowd(256, 178, 86, 46, 0.16, 32);
    this.drawPedestrianCrowd(722, 152, 98, 42, -0.12, 36);
    this.drawPedestrianCrowd(812, 386, 58, 126, 0.1, 34);
    this.drawPedestrianCrowd(638, 528, 122, 44, -0.16, 38);
    this.drawPedestrianCrowd(192, 462, 76, 92, 0.18, 34);
    this.drawPedestrianCrowd(402, 514, 78, 42, -0.08, 26);
  }

  private drawCrosswalk(x: number, y: number, length: number, stripeWidth: number, rotation: number): void {
    this.ground.save();
    this.ground.translateCanvas(x, y);
    this.ground.rotateCanvas(rotation);
    for (let offset = -length / 2; offset < length / 2; offset += stripeWidth * 2.05) {
      this.ground.fillStyle(0xf4efe2, 0.9);
      this.ground.fillRoundedRect(offset, -36, stripeWidth, 72, 2);
      this.ground.fillStyle(0xbeb6a8, 0.16);
      this.ground.fillRoundedRect(offset + stripeWidth * 0.18, -31, stripeWidth * 0.18, 62, 1);
    }
    this.ground.restore();
  }

  private drawScrambleBuildings(): void {
    this.drawRotatedRect(104, 70, 226, 116, -0.08, 0x5f625d, 1);
    this.drawRotatedRect(112, 182, 154, 84, -0.2, 0x8b6b60, 1);
    this.drawRotatedRect(350, 60, 230, 82, 0.05, 0x696b68, 1);
    this.drawRotatedRect(774, 62, 300, 104, 0.14, 0x6b625a, 1);
    this.drawRotatedRect(888, 306, 120, 354, 0.05, 0x585b60, 1);
    this.drawRotatedRect(748, 592, 326, 80, -0.1, 0x6b625d, 1);
    this.drawRotatedRect(150, 552, 230, 92, 0.2, 0x67695e, 1);

    this.drawSignageStrip(104, 70, 190, -0.08, [0xb78363, 0xc8b46f, 0x7793a4]);
    this.drawSignageStrip(350, 60, 184, 0.05, [0x7da0aa, 0xb7c0bc, 0xd5c487]);
    this.drawSignageStrip(774, 62, 236, 0.14, [0xb36f6a, 0x7488b1, 0xc7a667]);
    this.drawSignageStrip(888, 306, 306, 1.62, [0x6f75b0, 0x84a7b0, 0xb47779]);
    this.drawSignageStrip(748, 592, 264, -0.1, [0xd7c996, 0x8ea083, 0xa98270]);

    this.drawRotatedRect(850, 216, 96, 180, 0.05, 0x83a1a8, 0.62);
    this.ground.lineStyle(2, 0xc8d3d0, 0.36);
    for (let i = 0; i < 7; i += 1) {
      this.ground.lineBetween(818, 140 + i * 24, 888, 138 + i * 24);
    }
  }

  private drawSignageStrip(x: number, y: number, width: number, rotation: number, colors: number[]): void {
    this.ground.save();
    this.ground.translateCanvas(x, y);
    this.ground.rotateCanvas(rotation);
    for (let i = 0; i < colors.length; i += 1) {
      this.ground.fillStyle(colors[i], 0.82);
      this.ground.fillRoundedRect(-width / 2 + i * (width / colors.length) + 5, -18, width / colors.length - 10, 36, 3);
      this.ground.fillStyle(0xf1ead7, 0.18);
      this.ground.fillRoundedRect(-width / 2 + i * (width / colors.length) + 10, -12, width / colors.length - 20, 8, 2);
    }
    this.ground.restore();
  }

  private drawScrambleCars(): void {
    const cars = [
      { x: 208, y: 266, rotation: -0.48, color: 0xbfc5bf },
      { x: 244, y: 246, rotation: -0.48, color: 0x8f9aa1 },
      { x: 714, y: 240, rotation: -0.52, color: 0xc8bea5 },
      { x: 754, y: 218, rotation: -0.52, color: 0x8791a0 },
      { x: 714, y: 486, rotation: -0.36, color: 0xa78f82 },
      { x: 760, y: 468, rotation: -0.36, color: 0xd1d0c2 },
      { x: 422, y: 156, rotation: 1.38, color: 0x8e9a8c },
      { x: 516, y: 540, rotation: 0.02, color: 0xb4aba0 }
    ];
    for (const car of cars) {
      this.drawCar(car.x, car.y, car.rotation, car.color);
    }
  }

  private drawCar(x: number, y: number, rotation: number, color: number): void {
    this.ground.save();
    this.ground.translateCanvas(x, y);
    this.ground.rotateCanvas(rotation);
    this.ground.fillStyle(color, 0.92);
    this.ground.fillRoundedRect(-16, -7, 32, 14, 3);
    this.ground.fillStyle(0x4d5559, 0.38);
    this.ground.fillRoundedRect(-5, -5, 12, 10, 2);
    this.ground.restore();
  }

  private drawScrambleTrees(): void {
    for (const tree of [
      { x: 64, y: 230 },
      { x: 76, y: 282 },
      { x: 86, y: 438 },
      { x: 196, y: 584 },
      { x: 678, y: 584 },
      { x: 918, y: 468 },
      { x: 916, y: 146 }
    ]) {
      this.ground.fillStyle(0x5f705b, 0.9);
      this.ground.fillCircle(tree.x, tree.y, 18);
      this.ground.fillStyle(0x82906d, 0.42);
      this.ground.fillCircle(tree.x - 5, tree.y - 5, 8);
    }
  }

  private drawPedestrianCrowd(x: number, y: number, width: number, height: number, rotation: number, count: number): void {
    this.ground.save();
    this.ground.translateCanvas(x, y);
    this.ground.rotateCanvas(rotation);
    for (let i = 0; i < count; i += 1) {
      const px = seededRange(211 + x, i * 2, -width / 2, width / 2);
      const py = seededRange(223 + y, i * 2 + 1, -height / 2, height / 2);
      const color = i % 4 === 0 ? 0x2f3334 : i % 4 === 1 ? 0x56524a : i % 4 === 2 ? 0x72645a : 0x3f4a51;
      this.ground.fillStyle(color, 0.58);
      this.ground.fillCircle(px, py, seededRange(233 + x, i, 1.6, 2.9));
    }
    this.ground.restore();
  }

  private drawRotatedRect(x: number, y: number, width: number, height: number, rotation: number, color: number, alpha: number): void {
    this.ground.save();
    this.ground.translateCanvas(x, y);
    this.ground.rotateCanvas(rotation);
    this.ground.fillStyle(color, alpha);
    this.ground.fillRect(-width / 2, -height / 2, width, height);
    this.ground.restore();
  }

  private drawRotatedEllipse(patch: TerrainPatch, color: number, alpha: number): void {
    this.ground.save();
    this.ground.translateCanvas(patch.x, patch.y);
    this.ground.rotateCanvas(patch.rotation ?? 0);
    this.ground.fillStyle(color, alpha);
    this.ground.fillEllipse(0, 0, patch.rx * 2, patch.ry * 2);
    this.ground.restore();
  }

  private strokeRotatedEllipse(patch: TerrainPatch): void {
    this.ground.save();
    this.ground.translateCanvas(patch.x, patch.y);
    this.ground.rotateCanvas(patch.rotation ?? 0);
    this.ground.strokeEllipse(0, 0, patch.rx * 2, patch.ry * 2);
    this.ground.restore();
  }

  private renderWorld(): void {
    this.drawPheromones();
    this.drawObjects();
    this.drawAnts();
    this.drawPointerPreview();
  }

  private drawPheromones(): void {
    const grid = this.simulation.pheromones;
    this.pheromoneLayer.clear();
    for (let y = 0; y < grid.rows; y += 2) {
      for (let x = 0; x < grid.cols; x += 2) {
        const index = y * grid.cols + x;
        const food = grid.food[index];
        const home = grid.home[index];
        const disruption = grid.disruption[index];
        if (food > 0.025) {
          this.pheromoneLayer.fillStyle(0x8f9f7a, Math.min(0.3, food * 0.18));
          this.pheromoneLayer.fillCircle((x + 0.5) * grid.cellSize, (y + 0.5) * grid.cellSize, 5);
        }
        if (home > 0.025) {
          this.pheromoneLayer.fillStyle(0x9f856b, Math.min(0.24, home * 0.15));
          this.pheromoneLayer.fillCircle((x + 0.5) * grid.cellSize, (y + 0.5) * grid.cellSize, 4);
        }
        if (disruption > 0.03) {
          this.pheromoneLayer.fillStyle(0x7894a0, Math.min(0.18, disruption * 0.11));
          this.pheromoneLayer.fillCircle((x + 0.5) * grid.cellSize, (y + 0.5) * grid.cellSize, 7);
        }
        if (x % 4 === 0 && y % 4 === 0 && food + home > 0.22 && disruption < 0.2) {
          this.pheromoneLayer.fillStyle(0xd4c174, Math.min(0.18, (food + home) * 0.045));
          this.pheromoneLayer.fillCircle((x + 0.5) * grid.cellSize, (y + 0.5) * grid.cellSize, 3.2);
        }
      }
    }
    this.drawDominantTrail();
  }

  private drawDominantTrail(): void {
    const trail = this.simulation.getDominantTrail();
    if (trail.length < 2) return;
    const strength = this.simulation.getDominantTrailStrength();
    this.pheromoneLayer.lineStyle(8, 0xd8c77a, 0.08 + strength * 0.12);
    this.drawSplineOnLayer(this.pheromoneLayer, trail, 76);
    this.pheromoneLayer.lineStyle(3, 0x7f8b62, 0.24 + strength * 0.28);
    this.drawSplineOnLayer(this.pheromoneLayer, trail, 76);
    this.pheromoneLayer.lineStyle(1, 0xf1e3a4, 0.32 + strength * 0.38);
    this.drawSplineOnLayer(this.pheromoneLayer, trail, 76);
  }

  private drawSplineOnLayer(layer: Phaser.GameObjects.Graphics, points: Vec2[], divisions: number): void {
    if (points.length < 2) return;
    const path = new Phaser.Curves.Spline(points.flatMap((point) => [point.x, point.y]));
    path.draw(layer, divisions);
  }

  private drawPointerPreview(): void {
    this.previewLayer.clear();
    const pointer = this.input.activePointer;
    if (!pointer || pointer.worldX < 0 || pointer.worldX > this.simulation.width || pointer.worldY < 0 || pointer.worldY > this.simulation.height) return;
    const tool = TOOL_DEFINITIONS.find((entry) => entry.kind === this.simulation.selectedTool);
    if (!tool) return;
    const removing = this.simulation.hasObjectAt(pointer.worldX, pointer.worldY);
    const color = removing ? 0x59694b : this.toolColor(this.simulation.selectedTool);
    const radius = removing ? 24 : tool.radius;
    this.previewLayer.fillStyle(color, removing ? 0.08 : 0.045);
    this.previewLayer.fillCircle(pointer.worldX, pointer.worldY, radius);
    this.previewLayer.lineStyle(removing ? 3 : 2, color, removing ? 0.72 : 0.38);
    this.previewLayer.strokeCircle(pointer.worldX, pointer.worldY, radius);
    if (removing) {
      this.previewLayer.lineBetween(pointer.worldX - 9, pointer.worldY, pointer.worldX + 9, pointer.worldY);
      this.previewLayer.lineBetween(pointer.worldX, pointer.worldY - 9, pointer.worldX, pointer.worldY + 9);
    } else {
      this.previewLayer.lineStyle(1, 0xefe7d4, 0.22);
      this.previewLayer.strokeCircle(pointer.worldX, pointer.worldY, Math.max(8, radius * 0.42));
    }
  }

  private drawObjects(): void {
    this.objectLayer.clear();
    for (const object of this.simulation.objects) {
      const alpha = Math.min(1, 0.66 + object.age * 1.8);
      if (object.kind === "pebble") this.drawPebble(object, alpha);
      if (object.kind === "leaf") this.drawLeaf(object, alpha);
      if (object.kind === "water") this.drawWater(object, alpha);
      if (object.kind === "pump") this.drawPump(object, alpha);
      if (object.kind === "mystery") this.drawMystery(object, alpha);
      if (object.kind === "finger") this.drawFinger(object, alpha);
    }
  }

  private drawAnts(): void {
    this.antLayer.clear();
    for (const ant of this.simulation.ants) {
      const bodyColor = ant.washedTtl > 0 ? 0x5f7278 : ant.mode === "return" ? 0x6b5d43 : 0x4f5f57;
      const headColor = ant.washedTtl > 0 ? 0x71868a : ant.mode === "return" ? 0x8a7652 : 0x65766b;
      this.antLayer.save();
      this.antLayer.translateCanvas(ant.x, ant.y);
      this.antLayer.rotateCanvas(ant.heading);
      if (ant.washedTtl > 0) {
        this.antLayer.lineStyle(2, 0x9eb8ba, Math.min(0.5, ant.washedTtl * 0.28));
        this.antLayer.lineBetween(-15, 0, -5, 0);
      }
      this.antLayer.fillStyle(bodyColor, 0.9);
      this.antLayer.fillEllipse(0, 0, 9, 4.6);
      this.antLayer.fillStyle(headColor, 0.86);
      this.antLayer.fillEllipse(4.7, 0, 4.7, 3.6);
      if (ant.cargoSize > 0) {
        this.antLayer.fillStyle(0xd4c174, 0.95);
        this.antLayer.fillCircle(-9.8, 0, ant.cargoSize);
        this.antLayer.fillStyle(0xf0df98, 0.72);
        this.antLayer.fillCircle(-13.2, -3, ant.cargoSize * 0.32);
        this.antLayer.lineStyle(1, 0x8f7f49, 0.28);
        this.antLayer.strokeCircle(-9.8, 0, ant.cargoSize);
      }
      if (ant.mode === "return") {
        this.antLayer.fillStyle(0xd7c87a, 0.9);
        this.antLayer.fillCircle(-5.4, 0, ant.cargoSize > 0 ? 1.4 : 2);
      }
      this.antLayer.restore();
      if (ant.cargoSize > 0) {
        this.antLayer.fillStyle(0xf0df98, 0.2);
        this.antLayer.fillCircle(ant.x, ant.y - 12, 13);
        this.antLayer.lineStyle(2, 0xf0df98, 0.62);
        this.antLayer.strokeCircle(ant.x, ant.y - 12, 8.8);
        this.antLayer.fillStyle(0xf4df8c, 0.95);
        this.antLayer.fillRoundedRect(ant.x - 6.5, ant.y - 18.5, 13, 10, 3);
        this.antLayer.fillStyle(0x9a8750, 0.62);
        this.antLayer.fillCircle(ant.x + 3.4, ant.y - 14.5, 2.2);
      }
    }
  }

  private drawFoodPile(food: Vec2): void {
    this.ground.fillStyle(0xf1df92, 0.1);
    this.ground.fillCircle(food.x, food.y, 42);
    this.ground.lineStyle(2, 0xf2e6aa, 0.42);
    this.ground.strokeCircle(food.x, food.y, 33);
    this.ground.lineStyle(1, 0x9d8d58, 0.22);
    this.ground.strokeCircle(food.x, food.y, 22);
    for (let i = 0; i < 15; i += 1) {
      const angle = (i / 15) * Math.PI * 2 + seededRange(this.simulation.map.scatterSeed, i + 810, -0.25, 0.25);
      const distance = seededRange(this.simulation.map.scatterSeed, i + 840, 3, 23);
      const radius = seededRange(this.simulation.map.scatterSeed, i + 870, 3.8, 7.4);
      const x = food.x + Math.cos(angle) * distance;
      const y = food.y + Math.sin(angle) * distance * 0.68;
      this.ground.fillStyle(i % 3 === 0 ? 0xf3e39a : i % 3 === 1 ? 0xd8c97e : 0xc9ad60, 0.96);
      this.ground.fillCircle(x, y, radius);
      this.ground.fillStyle(0xfff1b9, 0.55);
      this.ground.fillCircle(x - radius * 0.28, y - radius * 0.28, radius * 0.32);
    }
  }

  private drawPebble(object: PlacedObject, alpha: number): void {
    this.objectLayer.save();
    this.objectLayer.translateCanvas(object.x, object.y);
    this.objectLayer.rotateCanvas(object.rotation);
    this.objectLayer.fillStyle(0x8f897d, 0.9 * alpha);
    this.objectLayer.fillEllipse(0, 0, object.radius * 2 * object.stretch, object.radius * 1.58);
    for (let i = 0; i < 5; i += 1) {
      const angle = seededRange(object.variantSeed, i, -Math.PI, Math.PI);
      const distance = seededRange(object.variantSeed, i + 10, 0, object.radius * 0.42);
      const r = seededRange(object.variantSeed, i + 20, object.radius * 0.16, object.radius * 0.34);
      this.objectLayer.fillStyle(i % 2 === 0 ? 0xa8a193 : 0x777168, (i % 2 === 0 ? 0.34 : 0.2) * alpha);
      this.objectLayer.fillCircle(Math.cos(angle) * distance, Math.sin(angle) * distance * 0.8, r);
    }
    this.objectLayer.fillStyle(0xb5ad9d, 0.42 * alpha);
    this.objectLayer.fillCircle(-object.radius * 0.28, -object.radius * 0.22, object.radius * 0.34);
    this.objectLayer.restore();
  }

  private drawLeaf(object: PlacedObject, alpha: number): void {
    this.objectLayer.save();
    this.objectLayer.translateCanvas(object.x, object.y);
    this.objectLayer.rotateCanvas(object.rotation);
    this.objectLayer.fillStyle(0x87936d, 0.9 * alpha);
    this.objectLayer.fillEllipse(0, 0, object.radius * object.stretch * 1.55, object.radius * 0.86);
    this.objectLayer.lineStyle(2, 0x667257, 0.55 * alpha);
    this.objectLayer.lineBetween(-object.radius * object.stretch * 0.55, 0, object.radius * object.stretch * 0.58, 0);
    this.objectLayer.restore();
  }

  private drawWater(object: PlacedObject, alpha: number): void {
    this.objectLayer.fillStyle(0x8ba6ad, 0.38 * alpha);
    this.objectLayer.fillCircle(object.x, object.y, object.radius);
    this.objectLayer.lineStyle(2, 0xd9e5e4, 0.4 * alpha);
    this.objectLayer.strokeCircle(object.x - 5, object.y - 5, object.radius * 0.45);
  }

  private drawPump(object: PlacedObject, alpha: number): void {
    this.objectLayer.fillStyle(0x8ba6ad, 0.22 * alpha);
    this.objectLayer.fillCircle(object.x, object.y, object.radius * 1.18);
    this.objectLayer.lineStyle(4, 0xc7d8d6, 0.62 * alpha);
    for (let i = 0; i < 9; i += 1) {
      const angle = (i / 9) * Math.PI * 2 + object.age * 2.4;
      const inner = object.radius * 0.18;
      const outer = object.radius * (0.64 + (i % 3) * 0.12);
      this.objectLayer.lineBetween(
        object.x + Math.cos(angle) * inner,
        object.y + Math.sin(angle) * inner,
        object.x + Math.cos(angle) * outer,
        object.y + Math.sin(angle) * outer
      );
    }
    this.objectLayer.fillStyle(0xe2eeeb, 0.44 * alpha);
    this.objectLayer.fillCircle(object.x - 10, object.y - 12, object.radius * 0.24);
  }

  private drawMystery(object: PlacedObject, alpha: number): void {
    const pulse = 0.9 + Math.sin(object.age * 4 + object.variantSeed) * 0.08;
    this.objectLayer.fillStyle(0x7d7890, 0.16 * alpha);
    this.objectLayer.fillCircle(object.x, object.y, object.radius * pulse);
    this.objectLayer.lineStyle(3, this.toolColor(object.effectKind), 0.44 * alpha);
    this.objectLayer.strokeCircle(object.x, object.y, object.radius * 0.48 * pulse);
    this.objectLayer.fillStyle(0x5d576a, 0.72 * alpha);
    this.objectLayer.fillCircle(object.x, object.y - object.radius * 0.06, object.radius * 0.16);
    this.objectLayer.fillStyle(0xe8e0ca, 0.78 * alpha);
    this.objectLayer.fillCircle(object.x + object.radius * 0.05, object.y - object.radius * 0.1, object.radius * 0.04);
  }

  private drawFinger(object: PlacedObject, alpha: number): void {
    this.objectLayer.save();
    this.objectLayer.translateCanvas(object.x, object.y);
    this.objectLayer.rotateCanvas(object.rotation);
    this.objectLayer.fillStyle(0xb78f79, 0.14 * alpha);
    this.objectLayer.fillEllipse(0, 0, object.radius * object.stretch * 2, object.radius * 1.05);
    this.objectLayer.lineStyle(3, 0xa67863, 0.14 * alpha);
    for (let i = -1; i <= 1; i += 1) {
      this.objectLayer.strokeEllipse(0, i * object.radius * 0.14, object.radius * object.stretch * 1.45, object.radius * 0.46);
    }
    this.objectLayer.restore();
  }

  private pulse(x: number, y: number, kind: ToolKind): void {
    const color = this.toolColor(kind);
    const ring = this.add.circle(x, y, 8).setStrokeStyle(2, color, 0.6).setFillStyle(color, 0.08);
    this.tweens.add({
      targets: ring,
      radius: kind === "pump" ? 118 : kind === "mystery" ? 84 : 48,
      alpha: 0,
      duration: kind === "pump" ? 520 : kind === "mystery" ? 460 : 360,
      ease: "Sine.easeOut",
      onComplete: () => ring.destroy()
    });
    const dotCount = kind === "pump" ? 14 : kind === "mystery" ? 11 : 7;
    for (let i = 0; i < dotCount; i += 1) {
      const angle = (i / dotCount) * Math.PI * 2 + seededRange(x + y, i, -0.2, 0.2);
      const dot = this.add.circle(x, y, 2.2, color, 0.36);
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(angle) * seededRange(x, i, 18, kind === "pump" ? 92 : 42),
        y: y + Math.sin(angle) * seededRange(y, i, 18, kind === "pump" ? 92 : 42),
        alpha: 0,
        duration: kind === "pump" ? 620 : 420,
        ease: "Sine.easeOut",
        onComplete: () => dot.destroy()
      });
    }
  }

  private toolColor(kind: ToolKind): number {
    if (kind === "mystery") return 0x7d7890;
    if (kind === "pump" || kind === "water") return 0x8ba6ad;
    if (kind === "leaf") return 0x87936d;
    if (kind === "finger") return 0xb78f79;
    return 0x8f897d;
  }

  private deniedPulse(x: number, y: number): void {
    const ring = this.add.circle(x, y, 8).setStrokeStyle(2, 0x9b6a5c, 0.72).setFillStyle(0x9b6a5c, 0.05);
    this.tweens.add({
      targets: ring,
      radius: 34,
      alpha: 0,
      duration: 300,
      ease: "Sine.easeOut",
      onComplete: () => ring.destroy()
    });
  }

  private removePulse(x: number, y: number): void {
    const ring = this.add.circle(x, y, 34).setStrokeStyle(2, 0x59694b, 0.55).setFillStyle(0x59694b, 0.03);
    this.tweens.add({
      targets: ring,
      radius: 10,
      alpha: 0,
      duration: 260,
      ease: "Sine.easeIn",
      onComplete: () => ring.destroy()
    });
  }

  private floatText(x: number, y: number, text: string, color: number): void {
    const label = this.add
      .text(x, y, text, {
        fontFamily: "Hiragino Sans, Yu Gothic, sans-serif",
        fontSize: "18px",
        fontStyle: "700",
        color: `#${color.toString(16).padStart(6, "0")}`,
        stroke: "#efe7d4",
        strokeThickness: 4
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: label,
      y: y - 32,
      alpha: 0,
      duration: 760,
      ease: "Sine.easeOut",
      onComplete: () => label.destroy()
    });
  }
}

function seededRange(seed: number, salt: number, min: number, max: number): number {
  const raw = Math.sin((seed + salt * 101.13) * 12.9898) * 43758.5453;
  return min + (raw - Math.floor(raw)) * (max - min);
}
