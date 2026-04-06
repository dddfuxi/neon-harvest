import Phaser from "phaser";

import { getBarrierOrbitSegmentCount } from "../../game/content/upgrades";
import { weaponDefinitions } from "../../game/content/weapons";
import { getAimReticleWorldPosition, InputController } from "../../game/input/bindings";
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
  themeLayer?: Phaser.GameObjects.TileSprite;
  themeWash?: Phaser.GameObjects.Rectangle;
  visionOverlay?: Phaser.GameObjects.RenderTexture;
  visionMask?: Phaser.GameObjects.Image;
  bossAlertFrame?: Phaser.GameObjects.Graphics;
  bossTelegraphs?: Phaser.GameObjects.Graphics;
  enemyIndicators?: Phaser.GameObjects.Graphics;
  player?: Phaser.GameObjects.Sprite;
  playerShield?: Phaser.GameObjects.Arc;
  barrierWards?: Phaser.GameObjects.Graphics;
  aimReticle?: Phaser.GameObjects.Graphics;
  extraction?: Phaser.GameObjects.Sprite;
  extractionGlow?: Phaser.GameObjects.Arc;
  extractionArrow?: Phaser.GameObjects.Graphics;
  bossRewardChest?: Phaser.GameObjects.Sprite;
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
  private objectivePauseTimer = 0;
  private deathFxObjects: Phaser.GameObjects.GameObject[] = [];
  private seenHitEffectIds = new Set<string>();
  private previousAnnouncementId: string | null = null;
  private lastBossRewardRevealKey: string | null = null;
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
    this.registryView.themeLayer = this.add
      .tileSprite(0, 0, this.scale.width, this.scale.height, "bg/theme-skirmish")
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(0.2)
      .setAlpha(0.42);
    this.registryView.themeWash = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x6cf3ff, 0.06)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(0.25);
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
    this.registryView.bossTelegraphs = this.add.graphics().setDepth(5.6);
    this.registryView.enemyIndicators = this.add.graphics().setScrollFactor(0).setDepth(8.6);

    this.registryView.player = this.add.sprite(640, 360, getPlayerTextureKey("pulse-blaster")).setDepth(5);
    this.registryView.playerShield = this.add.circle(640, 360, 24).setStrokeStyle(3, 0x6cf3ff, 0.75).setFillStyle(0x6cf3ff, 0.05).setDepth(4.5);
    this.registryView.barrierWards = this.add.graphics().setDepth(4.85);
    this.registryView.aimReticle = this.add.graphics().setDepth(5.91);
    this.registryView.extractionGlow = this.add
      .circle(1100, 110, 96, 0x6cf3ff, 0.1)
      .setStrokeStyle(5, 0xa8f5ff, 0.5)
      .setDepth(4.35)
      .setVisible(false);
    this.registryView.extraction = this.add.sprite(1100, 110, "fx/extraction").setAlpha(0.35).setVisible(false);
    this.registryView.extractionArrow = this.add.graphics().setDepth(8.5);
    this.registryView.bossRewardChest = this.add.sprite(0, 0, "fx/boss-reward-chest").setAlpha(0.9).setVisible(false).setDepth(4.9);

    this.inputController = new InputController(this);
    this.scale.on("resize", this.handleResize, this);
    this.handleResize();
  }

  update(_: number, delta: number): void {
    const current = this.callbacks.getState();
    if (this.objectivePauseTimer > 0) {
      this.objectivePauseTimer = Math.max(0, this.objectivePauseTimer - delta);
      this.handleRunTransitions(current);
      this.renderState(current);
      return;
    }

    const commands = this.callbacks.flushCommands();
    const running = current.run.status === "running";
    let input = createEmptyInput();
    if (running && this.inputController) {
      const snap = this.inputController.snapshot(current.run.player.position.x, current.run.player.position.y, current.run.enemies);
      if (current.run.stageLore) {
        if (snap.pause) {
          commands.push({ type: "dismiss-stage-lore" });
        }
        input = createEmptyInput();
      } else {
        input = snap;
      }
    }

    if (input.pause && running && !current.run.stageLore) {
      commands.push({ type: "toggle-pause" });
    }

    const next = updateSimulation(current, delta / 1000, input, commands);
    if (current !== next) {
      this.callbacks.setState(next);
      this.callbacks.onStateChange(next);
    }
    if (!current.run.objective.completed && next.run.objective.completed) {
      this.playObjectiveCompleteSequence(next);
    }
    this.handleBossDefeats(current, next);
    this.handleRunTransitions(next);
    this.renderState(next);
  }

  private handleResize(): void {
    const camera = this.cameras.main;
    camera.setViewport(0, 0, this.scale.width, this.scale.height);
    const baseZoom = Math.min(this.scale.width / 1280, this.scale.height / 720);
    const isMobileLandscape =
      window.matchMedia("(pointer: coarse)").matches && window.matchMedia("(orientation: landscape)").matches;
    camera.setZoom(isMobileLandscape ? baseZoom * 0.9 : baseZoom);
    this.registryView.background?.setSize(this.scale.width, this.scale.height);
    this.registryView.themeLayer?.setSize(this.scale.width, this.scale.height);
    this.registryView.themeWash?.setSize(this.scale.width, this.scale.height);
    this.registryView.visionOverlay?.setSize(this.scale.width, this.scale.height);
    this.renderBossAlertFrame(this.callbacks.getState());
  }

  private renderState(state: SimulationState): void {
    const background = this.registryView.background!;
    const themeLayer = this.registryView.themeLayer!;
    const themeWash = this.registryView.themeWash!;
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
    const weaponTint = weaponDefinitions[state.run.player.weaponId].color;
    playerSprite.setTexture(getPlayerTextureKey(state.run.player.weaponId));
    const shieldRatio = Math.max(0, state.run.player.shield / state.run.player.maxShield);
    playerShield.setPosition(state.run.player.position.x, state.run.player.position.y);
    playerShield.setRadius(20 + shieldRatio * 10 + Math.sin(this.time.now / 90) * 1.5);
    playerShield.setStrokeStyle(2 + shieldRatio * 2, weaponTint, 0.3 + shieldRatio * 0.55);
    playerShield.setFillStyle(weaponTint, 0.03 + shieldRatio * 0.08);
    playerShield.setVisible(shieldRatio > 0.02);

    const aimG = this.registryView.aimReticle;
    if (aimG) {
      const showAimReticle = state.run.status === "running" && !state.run.stageLore;
      if (showAimReticle) {
        const px = state.run.player.position.x;
        const py = state.run.player.position.y;
        const pAim = state.run.player.lastAimDirection;
        const reticlePos = getAimReticleWorldPosition(this, px, py, state.run.enemies, pAim);
        const ring = weaponTint;
        const tdx = reticlePos.x - px;
        const tdy = reticlePos.y - py;
        const tlen = Math.hypot(tdx, tdy);
        const rdx = tlen > 0.02 ? tdx / tlen : pAim.x;
        const rdy = tlen > 0.02 ? tdy / tlen : pAim.y;
        aimG.clear();
        aimG.lineStyle(2, ring, 0.92);
        aimG.strokeCircle(reticlePos.x, reticlePos.y, 6);
        aimG.lineStyle(1, 0xffffff, 0.45);
        aimG.strokeCircle(reticlePos.x, reticlePos.y, 9);
        aimG.lineStyle(1.5, ring, 0.4);
        aimG.beginPath();
        aimG.moveTo(px + rdx * 20, py + rdy * 20);
        aimG.lineTo(reticlePos.x - rdx * 11, reticlePos.y - rdy * 11);
        aimG.strokePath();
        aimG.fillStyle(ring, 0.9);
        aimG.fillCircle(reticlePos.x, reticlePos.y, 2);
      } else {
        aimG.clear();
      }
    }

    const barrierG = this.registryView.barrierWards;
    if (barrierG) {
      barrierG.clear();
      const applied = state.run.appliedUpgrades;
      const hasRicochet = applied.includes("ricochet-aegis");
      const segmentCount = getBarrierOrbitSegmentCount(applied);
      const hasOrbitStyle = segmentCount > 0;
      const hasVectorPlate = applied.includes("vector-plate");
      if (hasOrbitStyle || hasVectorPlate) {
        const px = state.run.player.position.x;
        const py = state.run.player.position.y;
        const p = state.run.player;
        if (hasOrbitStyle) {
          barrierG.lineStyle(4, hasRicochet ? 0xff4d5c : 0x9ae8ff, hasRicochet ? 0.92 : 0.88);
          const orbitR = 46;
          const halfW = 28;
          const phase = p.barrierOrbitPhase ?? 0;
          const n = Math.max(1, Math.min(3, segmentCount));
          for (let i = 0; i < n; i += 1) {
            const ang = phase + (i * Math.PI * 2) / n;
            const rx = Math.cos(ang);
            const ry = Math.sin(ang);
            const mx = px + rx * orbitR;
            const my = py + ry * orbitR;
            const tx = -ry;
            const ty = rx;
            barrierG.lineBetween(mx - tx * halfW, my - ty * halfW, mx + tx * halfW, my + ty * halfW);
          }
        }
        if (hasVectorPlate) {
          barrierG.lineStyle(4, 0x9ae8ff, 0.88);
          const d = p.lastAimDirection ?? { x: 1, y: 0 };
          const len = Math.hypot(d.x, d.y);
          const nx = len > 0.01 ? d.x / len : 1;
          const ny = len > 0.01 ? d.y / len : 0;
          const mx = px + nx * 40;
          const my = py + ny * 40;
          const pxv = -ny;
          const pyv = nx;
          const halfW = 32;
          barrierG.lineBetween(mx - pxv * halfW, my - pyv * halfW, mx + pxv * halfW, my + pyv * halfW);
        }
        barrierG.setVisible(true);
      } else {
        barrierG.setVisible(false);
      }
    }
    this.cameras.main.centerOn(state.run.player.position.x, state.run.player.position.y);
    background.tilePositionX = state.run.player.position.x - this.scale.width * 0.5;
    background.tilePositionY = state.run.player.position.y - this.scale.height * 0.5;
    themeLayer.tilePositionX = state.run.player.position.x * 0.35;
    themeLayer.tilePositionY = state.run.player.position.y * 0.35;
    this.applyStageTheme(state, themeLayer, themeWash);

    this.cameras.main.setAlpha(1 - state.run.screenFlash * 0.12);
    if (state.run.screenFlash > 0.8) {
      this.cameras.main.shake(70, 0.0025);
    }

    const extraction = this.registryView.extraction!;
    const extractionGlow = this.registryView.extractionGlow;
    const extractionArrow = this.registryView.extractionArrow;
    extraction.setVisible(state.run.extraction.unlocked);
    extraction.setPosition(state.run.extraction.zoneCenter.x, state.run.extraction.zoneCenter.y);
    extraction.setScale((state.run.extraction.radius / 40) * 1.12);
    extraction.setAlpha(state.run.extraction.active ? 1 : 0.52);
    extraction.setAngle(extraction.angle + 0.5);
    if (extractionGlow) {
      extractionGlow.setVisible(state.run.extraction.unlocked);
      if (state.run.extraction.unlocked) {
        const pulse = Math.sin(this.time.now / 220) * 0.04;
        extractionGlow.setPosition(state.run.extraction.zoneCenter.x, state.run.extraction.zoneCenter.y);
        extractionGlow.setRadius(state.run.extraction.radius * 1.22 + pulse * 40);
        extractionGlow.setFillStyle(0x6cf3ff, 0.1 + pulse * 0.5);
        extractionGlow.setStrokeStyle(5, 0xa8f5ff, 0.45 + pulse * 0.35);
      }
    }
    if (extractionArrow) {
      extractionArrow.clear();
      if (state.run.extraction.unlocked) {
        const cam = this.cameras.main;
        const view = cam.worldView;
        const zx = state.run.extraction.zoneCenter.x;
        const zy = state.run.extraction.zoneCenter.y;
        const margin = 48;
        const onScreen =
          zx >= view.x - margin &&
          zx <= view.x + view.width + margin &&
          zy >= view.y - margin &&
          zy <= view.y + view.height + margin;
        if (!onScreen) {
          const px = state.run.player.position.x;
          const py = state.run.player.position.y;
          const dx = zx - px;
          const dy = zy - py;
          const len = Math.hypot(dx, dy) || 1;
          const maxR = Math.min(view.width, view.height) * 0.36;
          const ax = px + (dx / len) * maxR;
          const ay = py + (dy / len) * maxR;
          const angle = Math.atan2(dy, dx);
          const tipX = ax + Math.cos(angle) * 20;
          const tipY = ay + Math.sin(angle) * 20;
          const wingA = 12;
          extractionArrow.fillStyle(0xffe8a8, 0.95);
          extractionArrow.fillTriangle(
            tipX,
            tipY,
            ax + Math.cos(angle + 2.4) * wingA,
            ay + Math.sin(angle + 2.4) * wingA,
            ax + Math.cos(angle - 2.4) * wingA,
            ay + Math.sin(angle - 2.4) * wingA
          );
          extractionArrow.lineStyle(2, 0xffffff, 0.65);
          const b1x = ax + Math.cos(angle + 2.4) * wingA;
          const b1y = ay + Math.sin(angle + 2.4) * wingA;
          const b2x = ax + Math.cos(angle - 2.4) * wingA;
          const b2y = ay + Math.sin(angle - 2.4) * wingA;
          extractionArrow.lineBetween(tipX, tipY, b1x, b1y);
          extractionArrow.lineBetween(tipX, tipY, b2x, b2y);
          extractionArrow.lineBetween(b1x, b1y, b2x, b2y);
        }
      }
    }

    const bossRewardChest = this.registryView.bossRewardChest!;
    bossRewardChest.setVisible(state.run.bossRewardChest.active);
    bossRewardChest.setPosition(state.run.bossRewardChest.position.x, state.run.bossRewardChest.position.y);
    bossRewardChest.setScale(state.run.bossRewardChest.rewardType === "boss-legendary" ? 1.16 : 1);
    bossRewardChest.setAlpha(state.run.bossRewardChest.active ? 0.96 : 0);
    bossRewardChest.setAngle(Math.sin(this.time.now / 260) * 3);
    bossRewardChest.setTint(state.run.bossRewardChest.rewardType === "boss-legendary" ? 0xfff0b3 : 0xffffff);

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
          const isBeam = hazard.shape === "beam-v" || hazard.shape === "beam-h";
          if (isBeam) {
            view.setVisible(false);
            return;
          }
          view.setVisible(true);
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
          view.setScale(
            enemy.radius /
              (enemy.type === "boss"
                ? enemy.bossPattern === "laser-prime"
                  ? 14
                  : 18
                : enemy.type === "brute"
                  ? 18
                  : 12)
          );
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
          view.setBlendMode(style.blendMode ?? Phaser.BlendModes.NORMAL);
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

    playerSprite.setTint(0xffffff);
    this.spawnHitEffects(state);
    this.playAnnouncementPulse(state);
    this.renderBossTelegraphs(state);
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
        .sprite(x, y, getPlayerTextureKey(state.run.player.weaponId))
          .setDepth(4.7 - progress * 0.1)
        .setTint(0xffffff)
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

  private playObjectiveCompleteSequence(_: SimulationState): void {
    this.objectivePauseTimer = 220;
    this.cameras.main.flash(170, 212, 255, 99, false);
    this.cameras.main.shake(140, 0.0022);
    if (this.sound.get("ui/objective-complete")) {
      this.sound.play("ui/objective-complete");
    }

    const centerX = this.scale.width * 0.5;
    const centerY = this.scale.height * 0.24;
    const ring = this.add.circle(centerX, centerY, 24, 0xd4ff63, 0.12).setScrollFactor(0).setDepth(9.5);
    this.tweens.add({
      targets: ring,
      radius: 180,
      alpha: 0,
      duration: 420,
      ease: "Cubic.easeOut",
      onComplete: () => ring.destroy()
    });
  }

  private handleBossDefeats(previous: SimulationState, next: SimulationState): void {
    const nextBossIds = new Set(next.run.enemies.filter((enemy) => enemy.type === "boss").map((enemy) => enemy.id));
    for (const boss of previous.run.enemies) {
      if (boss.type !== "boss" || nextBossIds.has(boss.id)) {
        continue;
      }
      this.playBossDefeatSequence(boss);
    }
  }

  private playBossDefeatSequence(boss: SimulationState["run"]["enemies"][number]): void {
    const sprite = this.registryView.enemies.get(boss.id);
    const healthBar = this.registryView.enemyHealthBars.get(boss.id);
    const center = { x: boss.position.x, y: boss.position.y };
    const burstColor = boss.color;

    if (sprite) {
      this.tweens.add({
        targets: sprite,
        alpha: 0,
        scaleX: sprite.scaleX * 0.68,
        scaleY: sprite.scaleY * 1.26,
        angle: sprite.angle + 18,
        duration: 340,
        ease: "Cubic.easeOut",
        onComplete: () => sprite.destroy()
      });
      this.registryView.enemies.delete(boss.id);
    }

    if (healthBar) {
      this.tweens.add({
        targets: healthBar,
        alpha: 0,
        scaleX: 1.8,
        duration: 220,
        ease: "Quad.easeOut",
        onComplete: () => healthBar.destroy()
      });
      this.registryView.enemyHealthBars.delete(boss.id);
    }

    this.cameras.main.flash(180, 255, 92, 124, false);
    this.cameras.main.shake(260, 0.0044);
    this.playBossDefeatBanner();

    const flash = this.add.circle(center.x, center.y, 24, 0xffffff, 0.92).setDepth(6.7);
    this.tweens.add({
      targets: flash,
      radius: boss.radius * 3.8,
      alpha: 0,
      duration: 380,
      ease: "Quad.easeOut",
      onComplete: () => flash.destroy()
    });

    const halo = this.add.circle(center.x, center.y, boss.radius * 0.9, burstColor, 0.24).setDepth(6.45);
    this.tweens.add({
      targets: halo,
      radius: boss.radius * 5.6,
      alpha: 0,
      duration: 980,
      ease: "Sine.easeOut",
      onComplete: () => halo.destroy()
    });

    const particleCount = 56;
    for (let index = 0; index < particleCount; index += 1) {
      const angle = (Math.PI * 2 * index) / particleCount + Phaser.Math.FloatBetween(-0.1, 0.1);
      const distance = Phaser.Math.Between(Math.round(boss.radius * 1.8), Math.round(boss.radius * 6.2));
      const size = Phaser.Math.FloatBetween(3.5, 8.5);
      const particle = this.add.circle(center.x, center.y, size, burstColor, 0.95).setDepth(6.55);
      this.tweens.add({
        targets: particle,
        x: center.x + Math.cos(angle) * distance,
        y: center.y + Math.sin(angle) * distance,
        alpha: 0,
        scale: Phaser.Math.FloatBetween(0.4, 1.7),
        duration: 900 + Phaser.Math.Between(0, 240),
        ease: "Cubic.easeOut",
        onComplete: () => particle.destroy()
      });
    }

    for (let index = 0; index < 10; index += 1) {
      const angle = (Math.PI * 2 * index) / 10 + Phaser.Math.FloatBetween(-0.06, 0.06);
      const ray = this.add
        .rectangle(center.x, center.y, boss.radius * 2.8, 7, 0xffffff, 0.72)
        .setRotation(angle)
        .setDepth(6.6)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: ray,
        alpha: 0,
        scaleX: 0.18,
        scaleY: 1.8,
        duration: 260,
        ease: "Quad.easeOut",
        onComplete: () => ray.destroy()
      });
    }
  }

  private playBossDefeatBanner(): void {
    const centerX = this.scale.width * 0.5;
    const centerY = this.scale.height * 0.28;
    const flash = this.add.rectangle(centerX, centerY, 420, 108, 0xff5c7c, 0.16).setScrollFactor(0).setDepth(10.1);
    const title = this.add
      .text(centerX, centerY - 8, "BOSS DOWN", {
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: "48px",
        fontStyle: "700",
        color: "#fff1f4",
        stroke: "#ff3657",
        strokeThickness: 10
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(10.2)
      .setAlpha(0);
    const subtitle = this.add
      .text(centerX, centerY + 32, "复制体坠毁 · 高阶奖励已析出", {
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: "18px",
        fontStyle: "700",
        color: "#ffd7de"
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(10.2)
      .setAlpha(0);

    this.tweens.add({
      targets: flash,
      alpha: 0,
      scaleX: 1.08,
      scaleY: 1.2,
      duration: 520,
      ease: "Quad.easeOut",
      onComplete: () => flash.destroy()
    });
    this.tweens.add({
      targets: title,
      alpha: 1,
      scale: 1.08,
      duration: 180,
      ease: "Back.easeOut",
      yoyo: true,
      hold: 220,
      onComplete: () => title.destroy()
    });
    this.tweens.add({
      targets: subtitle,
      alpha: 1,
      y: centerY + 24,
      duration: 180,
      ease: "Quad.easeOut",
      yoyo: true,
      hold: 180,
      onComplete: () => subtitle.destroy()
    });
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
    this.cameras.main.flash(120, 255, 255, 255, false);
    this.cameras.main.shake(460, 0.0065);
    this.cameras.main.zoomTo(this.cameras.main.zoom * 1.08, 1000);

    const flash = this.add.circle(center.x, center.y, 14, 0xffffff, 0.9).setDepth(6.2);
    this.deathFxObjects.push(flash);
    this.tweens.add({
      targets: flash,
      radius: 110,
      alpha: 0,
      duration: 420,
      ease: "Quad.easeOut"
    });

    const particleCount = 42;
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
      radius: 210,
      alpha: 0,
      duration: 1000,
      ease: "Sine.easeOut",
      onComplete: () => {
        playerSprite.setAlpha(1);
      }
    });
  }

  private applyStageTheme(
    state: SimulationState,
    themeLayer: Phaser.GameObjects.TileSprite,
    themeWash: Phaser.GameObjects.Rectangle
  ): void {
    if (state.run.stageTheme === "crossfire") {
      themeLayer.setTexture("bg/theme-crossfire").setAlpha(0.46);
      themeWash.setFillStyle(0x7f9dff, 0.08);
      return;
    }

    if (state.run.stageTheme === "siege") {
      themeLayer.setTexture("bg/theme-siege").setAlpha(0.52);
      themeWash.setFillStyle(0xff9c47, 0.09);
      return;
    }

    themeLayer.setTexture("bg/theme-skirmish").setAlpha(0.38);
    themeWash.setFillStyle(0x6cf3ff, 0.06);
  }

  private clearDeathSequence(): void {
    for (const object of this.deathFxObjects) {
      object.destroy();
    }
    this.deathFxObjects = [];
    this.registryView.player?.setAlpha(1);
    this.registryView.playerShield?.setVisible(true);
    const baseZoom = Math.min(this.scale.width / 1280, this.scale.height / 720);
    const isMobileLandscape =
      window.matchMedia("(pointer: coarse)").matches && window.matchMedia("(orientation: landscape)").matches;
    this.cameras.main.setZoom(isMobileLandscape ? baseZoom * 0.9 : baseZoom);
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
    const primeBoss = state.run.enemies.some((enemy) => enemy.type === "boss" && enemy.bossPattern === "laser-prime");
    const alertStrength = bossActive ? 0.35 + Math.sin(this.time.now / 120) * 0.12 : 0;
    const warningStrength = state.run.bossAlertTimer > 0 ? 0.5 + Math.sin(this.time.now / 70) * 0.2 : 0;
    const alpha = Math.max(0, Math.max(alertStrength, warningStrength));
    const borderColor = primeBoss ? 0x42e8ff : 0xff2f45;

    frame.clear();
    if (alpha <= 0.02) {
      frame.setVisible(false);
      return;
    }

    frame.setVisible(true);
    frame.lineStyle(10, borderColor, alpha);
    frame.strokeRect(5, 5, this.scale.width - 10, this.scale.height - 10);
    frame.lineStyle(22, borderColor, alpha * 0.2);
    frame.strokeRect(11, 11, this.scale.width - 22, this.scale.height - 22);
  }

  private renderBossTelegraphs(state: SimulationState): void {
    const graphics = this.registryView.bossTelegraphs;
    if (!graphics) {
      return;
    }

    graphics.clear();
    if (
      state.run.status !== "running" &&
      state.run.status !== "run-over" &&
      state.run.status !== "story-clear-pending"
    ) {
      return;
    }

    for (const hazard of state.run.hazards) {
      if (hazard.source !== "boss") {
        continue;
      }

      const isBeam = hazard.shape === "beam-v" || hazard.shape === "beam-h";
      if (isBeam) {
        const ht = hazard.beamHalfThickness ?? 40;
        const hl = hazard.beamHalfLength ?? 400;
        const cx = hazard.position.x;
        const cy = hazard.position.y;
        const telegraphMax = 1.55;
        const lineColor = 0x42e8ff;
        const fillColor = 0x5cf8ff;
        const wFull = hazard.shape === "beam-v" ? ht * 2 : hl * 2;
        const hFull = hazard.shape === "beam-v" ? hl * 2 : ht * 2;

        if (hazard.telegraphTime > 0) {
          const ratio = Phaser.Math.Clamp(hazard.telegraphTime / telegraphMax, 0, 1);
          const pulse = 1 + Math.sin(this.time.now / 70) * 0.04;
          const shrink = 0.32 + (1 - ratio) * 0.68;
          const w = wFull * shrink * pulse;
          const h = hFull * shrink * pulse;
          graphics.lineStyle(3, lineColor, 0.88);
          graphics.strokeRect(cx - w / 2, cy - h / 2, w, h);
          graphics.lineStyle(2, 0xffffff, 0.28 + (1 - ratio) * 0.22);
          graphics.strokeRect(cx - wFull / 2, cy - hFull / 2, wFull, hFull);
          graphics.fillStyle(fillColor, 0.07 + (1 - ratio) * 0.09);
          graphics.fillRect(cx - wFull / 2, cy - hFull / 2, wFull, hFull);
        } else if (hazard.active) {
          graphics.fillStyle(lineColor, 0.12 + Math.sin(this.time.now / 90) * 0.05);
          graphics.fillRect(cx - wFull / 2, cy - hFull / 2, wFull, hFull);
          graphics.lineStyle(2, 0xffffff, 0.38);
          graphics.strokeRect(cx - wFull / 2, cy - hFull / 2, wFull, hFull);
        }
        continue;
      }

      if (hazard.telegraphTime <= 0) {
        continue;
      }

      const ratio = Phaser.Math.Clamp(hazard.telegraphTime / 1.45, 0, 1);
      const color = 0xff425d;
      const pulse = 1 + Math.sin(this.time.now / 70) * 0.04;
      const shrinkingRadius = hazard.radius * (0.24 + ratio * 0.76) * pulse;

      graphics.lineStyle(2, color, 0.85);
      graphics.strokeCircle(hazard.position.x, hazard.position.y, hazard.radius);
      graphics.lineStyle(3, 0xffffff, 0.32 + (1 - ratio) * 0.2);
      graphics.strokeCircle(hazard.position.x, hazard.position.y, shrinkingRadius);
      graphics.fillStyle(color, 0.06 + (1 - ratio) * 0.04);
      graphics.fillCircle(hazard.position.x, hazard.position.y, hazard.radius);
    }

    for (const enemy of state.run.enemies) {
      if (enemy.type !== "boss" || enemy.bossPattern !== "charger" || enemy.chargeTimer <= 0) {
        continue;
      }

      const directionLength = Math.hypot(enemy.chargeDirection.x, enemy.chargeDirection.y);
      if (directionLength < 0.001) {
        continue;
      }

      const ratio = Phaser.Math.Clamp(enemy.chargeTimer / 1.05, 0, 1);
      const direction = {
        x: enemy.chargeDirection.x / directionLength,
        y: enemy.chargeDirection.y / directionLength
      };
      const lineLength = 250 + (1 - ratio) * 80;
      const start = {
        x: enemy.position.x + direction.x * (enemy.radius + 18),
        y: enemy.position.y + direction.y * (enemy.radius + 18)
      };
      const end = {
        x: start.x + direction.x * lineLength,
        y: start.y + direction.y * lineLength
      };
      const side = { x: -direction.y, y: direction.x };
      const width = 18 + (1 - ratio) * 10;

      graphics.lineStyle(5, 0xff694f, 0.24 + (1 - ratio) * 0.22);
      graphics.strokeLineShape(new Phaser.Geom.Line(start.x, start.y, end.x, end.y));
      graphics.fillStyle(0xff694f, 0.12 + (1 - ratio) * 0.08);
      graphics.beginPath();
      graphics.moveTo(start.x + side.x * width, start.y + side.y * width);
      graphics.lineTo(end.x, end.y);
      graphics.lineTo(start.x - side.x * width, start.y - side.y * width);
      graphics.closePath();
      graphics.fillPath();

      const anchorRadius = enemy.radius + 10 + Math.sin(this.time.now / 80) * 2;
      graphics.lineStyle(3, 0xffffff, 0.26 + (1 - ratio) * 0.18);
      graphics.strokeCircle(enemy.position.x, enemy.position.y, anchorRadius);
    }
  }

  private renderEnemyIndicators(state: SimulationState): void {
    const graphics = this.registryView.enemyIndicators;
    if (!graphics) {
      return;
    }

    graphics.clear();
    if (state.run.status !== "running" && state.run.status !== "story-clear-pending") {
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

    const drawScreenEdgeArrow = (
      worldX: number,
      worldY: number,
      size: number,
      color: number,
      alpha: number,
      strokeAlphaScale: number
    ): void => {
      const screenX = (worldX - camera.worldView.x) * camera.zoom;
      const screenY = (worldY - camera.worldView.y) * camera.zoom;
      const dx = screenX - centerX;
      const dy = screenY - centerY;
      const length = Math.max(1, Math.hypot(dx, dy));
      const angle = Math.atan2(dy, dx);
      const px = centerX + (dx / length) * indicatorRadius;
      const py = centerY + (dy / length) * indicatorRadius;
      graphics.fillStyle(color, alpha);
      graphics.lineStyle(2, 0xffffff, alpha * strokeAlphaScale);
      graphics.beginPath();
      graphics.moveTo(px + Math.cos(angle) * size, py + Math.sin(angle) * size);
      graphics.lineTo(px + Math.cos(angle + 2.45) * size, py + Math.sin(angle + 2.45) * size);
      graphics.lineTo(px + Math.cos(angle - 2.45) * size, py + Math.sin(angle - 2.45) * size);
      graphics.closePath();
      graphics.fillPath();
      graphics.strokePath();
    };

    for (const enemy of offscreenEnemies) {
      const size = enemy.type === "boss" ? 13 : 9;
      const color =
        enemy.type === "boss"
          ? enemy.bossPattern === "laser-prime"
            ? 0x5ce8ff
            : 0xff4a63
          : getEnemyTint(enemy.color, enemy.hp / enemy.maxHp);
      const alpha = enemy.type === "boss" ? 0.96 : 0.72;
      drawScreenEdgeArrow(enemy.position.x, enemy.position.y, size, color, alpha, 0.45);
    }

    const chest = state.run.bossRewardChest;
    if (
      chest.active &&
      chest.rewardType &&
      distanceToPlayer(chest.position.x, chest.position.y, state) > state.run.player.visionRadius * 1.04
    ) {
      const isLegendary = chest.rewardType === "boss-legendary";
      drawScreenEdgeArrow(
        chest.position.x,
        chest.position.y,
        12,
        isLegendary ? 0xffc46b : 0x6cf3ff,
        isLegendary ? 0.94 : 0.88,
        0.5
      );
    }
  }

  private spawnHitEffects(state: SimulationState): void {
    const activeIds = new Set(state.run.hitEffects.map((effect) => effect.id));
    for (const effect of state.run.hitEffects) {
      if (this.seenHitEffectIds.has(effect.id)) {
        continue;
      }
      this.seenHitEffectIds.add(effect.id);
      this.playHitEffect(effect);
    }

    for (const id of [...this.seenHitEffectIds]) {
      if (!activeIds.has(id)) {
        this.seenHitEffectIds.delete(id);
      }
    }
  }

  private playHitEffect(effect: SimulationState["run"]["hitEffects"][number]): void {
    if (effect.kind === "spark") {
      const rays = 5;
      for (let index = 0; index < rays; index += 1) {
        const angle = (Math.PI * 2 * index) / rays + Phaser.Math.FloatBetween(-0.2, 0.2);
        const ray = this.add
          .rectangle(effect.position.x, effect.position.y, 18, 3, effect.color, 0.9)
          .setRotation(angle)
          .setDepth(6.4);
        this.tweens.add({
          targets: ray,
          x: effect.position.x + Math.cos(angle) * 18,
          y: effect.position.y + Math.sin(angle) * 18,
          alpha: 0,
          scaleX: 0.3,
          duration: 120,
          ease: "Quad.easeOut",
          onComplete: () => ray.destroy()
        });
      }
      return;
    }

    if (effect.kind === "burst") {
      const ring = this.add.circle(effect.position.x, effect.position.y, 12, effect.color, 0.24).setDepth(6.35);
      const flash = this.add.circle(effect.position.x, effect.position.y, 5, 0xffffff, 0.9).setDepth(6.45);
      this.tweens.add({
        targets: ring,
        radius: 46,
        alpha: 0,
        duration: 180,
        ease: "Cubic.easeOut",
        onComplete: () => ring.destroy()
      });
      this.tweens.add({
        targets: flash,
        radius: 18,
        alpha: 0,
        duration: 130,
        ease: "Quad.easeOut",
        onComplete: () => flash.destroy()
      });
      return;
    }

    if (effect.kind === "pierce-trail") {
      const trail = this.add.rectangle(effect.position.x, effect.position.y, 68, 5, effect.color, 0.52).setDepth(6.3);
      const glow = this.add.rectangle(effect.position.x, effect.position.y, 36, 3, 0xffffff, 0.9).setDepth(6.4);
      const ring = this.add.circle(effect.position.x, effect.position.y, 8, effect.color, 0.16).setDepth(6.32);
      this.tweens.add({
        targets: trail,
        scaleX: 1.8,
        alpha: 0,
        duration: 180,
        ease: "Sine.easeOut",
        onComplete: () => trail.destroy()
      });
      this.tweens.add({
        targets: glow,
        scaleX: 2.1,
        alpha: 0,
        duration: 130,
        ease: "Quad.easeOut",
        onComplete: () => glow.destroy()
      });
      this.tweens.add({
        targets: ring,
        radius: 24,
        alpha: 0,
        duration: 160,
        ease: "Quad.easeOut",
        onComplete: () => ring.destroy()
      });
      return;
    }

    if (effect.kind === "heal-glint") {
      const core = this.add.circle(effect.position.x, effect.position.y, 7, effect.color, 0.88).setDepth(6.55);
      const ring = this.add.circle(effect.position.x, effect.position.y, 12, effect.color, 0.22).setDepth(6.52);
      this.tweens.add({
        targets: core,
        y: effect.position.y - 20,
        alpha: 0,
        scale: 1.4,
        duration: 300,
        ease: "Cubic.easeOut",
        onComplete: () => core.destroy()
      });
      this.tweens.add({
        targets: ring,
        radius: 32,
        alpha: 0,
        duration: 260,
        ease: "Sine.easeOut",
        onComplete: () => ring.destroy()
      });
      return;
    }

    if (effect.kind === "barrier-block") {
      const ring = this.add.circle(effect.position.x, effect.position.y, 8, effect.color, 0.35).setDepth(6.42);
      const flare = this.add.rectangle(effect.position.x, effect.position.y, 22, 4, 0xffffff, 0.82).setDepth(6.44);
      this.tweens.add({
        targets: ring,
        radius: 22,
        alpha: 0,
        duration: 160,
        ease: "Quad.easeOut",
        onComplete: () => ring.destroy()
      });
      flare.setRotation(Phaser.Math.FloatBetween(-0.25, 0.25));
      this.tweens.add({
        targets: flare,
        scaleX: 1.8,
        alpha: 0,
        duration: 140,
        ease: "Cubic.easeOut",
        onComplete: () => flare.destroy()
      });
      return;
    }

    const pulse = this.add.circle(effect.position.x, effect.position.y, 10, effect.color, 0.16).setDepth(6.35);
    const crossA = this.add.rectangle(effect.position.x, effect.position.y, 26, 3, 0xffffff, 0.88).setDepth(6.45);
    const crossB = this.add.rectangle(effect.position.x, effect.position.y, 26, 3, effect.color, 0.88).setDepth(6.45).setRotation(Math.PI / 2);
    this.tweens.add({
      targets: [pulse, crossA, crossB],
      alpha: 0,
      scaleX: 1.45,
      scaleY: 1.45,
      duration: 150,
      ease: "Quad.easeOut",
      onComplete: () => {
        pulse.destroy();
        crossA.destroy();
        crossB.destroy();
      }
    });
  }

  private playAnnouncementPulse(state: SimulationState): void {
    if (state.run.status !== "level-up") {
      this.lastBossRewardRevealKey = null;
    }

    const nextAnnouncementId = state.run.announcement?.id ?? null;
    if (!nextAnnouncementId || nextAnnouncementId === this.previousAnnouncementId) {
      this.previousAnnouncementId = nextAnnouncementId;
      return;
    }

    if (state.run.status === "level-up" && state.run.upgradeOfferSource !== "level-up") {
      const fxKey = `${state.run.upgradeOfferSource}:${nextAnnouncementId}:${state.run.offeredUpgrades.join(",")}`;
      if (fxKey !== this.lastBossRewardRevealKey) {
        this.lastBossRewardRevealKey = fxKey;
        this.playBossRewardReveal(state.run.upgradeOfferSource);
      }
      this.previousAnnouncementId = nextAnnouncementId;
      return;
    }

    const tone = state.run.announcement?.tone ?? "phase";
    if (tone === "boss") {
      this.cameras.main.flash(170, 255, 74, 99, false);
      this.cameras.main.shake(170, 0.0032);
    } else if (tone === "upgrade") {
      this.cameras.main.flash(120, 108, 243, 255, false);
      this.cameras.main.shake(120, 0.0018);
    } else {
      this.cameras.main.flash(140, 212, 255, 99, false);
      this.cameras.main.shake(140, 0.0022);
    }

    this.previousAnnouncementId = nextAnnouncementId;
  }

  private playBossRewardReveal(source: SimulationState["run"]["upgradeOfferSource"]): void {
    const isLegendary = source === "boss-legendary";
    const centerX = this.scale.width * 0.5;
    const centerY = this.scale.height * 0.23;
    const primaryColor = isLegendary ? 0xffc46b : 0xff6aa8;
    const accentColor = isLegendary ? 0xfff0b3 : 0xffffff;

    if (isLegendary) {
      this.cameras.main.flash(48, 32, 28, 22, false);
      this.cameras.main.shake(120, 0.0018);
    } else {
      this.cameras.main.flash(200, 255, 106, 168, false);
      this.cameras.main.shake(190, 0.0034);
    }

    const ring = this.add.circle(centerX, centerY, 42, primaryColor, isLegendary ? 0.22 : 0.16).setScrollFactor(0).setDepth(9.7);
    this.tweens.add({
      targets: ring,
      radius: isLegendary ? 280 : 220,
      alpha: 0,
      duration: isLegendary ? 620 : 480,
      ease: "Cubic.easeOut",
      onComplete: () => ring.destroy()
    });

    const halo = this.add.circle(centerX, centerY, 20, accentColor, 0.82).setScrollFactor(0).setDepth(9.8);
    this.tweens.add({
      targets: halo,
      radius: isLegendary ? 92 : 74,
      alpha: 0,
      duration: 260,
      ease: "Quad.easeOut",
      onComplete: () => halo.destroy()
    });

    const rayCount = isLegendary ? 14 : 10;
    for (let index = 0; index < rayCount; index += 1) {
      const angle = (Math.PI * 2 * index) / rayCount;
      const ray = this.add
        .rectangle(centerX, centerY, isLegendary ? 180 : 132, isLegendary ? 7 : 5, primaryColor, 0.7)
        .setScrollFactor(0)
        .setDepth(9.75)
        .setRotation(angle)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: ray,
        alpha: 0,
        scaleX: 0.2,
        scaleY: isLegendary ? 1.5 : 1.3,
        duration: isLegendary ? 360 : 280,
        ease: "Quad.easeOut",
        onComplete: () => ray.destroy()
      });
    }

    const particleCount = isLegendary ? 28 : 18;
    for (let index = 0; index < particleCount; index += 1) {
      const angle = Phaser.Math.FloatBetween(-Math.PI, Math.PI);
      const distance = Phaser.Math.Between(isLegendary ? 84 : 56, isLegendary ? 260 : 180);
      const particle = this.add.circle(centerX, centerY, Phaser.Math.FloatBetween(2.5, isLegendary ? 6.5 : 5), primaryColor, 0.9).setScrollFactor(0).setDepth(9.72);
      this.tweens.add({
        targets: particle,
        x: centerX + Math.cos(angle) * distance,
        y: centerY + Math.sin(angle) * distance * Phaser.Math.FloatBetween(0.55, 1),
        alpha: 0,
        scale: Phaser.Math.FloatBetween(0.4, 1.5),
        duration: isLegendary ? 900 : 620,
        ease: "Cubic.easeOut",
        onComplete: () => particle.destroy()
      });
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
  blendMode?: Phaser.BlendModes;
} {
  if (projectile.source === "enemy") {
    return {
      kind: "rect",
      width: projectile.radius * 3.1,
      height: projectile.radius * 1.9,
      alpha: 0.68,
      strokeWidth: 1,
      strokeAlpha: 0.08,
      scaleX: 1,
      scaleY: 1,
      blendMode: Phaser.BlendModes.NORMAL
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
        scaleY: 1.04,
        blendMode: Phaser.BlendModes.ADD
      };
    case "shard-lance":
      return {
        kind: visual.kind,
        width: projectile.radius * visual.widthScale,
        height: projectile.radius * visual.heightScale,
        alpha: 0.98,
        strokeWidth: visual.strokeWidth,
        strokeAlpha: visual.strokeAlpha,
        scaleX: 1.08,
        scaleY: 1,
        blendMode: Phaser.BlendModes.ADD
      };
    case "rift-carbine":
      return {
        kind: visual.kind,
        width: projectile.radius * visual.widthScale,
        height: projectile.radius * visual.heightScale,
        alpha: 0.94,
        strokeWidth: visual.strokeWidth,
        strokeAlpha: visual.strokeAlpha,
        scaleX: 1.06,
        scaleY: 1,
        blendMode: Phaser.BlendModes.ADD
      };
    case "nova-driver":
      return {
        kind: visual.kind,
        width: projectile.radius * visual.widthScale,
        height: projectile.radius * visual.heightScale,
        alpha: 0.9,
        strokeWidth: visual.strokeWidth,
        strokeAlpha: visual.strokeAlpha,
        scaleX: 1.04,
        scaleY: 1.04,
        blendMode: Phaser.BlendModes.ADD
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
        scaleX: 1.05,
        scaleY: 1,
        blendMode: Phaser.BlendModes.ADD
      };
  }
}

function getWeaponIdByColor(color: number): keyof typeof weaponDefinitions {
  const matched = Object.values(weaponDefinitions).find((weapon) => weapon.color === color);
  return matched?.id ?? "pulse-blaster";
}

function getPlayerTextureKey(weaponId: keyof typeof weaponDefinitions): string {
  return `player/hull-${weaponId}`;
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
