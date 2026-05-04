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
    description: "斜めに走る横断帯と広い中央広場で、行列が人波のように交差する。",
    background: 0xa8a096,
    nest: { x: 118, y: 526 },
    food: { x: 840, y: 112 },
    route: [
      { x: 118, y: 526 },
      { x: 250, y: 478 },
      { x: 384, y: 420 },
      { x: 490, y: 338 },
      { x: 608, y: 260 },
      { x: 724, y: 178 },
      { x: 840, y: 112 }
    ],
    branches: [
      {
        weight: 0.28,
        points: [
          { x: 118, y: 526 },
          { x: 206, y: 416 },
          { x: 342, y: 330 },
          { x: 506, y: 318 },
          { x: 660, y: 226 },
          { x: 840, y: 112 }
        ]
      },
      {
        weight: 0.24,
        points: [
          { x: 118, y: 526 },
          { x: 292, y: 556 },
          { x: 426, y: 448 },
          { x: 514, y: 346 },
          { x: 680, y: 350 },
          { x: 840, y: 112 }
        ]
      },
      {
        weight: 0.2,
        points: [
          { x: 118, y: 526 },
          { x: 170, y: 330 },
          { x: 330, y: 292 },
          { x: 470, y: 344 },
          { x: 594, y: 168 },
          { x: 840, y: 112 }
        ]
      },
      {
        weight: 0.16,
        points: [
          { x: 118, y: 526 },
          { x: 288, y: 456 },
          { x: 440, y: 554 },
          { x: 586, y: 426 },
          { x: 760, y: 376 },
          { x: 840, y: 112 }
        ]
      }
    ],
    terrain: [
      { kind: "plaza", x: 492, y: 348, rx: 160, ry: 116, rotation: -0.18, blocksAnts: false },
      { kind: "root", x: 126, y: 262, rx: 88, ry: 34, rotation: -0.3, blocksAnts: true },
      { kind: "root", x: 242, y: 112, rx: 124, ry: 28, rotation: -0.18, blocksAnts: true },
      { kind: "root", x: 756, y: 548, rx: 136, ry: 30, rotation: -0.12, blocksAnts: true },
      { kind: "root", x: 844, y: 318, rx: 62, ry: 116, rotation: 0.08, blocksAnts: true },
      { kind: "hill", x: 92, y: 404, rx: 58, ry: 70, rotation: 0.32, blocksAnts: true }
    ],
    scatterSeed: 23
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
