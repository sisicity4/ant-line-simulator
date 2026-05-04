export type ToolKind = "pebble" | "leaf" | "finger" | "water";

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
  memoryHeading: number;
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
  selectedTool: ToolKind;
}

export interface ToolDefinition {
  kind: ToolKind;
  label: string;
  icon: string;
  radius: number;
  cooldownMs: number;
}
