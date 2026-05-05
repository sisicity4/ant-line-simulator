import Phaser from "phaser";
import { AntColonySimulation, TOOL_DEFINITIONS } from "../simulation/AntColonySimulation";
import type { HudController } from "../ui/HudController";
import type { MapPreset, PlacedObject, TerrainPatch, ToolKind, Vec2 } from "../simulation/types";

export class GameScene extends Phaser.Scene {
  private readonly simulation = new AntColonySimulation();
  private readonly hud: HudController;
  private ground!: Phaser.GameObjects.Graphics;
  private pheromoneLayer!: Phaser.GameObjects.Graphics;
  private objectLayer!: Phaser.GameObjects.Graphics;
  private antLayer!: Phaser.GameObjects.Graphics;
  private fxLayer!: Phaser.GameObjects.Graphics;
  private lastPlaceAt = 0;

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

    this.drawGround();
    this.hud.mount({
      tools: TOOL_DEFINITIONS,
      maps: this.simulation.maps,
      onToolSelect: (tool) => this.simulation.setTool(tool),
      onMapSelect: (mapId) => {
        this.simulation.setMap(mapId);
        this.drawGround();
      },
      onReset: () => {
        this.simulation.reset();
        this.drawGround();
      },
      onTimeScaleToggle: () => this.simulation.toggleTimeScale()
    });

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
    const placed = this.simulation.placeTool(pointer.worldX, pointer.worldY, this.simulation.selectedTool);
    if (placed && primaryClick) {
      this.pulse(pointer.worldX, pointer.worldY, this.simulation.selectedTool);
    } else if (!placed && primaryClick) {
      this.deniedPulse(pointer.worldX, pointer.worldY);
      this.floatText(pointer.worldX, pointer.worldY - 18, "置けない", 0x8d5f52);
    }
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
      this.ground.fillStyle(0xd8c97e, 1);
      this.ground.fillCircle(food.x, food.y, 20);
      this.ground.fillStyle(0xb69e55, 1);
      for (let i = 0; i < 9; i += 1) {
        const angle = (i / 9) * Math.PI * 2;
        this.ground.fillCircle(food.x + Math.cos(angle) * 25, food.y + Math.sin(angle) * 15, 4);
      }
    }
  }

  private drawMapRoutes(map: MapPreset): void {
    this.ground.lineStyle(2, 0x8f826d, 0.22);
    this.drawSpline(map.route, 56);
    this.ground.lineStyle(2, 0x738065, 0.13);
    for (const branch of map.branches) {
      this.drawSpline(branch.points, 44);
    }

    if (map.id === "scramble") {
      this.drawScrambleCrosswalks();
    }
  }

  private drawSpline(points: Vec2[], divisions: number): void {
    const path = new Phaser.Curves.Spline(points.flatMap((point) => [point.x, point.y]));
    path.draw(this.ground, divisions);
  }

  private drawTerrain(map: MapPreset): void {
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
    this.ground.fillStyle(0x827d76, 1);
    this.ground.fillRect(0, 0, this.simulation.width, this.simulation.height);

    this.drawRotatedRect(500, 342, 1020, 178, -0.48, 0x8f8a83, 1);
    this.drawRotatedRect(438, 354, 940, 150, 0.4, 0x8a867f, 0.92);
    this.drawRotatedRect(484, 340, 920, 134, -1.48, 0x938d84, 0.9);
    this.drawRotatedRect(490, 350, 360, 230, -0.16, 0x9c968b, 0.78);

    this.ground.lineStyle(2, 0xd8d1be, 0.16);
    for (const lane of [
      { x: 500, y: 342, width: 980, rotation: -0.48 },
      { x: 438, y: 354, width: 900, rotation: 0.4 },
      { x: 484, y: 340, width: 880, rotation: -1.48 }
    ]) {
      this.drawRotatedLaneLines(lane.x, lane.y, lane.width, lane.rotation);
    }

    this.drawRotatedRect(106, 82, 224, 116, -0.08, 0x6d6f5c, 1);
    this.drawRotatedRect(102, 178, 154, 72, -0.2, 0x9c6f55, 0.95);
    this.drawRotatedRect(782, 54, 292, 96, 0.18, 0x726a5e, 1);
    this.drawRotatedRect(884, 258, 110, 290, 0.08, 0x625f62, 1);
    this.drawRotatedRect(760, 590, 306, 76, -0.1, 0x746a64, 1);
    this.drawRotatedRect(156, 426, 112, 152, 0.34, 0x6f765f, 0.92);

    this.drawWindowBand(108, 82, 184, -0.08, 0xdbbd76);
    this.drawWindowBand(782, 54, 218, 0.18, 0xc99169);
    this.drawWindowBand(884, 258, 244, 1.66, 0x7580ba);
    this.drawWindowBand(760, 590, 246, -0.1, 0xd8c99c);
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
      { x: 480, y: 398, length: 330, stripe: 14, rotation: -0.06 },
      { x: 602, y: 300, length: 288, stripe: 13, rotation: -0.52 },
      { x: 368, y: 316, length: 258, stripe: 13, rotation: 0.42 },
      { x: 488, y: 234, length: 280, stripe: 12, rotation: 1.38 },
      { x: 260, y: 506, length: 226, stripe: 12, rotation: 0.12 },
      { x: 732, y: 438, length: 238, stripe: 12, rotation: -0.36 },
      { x: 760, y: 176, length: 194, stripe: 11, rotation: 0.48 }
    ];
    for (const crossing of crossings) {
      this.drawCrosswalk(crossing.x, crossing.y, crossing.length, crossing.stripe, crossing.rotation);
    }

    this.ground.fillStyle(0x4f554e, 0.24);
    for (let i = 0; i < 86; i += 1) {
      const x = seededRange(83, i * 2, 188, 800);
      const y = seededRange(83, i * 2 + 1, 126, 548);
      if (Math.hypot((x - 500) / 1.45, y - 344) > 210) continue;
      this.ground.fillCircle(x, y, seededRange(83, i + 300, 1.5, 3.5));
    }
  }

  private drawCrosswalk(x: number, y: number, length: number, stripeWidth: number, rotation: number): void {
    this.ground.save();
    this.ground.translateCanvas(x, y);
    this.ground.rotateCanvas(rotation);
    for (let offset = -length / 2; offset < length / 2; offset += stripeWidth * 2.05) {
      this.ground.fillStyle(0xeee8d7, 0.72);
      this.ground.fillRoundedRect(offset, -31, stripeWidth, 62, 2);
      this.ground.fillStyle(0xbeb6a8, 0.16);
      this.ground.fillRoundedRect(offset + stripeWidth * 0.18, -27, stripeWidth * 0.18, 54, 1);
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
      }
    }
  }

  private drawObjects(): void {
    this.objectLayer.clear();
    for (const object of this.simulation.objects) {
      const alpha = Math.min(1, object.ttl / Math.min(object.maxTtl, 5));
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
      const color = ant.washedTtl > 0 ? 0x5f7278 : ant.mode === "return" ? 0x51463d : 0x5f5549;
      this.antLayer.save();
      this.antLayer.translateCanvas(ant.x, ant.y);
      this.antLayer.rotateCanvas(ant.heading);
      if (ant.washedTtl > 0) {
        this.antLayer.lineStyle(2, 0x9eb8ba, Math.min(0.5, ant.washedTtl * 0.28));
        this.antLayer.lineBetween(-15, 0, -5, 0);
      }
      this.antLayer.fillStyle(color, 0.9);
      this.antLayer.fillEllipse(0, 0, 9, 4.6);
      this.antLayer.fillStyle(0x73675a, 0.86);
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
        this.antLayer.fillStyle(0xf0df98, 0.88);
        this.antLayer.fillCircle(ant.x, ant.y - 12, 5.5);
        this.antLayer.lineStyle(1, 0x8f7f49, 0.55);
        this.antLayer.strokeCircle(ant.x, ant.y - 12, 8);
      }
    }
  }

  private drawPebble(object: PlacedObject, alpha: number): void {
    this.objectLayer.fillStyle(0x8f897d, 0.92 * alpha);
    this.objectLayer.fillCircle(object.x, object.y, object.radius);
    this.objectLayer.fillStyle(0xb5ad9d, 0.42 * alpha);
    this.objectLayer.fillCircle(object.x - 8, object.y - 7, object.radius * 0.38);
  }

  private drawLeaf(object: PlacedObject, alpha: number): void {
    this.objectLayer.fillStyle(0x87936d, 0.9 * alpha);
    this.objectLayer.fillEllipse(object.x, object.y, object.radius * 1.55, object.radius * 0.86);
    this.objectLayer.lineStyle(2, 0x667257, 0.55 * alpha);
    this.objectLayer.lineBetween(object.x - object.radius * 0.55, object.y, object.x + object.radius * 0.58, object.y);
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
      const angle = (i / 9) * Math.PI * 2 + object.ttl * 2.4;
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
    this.objectLayer.fillStyle(0x7d7890, 0.18 * alpha);
    this.objectLayer.fillCircle(object.x, object.y, object.radius * 0.92);
    this.objectLayer.lineStyle(3, 0xe8e0ca, 0.5 * alpha);
    this.objectLayer.strokeCircle(object.x, object.y, object.radius * 0.48);
    this.objectLayer.fillStyle(0x5d576a, 0.72 * alpha);
    this.objectLayer.fillCircle(object.x, object.y - object.radius * 0.06, object.radius * 0.16);
    this.objectLayer.fillStyle(0xe8e0ca, 0.78 * alpha);
    this.objectLayer.fillCircle(object.x + object.radius * 0.05, object.y - object.radius * 0.1, object.radius * 0.04);
  }

  private drawFinger(object: PlacedObject, alpha: number): void {
    this.objectLayer.fillStyle(0xb78f79, 0.18 * alpha);
    this.objectLayer.fillCircle(object.x, object.y, object.radius);
    this.objectLayer.lineStyle(3, 0xa67863, 0.16 * alpha);
    this.objectLayer.strokeCircle(object.x, object.y, object.radius * 0.72);
  }

  private pulse(x: number, y: number, kind: ToolKind): void {
    const color = kind === "mystery" ? 0x7d7890 : kind === "pump" || kind === "water" ? 0x8ba6ad : kind === "leaf" ? 0x87936d : kind === "finger" ? 0xb78f79 : 0x8f897d;
    const ring = this.add.circle(x, y, 8).setStrokeStyle(2, color, 0.6).setFillStyle(color, 0.08);
    this.tweens.add({
      targets: ring,
      radius: kind === "pump" ? 118 : kind === "mystery" ? 84 : 48,
      alpha: 0,
      duration: kind === "pump" ? 520 : kind === "mystery" ? 460 : 360,
      ease: "Sine.easeOut",
      onComplete: () => ring.destroy()
    });
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
