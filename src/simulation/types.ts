export type ToolKind = "pebble" | "leaf" | "finger" | "water" | "pump" | "mystery";

export type AntMode = "forage" | "return";

export interface Vec2 {
  x: number;
  y: number;
}

export interface Ant {
  id: number;
  x: number;
  y: number;
  heading: number;
  speed: number;
  preferredSpeed: number;
  mode: AntMode;
  routeIndex: number;
  routeBranchIndex: number;
  foodIndex: number;
  memoryHeading: number;
  cargoSize: number;
  cargoPieces: number;
  washedTtl: number;
  wiggle: number;
  lastTargetDistance: number;
  stalledTime: number;
  routeStickiness: number;
  pheromoneSensitivity: number;
  explorationNoise: number;
  shortcutBias: number;
}

export interface PlacedObject {
  id: number;
  kind: ToolKind;
  x: number;
  y: number;
  radius: number;
  age: number;
  effectKind: ToolKind;
  rotation: number;
  stretch: number;
  variantSeed: number;
}

export interface SimulationStats {
  deliveredPieces: number;
  trailIntegrity: number;
  activeAnts: number;
  totalAnts: number;
  activeCargo: number;
  selectedTool: ToolKind;
  mapName: string;
  timeScale: number;
  patternName: string;
}

export interface SimulationDebugSnapshot extends SimulationStats {
  objects: number;
  foods: number;
  invalidAnts: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  maxSpeed: number;
  maxPheromone: number;
  routeCacheSize: number;
}

export interface ToolDefinition {
  kind: ToolKind;
  label: string;
  icon: string;
  radius: number;
  cooldownMs: number;
}

export type TerrainKind = "hill" | "river" | "plaza" | "root";

export interface TerrainPatch {
  kind: TerrainKind;
  x: number;
  y: number;
  rx: number;
  ry: number;
  rotation?: number;
  blocksAnts: boolean;
}

export interface RouteBranch {
  points: Vec2[];
  weight: number;
}

export interface StartPattern {
  id: string;
  name: string;
  nest: Vec2;
  foods: Vec2[];
}

export interface MapPreset {
  id: string;
  name: string;
  description: string;
  background: number;
  nest: Vec2;
  food: Vec2;
  route: Vec2[];
  branches: RouteBranch[];
  terrain: TerrainPatch[];
  scatterSeed: number;
}
