import type Phaser from "phaser";

import { createEmptyInput, type InputSnapshot } from "./actions";
import { consumeVirtualControls, isVirtualControlsEnabled } from "./virtualControls";

export class InputController {
  private readonly keys: Record<string, Phaser.Input.Keyboard.Key>;
  private firePressed = false;
  private dashQueued = false;
  private interactPressed = false;
  private pauseQueued = false;

  constructor(private readonly scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard!;
    this.keys = keyboard.addKeys("W,A,S,D,UP,LEFT,DOWN,RIGHT,SHIFT,SPACE,E,ESC") as Record<string, Phaser.Input.Keyboard.Key>;

    scene.input.on("pointerdown", () => {
      this.firePressed = true;
    });
    scene.input.on("pointerup", () => {
      this.firePressed = false;
    });
    scene.input.on("gameout", () => {
      this.firePressed = false;
    });
    keyboard.on("keydown-SHIFT", () => {
      this.dashQueued = true;
    });
    keyboard.on("keydown-SPACE", () => {
      this.dashQueued = true;
    });
    keyboard.on("keydown-E", () => {
      this.interactPressed = true;
    });
    keyboard.on("keydown-ESC", () => {
      this.pauseQueued = true;
    });
  }

  snapshot(playerX: number, playerY: number): InputSnapshot {
    const input = createEmptyInput();
    const horizontal = Number(this.keys.D.isDown || this.keys.RIGHT.isDown) - Number(this.keys.A.isDown || this.keys.LEFT.isDown);
    const vertical = Number(this.keys.S.isDown || this.keys.DOWN.isDown) - Number(this.keys.W.isDown || this.keys.UP.isDown);
    const pointer = this.scene.input.activePointer;
    const virtual = consumeVirtualControls();

    input.move = isVirtualControlsEnabled() && (virtual.move.x !== 0 || virtual.move.y !== 0) ? virtual.move : { x: horizontal, y: vertical };
    input.aim =
      isVirtualControlsEnabled() && (virtual.fire || virtual.aim.x !== 0 || virtual.aim.y !== 0)
        ? virtual.aim
        : {
            x: pointer.worldX - playerX,
            y: pointer.worldY - playerY
          };
    input.fire = this.firePressed || virtual.fire;
    input.dash = this.dashQueued || virtual.dashQueued;
    input.interact = this.interactPressed || this.keys.E.isDown || virtual.interact;
    input.pause = this.pauseQueued || virtual.pauseQueued;

    this.dashQueued = false;
    this.interactPressed = false;
    this.pauseQueued = false;

    return input;
  }
}
