import Phaser from "phaser";

import { GameScene, type SceneCallbacks } from "./scenes/GameScene";

export function createGame(parent: HTMLElement, callbacks: SceneCallbacks): Phaser.Game {
  const prefersTouchRenderer =
    window.matchMedia("(pointer: coarse)").matches || Math.min(window.innerWidth, window.innerHeight) < 820;

  return new Phaser.Game({
    type: prefersTouchRenderer ? Phaser.CANVAS : Phaser.AUTO,
    parent,
    width: 1280,
    height: 720,
    backgroundColor: "#050913",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [new GameScene(callbacks)]
  });
}
