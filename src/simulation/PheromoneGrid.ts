export class PheromoneGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
  readonly food: Float32Array;
  readonly home: Float32Array;
  readonly disruption: Float32Array;

  constructor(width: number, height: number, cellSize: number) {
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.cellSize = cellSize;
    this.food = new Float32Array(this.cols * this.rows);
    this.home = new Float32Array(this.cols * this.rows);
    this.disruption = new Float32Array(this.cols * this.rows);
  }

  step(dt: number): void {
    const evaporation = Math.pow(0.92, dt);
    const disruptionEvaporation = Math.pow(0.82, dt);
    for (let i = 0; i < this.food.length; i += 1) {
      this.food[i] *= evaporation;
      this.home[i] *= evaporation;
      this.disruption[i] *= disruptionEvaporation;
    }
    this.diffuse(this.food, 0.035 * dt);
    this.diffuse(this.home, 0.035 * dt);
    this.diffuse(this.disruption, 0.02 * dt);
  }

  addFood(x: number, y: number, amount: number): void {
    this.add(this.food, x, y, amount);
  }

  addHome(x: number, y: number, amount: number): void {
    this.add(this.home, x, y, amount);
  }

  addDisruption(x: number, y: number, radius: number, amount: number): void {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const cr = Math.ceil(radius / this.cellSize);
    for (let gy = cy - cr; gy <= cy + cr; gy += 1) {
      for (let gx = cx - cr; gx <= cx + cr; gx += 1) {
        if (!this.inBounds(gx, gy)) continue;
        const dx = (gx + 0.5) * this.cellSize - x;
        const dy = (gy + 0.5) * this.cellSize - y;
        const distance = Math.hypot(dx, dy);
        if (distance > radius) continue;
        const falloff = 1 - distance / radius;
        const index = this.index(gx, gy);
        this.disruption[index] = Math.min(1.8, this.disruption[index] + amount * falloff);
      }
    }
  }

  sampleFood(x: number, y: number): number {
    return this.sample(this.food, x, y);
  }

  sampleHome(x: number, y: number): number {
    return this.sample(this.home, x, y);
  }

  sampleDisruption(x: number, y: number): number {
    return this.sample(this.disruption, x, y);
  }

  private add(field: Float32Array, x: number, y: number, amount: number): void {
    const gx = Math.floor(x / this.cellSize);
    const gy = Math.floor(y / this.cellSize);
    if (!this.inBounds(gx, gy)) return;
    const index = this.index(gx, gy);
    field[index] = Math.min(2.5, field[index] + amount);
  }

  private sample(field: Float32Array, x: number, y: number): number {
    const gx = Math.floor(x / this.cellSize);
    const gy = Math.floor(y / this.cellSize);
    if (!this.inBounds(gx, gy)) return 0;
    return field[this.index(gx, gy)];
  }

  private diffuse(field: Float32Array, rate: number): void {
    if (rate <= 0) return;
    const copy = new Float32Array(field);
    for (let y = 1; y < this.rows - 1; y += 1) {
      for (let x = 1; x < this.cols - 1; x += 1) {
        const index = this.index(x, y);
        const average =
          (copy[index] +
            copy[this.index(x - 1, y)] +
            copy[this.index(x + 1, y)] +
            copy[this.index(x, y - 1)] +
            copy[this.index(x, y + 1)]) /
          5;
        field[index] = copy[index] + (average - copy[index]) * rate;
      }
    }
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  private index(x: number, y: number): number {
    return y * this.cols + x;
  }
}
