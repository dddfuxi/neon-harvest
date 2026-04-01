import Phaser from "phaser";

import { weaponDefinitions } from "../../game/content/weapons";
import { InputController } from "../../game/input/bindings";
import { createEmptyInput } from "../../game/input/actions";
import { assetManifest } from "../../game/assets/manifest";
import { type UiCommand, updateSimulation } from "../../game/simulation/engine";
import type { SimulationState } from "../../game/simulation/types";
import { createGeneratedTextures } from "../view/generatedTextures";

export type SceneCallbacks = {
  getState: () => SimulationState;
  setState: (state: SimulationState) => void;
  flushCommands: () => UiCommand[];
  onStateChange: (state: SimulationState) => void;
};

type SpriteRegistry = {
  background?: Phaser.GameObjects.TileSprite;
  visionOverlay?: Phaser.GameObjects.RenderTexture;
  visionMask?: Phaser.GameObjects.Image;
  bossAlertFrame?: Phaser.GameObjects.Graphics;
  enemyIndicators?: Phaser.GameObjects.Graphics;
  player?: Phaser.GameObjects.Sprite;
  playerShield?: Phaser.GameObjects.Arc;
  extraction?: Phaser.GameObjects.Sprite;
  obstacles: Map<string, Phaser.GameObjects.Shape>;
  hazards: Map<string, Phaser.GameObjects.Arc>;
  enemies: Map<string, Phaser.GameObjects.Sprite>;
  enemyHealthBars: Map<string, Phaser.GameObjects.Rectangle>;
  projectiles: Map<string, Phaser.GameObjects.Shape>;
  shards: Map<string, Phaser.GameObjects.Sprite>;
};

export class GameScene extends Phaser.Scene {
  private inputController?: InputController;
  private previousRunStatus: SimulationState["run"]["status"] | null = null;
  private previousPlayerPosition: { x: number; y: number } | null = null;
  private previousDashTimer = 0;
  private deathFxObjects: Phaser.GameObjects.GameObject[] = [];
  private registryView: SpriteRegistry = {
    obstacles: new Map(),
    hazards: new Map(),
    enemies: new Map(),
    enemyHealthBars: new Map(),
    projectiles: new Map(),
    shards: new Map()
  };

  constructor(private readonly callbacks: SceneCallbacks) {
    super("GameScene");
  }

  preload(): void {
    void assetManifest;
  }

  create(): void {
    createGeneratedTextures(this);
    this.cameras.main.setBackgroundColor("#050913");
    this.registryView.background = this.add
      .tileSprite(0, 0, this.scale.width, this.scale.height, "bg/grid-tile")
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(0);
    this.registryView.visionOverlay = this.add
      .renderTexture(0, 0, this.scale.width, this.scale.height)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(8);
    this.registryView.visionMask = this.add
      .image(0, 0, "fx/vision-mask")
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setVisible(false);
    this.registryView.bossAlertFrame = this.add.graphics().setScrollFactor(0).setDepth(9).setVisible(false);
    this.registryView.enemyIndicators = this.add.graphics().setScrollFactor(0).setDepth(8.6);

    this.registryView.player = this.add.sprite(640, 360, "player/hull").setDepth(5);
    this.registryView.playerShield = this.add.circle(640, 360, 24).setStrokeStyle(3, 0x6cf3ff, 0.75).setFillStyle(0x6cf3ff, 0.05).setDepth(4.5);
    this.registryView.extraction = this.add.sprite(1100, 110, "fx/extraction").setAlpha(0.35).setVisible(false);

    this.inputController = new InputController(this);
    this.scale.on("resize", this.handleResize, this);
    this.handleResize();
  }

  update(_: number, delta: number): void {
    const current = this.callbacks.getState();
    const commands = this.callbacks.flushCommands();
    const input =
      this.inputController && current.run.status === "running"
        ? this.inputController.snapshot(current.run.player.position.x, current.run.player.position.y)
        : createEmptyInput();

    if (input.pause && current.run.status === "running") {
      commands.push({ type: "toggle-pause" });
    }

    const next = updateSimulation(current, delta / 1000, input, commands);
    if (current !== next) {
      this.callbacks.setState(next);
      this.callbacks.onStateChange(next);
    }
    this.handleRunTransitions(next);
    this.renderState(next);
  }

  private handleResize(): void {
    const camera = this.cameras.main;
    camera.setViewport(0, 0, this.scale.width, this.scale.height);
    camera.setZoom(Math.min(this.scale.width / 1280, this.scale.height / 720));
    this.registryView.background?.setSize(this.scale.width, this.scale.height);
    this.registryView.visionOverlay?.setSize(this.scale.width, this.scale.height);
    this.renderBossAlertFrame(this.callbacks.getState());
  }

  private renderState(state: SimulationState): void {
    const background = this.registryView.background!;
    const playerSprite = this.registryView.player!;
    const playerShield = this.registryView.playerShield!;
    this.maybeSpawnDashAfterimages(state);
    playerSprite.setPosition(state.run.player.position.x, state.run.player.position.y);
    const projectileHeading = state.run.projectiles.find((projectile) => projectile.source === "player");
    const facing = projectileHeading
      ? projectileHeading.velocity
      : { x: state.run.player.velocity.x || 1, y: state.run.player.velocity.y || 0.01 };
    playerSprite.setRotation(Math.atan2(facing.y, facing.x));
    playerSprite.setScale(1 + state.run.screenFlash * 0.05);
    const shieldRatio = Math.max(0, state.run.player.shield / state.run.player.maxShield);
    playerShield.setPosition(state.run.player.position.x, state.run.player.position.y);
    playerShield.setRadius(20 + shieldRatio * 10 + Math.sin(this.time.now / 90) * 1.5);
    playerShield.setStrokeStyle(2 + shieldRatio * 2, 0x6cf3ff, 0.3 + shieldRatio * 0.55);
    playerShield.setFillStyle(0x6cf3ff, 0.03 + shieldRatio * 0.08);
    playerShield.setVisible(shieldRatio > 0.02);
    this.cameras.main.centerOn(state.run.player.position.x, state.run.player.position.y);
    background.tilePositionX = state.run.player.position.x - this.scale.width * 0.5;
    background.tilePositionY = state.run.player.position.y - this.scale.height * 0.5;

    this.cameras.main.setAlpha(1 - state.run.screenFlash * 0.12);
    if (state.run.screenFlash > 0.8) {
      this.cameras.main.shake(70, 0.0025);
    }

    const extraction = this.registryView.extraction!;
    extraction.setVisible(state.run.extraction.unlocked);
    extraction.setPosition(state.run.extraction.zoneCenter.x, state.run.extraction.zoneCenter.y);
    extraction.setScale(state.run.extraction.radius / 40);
    extraction.setAlpha(state.run.extraction.active ? 0.95 : 0.38);
    extraction.setAngle(extraction.angle + 0.5);

    syncCollection<Phaser.GameObjects.Shape>(
      state.run.obstacles.map((obstacle) => ({
        id: obstacle.id,
        create: () => createObstacleShape(this, obstacle),
        update: (view) => {
          const visibility = getVisionVisibility(obstacle.position.x, obstacle.position.y, state);
          view.setPosition(obstacle.position.x, obstacle.position.y);
          view.setVisible(visibility > 0.02);
          view.setAlpha(visibility);
        }
      })),
      this.registryView.obstacles
    );

    syncCollection<Phaser.GameObjects.Arc>(
      state.run.hazards.map((hazard) => ({
        id: hazard.id,
        create: () =>
          this.add.circle(hazard.position.x, hazard.position.y, hazard.radius, 0xff728f, 0.12).setStrokeStyle(2, 0xff728f, 0.35),
        update: (view) => {
          view.setPosition(hazard.position.x, hazard.position.y);
          view.setRadius(hazard.radius);
          const telegraphRatio = hazard.telegraphTime > 0 ? hazard.telegraphTime / 1.45 : 0;
          const color = hazard.source === "boss" ? 0xff3b4f : 0xff728f;
          view.setFillStyle(color, hazard.active ? 0.18 : 0.06 + (1 - telegraphRatio) * 0.12);
          view.setStrokeStyle(hazard.active ? 3 : 2, color, hazard.active ? 0.8 : 0.45);
        }
      })),
      this.registryView.hazards
    );

    syncCollection<Phaser.GameObjects.Sprite>(
      state.run.enemies.map((enemy) => ({
        id: enemy.id,
        create: () => this.add.sprite(enemy.position.x, enemy.position.y, `enemy/${enemy.type}`).setTint(enemy.color).setDepth(4),
        update: (view) => {
          const visibility = getVisionVisibility(enemy.position.x, enemy.position.y, state);
          view.setPosition(enemy.position.x, enemy.position.y);
          view.setTint(getEnemyTint(enemy.color, enemy.hp / enemy.maxHp));
          view.setScale(enemy.radius / (enemy.type === "boss" ? 18 : enemy.type === "brute" ? 18 : 12));
          view.setVisible(visibility > 0.02);
          view.setAlpha(visibility);
        }
      })),
      this.registryView.enemies
    );

    syncCollection<Phaser.GameObjects.Rectangle>(
      state.run.enemies.map((enemy) => ({
        id: enemy.id,
        create: () => this.add.rectangle(enemy.position.x, enemy.position.y - enemy.radius - 10, enemy.radius * 2, 4, 0x7cff90).setDepth(4.2),
        update: (view) => {
          const healthRatio = Math.max(0, enemy.hp / enemy.maxHp);
          const visibility = getVisionVisibility(enemy.position.x, enemy.position.y, state);
          view.setPosition(enemy.position.x, enemy.position.y - enemy.radius - 10);
          view.setSize(Math.max(6, enemy.radius * 2 * healthRatio), 4);
          view.setFillStyle(getHealthBarColor(healthRatio), 0.95);
          view.setVisible(visibility > 0.08);
          view.setAlpha(visibility * 0.95);
        }
      })),
      this.registryView.enemyHealthBars
    );

    syncCollection<Phaser.GameObjects.Shape>(
      state.run.projectiles.map((projectile) => ({
        id: projectile.id,
        create: () => createProjectileShape(this, projectile),
        update: (view) => {
          const style = getProjectileRenderStyle(projectile);
          view.setPosition(projectile.position.x, projectile.position.y);
          view.setRotation(Math.atan2(projectile.velocity.y, projectile.velocity.x));
          view.setFillStyle(projectile.color, style.alpha);
          view.setStrokeStyle(style.strokeWidth, 0xffffff, style.strokeAlpha);
          if (view instanceof Phaser.GameObjects.Rectangle) {
            view.setSize(style.width, style.height);
          } else if (view instanceof Phaser.GameObjects.Ellipse) {
            view.setSize(style.width, style.height);
          }
          view.setScale(style.scaleX, style.scaleY);
          view.setAlpha(style.alpha);
        }
      })),
      this.registryView.projectiles
    );

    syncCollection<Phaser.GameObjects.Sprite>(
      state.run.shards.map((shard) => ({
        id: shard.id,
        create: () => this.add.sprite(shard.position.x, shard.position.y, "fx/shard").setDepth(2),
        update: (view) => {
          view.setPosition(shard.position.x, shard.position.y);
          view.setScale(1 + Math.sin(this.time.now / 160 + shard.position.x) * 0.08);
        }
      })),
      this.registryView.shards
    );

    const tint = weaponDefinitions[state.run.player.weaponId].color;
    playerSprite.setTint(tint);
    this.renderVisionOverlay(state);
    this.renderEnemyIndicators(state);
    this.renderBossAlertFrame(state);
    this.previousPlayerPosition = { ...state.run.player.position };
    this.previousDashTimer = state.run.player.dashTimer;
  }

  private maybeSpawnDashAfterimages(state: SimulationState): void {
    if (!this.previousPlayerPosition) {
      return;
    }

    const displacement = Phaser.Math.Distance.Between(
      this.previousPlayerPosition.x,
      this.previousPlayerPosition.y,
      state.run.player.position.x,
      state.run.player.position.y
    );
    const dashTriggered =
      state.run.status === "running" &&
      this.previousDashTimer <= 0.02 &&
      state.run.player.dashTimer > 0.05 &&
      displacement > state.run.player.dashDistance * 0.42;

    if (!dashTriggered) {
      return;
    }

    const tint = weaponDefinitions[state.run.player.weaponId].color;
    const angle = Math.atan2(
      state.run.player.position.y - this.previousPlayerPosition.y,
      state.run.player.position.x - this.previousPlayerPosition.x
    );
    const ghostCount = 5;

    for (let index = 0; index < ghostCount; index += 1) {
      const progress = index / Math.max(1, ghostCount - 1);
      const x = Phaser.Math.Linear(state.run.player.position.x, this.previousPlayerPosition.x, progress);
      const y = Phaser.Math.Linear(state.run.player.position.y, this.previousPlayerPosition.y, progress);
      const ghost = this.add
        .sprite(x, y, "player/hull")
        .setDepth(4.7 - progress * 0.1)
        .setTint(tint)
        .setRotation(angle)
        .setScale(1.05 - progress * 0.12)
        .setAlpha(0.32 - progress * 0.2)
        .setBlendMode(Phaser.BlendModes.ADD);

      this.tweens.add({
        targets: ghost,
        alpha: 0,
        scale: 0.74,
        duration: 220 + progress * 120,
        ease: "Cubic.easeOut",
        onComplete: () => {
          ghost.destroy();
        }
      });
    }
  }

  private handleRunTransitions(state: SimulationState): void {
    const currentResult = state.run.runSummary?.result ?? null;
    const didDie =
      this.previousRunStatus !== "run-over" &&
      state.run.status === "run-over" &&
      currentResult === "dead";
    const resetFx =
      this.previousRunStatus === "run-over" &&
      state.run.status !== "run-over";

    if (didDie) {
      this.playDeathSequence(state);
    } else if (resetFx) {
      this.clearDeathSequence();
    }

    this.previousRunStatus = state.run.status;
  }

  private playDeathSequence(state: SimulationState): void {
    this.clearDeathSequence();
    const playerSprite = this.registryView.player;
    const playerShield = this.registryView.playerShield;
    if (!playerSprite || !playerShield) {
      return;
    }

    const burstColor = weaponDefinitions[state.run.player.weaponId].color;
    const center = { x: state.run.player.position.x, y: state.run.player.position.y };

    playerShield.setVisible(false);
    playerSprite.setAlpha(0.08);
    this.cameras.main.shake(220, 0.006);
    this.cameras.main.zoomTo(this.cameras.main.zoom * 1.06, 220);

    const flash = this.add.circle(center.x, center.y, 14, 0xffffff, 0.9).setDepth(6.2);
    this.deathFxObjects.push(flash);
    this.tweens.add({
      targets: flash,
      radius: 110,
      alpha: 0,
      duration: 420,
      ease: "Quad.easeOut"
    });

    const particleCount = 30;
    for (let index = 0; index < particleCount; index += 1) {
      const angle = (Math.PI * 2 * index) / particleCount + Phaser.Math.FloatBetween(-0.08, 0.08);
      const distance = Phaser.Math.Between(56, 180);
      const radius = Phaser.Math.FloatBetween(2.5, 6.5);
      const particle = this.add.circle(center.x, center.y, radius, burstColor, 0.95).setDepth(6);
      this.deathFxObjects.push(particle);
      this.tweens.add({
        targets: particle,
        x: center.x + Math.cos(angle) * distance,
        y: center.y + Math.sin(angle) * distance,
        alpha: 0,
        scale: Phaser.Math.FloatBetween(0.4, 1.6),
        duration: 1000,
        ease: "Cubic.easeOut"
      });
    }

    const halo = this.add.circle(center.x, center.y, 26, burstColor, 0.18).setDepth(5.8);
    this.deathFxObjects.push(halo);
    this.tweens.add({
      targets: halo,
      radius: 170,
      alpha: 0,
      duration: 1000,
      ease: "Sine.easeOut",
      onComplete: () => {
        playerSprite.setAlpha(1);
      }
    });
  }

  private clearDeathSequence(): void {
    for (const object of this.deathFxObjects) {
      object.destroy();
    }
    this.deathFxObjects = [];
    this.registryView.player?.setAlpha(1);
    this.registryView.playerShield?.setVisible(true);
    this.cameras.main.setZoom(Math.min(this.scale.width / 1280, this.scale.height / 720));
    this.previousPlayerPosition = null;
    this.previousDashTimer = 0;
  }

  private renderVisionOverlay(state: SimulationState): void {
    const overlay = this.registryView.visionOverlay;
    const mask = this.registryView.visionMask;
    if (!overlay || !mask) {
      return;
    }

    const camera = this.cameras.main;
    const centerX = (state.run.player.position.x - camera.worldView.x) * camera.zoom;
    const centerY = (state.run.player.position.y - camera.worldView.y) * camera.zoom;
    const scale = Math.max(1.25, (state.run.player.visionRadius * 2.35 * camera.zoom) / 512);

    overlay.clear();
    overlay.fill(0x01040a, 0.84);
    mask.setPosition(centerX, centerY);
    mask.setScale(scale);
    overlay.erase(mask);
  }

  private renderBossAlertFrame(state: SimulationState): void {
    const frame = this.registryView.bossAlertFrame;
    if (!frame) {
      return;
    }

    if (state.run.status === "menu" || state.run.status === "meta" || state.run.status === "run-over") {
      frame.clear();
      frame.setVisible(false);
      return;
    }

    const bossActive = state.run.enemies.some((enemy) => enemy.type === "boss");
    const alertStrength = bossActive ? 0.35 + Math.sin(this.time.now / 120) * 0.12 : 0;
    const warningStrength = state.run.bossAlertTimer > 0 ? 0.5 + Math.sin(this.time.now / 70) * 0.2 : 0;
    const alpha = Math.max(0, Math.max(alertStrength, warningStrength));

    frame.clear();
    if (alpha <= 0.02) {
      frame.setVisible(false);
      return;
    }

    frame.setVisible(true);
    frame.lineStyle(10, 0xff2f45, alpha);
    frame.strokeRect(5, 5, this.scale.width - 10, this.scale.height - 10);
    frame.lineStyle(22, 0xff2f45, alpha * 0.2);
    frame.strokeRect(11, 11, this.scale.width - 22, this.scale.height - 22);
  }

  private renderEnemyIndicators(state: SimulationState): void {
    const graphics = this.registryView.enemyIndicators;
    if (!graphics) {
      return;
    }

    graphics.clear();
    if (state.run.status !== "running") {
      return;
    }

    const camera = this.cameras.main;
    const centerX = this.scale.width * 0.5;
    const centerY = this.scale.height * 0.5;
    const indicatorRadius = Math.min(this.scale.width, this.scale.height) * 0.39;
    const offscreenEnemies = state.run.enemies
      .filter((enemy) => distanceToPlayer(enemy.position.x, enemy.position.y, state) > state.run.player.visionRadius * 1.04)
      .sort((a, b) => distanceToPlayer(a.position.x, a.position.y, state) - distanceToPlayer(b.position.x, b.position.y, state))
      .slice(0, 8);

    for (const enemy of offscreenEnemies) {
      const screenX = (enemy.position.x - camera.worldView.x) * camera.zoom;
      const screenY = (enemy.position.y - camera.worldView.y) * camera.zoom;
      const dx = screenX - centerX;
      const dy = screenY - centerY;
      const length = Math.max(1, Math.hypot(dx, dy));
      const angle = Math.atan2(dy, dx);
      const px = centerX + (dx / length) * indicatorRadius;
      const py = centerY + (dy / length) * indicatorRadius;
      const size = enemy.type === "boss" ? 13 : 9;
      const color = enemy.type === "boss" ? 0xff4a63 : getEnemyTint(enemy.color, enemy.hp / enemy.maxHp);
      const alpha = enemy.type === "boss" ? 0.96 : 0.72;

      graphics.fillStyle(color, alpha);
      graphics.lineStyle(2, 0xffffff, alpha * 0.45);
      graphics.beginPath();
      graphics.moveTo(px + Math.cos(angle) * size, py + Math.sin(angle) * size);
      graphics.lineTo(px + Math.cos(angle + 2.45) * size, py + Math.sin(angle + 2.45) * size);
      graphics.lineTo(px + Math.cos(angle - 2.45) * size, py + Math.sin(angle - 2.45) * size);
      graphics.closePath();
      graphics.fillPath();
      graphics.strokePath();
    }
  }
}

function syncCollection<T extends Phaser.GameObjects.GameObject>(
  descriptors: Array<{ id: string; create: () => T; update: (view: T) => void }>,
  registry: Map<string, T>
): void {
  const activeIds = new Set(descriptors.map((entry) => entry.id));
  for (const [id, view] of registry.entries()) {
    if (!activeIds.has(id)) {
      view.destroy();
      registry.delete(id);
    }
  }

  for (const descriptor of descriptors) {
    const existing = registry.get(descriptor.id) ?? descriptor.create();
    registry.set(descriptor.id, existing);
    descriptor.update(existing);
  }
}

function createObstacleShape(scene: Phaser.Scene, obstacle: SimulationState["run"]["obstacles"][number]): Phaser.GameObjects.Shape {
  if (obstacle.kind === "crystal") {
    return scene.add
      .triangle(
        obstacle.position.x,
        obstacle.position.y,
        0,
        obstacle.radius,
        obstacle.radius * 0.9,
        0,
        obstacle.radius * 1.4,
        obstacle.radius * 1.2,
        obstacle.color,
        0.9
      )
      .setDepth(1.4)
      .setStrokeStyle(2, 0x89dbff, 0.35);
  }

  if (obstacle.kind === "pillar") {
    return scene.add
      .ellipse(obstacle.position.x, obstacle.position.y, obstacle.radius * 1.6, obstacle.radius * 1.9, obstacle.color, 0.95)
      .setDepth(1.4)
      .setStrokeStyle(2, 0xa7c9ff, 0.18);
  }

  return scene.add
    .circle(obstacle.position.x, obstacle.position.y, obstacle.radius, obstacle.color, 0.92)
    .setDepth(1.4)
    .setStrokeStyle(2, 0xc8d4ea, 0.16);
}

function createProjectileShape(scene: Phaser.Scene, projectile: SimulationState["run"]["projectiles"][number]): Phaser.GameObjects.Shape {
  const style = getProjectileRenderStyle(projectile);
  if (style.kind === "ellipse") {
    return scene.add
      .ellipse(projectile.position.x, projectile.position.y, style.width, style.height, projectile.color, style.alpha)
      .setDepth(3)
      .setStrokeStyle(style.strokeWidth, 0xffffff, style.strokeAlpha);
  }

  return scene.add
    .rectangle(projectile.position.x, projectile.position.y, style.width, style.height, projectile.color, style.alpha)
    .setDepth(3)
    .setStrokeStyle(style.strokeWidth, 0xffffff, style.strokeAlpha);
}

function getProjectileRenderStyle(projectile: SimulationState["run"]["projectiles"][number]): {
  kind: "rect" | "ellipse";
  width: number;
  height: number;
  alpha: number;
  strokeWidth: number;
  strokeAlpha: number;
  scaleX: number;
  scaleY: number;
} {
  if (projectile.source === "enemy") {
    return {
      kind: "rect",
      width: projectile.radius * 3.1,
      height: projectile.radius * 1.9,
      alpha: 0.82,
      strokeWidth: 1,
      strokeAlpha: 0.18,
      scaleX: 1,
      scaleY: 1
    };
  }

  const weaponId = getWeaponIdByColor(projectile.color);
  const visual = weaponDefinitions[weaponId].projectileVisual;
  switch (weaponId) {
    case "arc-caster":
      return {
        kind: visual.kind,
        width: projectile.radius * visual.widthScale,
        height: projectile.radius * visual.heightScale,
        alpha: 0.92,
        strokeWidth: visual.strokeWidth,
        strokeAlpha: visual.strokeAlpha,
        scaleX: 1,
        scaleY: 1
      };
    case "shard-lance":
      return {
        kind: visual.kind,
        width: projectile.radius * visual.widthScale,
        height: projectile.radius * visual.heightScale,
        alpha: 0.98,
        strokeWidth: visual.strokeWidth,
        strokeAlpha: visual.strokeAlpha,
        scaleX: 1,
        scaleY: 1
      };
    case "rift-carbine":
      return {
        kind: visual.kind,
        width: projectile.radius * visual.widthScale,
        height: projectile.radius * visual.heightScale,
        alpha: 0.94,
        strokeWidth: visual.strokeWidth,
        strokeAlpha: visual.strokeAlpha,
        scaleX: 1,
        scaleY: 1
      };
    case "nova-driver":
      return {
        kind: visual.kind,
        width: projectile.radius * visual.widthScale,
        height: projectile.radius * visual.heightScale,
        alpha: 0.9,
        strokeWidth: visual.strokeWidth,
        strokeAlpha: visual.strokeAlpha,
        scaleX: 1,
        scaleY: 1
      };
    case "pulse-blaster":
    default:
      return {
        kind: visual.kind,
        width: projectile.radius * visual.widthScale,
        height: projectile.radius * visual.heightScale,
        alpha: 0.95,
        strokeWidth: visual.strokeWidth,
        strokeAlpha: visual.strokeAlpha,
        scaleX: 1,
        scaleY: 1
      };
  }
}

function getWeaponIdByColor(color: number): keyof typeof weaponDefinitions {
  const matched = Object.values(weaponDefinitions).find((weapon) => weapon.color === color);
  return matched?.id ?? "pulse-blaster";
}

function getEnemyTint(baseColor: number, healthRatio: number): number {
  if (healthRatio > 0.66) {
    return baseColor;
  }
  if (healthRatio > 0.33) {
    return 0xffb347;
  }
  return 0xff5d73;
}

function getHealthBarColor(healthRatio: number): number {
  if (healthRatio > 0.66) {
    return 0x76f7a3;
  }
  if (healthRatio > 0.33) {
    return 0xffc24d;
  }
  return 0xff5d73;
}

function distanceToPlayer(x: number, y: number, state: SimulationState): number {
  return Math.hypot(x - state.run.player.position.x, y - state.run.player.position.y);
}

function getVisionVisibility(x: number, y: number, state: SimulationState): number {
  const distance = distanceToPlayer(x, y, state);
  const innerRadius = state.run.player.visionRadius * 0.62;
  const outerRadius = state.run.player.visionRadius * 1.08;

  if (distance <= innerRadius) {
    return 1;
  }

  if (distance >= outerRadius) {
    return 0;
  }

  const normalized = 1 - (distance - innerRadius) / Math.max(1, outerRadius - innerRadius);
  return Phaser.Math.Clamp(normalized * normalized, 0, 1);
}
