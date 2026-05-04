import Phaser from "phaser";
import { AntColonySimulation, TOOL_DEFINITIONS } from "../simulation/AntColonySimulation";
import type { HudController } from "../ui/HudController";
import type { PlacedObject, ToolKind } from "../simulation/types";

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
      onToolSelect: (tool) => this.simulation.setTool(tool),
      onReset: () => this.simulation.reset()
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
    }
  }

  private drawGround(): void {
    this.ground.clear();
    this.ground.fillStyle(0xc8bea6, 1);
    this.ground.fillRect(0, 0, this.simulation.width, this.simulation.height);

    for (let i = 0; i < 130; i += 1) {
      const x = Math.random() * this.simulation.width;
      const y = Math.random() * this.simulation.height;
      const color = i % 3 === 0 ? 0xb6aa91 : i % 3 === 1 ? 0xd4c9b1 : 0xaeb18f;
      this.ground.fillStyle(color, 0.24);
      this.ground.fillCircle(x, y, 1 + Math.random() * 2.2);
    }

    this.ground.lineStyle(2, 0x9d927d, 0.24);
    const path = new Phaser.Curves.Spline([
      110,
      385,
      280,
      300,
      520,
      365,
      835,
      282
    ]);
    path.draw(this.ground, 48);

    this.ground.fillStyle(0x84725f, 1);
    this.ground.fillCircle(this.simulation.nest.x, this.simulation.nest.y, 31);
    this.ground.fillStyle(0x5c5148, 0.48);
    this.ground.fillCircle(this.simulation.nest.x + 3, this.simulation.nest.y + 2, 19);

    this.ground.fillStyle(0xd8c97e, 1);
    this.ground.fillCircle(this.simulation.food.x, this.simulation.food.y, 20);
    this.ground.fillStyle(0xb69e55, 1);
    for (let i = 0; i < 9; i += 1) {
      const angle = (i / 9) * Math.PI * 2;
      this.ground.fillCircle(this.simulation.food.x + Math.cos(angle) * 25, this.simulation.food.y + Math.sin(angle) * 15, 4);
    }
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
      if (object.kind === "finger") this.drawFinger(object, alpha);
    }
  }

  private drawAnts(): void {
    this.antLayer.clear();
    for (const ant of this.simulation.ants) {
      const color = ant.mode === "return" ? 0x51463d : 0x5f5549;
      this.antLayer.save();
      this.antLayer.translateCanvas(ant.x, ant.y);
      this.antLayer.rotateCanvas(ant.heading);
      this.antLayer.fillStyle(color, 0.9);
      this.antLayer.fillEllipse(0, 0, 9, 4.6);
      this.antLayer.fillStyle(0x73675a, 0.86);
      this.antLayer.fillEllipse(4.7, 0, 4.7, 3.6);
      if (ant.mode === "return") {
        this.antLayer.fillStyle(0xd7c87a, 0.9);
        this.antLayer.fillCircle(-5.4, 0, 2);
      }
      this.antLayer.restore();
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

  private drawFinger(object: PlacedObject, alpha: number): void {
    this.objectLayer.fillStyle(0xb78f79, 0.18 * alpha);
    this.objectLayer.fillCircle(object.x, object.y, object.radius);
    this.objectLayer.lineStyle(3, 0xa67863, 0.16 * alpha);
    this.objectLayer.strokeCircle(object.x, object.y, object.radius * 0.72);
  }

  private pulse(x: number, y: number, kind: ToolKind): void {
    const color = kind === "water" ? 0x8ba6ad : kind === "leaf" ? 0x87936d : kind === "finger" ? 0xb78f79 : 0x8f897d;
    const ring = this.add.circle(x, y, 8).setStrokeStyle(2, color, 0.6).setFillStyle(color, 0.08);
    this.tweens.add({
      targets: ring,
      radius: 48,
      alpha: 0,
      duration: 360,
      ease: "Sine.easeOut",
      onComplete: () => ring.destroy()
    });
  }
}
