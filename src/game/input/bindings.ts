import type Phaser from "phaser";

import { createEmptyInput, type InputSnapshot } from "./actions";
import { consumeVirtualControls, isVirtualControlsEnabled } from "./virtualControls";
import type { EnemyState } from "../simulation/types";

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

  snapshot(playerX: number, playerY: number, enemies: EnemyState[] = []): InputSnapshot {
    const input = createEmptyInput();
    const horizontal = Number(this.keys.D.isDown || this.keys.RIGHT.isDown) - Number(this.keys.A.isDown || this.keys.LEFT.isDown);
    const vertical = Number(this.keys.S.isDown || this.keys.DOWN.isDown) - Number(this.keys.W.isDown || this.keys.UP.isDown);
    const pointer = this.scene.input.activePointer;
    const virtual = consumeVirtualControls();

    input.move = isVirtualControlsEnabled() && (virtual.move.x !== 0 || virtual.move.y !== 0) ? virtual.move : { x: horizontal, y: vertical };
    const assistedAim =
      isVirtualControlsEnabled() && (virtual.fire || virtual.aim.x !== 0 || virtual.aim.y !== 0)
        ? applyAimAssist(virtual.aim, playerX, playerY, enemies)
        : null;
    input.aim =
      isVirtualControlsEnabled() && (virtual.fire || virtual.aim.x !== 0 || virtual.aim.y !== 0)
        ? assistedAim ?? virtual.aim
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

function applyAimAssist(
  aim: InputSnapshot["aim"],
  playerX: number,
  playerY: number,
  enemies: EnemyState[]
): InputSnapshot["aim"] {
  const aimLength = Math.hypot(aim.x, aim.y);
  if (aimLength < 0.15 || enemies.length === 0) {
    return aim;
  }

  const aimDir = { x: aim.x / aimLength, y: aim.y / aimLength };
  let bestScore = Infinity;
  let bestTarget: { x: number; y: number } | null = null;

  for (const enemy of enemies) {
    const dx = enemy.position.x - playerX;
    const dy = enemy.position.y - playerY;
    const distance = Math.hypot(dx, dy);
    if (distance < 24 || distance > 520) {
      continue;
    }

    const dot = (dx / distance) * aimDir.x + (dy / distance) * aimDir.y;
    if (dot < 0.72) {
      continue;
    }

    const score = (1 - dot) * 220 + distance * 0.16 - enemy.radius * 0.4;
    if (score < bestScore) {
      bestScore = score;
      bestTarget = { x: dx, y: dy };
    }
  }

  if (!bestTarget) {
    return aim;
  }

  return {
    x: aim.x * 0.35 + bestTarget.x * 0.65,
    y: aim.y * 0.35 + bestTarget.y * 0.65
  };
}
