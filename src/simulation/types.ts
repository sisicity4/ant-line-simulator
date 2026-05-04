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
  mode: AntMode;
  routeIndex: number;
  memoryHeading: number;
  cargoSize: number;
  cargoValue: number;
  washedTtl: number;
  wiggle: number;
}

export interface PlacedObject {
  id: number;
  kind: ToolKind;
  x: number;
  y: number;
  radius: number;
  ttl: number;
  maxTtl: number;
}

export interface SimulationStats {
  score: number;
  deliveredFood: number;
  trailIntegrity: number;
  activeAnts: number;
  activeCargo: number;
  selectedTool: ToolKind;
  mapName: string;
  challengeText: string;
  reactionText: string;
  combo: number;
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
