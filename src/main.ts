import Phaser from "phaser";
import { GameScene } from "./phaser/GameScene";
import { HudController } from "./ui/HudController";
import "./style.css";

const hud = new HudController(document.querySelector<HTMLDivElement>("#hud-root")!);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game-container",
  backgroundColor: "#c9bfa8",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 640
  },
  render: {
    antialias: true,
    pixelArt: false
  },
  scene: [new GameScene(hud)]
});

window.addEventListener("beforeunload", () => {
  game.destroy(true);
});
