import type { MapPreset } from "./types";

export const MAP_PRESETS: MapPreset[] = [
  {
    id: "garden-fork",
    name: "庭の分かれ道",
    description: "植え込みの根と小さな土の起伏で、行列がゆるく二股に広がる。",
    background: 0xc8bea6,
    nest: { x: 132, y: 330 },
    food: { x: 816, y: 308 },
    route: [
      { x: 132, y: 330 },
      { x: 250, y: 286 },
      { x: 382, y: 352 },
      { x: 534, y: 318 },
      { x: 676, y: 356 },
      { x: 816, y: 308 }
    ],
    branches: [
      {
        weight: 0.45,
        points: [
          { x: 132, y: 330 },
          { x: 258, y: 382 },
          { x: 420, y: 292 },
          { x: 590, y: 382 },
          { x: 816, y: 308 }
        ]
      }
    ],
    terrain: [
      { kind: "root", x: 342, y: 322, rx: 48, ry: 17, rotation: -0.4, blocksAnts: true },
      { kind: "hill", x: 612, y: 286, rx: 58, ry: 36, rotation: 0.2, blocksAnts: true },
      { kind: "root", x: 558, y: 420, rx: 70, ry: 15, rotation: 0.22, blocksAnts: true }
    ],
    scatterSeed: 7
  },
  {
    id: "scramble",
    name: "スクランブル交差点",
    description: "白線みたいな紙片が交差して、中央で行列がばらけやすい。",
    background: 0xbeb8a5,
    nest: { x: 128, y: 500 },
    food: { x: 830, y: 142 },
    route: [
      { x: 128, y: 500 },
      { x: 266, y: 430 },
      { x: 432, y: 356 },
      { x: 544, y: 294 },
      { x: 684, y: 220 },
      { x: 830, y: 142 }
    ],
    branches: [
      {
        weight: 0.55,
        points: [
          { x: 128, y: 500 },
          { x: 314, y: 520 },
          { x: 470, y: 356 },
          { x: 668, y: 344 },
          { x: 830, y: 142 }
        ]
      },
      {
        weight: 0.4,
        points: [
          { x: 128, y: 500 },
          { x: 214, y: 310 },
          { x: 448, y: 350 },
          { x: 584, y: 158 },
          { x: 830, y: 142 }
        ]
      }
    ],
    terrain: [
      { kind: "plaza", x: 474, y: 350, rx: 104, ry: 78, rotation: -0.2, blocksAnts: false },
      { kind: "root", x: 354, y: 236, rx: 84, ry: 13, rotation: 0.75, blocksAnts: true },
      { kind: "root", x: 626, y: 458, rx: 92, ry: 15, rotation: -0.52, blocksAnts: true }
    ],
    scatterSeed: 19
  },
  {
    id: "mountain-river",
    name: "山と小川",
    description: "小山と小川で迂回が多く、橋のような細い抜け道に行列が寄る。",
    background: 0xc1b89e,
    nest: { x: 124, y: 150 },
    food: { x: 822, y: 486 },
    route: [
      { x: 124, y: 150 },
      { x: 250, y: 210 },
      { x: 352, y: 318 },
      { x: 490, y: 356 },
      { x: 628, y: 430 },
      { x: 822, y: 486 }
    ],
    branches: [
      {
        weight: 0.5,
        points: [
          { x: 124, y: 150 },
          { x: 260, y: 96 },
          { x: 454, y: 190 },
          { x: 602, y: 344 },
          { x: 822, y: 486 }
        ]
      }
    ],
    terrain: [
      { kind: "hill", x: 410, y: 226, rx: 92, ry: 70, rotation: 0.26, blocksAnts: true },
      { kind: "hill", x: 566, y: 504, rx: 80, ry: 48, rotation: -0.3, blocksAnts: true },
      { kind: "river", x: 520, y: 338, rx: 260, ry: 30, rotation: 0.42, blocksAnts: true },
      { kind: "root", x: 704, y: 258, rx: 78, ry: 14, rotation: 0.62, blocksAnts: true }
    ],
    scatterSeed: 31
  }
];
