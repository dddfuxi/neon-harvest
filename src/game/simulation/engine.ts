import { enemyDefinitions, getEnemySpawnMix } from "../content/enemies";
import {
  getBarrierOrbitSegmentCount,
  upgradeBranchLabels,
  upgradeDefinitions,
  upgradePool,
  upgradeTreeMeta,
  type UpgradeDefinition,
  type UpgradeId
} from "../content/upgrades";
import type { EnemyType } from "../content/enemies";
import { weaponDefinitions, type WeaponId, type WeaponModId } from "../content/weapons";
import type { InputSnapshot } from "../input/actions";
import { add, clamp, distance, distancePointToSegment, fromAngle, normalize, scale, subtract } from "./math";
import { buyMetaUpgrade, buyPreRunSupply, buyWeaponMod } from "./meta";
import { randomChoice, randomFloat } from "./random";
import { createRunState, getObjectiveTargetForStage } from "./state";
import {
  STORY_FINAL_STAGE,
  type BossPattern,
  type EnemyState,
  type HazardState,
  type HitEffectState,
  type ObstacleState,
  type ProjectileState,
  type RunAnnouncement,
  type RunObjectiveState,
  type RunSummary,
  type RunTheme,
  type ShardState,
  type SimulationState,
  type UpgradeOfferSource,
  type Vec2,
  type RunMode
} from "./types";

/** 全局弹体射程系数（飞行时间秒）；小于 1 时等比例缩短敌我弹道最大距离 */
const PROJECTILE_LIFE_GLOBAL_SCALE = 0.72;

export type UiCommand =
  | { type: "start-run"; weaponId?: WeaponId; runMode?: RunMode }
  | { type: "choose-story-post-clear"; choice: "continue" | "settle" }
  | { type: "dismiss-stage-lore" }
  | { type: "toggle-pause" }
  | { type: "resume-run" }
  | { type: "exit-run" }
  | { type: "choose-upgrade"; upgradeId: UpgradeId }
  | { type: "enter-meta" }
  | { type: "exit-meta" }
  | { type: "buy-meta"; upgradeId: string }
  | { type: "buy-supply"; supplyId: "weapon-oil" | "shield-pack" | "field-notes" | "emergency-repair" | "risk-protocol" }
  | { type: "buy-weapon-mod"; weaponId: WeaponId; modId: WeaponModId };

export function updateSimulation(
  previous: SimulationState,
  deltaSeconds: number,
  input: InputSnapshot,
  commands: UiCommand[]
): SimulationState {
  let state = previous;

  for (const command of commands) {
    state = applyCommand(state, command);
  }

  if (state.run.status !== "running") {
    const cooled = tickAnnouncement(tickHitEffects(coolScreenFlash(state, deltaSeconds), deltaSeconds), deltaSeconds);
    if (cooled.run.status === "run-over" && cooled.run.runOverDelay > 0) {
      return tickRunOverDelay(cooled, deltaSeconds);
    }
    return cooled;
  }

  if (state.run.stageLore) {
    return tickAnnouncement(tickHitEffects(coolScreenFlash(state, deltaSeconds), deltaSeconds), deltaSeconds);
  }

  let next = { ...state, run: { ...state.run, time: state.run.time + deltaSeconds } };
  next = coolScreenFlash(next, deltaSeconds);
  next = tickHitEffects(next, deltaSeconds);
  next = tickAnnouncement(next, deltaSeconds);
  next = tickPlayer(next, deltaSeconds, input);
  next = refreshWorldChunks(next);
  next = spawnEnemies(next, deltaSeconds);
  next = updateEnemies(next, deltaSeconds);
  next = updateProjectiles(next, deltaSeconds);
  next = maybeOpenBossRewardChest(next);
  if (next.run.status !== "running") {
    return next;
  }
  next = updateShards(next, deltaSeconds);
  next = updateHazards(next, deltaSeconds);
  next = maybeOpenBossRewardChest(next);
  if (next.run.status !== "running") {
    return next;
  }
  next = maybeUnlockExtraction(next);
  next = updateExtraction(next, deltaSeconds, input);
  next = maybeTriggerBossEvent(next);
  next = maybeOfferLevelUp(next);
  if (next.run.status !== "running") {
    return next;
  }
  next = updateObjective(next, deltaSeconds);
  next = updateTutorialHint(next);
  next = checkDefeat(next);

  return maybeFlushPendingStageLore(next);
}

function coolScreenFlash(state: SimulationState, deltaSeconds: number): SimulationState {
  const nextFlash = Math.max(0, state.run.screenFlash - deltaSeconds * 1.4);
  const nextBossAlertTimer = Math.max(0, state.run.bossAlertTimer - deltaSeconds);
  if (nextFlash === state.run.screenFlash && nextBossAlertTimer === state.run.bossAlertTimer) {
    return state;
  }

  return {
    ...state,
    run: {
      ...state.run,
      screenFlash: nextFlash,
      bossAlertTimer: nextBossAlertTimer
    }
  };
}

function tickRunOverDelay(state: SimulationState, deltaSeconds: number): SimulationState {
  const nextDelay = Math.max(0, state.run.runOverDelay - deltaSeconds);
  if (nextDelay === state.run.runOverDelay) {
    return state;
  }

  return {
    ...state,
    run: {
      ...state.run,
      runOverDelay: nextDelay
    }
  };
}

function tickHitEffects(state: SimulationState, deltaSeconds: number): SimulationState {
  if (state.run.hitEffects.length === 0) {
    return state;
  }

  const hitEffects = state.run.hitEffects
    .map((effect) => ({
      ...effect,
      ttl: effect.ttl - deltaSeconds
    }))
    .filter((effect) => effect.ttl > 0);

  return {
    ...state,
    run: {
      ...state.run,
      hitEffects
    }
  };
}

function tickAnnouncement(state: SimulationState, deltaSeconds: number): SimulationState {
  if (!state.run.announcement) {
    return state;
  }

  const timer = state.run.announcement.timer - deltaSeconds;
  return {
    ...state,
    run: {
      ...state.run,
      announcement:
        timer > 0
          ? {
              ...state.run.announcement,
              timer
            }
          : null
    }
  };
}

function applyCommand(state: SimulationState, command: UiCommand): SimulationState {
  switch (command.type) {
    case "start-run":
      return createRunState(state, command.weaponId, command.runMode ?? "story");
    case "choose-story-post-clear":
      if (state.run.status !== "story-clear-pending") {
        return state;
      }
      if (command.choice === "continue") {
        return advanceStage({
          ...state,
          run: { ...state.run, storyArcComplete: true, status: "running" }
        });
      }
      return endRun(state, "cleared");
    case "dismiss-stage-lore":
      if (state.run.stageLore) {
        return maybeFlushPendingStageLore({ ...state, run: { ...state.run, stageLore: null } });
      }
      return state;
    case "toggle-pause":
      if (state.run.stageLore) {
        return maybeFlushPendingStageLore({ ...state, run: { ...state.run, stageLore: null } });
      }
      if (state.run.status === "running") {
        return { ...state, run: { ...state.run, status: "paused" } };
      }
      if (state.run.status === "paused") {
        return { ...state, run: { ...state.run, status: "running" } };
      }
      return state;
    case "resume-run":
      if (state.run.status === "paused") {
        return { ...state, run: { ...state.run, status: "running" } };
      }
      return state;
    case "exit-run":
      if (state.run.status === "paused") {
        return endRun(
          {
            ...state,
            run: {
              ...state.run,
              lastDamageSource: "死于自杀"
            }
          },
          "dead"
        );
      }
      return state;
    case "choose-upgrade":
      if (state.run.status !== "level-up") {
        return state;
      }
      return applyUpgrade(state, command.upgradeId);
    case "enter-meta":
      return { ...state, run: { ...state.run, status: "meta" } };
    case "exit-meta":
      return { ...state, run: { ...state.run, status: "menu" } };
    case "buy-meta":
      return { ...state, meta: buyMetaUpgrade(state.meta, command.upgradeId) };
    case "buy-supply":
      return { ...state, meta: buyPreRunSupply(state.meta, command.supplyId) };
    case "buy-weapon-mod":
      return { ...state, meta: buyWeaponMod(state.meta, command.weaponId, command.modId) };
    default:
      return state;
  }
}

function applyUpgrade(state: SimulationState, upgradeId: UpgradeId): SimulationState {
  const player = { ...state.run.player };
  let hazards = [...state.run.hazards];
  let emergencyRepairCharges = state.run.emergencyRepairCharges;
  let extraBankedShards = 0;
  const applied = [...state.run.appliedUpgrades, upgradeId];
  const definition = upgradeDefinitions[upgradeId];
  const discoveredUpgradeIds = state.meta.discoveredUpgradeIds.includes(upgradeId)
    ? state.meta.discoveredUpgradeIds
    : [...state.meta.discoveredUpgradeIds, upgradeId];

  switch (upgradeId) {
    case "weapon-tuning":
      player.weaponLevel += 1;
      break;
    case "overclock-rounds":
      player.damageMultiplier *= 1.18;
      break;
    case "heat-sink":
      player.fireRateMultiplier *= 1.08;
      player.projectileSpeedMultiplier *= 1.05;
      break;
    case "kinetic-echo":
    case "ghost-shell":
      player.extraPierce += upgradeId === "kinetic-echo" ? 2 : 1;
      if (upgradeId === "ghost-shell") {
        player.explosiveShots += 18;
      }
      break;
    case "phase-cooling":
      player.maxShield += 20;
      player.shield = Math.min(player.maxShield, player.shield + 20);
      break;
    case "ion-shell":
      player.damageReduction += 0.12;
      break;
    case "rapid-cycle":
      player.fireRateMultiplier *= 1.2;
      break;
    case "blink-drive":
      player.dashCooldown *= 0.82;
      player.dashDistance += 26;
      break;
    case "repulsor-fins":
      player.moveSpeed *= 1.12;
      player.shardMagnet += 34;
      break;
    case "salvage-net":
      player.xpMultiplier *= 1.2;
      break;
    case "compound-interest":
      player.economyMultiplier *= 1.18;
      extraBankedShards += 18;
      break;
    case "pressure-core":
      player.damageMultiplier *= 1.06;
      player.projectileSpeedMultiplier *= 1.04;
      break;
    case "auto-forge":
      player.maxShield += 10;
      player.shield = Math.min(player.maxShield, player.shield + 18);
      break;
    case "lattice-armor":
      player.maxHp += 28;
      player.hp += 28;
      break;
    case "fracture-grid":
      hazards = hazards.map((hazard) => ({
        ...hazard,
        radius: hazard.radius + 18,
        damagePerSecond: hazard.damagePerSecond + 3
      }));
      break;
    case "weapon-swap":
      if (definition.weaponSwapTo) {
        player.weaponId = definition.weaponSwapTo;
      }
      break;
    case "twin-fang":
      player.shotCount += 1;
      break;
    case "triptych":
      // +2 发扇形（基准 1 发时合起来为三联），与「双牙并列」+1 可叠加为四连发。
      player.shotCount += 2;
      player.fireRateMultiplier *= 0.92;
      break;
    case "sidewinder-rack":
      player.sideShotLevel = Math.max(player.sideShotLevel, 1);
      player.fireRateMultiplier *= 1.08;
      player.projectileSpeedMultiplier *= 1.04;
      break;
    case "rear-array":
      player.rearShot = true;
      break;
    case "catacomb-rounds":
      player.ricochetShots += 1;
      break;
    case "halo-shards":
      player.killBurst = true;
      break;
    case "seeker-lens":
      player.homingStrength += 0.22;
      player.projectileSpeedMultiplier *= 1.06;
      break;
    case "giant-core":
      player.projectileSize *= 1.32;
      player.projectileSpeedMultiplier *= 0.92;
      player.damageMultiplier *= 1.08;
      break;
    case "zero-point-lattice":
      player.damageMultiplier *= 1.35;
      player.projectileSize *= 1.22;
      player.projectileSpeedMultiplier *= 1.08;
      player.extraPierce += 2;
      player.homingStrength += 0.12;
      break;
    case "blood-siphon":
      player.lifeSteal += 0.05;
      break;
    case "aegis-surge":
      player.maxShield += 34;
      player.shield = Math.min(player.maxShield, player.shield + 34);
      player.maxHp += 24;
      player.hp += 24;
      player.damageReduction += 0.08;
      break;
    case "phoenix-protocol":
      player.maxHp += 56;
      player.hp += 56;
      player.maxShield += 40;
      player.shield = Math.min(player.maxShield, player.shield + 40);
      player.lifeSteal += 0.04;
      player.damageReduction += 0.1;
      emergencyRepairCharges += 1;
      break;
    case "bank-heist":
      player.economyMultiplier *= 1.14;
      player.xpMultiplier *= 1.1;
      break;
    case "survey-array":
      player.visionRadius += 95;
      break;
    case "deep-radar":
      player.visionRadius += 155;
      break;
    case "vector-plate":
    case "orbit-plate-1":
    case "orbit-plate-2":
    case "orbit-plate-3":
    case "ricochet-aegis":
      break;
    case "apex-sanctuary":
      player.moveSpeed *= 1.06;
      player.xpMultiplier *= 1.05;
      player.fireRateMultiplier *= 2;
      player.projectileSize *= 1.38;
      player.apexInvulnRemaining = 0;
      player.apexPulseCooldown = 8;
      break;
    case "salvo-duel":
      break;
    case "supernova-heart":
      player.shotCount += 2;
      player.fireRateMultiplier *= 1.15;
      player.explosiveShots += 26;
      player.killBurst = true;
      player.sideShotLevel = Math.max(player.sideShotLevel, 1);
      break;
    default:
      break;
  }

  return {
    ...state,
    meta: {
      ...state.meta,
      discoveredUpgradeIds
    },
    nextId: state.nextId + 1,
    run: {
      ...state.run,
      status: "running",
      player,
      hazards,
      bankedShards: state.run.bankedShards + extraBankedShards,
      appliedUpgrades: applied,
      offeredUpgrades: [],
      upgradeOfferSource: "level-up",
      // 复制体击杀常伴随经验升级：先弹出普通三选一时不应吞掉仍待领取的副本宝箱奖励。
      pendingBossReward:
        state.run.upgradeOfferSource === "level-up" ? state.run.pendingBossReward : null,
      emergencyRepairCharges,
      tutorialHint: `构筑已接入：${definition.title}。`,
        announcement: createAnnouncement(
          state.nextId,
          "构筑完成",
          `${upgradeBranchLabels[upgradeTreeMeta[upgradeId].branch]} · ${definition.title} 已接入，继续沿当前路线推进。`,
          "upgrade"
        ),
        screenFlash: 0.9
    }
  };
}

function tickPlayer(state: SimulationState, deltaSeconds: number, input: InputSnapshot): SimulationState {
  const player = { ...state.run.player };
  const moveDirection = normalize(input.move);
  player.skillCooldown = Math.max(0, player.skillCooldown - deltaSeconds);
  player.skillEffectTimer = Math.max(0, player.skillEffectTimer - deltaSeconds);
  const overdriveMultiplier = player.characterSkillId === "overdrive-core" && player.skillEffectTimer > 0 ? 1.18 : 1;
  player.velocity = scale(moveDirection, player.moveSpeed * overdriveMultiplier);
  player.position = resolveObstacleCollision(add(player.position, scale(player.velocity, deltaSeconds)), player.radius, state.run.obstacles);
  player.weaponCooldown = Math.max(0, player.weaponCooldown - deltaSeconds);
  player.dashTimer = Math.max(0, player.dashTimer - deltaSeconds);
  player.shieldRegenDelay = Math.max(0, player.shieldRegenDelay - deltaSeconds);

  if (input.dash && player.dashTimer <= 0) {
    const dashDirection = moveDirection.x === 0 && moveDirection.y === 0 ? normalize(input.aim) : moveDirection;
    player.position = resolveObstacleCollision(add(player.position, scale(dashDirection, player.dashDistance)), player.radius, state.run.obstacles);
    player.dashTimer = player.dashCooldown;
  }

  let next = { ...state, run: { ...state.run, player } };
  if (input.dash && player.dashTimer > 0 && player.characterSkillId === "phase-burst" && player.skillCooldown <= 0) {
    next = triggerPhaseBurst(next);
  }
  if (input.fire) {
    next = firePlayerWeapon(next, normalize(input.aim));
  }

  const aimLen = Math.hypot(input.aim.x, input.aim.y);
  if (aimLen > 0.12) {
    next.run.player.lastAimDirection = scale(input.aim, 1 / aimLen);
  }
  if (getBarrierOrbitSegmentCount(next.run.appliedUpgrades) > 0) {
    next.run.player.barrierOrbitPhase = (next.run.player.barrierOrbitPhase ?? 0) + deltaSeconds * 1.25;
  }

  if (next.run.appliedUpgrades.includes("apex-sanctuary")) {
    const APEX_INVULN_SEC = 2;
    /** 无敌结束后的间隔秒数；与无敌合计为 10 秒一循环（2s 无敌 + 8s 间隔） */
    const APEX_GAP_SEC = 8;
    let inv = next.run.player.apexInvulnRemaining ?? 0;
    let cd = next.run.player.apexPulseCooldown ?? 0;
    if (inv > 0) {
      inv -= deltaSeconds;
      if (inv <= 0) {
        inv = 0;
        cd = APEX_GAP_SEC;
      }
    } else {
      cd -= deltaSeconds;
      if (cd <= 0) {
        inv = APEX_INVULN_SEC;
        cd = 0;
        next.run.screenFlash = Math.max(next.run.screenFlash, 0.42);
      }
    }
    next.run.player.apexInvulnRemaining = Math.max(0, inv);
    next.run.player.apexPulseCooldown = Math.max(0, cd);
  }

  return next;
}

function refreshWorldChunks(state: SimulationState): SimulationState {
  const loadChunkKeys = collectChunkKeys(state.run.player.position, state.world.chunkSize, 4);
  const retainChunkKeys = collectChunkKeys(state.run.player.position, state.world.chunkSize, 5);
  const currentChunkSet = new Set(state.run.activeChunkKeys);
  const retainChunkSet = new Set(retainChunkKeys);
  const retainedChunkKeys = state.run.activeChunkKeys.filter((chunkKey) => retainChunkSet.has(chunkKey));
  const missingChunkKeys = loadChunkKeys.filter((chunkKey) => !currentChunkSet.has(chunkKey));

  if (missingChunkKeys.length === 0 && retainedChunkKeys.length === state.run.activeChunkKeys.length) {
    return state;
  }

  const retainedObstacles = state.run.obstacles.filter((obstacle) => retainChunkSet.has(obstacle.chunkKey));
  const addedObstacles = generateChunkObstacles(state.world.seed, state.world.chunkSize, missingChunkKeys);

  return {
    ...state,
    run: {
      ...state.run,
      obstacles: [...retainedObstacles, ...addedObstacles],
      activeChunkKeys: [...retainedChunkKeys, ...missingChunkKeys]
    }
  };
}

function triggerPhaseBurst(state: SimulationState): SimulationState {
  const player = { ...state.run.player, skillCooldown: 4.5 };
  const burstRadius = 96;
  const burstDamage = 28;
  const enemies = state.run.enemies.map((enemy) => {
    if (distance(enemy.position, player.position) > burstRadius + enemy.radius) {
      return enemy;
    }
    return {
      ...enemy,
      hp: enemy.hp - burstDamage
    };
  });

  return {
    ...state,
    run: {
      ...state.run,
      player,
      enemies,
      screenFlash: Math.max(state.run.screenFlash, 0.42)
    }
  };
}

function firePlayerWeapon(state: SimulationState, aimDirection: Vec2): SimulationState {
  const player = { ...state.run.player };
  const weapon = weaponDefinitions[player.weaponId];
  const overdriveMultiplier = player.characterSkillId === "overdrive-core" && player.skillEffectTimer > 0 ? 1.22 : 1;
  const weaponLevelMultiplier = Math.max(1, player.weaponLevel);
  const effectiveFireRate =
    weapon.fireRate * player.fireRateMultiplier * (1 + (weaponLevelMultiplier - 1) * 0.08) * overdriveMultiplier;
  if (player.weaponCooldown > 0 || (aimDirection.x === 0 && aimDirection.y === 0)) {
    return state;
  }

  let seed = state.rngSeed;
  const projectiles: ProjectileState[] = [];
  const angle = Math.atan2(aimDirection.y, aimDirection.x);
  const shotCount = Math.max(1, player.shotCount + weapon.baseShotCount - 1);
  const step = shotCount <= 1 ? 0 : weapon.shotSpacing;
  const baseOffsets = Array.from({ length: shotCount }, (_, index) => (index - (shotCount - 1) / 2) * step);

  for (const offset of baseOffsets) {
    const randomRoll = randomFloat(seed);
    seed = randomRoll.seed;
    projectiles.push(createProjectile(state, player, angle + offset + (randomRoll.value - 0.5) * weapon.spread, weapon, projectiles.length));
  }

  if (player.sideShotLevel > 0) {
    projectiles.push(createProjectile(state, player, angle + 0.35, weapon, projectiles.length, 0.74));
    projectiles.push(createProjectile(state, player, angle - 0.35, weapon, projectiles.length, 0.74));
  }

  if (player.rearShot) {
    projectiles.push(createProjectile(state, player, angle + Math.PI, weapon, projectiles.length, 0.88));
  }

  return {
    ...state,
    rngSeed: seed,
    nextId: state.nextId + projectiles.length,
    run: {
      ...state.run,
      player: {
        ...player,
        weaponCooldown: 1 / effectiveFireRate
      },
      projectiles: [...state.run.projectiles, ...projectiles],
      screenFlash: Math.max(state.run.screenFlash, 0.12)
    }
  };
}

function createProjectile(
  state: SimulationState,
  player: SimulationState["run"]["player"],
  angle: number,
  weapon: (typeof weaponDefinitions)[WeaponId],
  indexOffset: number,
  damageScale = 1
): ProjectileState {
  const direction = fromAngle(angle);
  const weaponLevelMultiplier = Math.max(1, player.weaponLevel);
  const speed = weapon.projectileSpeed * player.projectileSpeedMultiplier * (1 + (weaponLevelMultiplier - 1) * 0.04);
  const size = 5 * player.projectileSize;
  let life = weapon.projectileLife * (1 + (player.projectileSize - 1) * 0.15);
  if (state.run.appliedUpgrades.includes("apex-sanctuary")) {
    life *= 2;
  }
  life *= PROJECTILE_LIFE_GLOBAL_SCALE;

  return {
    id: `p-${state.nextId + indexOffset}`,
    source: "player",
    position: add(player.position, scale(direction, player.radius + 12)),
    velocity: scale(direction, speed),
    radius: size,
    life,
    damage:
      weapon.damage *
      (1 + (weaponLevelMultiplier - 1) * 0.12) *
      damageScale *
      player.damageMultiplier *
      (state.run.extraction.unlocked && state.run.appliedUpgrades.includes("pressure-core") ? 1.12 : 1),
    color: weapon.color,
    pierceLeft: weapon.pierce + player.extraPierce,
    obstaclePierceLeft: weapon.obstaclePierce,
    explosiveRadius: player.explosiveShots,
    ricochetLeft: player.ricochetShots,
    obstacleRicochets: 0,
    catacombBonusSpent: false,
    homingStrength: player.homingStrength
  };
}

function spawnEnemies(state: SimulationState, deltaSeconds: number): SimulationState {
  const bossActive = state.run.enemies.some((enemy) => enemy.type === "boss");
  const earlyPenalty = state.run.time < 45 ? 2 : state.run.time < 90 ? 1 : 0;
  const stagePressure = Math.floor((state.run.objective.stage - 1) / 3);
  const riskPressure = state.run.riskProtocolTier * 1.25;
  const themeCountBonus = state.run.stageTheme === "siege" ? 2 : state.run.stageTheme === "crossfire" ? 1 : 0;
  const desiredCount = Math.max(
    2,
    Math.floor(
      (bossActive ? 2 : 4) +
        state.run.time / 14 +
        state.run.unbankedShards / 55 +
        stagePressure * 1.5 +
        themeCountBonus +
        riskPressure -
        earlyPenalty
    )
  );
  const themeRateBonus = state.run.stageTheme === "siege" ? 0.26 : state.run.stageTheme === "crossfire" ? 0.14 : 0;
  const spawnRate = clamp(
    (state.run.time < 75 ? 0.72 + state.run.time / 120 : 1.3 + state.run.time / 55) +
      stagePressure * 0.18 +
      themeRateBonus +
      state.run.riskProtocolTier * 0.22,
    0.72,
    7.2
  );
  const spawnInterval = 1 / spawnRate;
  let accumulator = state.run.spawnAccumulator + deltaSeconds;
  let next = state;

  if (next.run.enemies.length < 2 && next.run.time < 3) {
    accumulator += 1.4;
  }

  while (accumulator >= spawnInterval && next.run.enemies.length < desiredCount) {
    accumulator -= spawnInterval;
    next = spawnSingleEnemy(next);
  }

  if (accumulator === next.run.spawnAccumulator) {
    return maybeAddHazards(next);
  }

  return maybeAddHazards({
    ...next,
    run: {
      ...next.run,
      spawnAccumulator: accumulator
    }
  });
}

function spawnSingleEnemy(state: SimulationState): SimulationState {
  const mix = getEnemySpawnMix(state.run.time, state.run.stageTheme);
  const choice = randomChoice(state.rngSeed, mix);
  const angleRoll = randomFloat(choice.seed);
  const radiusRoll = randomFloat(angleRoll.seed);
  const modifierRoll = randomFloat(radiusRoll.seed);
  const definition = enemyDefinitions[choice.value];
  const angle = angleRoll.value * Math.PI * 2;
  const radius = 420 + radiusRoll.value * 180;
  const position = add(state.run.player.position, scale(fromAngle(angle), radius));

  const eliteUnlocked = state.run.time > 150;
  const eliteModifier = eliteUnlocked && modifierRoll.value > 0.84 ? (modifierRoll.value > 0.92 ? "volatile" : "fast") : null;
  const hpBonus = (eliteModifier ? 1.35 : 1) * (1 + state.run.riskProtocolTier * 0.12);
  const color = eliteModifier === "volatile" ? 0xffe670 : definition.color;
  const enemy: EnemyState = {
    id: `e-${state.nextId}`,
    type: definition.type,
    modifier: eliteModifier,
    bossPattern: null,
    position: resolveObstacleCollision(position, definition.radius, state.run.obstacles),
    velocity: { x: 0, y: 0 },
    radius: definition.radius,
    hp: definition.health * hpBonus,
    maxHp: definition.health * hpBonus,
    fireCooldown: definition.rangedCooldown ?? 0,
    skillCooldown: 0,
    secondaryCooldown: 0,
    chargeTimer: 0,
    chargeDirection: { x: 0, y: 0 },
    touchCooldown: 0,
    color
  };

  return {
    ...state,
    rngSeed: modifierRoll.seed,
    nextId: state.nextId + 1,
    run: {
      ...state.run,
      enemies: [...state.run.enemies, enemy]
    }
  };
}

function spawnBoss(
  state: SimulationState,
  pattern: BossPattern,
  options?: { hpMultiplier?: number; radiusMultiplier?: number; colorOverride?: number }
): SimulationState {
  const definition = enemyDefinitions.boss;
  const angleRoll = randomFloat(state.rngSeed);
  const angle = angleRoll.value * Math.PI * 2;
  const position = add(state.run.player.position, scale(fromAngle(angle), 420));
  const radiusScale =
    (pattern === "artillery" ? 1.42 : pattern === "charger" ? 1.28 : 1.55) * (options?.radiusMultiplier ?? 1);
  const lateBossHp =
    1 + Math.min(1.45, state.run.bossDefeats * 0.12 + state.run.objective.stage * 0.04);
  const hpScale =
    (pattern === "artillery" ? 1.14 : pattern === "charger" ? 1.06 : 1.26) *
    (options?.hpMultiplier ?? 1) *
    (1 + state.run.riskProtocolTier * 0.16) *
    lateBossHp;
  const bossHp = definition.health * hpScale * 2;
  const enemy: EnemyState = {
    id: `e-${state.nextId}`,
    type: "boss",
    modifier: null,
    bossPattern: pattern,
    position: resolveObstacleCollision(position, definition.radius * radiusScale, state.run.obstacles),
    velocity: { x: 0, y: 0 },
    radius: definition.radius * radiusScale,
    hp: bossHp,
    maxHp: bossHp,
    fireCooldown: pattern === "laser-prime" ? 0.55 : 0.7,
    skillCooldown: pattern === "laser-prime" ? 2 : 1.8,
    secondaryCooldown: pattern === "laser-prime" ? 4.2 : 3.4,
    chargeTimer: 0,
    chargeDirection: { x: 0, y: 0 },
    touchCooldown: 0,
    color: options?.colorOverride ?? (pattern === "artillery" ? 0xff516b : pattern === "charger" ? 0xff7a4a : 0x48e8ff),
    bossLaserPhase: pattern === "laser-prime" ? 0 : undefined
  };

  return {
    ...state,
    rngSeed: angleRoll.seed,
    nextId: state.nextId + 1,
    run: {
      ...state.run,
      enemies: [...state.run.enemies, enemy],
      screenFlash: 0.62
    }
  };
}

function maybeAddHazards(state: SimulationState): SimulationState {
  const fractureBonus = state.run.appliedUpgrades.includes("fracture-grid") ? 1 : 0;
  const hazardTier = getHazardTier(state) + fractureBonus;
  if (hazardTier <= state.run.activeHazardTier || hazardTier === 0) {
    return state;
  }

  const hazardRadiusBonus =
    (state.run.stageTheme === "siege" ? 18 : state.run.stageTheme === "crossfire" ? -6 : 0) + state.run.riskProtocolTier * 8;
  const hazardDamageBonus =
    (state.run.stageTheme === "siege" ? 4 : state.run.stageTheme === "crossfire" ? 2 : 0) + state.run.riskProtocolTier * 3;

  const hazard: HazardState = {
    id: `h-${state.nextId}`,
    position: add(state.run.player.position, {
      x: 180 + ((hazardTier * 260) % 260),
      y: -140 + ((hazardTier * 170) % 240)
    }),
    radius: 58 + hazardTier * 12 + hazardRadiusBonus,
    damagePerSecond: 10 + hazardTier * 4 + hazardDamageBonus,
    active: true,
    telegraphTime: 0,
    duration: 999,
    source: "storm"
  };

  return {
    ...state,
    nextId: state.nextId + 1,
    run: {
      ...state.run,
      activeHazardTier: hazardTier,
      hazards: [...state.run.hazards, hazard],
      tutorialHint:
        state.run.stageTheme === "siege"
          ? "围城阶段出现重压风暴区，拖拽敌人穿过去能明显减压。"
          : state.run.stageTheme === "crossfire"
            ? "交火阶段的风暴区更窄但更密，注意别被远程火力逼进去。"
            : "游猎阶段形成风暴口袋，可以把敌人赶进去吃伤害。",
    }
  };
}

function updateEnemies(state: SimulationState, deltaSeconds: number): SimulationState {
  const player = state.run.player;
  const projectiles = [...state.run.projectiles];
  const hazards = [...state.run.hazards];
  let hp = player.hp;
  let shield = player.shield;
  let regenDelay = player.shieldRegenDelay;
  let skillCooldown = player.skillCooldown;
  let skillEffectTimer = player.skillEffectTimer;
  let lastDamageSource = state.run.lastDamageSource;
  let screenFlash = state.run.screenFlash;
  let nextId = state.nextId;

  const enemies = state.run.enemies.flatMap((enemy) => {
    const definition = enemyDefinitions[enemy.type];
    const enemyNext = { ...enemy };
    enemyNext.fireCooldown = Math.max(0, enemyNext.fireCooldown - deltaSeconds);
    enemyNext.skillCooldown = Math.max(0, enemyNext.skillCooldown - deltaSeconds);
    enemyNext.secondaryCooldown = Math.max(0, enemyNext.secondaryCooldown - deltaSeconds);
    enemyNext.chargeTimer = Math.max(0, enemyNext.chargeTimer - deltaSeconds);
    enemyNext.touchCooldown = Math.max(0, enemyNext.touchCooldown - deltaSeconds);
    const steer =
      enemy.type === "boss" && enemyNext.chargeTimer > 0
        ? enemyNext.chargeDirection
        : steerEnemyAroundObstacles(enemy.position, player.position, state.run.obstacles, enemy.radius);
    const speedBase = enemy.modifier === "fast" ? definition.speed * 1.35 : definition.speed;
    const chargeMultiplier = enemy.type === "boss" && enemyNext.chargeTimer > 0 ? 3.15 : 1;
    const speed = speedBase * chargeMultiplier * (state.run.extraction.unlocked ? 1.08 : 1);
    enemyNext.velocity = scale(steer, speed);
    enemyNext.position = resolveObstacleCollision(add(enemy.position, scale(enemyNext.velocity, deltaSeconds)), enemy.radius, state.run.obstacles);

    if (enemy.type === "boss") {
      const bossUpdate = updateBossSkills(state, enemyNext, projectiles, hazards, nextId);
      nextId = bossUpdate.nextId;
      screenFlash = Math.max(screenFlash, bossUpdate.screenFlash);
    }

    if (distance(enemyNext.position, player.position) <= enemy.radius + player.radius + 6 && enemyNext.touchCooldown <= 0) {
      const contactDamage =
        enemy.type === "boss" && enemyNext.chargeTimer > 0
          ? definition.contactDamage * 1.9
          : definition.contactDamage;
      if (!isApexSanctuaryInvulnerable(state)) {
        const damageResult = applyIncomingDamage(shield, hp, contactDamage * (1 - clamp(player.damageReduction, 0, 0.6)));
        if (player.characterSkillId === "overdrive-core" && damageResult.hp < hp && skillCooldown <= 0) {
          skillCooldown = 14;
          skillEffectTimer = 4.5;
          screenFlash = Math.max(screenFlash, 0.72);
        }
        shield = damageResult.shield;
        hp = damageResult.hp;
      }
      lastDamageSource =
        enemy.type === "boss"
          ? enemyNext.chargeTimer > 0
            ? "被复制体冲锋正面撞穿"
            : "被复制体近身压制击毁"
          : enemy.type === "brute"
            ? "被厚甲单位贴身碾碎"
            : enemy.type === "sniper"
              ? "被远程目标贴近补伤收掉"
              : "被近身敌群围死";
      regenDelay = 4;
      screenFlash = 1;
      enemyNext.touchCooldown = enemy.type === "boss" ? 1.1 : 0.65;
      if (enemy.type === "boss") {
        enemyNext.chargeTimer = 0;
      }
    }

    if (enemy.type === "sniper" && enemyNext.fireCooldown <= 0 && distance(enemy.position, player.position) > 220) {
      const shotDirection = normalize(subtract(player.position, enemy.position));
      projectiles.push({
        id: `ep-${nextId}`,
        source: "enemy",
        position: add(enemy.position, scale(shotDirection, enemy.radius + 8)),
        velocity: scale(shotDirection, 260),
        radius: 5,
        life: 2.8 * PROJECTILE_LIFE_GLOBAL_SCALE,
        damage: 14,
        color: 0xff72c8,
        pierceLeft: 0,
        obstaclePierceLeft: 0,
        explosiveRadius: 0,
        ricochetLeft: 0,
        obstacleRicochets: 0,
        catacombBonusSpent: false,
        homingStrength: 0,
        damageChannel: "ranged"
      });
      nextId += 1;
      enemyNext.fireCooldown = definition.rangedCooldown ?? 2.4;
    }

    return enemyNext.hp > 0 ? [enemyNext] : [];
  });

  return {
    ...state,
    nextId,
    run: {
      ...state.run,
      player: {
        ...player,
        hp,
        shield,
        shieldRegenDelay: regenDelay,
        skillCooldown,
        skillEffectTimer
      },
      enemies,
      hazards,
      projectiles,
      lastDamageSource,
      screenFlash
    }
  };
}

function getHazardTier(state: SimulationState): number {
  return Math.max(Math.floor(state.run.time / 150), Math.floor((state.run.objective.stage - 1) / 3));
}

function pointInHazard(point: Vec2, entityRadius: number, hazard: HazardState): boolean {
  const shape = hazard.shape ?? "circle";
  if (shape === "circle") {
    return distance(point, hazard.position) <= hazard.radius + entityRadius;
  }
  const ht = hazard.beamHalfThickness ?? hazard.radius * 0.12;
  const hl = hazard.beamHalfLength ?? hazard.radius;
  const { x: cx, y: cy } = hazard.position;
  if (shape === "beam-v") {
    return Math.abs(point.x - cx) <= ht + entityRadius && Math.abs(point.y - cy) <= hl + entityRadius;
  }
  return Math.abs(point.y - cy) <= ht + entityRadius && Math.abs(point.x - cx) <= hl + entityRadius;
}

function isEnemyInsideHazard(enemy: EnemyState, hazards: HazardState[]): boolean {
  return hazards.some((hazard) => hazard.active && pointInHazard(enemy.position, enemy.radius, hazard));
}

function updateBossSkills(
  state: SimulationState,
  enemy: EnemyState,
  projectiles: ProjectileState[],
  hazards: HazardState[],
  nextId: number
): { nextId: number; screenFlash: number } {
  let localNextId = nextId;
  let screenFlash = state.run.screenFlash;
  const toPlayer = normalize(subtract(state.run.player.position, enemy.position));
  const distanceToPlayer = distance(enemy.position, state.run.player.position);

  if (enemy.bossPattern === "artillery" || enemy.bossPattern === "charger") {
    if (enemy.skillCooldown <= 0 && distanceToPlayer > 110) {
      const volleyCount = enemy.bossPattern === "artillery" ? 3 : 2;
      for (let index = 0; index < volleyCount; index += 1) {
        const offsetAngle = (index - (volleyCount - 1) / 2) * 0.16;
        const direction = fromAngle(Math.atan2(toPlayer.y, toPlayer.x) + offsetAngle);
        projectiles.push({
          id: `ep-${localNextId}`,
          source: "enemy",
          position: add(enemy.position, scale(direction, enemy.radius + 12)),
          velocity: scale(direction, enemy.bossPattern === "artillery" ? 300 : 340),
          radius: enemy.bossPattern === "artillery" ? 7 : 6,
          life: 3.2 * PROJECTILE_LIFE_GLOBAL_SCALE,
          damage: enemy.bossPattern === "artillery" ? 20 : 16,
          color: 0xff5c6f,
          pierceLeft: 0,
          obstaclePierceLeft: 0,
          explosiveRadius: 0,
          ricochetLeft: 0,
          obstacleRicochets: 0,
          catacombBonusSpent: false,
          homingStrength: 0,
          damageChannel: "ranged"
        });
        localNextId += 1;
      }
      enemy.skillCooldown = enemy.bossPattern === "artillery" ? 3.4 : 4.4;
      screenFlash = Math.max(screenFlash, 0.24);
    }

    if (enemy.secondaryCooldown <= 0) {
      if (enemy.bossPattern === "artillery") {
        for (let index = 0; index < 3; index += 1) {
          const angle = (Math.PI * 2 * index) / 3 + (localNextId % 5) * 0.19;
          const radius = 110 + index * 46;
          hazards.push({
            id: `h-boss-${localNextId}`,
            position: add(state.run.player.position, scale(fromAngle(angle), radius)),
            radius: 42 + index * 8,
            damagePerSecond: 44,
            active: false,
            telegraphTime: 1.45,
            duration: 2.2,
            source: "boss"
          });
          localNextId += 1;
        }
        enemy.secondaryCooldown = 7.6;
      } else {
        enemy.chargeDirection = toPlayer;
        enemy.chargeTimer = 1.05;
        enemy.secondaryCooldown = 6.4;
      }
      screenFlash = Math.max(screenFlash, 0.46);
    }
  }

  if (enemy.bossPattern === "laser-prime") {
    if (enemy.skillCooldown <= 0 && distanceToPlayer > 95) {
      const volleyCount = 5;
      for (let index = 0; index < volleyCount; index += 1) {
        const offsetAngle = (index - (volleyCount - 1) / 2) * 0.11;
        const direction = fromAngle(Math.atan2(toPlayer.y, toPlayer.x) + offsetAngle);
        projectiles.push({
          id: `ep-${localNextId}`,
          source: "enemy",
          position: add(enemy.position, scale(direction, enemy.radius + 12)),
          velocity: scale(direction, 255),
          radius: 6,
          life: 3.2 * PROJECTILE_LIFE_GLOBAL_SCALE,
          damage: 17,
          color: 0x5cf8ff,
          pierceLeft: 0,
          obstaclePierceLeft: 0,
          explosiveRadius: 0,
          ricochetLeft: 0,
          obstacleRicochets: 0,
          catacombBonusSpent: false,
          homingStrength: 0,
          damageChannel: "ranged"
        });
        localNextId += 1;
      }
      enemy.skillCooldown = 2.65;
      screenFlash = Math.max(screenFlash, 0.22);
    }

    if (enemy.secondaryCooldown <= 0) {
      const playerPos = state.run.player.position;
      const phase = (enemy.bossLaserPhase ?? 0) % 2;
      const telegraph = 1.55;
      const duration = 2.05;
      const dps = 50;
      if (phase === 0) {
        const cx = clamp(playerPos.x, 96, 1184);
        hazards.push({
          id: `h-boss-${localNextId}`,
          position: { x: cx, y: 360 },
          radius: 400,
          shape: "beam-v",
          beamHalfThickness: 46,
          beamHalfLength: 400,
          damagePerSecond: dps,
          active: false,
          telegraphTime: telegraph,
          duration,
          source: "boss"
        });
      } else {
        const cy = clamp(playerPos.y, 72, 648);
        hazards.push({
          id: `h-boss-${localNextId}`,
          position: { x: 640, y: cy },
          radius: 700,
          shape: "beam-h",
          beamHalfThickness: 42,
          beamHalfLength: 700,
          damagePerSecond: dps,
          active: false,
          telegraphTime: telegraph,
          duration,
          source: "boss"
        });
      }
      enemy.bossLaserPhase = (enemy.bossLaserPhase ?? 0) + 1;
      enemy.secondaryCooldown = 5.4;
      screenFlash = Math.max(screenFlash, 0.5);
    }
  }

  return { nextId: localNextId, screenFlash };
}

function maybeOfferPendingBossReward(state: SimulationState): SimulationState {
  const offerSource = state.run.pendingBossReward ?? state.run.bossRewardChest.rewardType;
  if (state.run.status !== "running" || !offerSource) {
    return state;
  }

  let offeredUpgrades = rollUpgrades(state, offerSource);
  if (offeredUpgrades.length === 0) {
    offeredUpgrades = rollUpgrades(state, "level-up");
  }
  if (offeredUpgrades.length === 0) {
    return {
      ...state,
      run: {
        ...state.run,
        pendingBossReward: null
      }
    };
  }

  const legendaryReady = offerSource === "boss-legendary";
  return {
    ...state,
    nextId: state.nextId + 1,
    run: {
      ...state.run,
      status: "level-up",
      offeredUpgrades,
      upgradeOfferSource: offerSource,
      pendingBossReward: null,
      bossRewardChest: {
        ...state.run.bossRewardChest,
        active: false,
        rewardType: null
      },
      tutorialHint: legendaryReady
        ? "三次复制体讨伐已完成，传说奖励已开启。挑一张真正改变上限的核心。"
        : "复制体核心已崩解，史诗奖励箱已打开。趁热把构筑抬到下一个档位。",
      announcement: createAnnouncement(
        state.nextId,
        legendaryReady ? "传说回响" : "副本宝箱",
        legendaryReady ? "三选一均为传说品质。任选一张终局级核心。" : "复制体已被击溃，立即从高阶奖励中挑选一张史诗强化。",
        legendaryReady ? "boss" : "upgrade",
        4
      ),
      screenFlash: Math.max(state.run.screenFlash, legendaryReady ? 0.16 : 0.85)
    }
  };
}

function maybeOpenBossRewardChest(state: SimulationState): SimulationState {
  if (state.run.status !== "running" || !state.run.bossRewardChest.active || !state.run.bossRewardChest.rewardType) {
    return state;
  }

  const withinChest = distance(state.run.player.position, state.run.bossRewardChest.position) <= state.run.bossRewardChest.radius;
  if (!withinChest) {
    return state;
  }

  return maybeOfferPendingBossReward({
    ...state,
    run: {
      ...state.run,
      bossRewardChest: {
        ...state.run.bossRewardChest,
        active: false
      }
    }
  });
}

function isEnemyRangedProjectile(projectile: ProjectileState): boolean {
  if (projectile.source !== "enemy") {
    return false;
  }
  return (projectile.damageChannel ?? "ranged") === "ranged";
}

function collectBarrierSegments(state: SimulationState): Array<{ a: Vec2; b: Vec2 }> {
  const upgrades = state.run.appliedUpgrades;
  const pos = state.run.player.position;
  const p = state.run.player;
  const segments: Array<{ a: Vec2; b: Vec2 }> = [];

  const orbitCount = getBarrierOrbitSegmentCount(upgrades);
  if (orbitCount > 0) {
    const orbitR = 46;
    const halfW = 28;
    const phase = p.barrierOrbitPhase ?? 0;
    const n = Math.max(1, Math.min(3, orbitCount));
    for (let i = 0; i < n; i += 1) {
      const ang = phase + (i * Math.PI * 2) / n;
      const rad = fromAngle(ang);
      const tan: Vec2 = { x: -rad.y, y: rad.x };
      const mid = add(pos, scale(rad, orbitR));
      segments.push({
        a: add(mid, scale(tan, -halfW)),
        b: add(mid, scale(tan, halfW))
      });
    }
  }

  if (upgrades.includes("vector-plate")) {
    const dir = normalize(p.lastAimDirection);
    const mid = add(pos, scale(dir, 40));
    const perp: Vec2 = { x: -dir.y, y: dir.x };
    const halfW = 32;
    segments.push({
      a: add(mid, scale(perp, -halfW)),
      b: add(mid, scale(perp, halfW))
    });
  }

  return segments;
}

function projectileBlockedByBarriers(position: Vec2, radius: number, state: SimulationState): boolean {
  const margin = 5;
  for (const seg of collectBarrierSegments(state)) {
    if (distancePointToSegment(position, seg.a, seg.b) <= radius + margin) {
      return true;
    }
  }
  return false;
}

function advanceProjectileMotion(
  projectile: ProjectileState,
  enemies: EnemyState[],
  deltaSeconds: number
): ProjectileState | null {
  const homedVelocity =
    projectile.source === "player" && projectile.homingStrength > 0
      ? steerProjectile(projectile, enemies, projectile.homingStrength)
      : projectile.velocity;
  const nextProjectile: ProjectileState = {
    ...projectile,
    velocity: homedVelocity,
    life: projectile.life - deltaSeconds,
    position: add(projectile.position, scale(homedVelocity, deltaSeconds))
  };
  if (nextProjectile.life <= 0) {
    return null;
  }
  return nextProjectile;
}

function updateProjectiles(state: SimulationState, deltaSeconds: number): SimulationState {
  let enemies = [...state.run.enemies];
  let hp = state.run.player.hp;
  let shield = state.run.player.shield;
  let regenDelay = state.run.player.shieldRegenDelay;
  let skillCooldown = state.run.player.skillCooldown;
  let skillEffectTimer = state.run.player.skillEffectTimer;
  let banked = state.run.bankedShards;
  let unbanked = state.run.unbankedShards;
  let score = state.run.score;
  let enemiesDestroyed = state.run.enemiesDestroyed;
  let xp = state.run.player.xp;
  let lastDamageSource = state.run.lastDamageSource;
  let screenFlash = state.run.screenFlash;
  const shards = [...state.run.shards];
  const hitEffects = [...state.run.hitEffects];
  const spawnedProjectiles: ProjectileState[] = [];
  let nextId = state.nextId;
  const remainingProjectiles: ProjectileState[] = [];

  const initialEnemies = state.run.enemies;
  const enemyProjectileAdvance = new Map<string, ProjectileState>();
  for (const projectile of state.run.projectiles) {
    if (projectile.source === "enemy") {
      const advanced = advanceProjectileMotion(projectile, initialEnemies, deltaSeconds);
      if (advanced) {
        enemyProjectileAdvance.set(projectile.id, advanced);
      }
    }
  }

  const cancelledProjectileIds = new Set<string>();
  let salvoDuelFlash = 0;
  if (state.run.appliedUpgrades.includes("salvo-duel")) {
    for (const projectile of state.run.projectiles) {
      if (projectile.source !== "player") {
        continue;
      }
      const nextPlayer = advanceProjectileMotion(projectile, initialEnemies, deltaSeconds);
      if (!nextPlayer) {
        continue;
      }
      for (const [enemyProjectileId, nextEnemy] of enemyProjectileAdvance) {
        if (cancelledProjectileIds.has(enemyProjectileId)) {
          continue;
        }
        if (
          distance(nextPlayer.position, nextEnemy.position) <=
          nextPlayer.radius + nextEnemy.radius + 4
        ) {
          cancelledProjectileIds.add(projectile.id);
          cancelledProjectileIds.add(enemyProjectileId);
          const mid = scale(add(nextPlayer.position, nextEnemy.position), 0.5);
          pushHitEffect(hitEffects, nextId, {
            position: mid,
            color: 0xffe8a8,
            weaponId: getWeaponIdByColor(nextPlayer.color),
            kind: "spark",
            ttl: 0.12
          });
          nextId += 1;
          salvoDuelFlash = Math.max(salvoDuelFlash, 0.14);
          break;
        }
      }
    }
  }

  screenFlash = Math.max(screenFlash, salvoDuelFlash);

  for (const projectile of state.run.projectiles) {
    if (cancelledProjectileIds.has(projectile.id)) {
      continue;
    }

    let nextProjectile: ProjectileState;
    if (projectile.source === "enemy") {
      const advanced = enemyProjectileAdvance.get(projectile.id);
      if (!advanced) {
        continue;
      }
      nextProjectile = advanced;
    } else {
      const advanced = advanceProjectileMotion(projectile, enemies, deltaSeconds);
      if (!advanced) {
        continue;
      }
      nextProjectile = advanced;
    }

    if (projectile.source === "player") {
      let collided = false;
      let healed = 0;

      enemies = enemies.flatMap((enemy) => {
        if (collided && nextProjectile.pierceLeft < 0) {
          return [enemy];
        }

        if (distance(nextProjectile.position, enemy.position) <= nextProjectile.radius + enemy.radius) {
          collided = true;
          const hazardAmplifier =
            state.run.appliedUpgrades.includes("fracture-grid") && isEnemyInsideHazard(enemy, state.run.hazards) ? 1.14 : 1;
          let hitDamage = nextProjectile.damage * hazardAmplifier;
          if (
            state.run.appliedUpgrades.includes("catacomb-rounds") &&
            (nextProjectile.obstacleRicochets ?? 0) > 0 &&
            !nextProjectile.catacombBonusSpent
          ) {
            hitDamage *= 1.22;
            nextProjectile.catacombBonusSpent = true;
          }
          const nextEnemy = { ...enemy, hp: enemy.hp - hitDamage };
          const weaponId = getWeaponIdByColor(nextProjectile.color);
          healed += hitDamage * state.run.player.lifeSteal;
          pushHitEffect(hitEffects, nextId, {
            position: { ...nextProjectile.position },
            color: nextProjectile.color,
            weaponId,
            kind:
              nextProjectile.pierceLeft > 0
                ? "pierce-trail"
                : weaponId === "nova-driver"
                  ? "burst"
                  : weaponId === "shard-lance"
                    ? "pierce-trail"
                    : "spark",
            ttl: nextProjectile.pierceLeft > 0 ? 0.2 : weaponId === "nova-driver" ? 0.24 : weaponId === "shard-lance" ? 0.18 : 0.14
          });
          nextId += 1;

          if (nextProjectile.explosiveRadius > 0) {
            enemies = applyExplosionDamage(enemies, nextProjectile.position, nextProjectile.explosiveRadius, hitDamage * 0.4, enemy.id);
            screenFlash = Math.max(screenFlash, 0.36);
            pushHitEffect(hitEffects, nextId, {
              position: { ...nextProjectile.position },
              color: nextProjectile.color,
              weaponId,
              kind: "burst",
              ttl: 0.28
            });
            nextId += 1;
          }

          if (nextEnemy.hp <= 0) {
            const definition = enemyDefinitions[enemy.type];
            const shardBurst = enemy.modifier === "volatile" ? 1.35 : 1;
            shards.push(createShard(nextId, enemy.position, definition.shardDrop * shardBurst, definition.xp));
            if (state.run.player.killBurst) {
              const burst = createKillBurstProjectiles(nextId + spawnedProjectiles.length, enemy.position, nextProjectile.color, hitDamage * 0.38);
              spawnedProjectiles.push(...burst);
              nextId += burst.length;
            }
            score += 25 + definition.xp;
            enemiesDestroyed += 1;
            screenFlash = Math.max(screenFlash, 0.28);
            nextProjectile.pierceLeft -= 1;
            return [];
          }

          nextProjectile.pierceLeft -= 1;
          return [nextEnemy];
        }

        return [enemy];
      });

      if (healed > 0) {
        hp = Math.min(state.run.player.maxHp, hp + healed);
        if (healed >= 0.55 && state.run.player.lifeSteal > 0) {
          pushHitEffect(hitEffects, nextId, {
            position: { ...state.run.player.position },
            color: 0x7dffb3,
            weaponId: getWeaponIdByColor(nextProjectile.color),
            kind: "heal-glint",
            ttl: 0.32
          });
          nextId += 1;
        }
      }

      const obstacleImpact = resolveProjectileObstacleImpact(nextProjectile, state.run.obstacles);
      if (obstacleImpact.didImpact && (obstacleImpact.response === "reflect" || nextProjectile.ricochetLeft > 0)) {
        const weaponId = getWeaponIdByColor(nextProjectile.color);
        nextProjectile.position = obstacleImpact.position;
        nextProjectile.velocity = obstacleImpact.velocity;
        if (obstacleImpact.response !== "reflect" && nextProjectile.ricochetLeft > 0) {
          nextProjectile.ricochetLeft -= 1;
          nextProjectile.obstacleRicochets = (nextProjectile.obstacleRicochets ?? 0) + 1;
        }
        screenFlash = Math.max(screenFlash, obstacleImpact.response === "reflect" ? 0.22 : 0.22);
        pushHitEffect(hitEffects, nextId, {
          position: { ...obstacleImpact.position },
          color: nextProjectile.color,
          weaponId,
          kind: "ricochet-flash",
          ttl: 0.2
        });
        nextId += 1;
      } else if (obstacleImpact.didImpact && nextProjectile.obstaclePierceLeft > 0) {
        const weaponId = getWeaponIdByColor(nextProjectile.color);
        nextProjectile.obstaclePierceLeft -= 1;
        screenFlash = Math.max(screenFlash, 0.12);
        pushHitEffect(hitEffects, nextId, {
          position: { ...obstacleImpact.position },
          color: nextProjectile.color,
          weaponId,
          kind: "pierce-trail",
          ttl: 0.16
        });
        nextId += 1;
      } else if (obstacleImpact.didImpact) {
        const weaponId = getWeaponIdByColor(nextProjectile.color);
        collided = true;
        pushHitEffect(hitEffects, nextId, {
          position: { ...obstacleImpact.position },
          color: nextProjectile.color,
          weaponId,
          kind: weaponId === "nova-driver" ? "burst" : "spark",
          ttl: weaponId === "nova-driver" ? 0.22 : 0.14
        });
        nextId += 1;
      }

      if (!collided || nextProjectile.pierceLeft >= 0) {
        remainingProjectiles.push(nextProjectile);
      }
    } else {
      const obstacleImpact = resolveProjectileObstacleImpact(nextProjectile, state.run.obstacles);
      if (obstacleImpact.didImpact) {
        if (obstacleImpact.response === "reflect") {
          nextProjectile.position = obstacleImpact.position;
          nextProjectile.velocity = obstacleImpact.velocity;
          remainingProjectiles.push(nextProjectile);
          screenFlash = Math.max(screenFlash, 0.14);
        }
      } else if (
        isEnemyRangedProjectile(nextProjectile) &&
        projectileBlockedByBarriers(nextProjectile.position, nextProjectile.radius, state)
      ) {
        if (state.run.appliedUpgrades.includes("ricochet-aegis")) {
          const reflected = createReflectedBarrierProjectile(nextId, nextProjectile.position, nextProjectile, enemies);
          if (reflected) {
            spawnedProjectiles.push(reflected);
            nextId += 1;
          }
          pushHitEffect(hitEffects, nextId, {
            position: { ...nextProjectile.position },
            color: 0xff6a7a,
            weaponId: "pulse-blaster",
            kind: "ricochet-flash",
            ttl: 0.22
          });
          nextId += 1;
        } else {
          pushHitEffect(hitEffects, nextId, {
            position: { ...nextProjectile.position },
            color: 0x8cf3ff,
            weaponId: "pulse-blaster",
            kind: "barrier-block",
            ttl: 0.16
          });
          nextId += 1;
        }
        screenFlash = Math.max(screenFlash, 0.18);
      } else if (distance(nextProjectile.position, state.run.player.position) <= nextProjectile.radius + state.run.player.radius) {
        if (isApexSanctuaryInvulnerable(state)) {
          screenFlash = Math.max(screenFlash, 0.22);
        } else {
          const damageResult = applyIncomingDamage(shield, hp, nextProjectile.damage * (1 - clamp(state.run.player.damageReduction, 0, 0.6)));
          if (state.run.player.characterSkillId === "overdrive-core" && damageResult.hp < hp && skillCooldown <= 0) {
            skillCooldown = 14;
            skillEffectTimer = 4.5;
            screenFlash = Math.max(screenFlash, 0.72);
          }
          shield = damageResult.shield;
          hp = damageResult.hp;
          lastDamageSource = "被远程火力压垮";
          regenDelay = 4;
          screenFlash = 1;
        }
      } else {
        remainingProjectiles.push(nextProjectile);
      }
    }
  }

  for (const hazard of state.run.hazards) {
    if (!hazard.active) {
      continue;
    }

    enemies = enemies.map((enemy) => {
      if (!pointInHazard(enemy.position, enemy.radius, hazard)) {
        return enemy;
      }
      return {
        ...enemy,
        hp: enemy.hp - hazard.damagePerSecond * deltaSeconds * (state.run.appliedUpgrades.includes("fracture-grid") ? 1.35 : 1)
      };
    });
  }

  enemies = enemies.flatMap((enemy) => {
    if (enemy.hp > 0) {
      return [enemy];
    }
    const definition = enemyDefinitions[enemy.type];
    const wasBoss = enemy.type === "boss";
    shards.push(createShard(nextId, enemy.position, definition.shardDrop, definition.xp));
    nextId += 1;
    banked += Math.round(definition.shardDrop * 0.15);
    unbanked += definition.shardDrop;
    score += 25 + definition.xp;
    enemiesDestroyed += 1;
    if (wasBoss) {
      score += 180;
    }
    return [];
  });

  const defeatedBossCount = state.run.enemies.filter((enemy) => enemy.type === "boss").length - enemies.filter((enemy) => enemy.type === "boss").length;
  const bossDefeats = state.run.bossDefeats + Math.max(0, defeatedBossCount);
  const previousLegendaryCharge = state.run.bossLegendaryCharge;
  const bossLegendaryCharge = defeatedBossCount > 0 ? (previousLegendaryCharge + defeatedBossCount) % 3 : previousLegendaryCharge;
  const shouldOfferLegendary = defeatedBossCount > 0 && previousLegendaryCharge + defeatedBossCount >= 3;
  const pendingBossReward =
    defeatedBossCount > 0 ? (shouldOfferLegendary ? "boss-legendary" : "boss-epic") : state.run.pendingBossReward;
  const defeatedBoss = state.run.enemies.find((enemy) => enemy.type === "boss" && !enemies.some((nextEnemy) => nextEnemy.id === enemy.id));
  const bossAnnouncement =
    defeatedBossCount > 0
      ? createAnnouncement(
          nextId,
          shouldOfferLegendary ? "传说宝箱掉落" : "复制体已击溃",
          shouldOfferLegendary ? "第三次复制体讨伐完成，传说宝箱已从残骸中析出。" : "复制体坠毁，奖励宝箱已掉落到战场。",
          "boss",
          4.2
        )
      : state.run.announcement;
  const bossHint =
    defeatedBossCount > 0
      ? shouldOfferLegendary
        ? "你已经连续击破三次复制体。靠近掉落的传说宝箱并交互开启。"
        : `复制体已被击破。靠近掉落的史诗宝箱并交互开启；再击破 ${Math.max(0, 3 - bossLegendaryCharge)} 次复制体可获得一次传说奖励。`
      : state.run.tutorialHint;

  return {
    ...state,
    nextId,
    run: {
      ...state.run,
      player: {
        ...state.run.player,
        hp,
        shield,
        xp,
        shieldRegenDelay: regenDelay,
        skillCooldown,
        skillEffectTimer
      },
      enemies,
      hitEffects,
      projectiles: [...remainingProjectiles, ...spawnedProjectiles],
      shards,
      lastDamageSource,
      bankedShards: banked,
      unbankedShards: unbanked,
      score,
      enemiesDestroyed,
      bossDefeats,
      bossLegendaryCharge,
      pendingBossReward,
      bossRewardChest:
        defeatedBossCount > 0 && defeatedBoss
          ? {
              active: true,
              position: { ...defeatedBoss.position },
              radius: 54,
              rewardType: pendingBossReward
            }
          : state.run.bossRewardChest,
      announcement: bossAnnouncement,
      tutorialHint: bossHint,
      screenFlash
    }
  };
}

function updateShards(state: SimulationState, deltaSeconds: number): SimulationState {
  // 经验只来自拾取能量碎片（击杀不再直接加经验，见 updateProjectiles 中敌人阵亡处理）。
  let xp = state.run.player.xp;
  let unbanked = state.run.unbankedShards;
  let banked = state.run.bankedShards;
  let screenFlash = state.run.screenFlash;
  const salvageNet = state.run.appliedUpgrades.includes("salvage-net");

  const shards = state.run.shards.flatMap((shard) => {
    const toPlayer = subtract(state.run.player.position, shard.position);
    const distanceToPlayer = distance(shard.position, state.run.player.position);
    const acceleration = distanceToPlayer < state.run.player.shardMagnet ? 460 : 0;
    const velocity = acceleration > 0 ? scale(normalize(toPlayer), acceleration) : shard.velocity;
    const nextShard: ShardState = {
      ...shard,
      velocity,
      position: add(shard.position, scale(velocity, deltaSeconds))
    };

    if (distance(nextShard.position, state.run.player.position) <= shard.radius + state.run.player.radius + 4) {
      xp += shard.xpValue * state.run.player.xpMultiplier;
      unbanked += shard.value;
      banked += Math.round(shard.value * 0.12 * state.run.player.economyMultiplier);
      if (salvageNet) {
        screenFlash = Math.max(screenFlash, 0.14);
      }
      return [];
    }
    return [nextShard];
  });

  return {
    ...state,
    run: {
      ...state.run,
      player: {
        ...state.run.player,
        xp
      },
      shards,
      unbankedShards: unbanked,
      bankedShards: banked,
      screenFlash
    }
  };
}

function updateHazards(state: SimulationState, deltaSeconds: number): SimulationState {
  let shield = state.run.player.shield;
  let hp = state.run.player.hp;
  let regenDelay = state.run.player.shieldRegenDelay;
  let skillCooldown = state.run.player.skillCooldown;
  let skillEffectTimer = state.run.player.skillEffectTimer;
  let lastDamageSource = state.run.lastDamageSource;
  let screenFlash = state.run.screenFlash;
  const hazards = state.run.hazards.flatMap((hazard) => {
    const nextHazard: HazardState = {
      ...hazard,
      telegraphTime: Math.max(0, hazard.telegraphTime - deltaSeconds),
      duration: hazard.source === "storm" ? hazard.duration : hazard.duration - deltaSeconds
    };
    nextHazard.active = nextHazard.telegraphTime <= 0;

    if (nextHazard.source === "boss" && nextHazard.duration <= 0) {
      return [];
    }

    if (nextHazard.active && pointInHazard(state.run.player.position, state.run.player.radius, nextHazard)) {
      const damageScale = nextHazard.source === "boss" ? 1.2 : 1;
      if (!isApexSanctuaryInvulnerable(state)) {
        const damageResult = applyIncomingDamage(shield, hp, nextHazard.damagePerSecond * deltaSeconds * damageScale);
        if (state.run.player.characterSkillId === "overdrive-core" && damageResult.hp < hp && skillCooldown <= 0) {
          skillCooldown = 14;
          skillEffectTimer = 4.5;
          screenFlash = Math.max(screenFlash, 0.72);
        }
        shield = damageResult.shield;
        hp = damageResult.hp;
        const bossHazardCause =
          nextHazard.shape === "beam-v" || nextHazard.shape === "beam-h"
            ? "被终幕复写的激光栅格吞没"
            : "被复制体炮击区域吞没";
        lastDamageSource = nextHazard.source === "boss" ? bossHazardCause : "在风暴区里持续失血";
        regenDelay = 4;
        screenFlash = Math.max(screenFlash, nextHazard.source === "boss" ? 0.72 : 0.28);
      }
    }

    return [nextHazard];
  });

  if (regenDelay <= 0 && shield < state.run.player.maxShield) {
    shield = Math.min(state.run.player.maxShield, shield + 16 * deltaSeconds);
  }

  return {
    ...state,
    run: {
      ...state.run,
      hazards,
      player: {
        ...state.run.player,
        hp,
        shield,
        shieldRegenDelay: regenDelay,
        skillCooldown,
        skillEffectTimer
      },
      lastDamageSource,
      screenFlash
    }
  };
}

function maybeUnlockExtraction(state: SimulationState): SimulationState {
  if (state.run.extraction.unlocked || state.run.time < 480) {
    return state;
  }

  return {
    ...state,
    run: {
      ...state.run,
      extraction: {
        ...state.run.extraction,
        unlocked: true
      },
      tutorialHint: "\u64a4\u79bb\u7a97\u53e3\u5df2\u5f00\u542f\uff0c\u6309\u4f4f E \u53ef\u4ee5\u79bb\u573a\uff0c\u4e5f\u53ef\u4ee5\u7ee7\u7eed\u8d2a\u6536\u76ca\u3002",
      screenFlash: 1
    }
  };
}

function updateExtraction(state: SimulationState, deltaSeconds: number, input: InputSnapshot): SimulationState {
  const extraction = { ...state.run.extraction };
  if (!extraction.unlocked) {
    return state;
  }

  extraction.rewardMultiplier = 1 + clamp((state.run.time - 480) / 120, 0, 0.62) + state.run.riskProtocolTier * 0.28;
  const insideZone = distance(state.run.player.position, extraction.zoneCenter) <= extraction.radius;
  extraction.active = insideZone && input.interact;
  extraction.holdTimer = extraction.active ? extraction.holdTimer + deltaSeconds : Math.max(0, extraction.holdTimer - deltaSeconds * 1.5);

  if (extraction.holdTimer >= extraction.holdDuration) {
    return endRun(state, "extracted");
  }

  return {
    ...state,
    run: {
      ...state.run,
      extraction
    }
  };
}

function maybeTriggerBossEvent(state: SimulationState): SimulationState {
  const bossActive = state.run.enemies.some((enemy) => enemy.type === "boss");
  if (state.run.objective.stage >= 9) {
    return state;
  }
  const nextSpawnTime = 30 + state.run.bossSpawnCount * 60;
  if (bossActive || state.run.time < nextSpawnTime) {
    return state;
  }

  const patternRoll = randomFloat(state.rngSeed);
  let next: SimulationState = {
    ...state,
    nextId: state.nextId + 1,
    rngSeed: patternRoll.seed,
    run: {
      ...state.run,
      bossEventTriggered: true,
      bossSpawnCount: state.run.bossSpawnCount + 1,
      bossAlertTimer: 5,
      announcement: createAnnouncement(
        state.nextId,
        "同事复制体入场",
        patternRoll.value > 0.5
          ? "技能模型拷出来的炮击型「同事」已锁定本区，立刻脱离收缩红圈。"
          : "技能模型拷出来的冲锋型「同事」已锁定航线，优先横向脱离蓄力线。",
        "boss"
      ),
      tutorialHint:
        patternRoll.value > 0.5
          ? "复制体同事（炮击型）进入战场：离开红圈预警区，别和技能侧生成的假货换命。"
          : "复制体同事（冲锋型）进入战场：侧向位移躲开直线冲撞。",
    }
  };
  next = spawnBoss(next, patternRoll.value > 0.5 ? "artillery" : "charger");
  return next;
}

function isBossRewardOutstanding(run: SimulationState["run"]): boolean {
  if (run.pendingBossReward != null) {
    return true;
  }
  return run.bossRewardChest.active && run.bossRewardChest.rewardType != null;
}

function maybeOfferLevelUp(state: SimulationState): SimulationState {
  if (state.run.status !== "running") {
    return state;
  }

  const player = { ...state.run.player };
  if (player.xp < player.xpToNext) {
    return state;
  }

  // 副本奖励未结算时不要弹出普通升级，否则同一波会连领两次（先构筑/后宝箱）。
  if (isBossRewardOutstanding(state.run)) {
    return state;
  }

  player.xp -= player.xpToNext;
  player.xpLevel += 1;
  player.xpToNext = Math.floor(player.xpToNext * 1.52 + 26);
  if (state.run.appliedUpgrades.includes("auto-forge")) {
    player.shield = Math.min(player.maxShield, player.shield + 18);
  }

  return {
    ...state,
    run: {
      ...state.run,
      status: "level-up",
      player,
      offeredUpgrades: rollUpgrades(state, "level-up"),
      upgradeOfferSource: "level-up"
    }
  };
}

function updateObjective(state: SimulationState, deltaSeconds: number): SimulationState {
  if (state.run.status !== "running") {
    return state;
  }

  const objective = state.run.objective;
  const nextFlash = Math.max(0, objective.completionFlash - deltaSeconds);
  const nextProgress = getObjectiveProgress(state, objective);

  if (objective.completed) {
    if (nextFlash > 0) {
      return {
        ...state,
        run: {
          ...state.run,
          objective: {
            ...objective,
            completionFlash: nextFlash
          }
        }
      };
    }

    if (
      state.run.runMode === "story" &&
      !state.run.storyArcComplete &&
      objective.stage === STORY_FINAL_STAGE
    ) {
      return {
        ...state,
        nextId: state.nextId + 1,
        run: {
          ...state.run,
          status: "story-clear-pending",
          tutorialHint:
            "主线目标已达成：这一轮人类席位暂时保住。选择「继续作战」保留进度进入自由清剿；「结算撤离」直接完成本局并领取奖励。撤离信标仍可使用。",
          announcement: createAnnouncement(
            state.nextId,
            "黑域节点完成",
            "主线目标已达成。在面板中选择继续作战，或直接结算撤离。",
            "phase",
            5
          ),
          screenFlash: Math.max(state.run.screenFlash, 0.85)
        }
      };
    }

    return advanceStage(state);
  }

  if (nextProgress < objective.target) {
    if (nextProgress === objective.progress) {
      return state;
    }

    return {
      ...state,
      run: {
        ...state.run,
        objective: {
          ...objective,
          progress: nextProgress
        }
      }
    };
  }

  return {
    ...state,
    nextId: state.nextId + 1,
    run: {
      ...state.run,
      player: {
        ...state.run.player,
        shield: Math.min(state.run.player.maxShield, state.run.player.shield + 14)
      },
      bankedShards: state.run.bankedShards + objective.rewardShards,
      objective: {
        ...objective,
        progress: objective.target,
        completed: true,
        completionFlash: state.run.runMode === "story" ? 3.2 : 2.4
      },
      tutorialHint: `${objective.title} 已完成，获得 ${objective.rewardShards} 积分入账。`,
      announcement: createAnnouncement(
        state.nextId,
        "阶段完成",
        `${objective.title} 达成 · +${objective.rewardShards} 积分`,
        "phase"
      ),
      screenFlash: Math.max(state.run.screenFlash, 0.65)
    }
  };
}

function getObjectiveProgress(state: SimulationState, objective: RunObjectiveState): number {
  switch (objective.kind) {
    case "collect-shards":
      return Math.max(0, state.run.bankedShards - objective.baselineBankedShards);
    case "defeat-enemies":
      return Math.max(0, state.run.enemiesDestroyed - objective.baselineEnemiesDestroyed);
    case "survive":
      return Math.max(0, Math.floor(state.run.time - objective.baselineTime));
    default:
      return objective.progress;
  }
}

function createNextObjective(state: SimulationState): RunObjectiveState {
  const nextStage = state.run.objective.stage + 1;
  const cycle = Math.max(0, nextStage - 1);
  const kindIndex = cycle % 3;
  const runMode = state.run.runMode;

  if (kindIndex === 0) {
    const target = getObjectiveTargetForStage(nextStage, "collect-shards", runMode);
    return {
      id: `objective-${nextStage}`,
      stage: nextStage,
      cycle,
      kind: "collect-shards",
      title: "回收信标",
      description: `再回收 ${target} 点能量碎片，稳定本区航道。`,
      target,
      progress: 0,
      rewardShards: 15 + cycle * 3,
      rewardXp: 8 + cycle * 2,
      baselineTime: state.run.time,
      baselineBankedShards: state.run.bankedShards,
      baselineEnemiesDestroyed: state.run.enemiesDestroyed,
      completed: false,
      completionFlash: 0
    };
  }

  if (kindIndex === 1) {
    const target = getObjectiveTargetForStage(nextStage, "defeat-enemies", runMode);
    return {
      id: `objective-${nextStage}`,
      stage: nextStage,
      cycle,
      kind: "defeat-enemies",
      title: "清剿节点",
      description: `击破 ${target} 个敌方目标，压低局部威胁。`,
      target,
      progress: 0,
      rewardShards: 18 + cycle * 3,
      rewardXp: 10 + cycle * 2,
      baselineTime: state.run.time,
      baselineBankedShards: state.run.bankedShards,
      baselineEnemiesDestroyed: state.run.enemiesDestroyed,
      completed: false,
      completionFlash: 0
    };
  }

  const target = getObjectiveTargetForStage(nextStage, "survive", runMode);
  return {
    id: `objective-${nextStage}`,
    stage: nextStage,
    cycle,
    kind: "survive",
    title: "稳态维持",
    description: `守住阵线 ${target} 秒，等待回收链路重连。`,
    target,
    progress: 0,
    rewardShards: 17 + cycle * 4,
    rewardXp: 12 + cycle * 2,
    baselineTime: state.run.time,
    baselineBankedShards: state.run.bankedShards,
    baselineEnemiesDestroyed: state.run.enemiesDestroyed,
    completed: false,
    completionFlash: 0
  };
}

function getThemeForStage(stage: number): RunTheme {
  const chapter = Math.floor(Math.max(0, stage - 1) / 3) % 3;
  if (chapter === 1) {
    return "siege";
  }
  if (chapter === 2) {
    return "crossfire";
  }
  return "skirmish";
}

function getThemeLabel(theme: RunTheme): string {
  switch (theme) {
    case "crossfire":
      return "交火阶段";
    case "siege":
      return "围城阶段";
    default:
      return "游猎阶段";
  }
}

function pushHitEffect(
  hitEffects: HitEffectState[],
  nextId: number,
  effect: Omit<HitEffectState, "id">
): void {
  hitEffects.push({
    id: `fx-hit-${nextId}`,
    ...effect
  });
  if (hitEffects.length > 48) {
    hitEffects.splice(0, hitEffects.length - 48);
  }
}

type WeightedUpgrade = UpgradeDefinition & { weight: number };

function pickWeightedUpgrade(entries: WeightedUpgrade[], seed: number): { id: UpgradeId; seed: number } {
  if (entries.length === 0) {
    throw new Error("pickWeightedUpgrade: empty entries");
  }
  const result = randomFloat(seed);
  const nextSeed = result.seed;
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    return { id: entries[0].id, seed: nextSeed };
  }
  let cursor = result.value * totalWeight;
  let chosenIndex = 0;
  for (let i = 0; i < entries.length; i += 1) {
    cursor -= entries[i].weight;
    if (cursor <= 0) {
      chosenIndex = i;
      break;
    }
  }
  return { id: entries[chosenIndex].id, seed: nextSeed };
}

function removeUpgradeById(available: WeightedUpgrade[], id: UpgradeId): void {
  const index = available.findIndex((entry) => entry.id === id);
  if (index >= 0) {
    available.splice(index, 1);
  }
}

function rollUpgrades(state: SimulationState, source: UpgradeOfferSource): UpgradeId[] {
  let seed = state.rngSeed;

  const buildPool = (relaxEpicParents: boolean): WeightedUpgrade[] =>
    upgradePool
      .filter((upgrade) => {
        if (upgrade.once && state.run.appliedUpgrades.includes(upgrade.id)) {
          return false;
        }
        if (upgrade.id === "compound-interest" && !state.meta.unlockedUpgradeIds.includes("compound-interest")) {
          return false;
        }
        if (upgrade.id === "fracture-grid" && state.run.hazards.length === 0) {
          return false;
        }
        const meta = upgradeTreeMeta[upgrade.id];
        if (meta.parents && !meta.parents.every((parentId) => state.run.appliedUpgrades.includes(parentId))) {
          if (!relaxEpicParents || (upgrade.rarity !== "epic" && upgrade.rarity !== "legendary" && upgrade.rarity !== "mythic")) {
            return false;
          }
        }
        if (source === "boss-epic" && upgrade.rarity === "common") {
          return false;
        }
        if (source === "boss-epic" && upgrade.rarity === "mythic") {
          return false;
        }
        // 传说副本箱：三选一必须全是传说卡（与「必出传说」文案一致）；史诗仅出现在 boss-epic
        if (source === "boss-legendary" && upgrade.rarity !== "legendary") {
          return false;
        }
        if (source === "level-up" && upgrade.rarity === "legendary") {
          return false;
        }
        return true;
      })
      .map((upgrade) => {
        const meta = upgradeTreeMeta[upgrade.id];
        const sameBranchCount = state.run.appliedUpgrades.filter((upgradeId) => upgradeTreeMeta[upgradeId]?.branch === meta.branch).length;
        // 弱线路堆叠：避免「一路走到黑」压死其它分支，便于看到更多不同技能
        const branchStackBias = 1 + Math.min(0.22, sameBranchCount * 0.065);
        // 本局尚未点过该分支时略抬高，鼓励尝鲜
        const freshBranchBias = sameBranchCount === 0 ? 1.14 : 1;
        const branchBias = branchStackBias * freshBranchBias;
        // 阶位与阶段略松绑，减少「永远先看到同一档」的体感
        const stageBias = state.run.objective.stage >= meta.tier * 2 ? 1.06 : 0.94;
        const rarityBias =
          source === "level-up"
            ? upgrade.rarity === "mythic"
              ? 0.012
              : upgrade.rarity === "epic"
                ? 1.28
                : upgrade.rarity === "rare"
                  ? 1.16
                  : 0.94
            : source === "boss-epic"
              ? upgrade.rarity === "epic"
                ? 1.95
                : upgrade.rarity === "legendary"
                  ? 1.72
                  : 1.08
              : upgrade.rarity === "legendary"
                ? 3.8
                : 0.42;
        const bossDefeatBias = source === "level-up" ? 1 + Math.min(0.14, state.run.bossDefeats * 0.035) : 1;
        return {
          ...upgrade,
          weight: upgrade.weight * branchBias * stageBias * rarityBias * bossDefeatBias
        };
      });

  let available = buildPool(false);

  if (source === "boss-epic" || source === "boss-legendary") {
    if (available.length === 0) {
      available = buildPool(true);
    }
  }

  if (source === "boss-epic") {
    const hasEpicPlus = available.some((u) => u.rarity === "epic" || u.rarity === "legendary");
    if (!hasEpicPlus) {
      available = buildPool(true);
    }
  }

  const selections: UpgradeId[] = [];

  if (source === "boss-epic") {
    const epicPlus = available.filter((u) => u.rarity === "epic" || u.rarity === "legendary");
    if (epicPlus.length > 0) {
      const pick = pickWeightedUpgrade(epicPlus, seed);
      seed = pick.seed;
      selections.push(pick.id);
      removeUpgradeById(available, pick.id);
    }
  }

  while (selections.length < 3 && available.length > 0) {
    const pick = pickWeightedUpgrade(available, seed);
    seed = pick.seed;
    selections.push(pick.id);
    removeUpgradeById(available, pick.id);
  }

  return selections;
}

function updateTutorialHint(state: SimulationState): SimulationState {
  if (state.run.objective.completed && state.run.objective.completionFlash > 0) {
    return state;
  }

  const xpCappedForLevel = state.run.player.xp >= state.run.player.xpToNext;

  // 副本奖励未结算但经验已满：强提示先结算，否则无法弹出升级（可能卡阶段）
  if (isBossRewardOutstanding(state.run) && xpCappedForLevel && !state.run.bossRewardChest.active && state.run.pendingBossReward != null) {
    return {
      ...state,
      run: {
        ...state.run,
        tutorialHint:
          "【优先】经验已满，但副本奖励仍未结算。请回到复制体被击败的位置附近寻找发光宝箱；靠近后会自动开启，之后才能升级。"
      }
    };
  }

  if (state.run.bossRewardChest.active) {
    const withinChest =
      distance(state.run.player.position, state.run.bossRewardChest.position) <= state.run.bossRewardChest.radius;
    let tutorialHint: string;
    if (xpCappedForLevel) {
      if (withinChest) {
        tutorialHint = "正在开启副本宝箱… 领取后即可解锁升级并继续推进阶段。";
      } else {
        tutorialHint =
          state.run.bossRewardChest.rewardType === "boss-legendary"
            ? "【优先】经验已满，但必须先领取传说副本宝箱才能升级。请尽快靠近发光宝箱直至自动开启。"
            : "【优先】经验已满，但必须先领取副本宝箱才能升级。请尽快靠近战场上的宝箱直至自动开启。";
      }
    } else if (withinChest) {
      tutorialHint = "已进入副本奖励箱范围，正在开启强化。";
    } else {
      tutorialHint =
        state.run.bossRewardChest.rewardType === "boss-legendary"
          ? "传说宝箱已掉落。靠近后会自动开启，选择一张终局级强化。"
          : "副本奖励箱已掉落。靠近后会自动开启，领取本次高阶强化。";
    }
    return {
      ...state,
      run: {
        ...state.run,
        tutorialHint
      }
    };
  }

  if (!state.run.extraction.unlocked) {
    return {
      ...state,
      run: {
        ...state.run,
        tutorialHint: `${getThemeLabel(state.run.stageTheme)} · 阶段 ${state.run.objective.stage}：${state.run.objective.description}`
      }
    };
  }

  return {
    ...state,
    run: {
      ...state.run,
      tutorialHint: `撤离已开启。当前仍处于${getThemeLabel(state.run.stageTheme)}，你也可以先完成阶段 ${state.run.objective.stage} 目标再走。`
    }
  };
}

function checkDefeat(state: SimulationState): SimulationState {
  if (state.run.player.hp > 0) {
    return state;
  }
  if (state.run.emergencyRepairCharges > 0) {
    return {
      ...state,
      nextId: state.nextId + 1,
      run: {
        ...state.run,
        emergencyRepairCharges: state.run.emergencyRepairCharges - 1,
        player: {
          ...state.run.player,
          hp: Math.max(48, Math.round(state.run.player.maxHp * 0.42)),
          shield: Math.max(24, Math.round(state.run.player.maxShield * 0.36)),
          shieldRegenDelay: 2.4
        },
        lastDamageSource: "应急修复已触发",
        tutorialHint: "应急修复单元已自动介入，立刻脱离当前火线。",
        announcement: createAnnouncement(state.nextId, "应急修复", "机体已被紧急拉回安全线，但本局只会触发这一次。", "upgrade", 3.4),
        screenFlash: 1
      }
    };
  }
  return endRun(state, "dead");
}

function endRun(state: SimulationState, result: RunSummary["result"]): SimulationState {
  const successLike = result === "extracted" || result === "cleared";
  /** 成功撤离/通关时略压低转入机库的积分，避免单局积分膨胀、开局补给显得过便宜 */
  const SUCCESS_META_CREDITS_FACTOR = 0.84;
  const extractionBonus = (successLike ? state.run.extraction.rewardMultiplier : 0.55) * (1 + state.run.riskProtocolTier * 0.26);
  const payout = Math.round(state.run.unbankedShards * extractionBonus * (successLike ? state.run.player.economyMultiplier : 0.45));
  const objectivesCompleted = Math.max(0, state.run.objective.stage - 1 + (state.run.objective.completed ? 1 : 0));
  const keyUpgradeIds = state.run.appliedUpgrades.filter((upgradeId) => upgradeId !== "weapon-tuning");
  const keyUpgradeTitles = keyUpgradeIds
    .slice(-4)
    .map((upgradeId) => upgradeDefinitions[upgradeId]?.title)
    .filter((title): title is string => Boolean(title));
  const buildRecap =
    keyUpgradeTitles.length > 0
      ? `武器 Lv.${state.run.player.weaponLevel}${state.run.riskProtocolTier > 0 ? " · 风险协议已启用" : ""} · 关键升级：${keyUpgradeTitles.join(" / ")}`
      : `武器 Lv.${state.run.player.weaponLevel}${state.run.riskProtocolTier > 0 ? " · 风险协议已启用" : ""} · 本轮主要依靠基础火力推进`;
  const deathReason =
    result === "extracted"
      ? "成功撤离，结算完成"
      : result === "cleared"
        ? "战役目标完成，已结算战利品"
        : state.run.lastDamageSource || "在持续交火中被压垮";
  const summary: RunSummary = {
    result,
    duration: state.run.time,
    level: state.run.player.xpLevel,
    weaponId: state.run.player.weaponId,
    weaponLevel: state.run.player.weaponLevel,
    riskProtocolTier: state.run.riskProtocolTier,
    shardsBanked: successLike
      ? Math.max(0, Math.round((state.run.bankedShards + payout) * SUCCESS_META_CREDITS_FACTOR))
      : payout,
    enemiesDestroyed: state.run.enemiesDestroyed,
    objectivesCompleted,
    highestStage: state.run.objective.stage,
    buildRecap,
    keyUpgrades: keyUpgradeTitles,
    upgradeSequence: [...state.run.appliedUpgrades],
    deathReason,
    extractionBonus
  };
  const armoryMarksGain =
    result === "cleared"
      ? 1
      : result === "extracted" && state.run.runMode === "story" && summary.highestStage >= STORY_FINAL_STAGE
        ? 1
        : 0;
  const leaderboardEntry = {
    id: `lb-${state.nextId}-${Math.floor(state.run.time)}`,
    recordedAt: Date.now(),
    playerName: "鏈湴璁板綍",
    weaponId: state.run.player.weaponId,
    score: summary.shardsBanked,
    result,
    duration: summary.duration,
    level: summary.level,
    enemiesDestroyed: summary.enemiesDestroyed
  };
  const leaderboard = [...state.meta.leaderboard, leaderboardEntry]
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (right.level !== left.level) {
        return right.level - left.level;
      }
      return right.recordedAt - left.recordedAt;
    })
    .slice(0, 10);

  const armoryLine = armoryMarksGain > 0 ? ` 获得通关印记 +${armoryMarksGain}（可在机库兑换武器库改装）。` : "";

  return {
    ...state,
    meta: {
      ...state.meta,
      credits: state.meta.credits + summary.shardsBanked,
      armoryMarks: (state.meta.armoryMarks ?? 0) + armoryMarksGain,
      lastRunSummary: summary,
      leaderboard
    },
    run: {
      ...state.run,
      status: "run-over",
      stageLore: null,
      pendingStageLoreQueue: [],
      runOverDelay: result === "dead" ? 1 : 0,
      runSummary: summary,
      tutorialHint:
        result === "extracted"
          ? `本轮成功撤离。${summary.buildRecap}。完成 ${summary.objectivesCompleted} 个阶段任务，击破 ${summary.enemiesDestroyed} 个敌人，推进到第 ${summary.highestStage} 阶段。${armoryLine}`
          : result === "cleared"
            ? `本轮战役通关结算。${summary.buildRecap}。完成 ${summary.objectivesCompleted} 个阶段任务，击破 ${summary.enemiesDestroyed} 个敌人，推进到第 ${summary.highestStage} 阶段。${armoryLine}`
            : `本轮机体损毁。${summary.buildRecap}。完成 ${summary.objectivesCompleted} 个阶段任务，击破 ${summary.enemiesDestroyed} 个敌人，推进到第 ${summary.highestStage} 阶段。`,
      bankedShards: summary.shardsBanked,
      unbankedShards: 0,
      extraction: {
        ...state.run.extraction,
        active: false,
        holdTimer: 0
      }
    }
  };
}

function steerProjectile(projectile: ProjectileState, enemies: EnemyState[], homingStrength: number): Vec2 {
  const target = findClosestEnemy(projectile.position, enemies, 260);
  if (!target) {
    return projectile.velocity;
  }
  const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y);
  const desired = scale(normalize(subtract(target.position, projectile.position)), speed);
  const mixed = {
    x: projectile.velocity.x + (desired.x - projectile.velocity.x) * homingStrength,
    y: projectile.velocity.y + (desired.y - projectile.velocity.y) * homingStrength
  };
  return scale(normalize(mixed), speed);
}

function steerEnemyAroundObstacles(position: Vec2, target: Vec2, obstacles: ObstacleState[], radius: number): Vec2 {
  const direct = normalize(subtract(target, position));
  const blocking = findBlockingObstacle(position, target, obstacles, radius);
  if (!blocking) {
    return direct;
  }

  const toObstacle = normalize(subtract(blocking.position, position));
  const tangentA = normalize({ x: -toObstacle.y, y: toObstacle.x });
  const tangentB = normalize({ x: toObstacle.y, y: -toObstacle.x });
  const towardTargetA = distance(add(position, scale(tangentA, 40)), target);
  const towardTargetB = distance(add(position, scale(tangentB, 40)), target);
  const tangent = towardTargetA < towardTargetB ? tangentA : tangentB;

  return normalize({
    x: direct.x * 0.35 + tangent.x * 0.95,
    y: direct.y * 0.35 + tangent.y * 0.95
  });
}

function findBlockingObstacle(start: Vec2, end: Vec2, obstacles: ObstacleState[], radius: number): ObstacleState | null {
  for (const obstacle of obstacles) {
    const hit = segmentDistanceToPoint(start, end, obstacle.position);
    if (hit < obstacle.radius + radius + 12) {
      return obstacle;
    }
  }
  return null;
}

function segmentDistanceToPoint(a: Vec2, b: Vec2, point: Vec2): number {
  const ab = subtract(b, a);
  const ap = subtract(point, a);
  const denom = ab.x * ab.x + ab.y * ab.y;
  if (denom <= 0.0001) {
    return distance(a, point);
  }
  const t = clamp((ap.x * ab.x + ap.y * ab.y) / denom, 0, 1);
  const closest = add(a, scale(ab, t));
  return distance(closest, point);
}

function resolveProjectileObstacleImpact(
  projectile: ProjectileState,
  obstacles: ObstacleState[]
): { position: Vec2; velocity: Vec2; didImpact: boolean; response: ObstacleState["projectileResponse"] | null } {
  for (const obstacle of obstacles) {
    const gap = distance(projectile.position, obstacle.position);
    if (gap > projectile.radius + obstacle.radius) {
      continue;
    }

    const normal = normalize(subtract(projectile.position, obstacle.position));
    const dot = projectile.velocity.x * normal.x + projectile.velocity.y * normal.y;
    const reflected = {
      x: projectile.velocity.x - 2 * dot * normal.x,
      y: projectile.velocity.y - 2 * dot * normal.y
    };
    return {
      position: add(obstacle.position, scale(normal, obstacle.radius + projectile.radius + 1)),
      velocity: reflected,
      didImpact: true,
      response: obstacle.projectileResponse
    };
  }

  return {
    position: projectile.position,
    velocity: projectile.velocity,
    didImpact: false,
    response: null
  };
}

function applyExplosionDamage(
  enemies: EnemyState[],
  center: Vec2,
  radius: number,
  damage: number,
  ignoredId: string
): EnemyState[] {
  return enemies.map((enemy) => {
    if (enemy.id === ignoredId || distance(enemy.position, center) > radius + enemy.radius) {
      return enemy;
    }
    return {
      ...enemy,
      hp: enemy.hp - damage
    };
  });
}

function createReflectedBarrierProjectile(
  nextId: number,
  position: Vec2,
  incoming: ProjectileState,
  enemies: EnemyState[]
): ProjectileState | null {
  const target = findClosestEnemy(position, enemies, 560);
  if (!target) {
    return null;
  }
  const toTarget = normalize(subtract(target.position, position));
  const inboundSpeed = Math.hypot(incoming.velocity.x, incoming.velocity.y);
  const speed = Math.min(500, Math.max(210, inboundSpeed * 0.9));
  return {
    id: `p-refl-${nextId}`,
    source: "player",
    position: { ...position },
    velocity: scale(toTarget, speed),
    radius: Math.max(3.4, incoming.radius * 0.88),
    life: Math.min(1.85, incoming.life + 0.35),
    damage: Math.max(9, incoming.damage * 0.52),
    color: 0xff5566,
    pierceLeft: 1,
    obstaclePierceLeft: 0,
    explosiveRadius: 0,
    ricochetLeft: 0,
    obstacleRicochets: 0,
    catacombBonusSpent: false,
    homingStrength: 0.12
  };
}

function createKillBurstProjectiles(nextId: number, position: Vec2, color: number, damage: number): ProjectileState[] {
  const burst: ProjectileState[] = [];
  for (let i = 0; i < 6; i += 1) {
    const direction = fromAngle((Math.PI * 2 * i) / 6);
    burst.push({
      id: `kb-${nextId + i}`,
      source: "player",
      position: { ...position },
      velocity: scale(direction, 300),
      radius: 3.8,
      life: 0.5 * PROJECTILE_LIFE_GLOBAL_SCALE,
      damage,
      color,
      pierceLeft: 0,
      obstaclePierceLeft: 0,
      explosiveRadius: 0,
      ricochetLeft: 0,
      obstacleRicochets: 0,
      catacombBonusSpent: false,
      homingStrength: 0
    });
  }
  return burst;
}

function createAnnouncement(
  nextId: number,
  title: string,
  subtitle: string,
  tone: RunAnnouncement["tone"],
  duration = 2.2
): RunAnnouncement {
  return {
    id: `announcement-${nextId}`,
    title,
    subtitle,
    tone,
    timer: duration,
    duration
  };
}

/** Boss 离场且当前无叙事遮罩时，按队列补播被顺延的阶段打字机 */
function maybeFlushPendingStageLore(state: SimulationState): SimulationState {
  if (state.run.runMode !== "story") {
    return state;
  }
  if (state.run.stageLore) {
    return state;
  }
  if (state.run.enemies.some((enemy) => enemy.type === "boss")) {
    return state;
  }
  const queue = state.run.pendingStageLoreQueue;
  if (!queue || queue.length === 0) {
    return state;
  }
  const [head, ...rest] = queue;
  return {
    ...state,
    run: {
      ...state.run,
      stageLore: { stage: head.stage },
      pendingStageLoreQueue: rest
    }
  };
}

function attachStoryStageLore(next: SimulationState): SimulationState {
  if (next.run.runMode !== "story") {
    return { ...next, run: { ...next.run, stageLore: null, pendingStageLoreQueue: [] } };
  }
  const stage = next.run.objective.stage;
  const prevQueue = next.run.pendingStageLoreQueue ?? [];
  // 场上存在 Boss 时不弹叙事，本阶段文案入队等待补播
  if (next.run.enemies.some((enemy) => enemy.type === "boss")) {
    return {
      ...next,
      run: {
        ...next.run,
        stageLore: null,
        pendingStageLoreQueue: [...prevQueue, { stage }]
      }
    };
  }
  const queue = [...prevQueue, { stage }];
  const head = queue[0];
  const rest = queue.slice(1);
  return {
    ...next,
    run: {
      ...next.run,
      stageLore: { stage: head.stage },
      pendingStageLoreQueue: rest
    }
  };
}

function advanceStage(state: SimulationState): SimulationState {
  const nextStage = state.run.objective.stage + 1;
  const nextObjective = createNextObjective(state);
  let next: SimulationState = {
    ...state,
    run: {
      ...state.run,
      objective: nextObjective,
      stageTheme: getThemeForStage(nextStage),
      tutorialHint: `阶段 ${nextStage} 已开始：${nextObjective.description}`,
      announcement: createAnnouncement(
        state.nextId,
        `阶段 ${nextStage} 任务`,
        `${nextObjective.title} · ${nextObjective.description}`,
        "phase",
        3.8
      )
    }
  };

  if (state.run.objective.stage === 3) {
    next = {
      ...next,
      nextId: next.nextId + 1,
      run: {
        ...next.run,
        stageTheme: "siege",
        announcement: createAnnouncement(
          next.nextId,
          "节点异变",
          `围城态接管本区。新任务：${next.run.objective.title} · ${next.run.objective.description}`,
          "phase",
          4.4
        ),
        tutorialHint: "围城态已生效。敌群更厚、更密，优先拉开站位再处理近身单位。",
        screenFlash: Math.max(next.run.screenFlash, 0.72)
      }
    };
    return attachStoryStageLore(next);
  }

  if (state.run.objective.stage === 6) {
    next = spawnEliteWave(next);
    next = {
      ...next,
      nextId: next.nextId + 1,
      run: {
        ...next.run,
        announcement: createAnnouncement(
          next.nextId,
          "节点压境",
          `精英群已切入本区。新任务：${next.run.objective.title} · ${next.run.objective.description}`,
          "phase",
          4.4
        ),
        tutorialHint: "第 6 阶段结点触发精英群。先处理精英火力点，别让阵线被一波冲碎。",
        bossAlertTimer: Math.max(next.run.bossAlertTimer, 2.4),
        screenFlash: Math.max(next.run.screenFlash, 0.84)
      }
    };
    return attachStoryStageLore(next);
  }

  if (state.run.objective.stage === 9) {
    next = triggerStageBoss(next);
    return attachStoryStageLore(next);
  }

  if (state.run.objective.stage === 11 && next.run.runMode === "story" && !next.run.storyArcComplete) {
    const hasPrime = next.run.enemies.some((e) => e.bossPattern === "laser-prime");
    if (!hasPrime) {
      next = spawnBoss(next, "laser-prime", {
        hpMultiplier: 1.72,
        radiusMultiplier: 1.38,
        colorOverride: 0x42e8ff
      });
      next = {
        ...next,
        nextId: next.nextId + 1,
        run: {
          ...next.run,
          bossSpawnCount: Math.max(next.run.bossSpawnCount, 1),
          bossAlertTimer: Math.max(next.run.bossAlertTimer, 6),
          announcement: createAnnouncement(
            next.nextId,
            "终幕·你的复写",
            "技能模型用你整段航迹合成的最终镜像；激光栅格展开，纵扫与横扫交替封路。",
            "boss",
            5
          ),
          tutorialHint:
            "终幕复写体：最终被复制的你。青蓝光谱、体型更大；激光纵扫与横扫交替预警，侧向滑出预警带。",
          screenFlash: Math.max(next.run.screenFlash, 1)
        }
      };
    }
    return attachStoryStageLore(next);
  }

  return attachStoryStageLore(next);
}

function spawnEliteWave(state: SimulationState): SimulationState {
  let nextId = state.nextId;
  const formations: Array<{ type: EnemyType; modifier: "fast" | "volatile" | null; angle: number; distance: number; hpScale: number }> = [
    { type: "sniper", modifier: "volatile", angle: -0.85, distance: 310, hpScale: 1.45 },
    { type: "sniper", modifier: "volatile", angle: 0.85, distance: 310, hpScale: 1.45 },
    { type: "drone", modifier: "fast", angle: -0.35, distance: 250, hpScale: 1.4 },
    { type: "drone", modifier: "fast", angle: 0.35, distance: 250, hpScale: 1.4 },
    { type: "brute", modifier: "volatile", angle: 0, distance: 360, hpScale: 1.7 }
  ];

  const enemies = [...state.run.enemies];
  for (const formation of formations) {
    const definition = enemyDefinitions[formation.type];
    const position = add(state.run.player.position, scale(fromAngle(formation.angle), formation.distance));
    enemies.push({
      id: `e-${nextId}`,
      type: definition.type,
      modifier: formation.modifier,
      bossPattern: null,
      position: resolveObstacleCollision(position, definition.radius, state.run.obstacles),
      velocity: { x: 0, y: 0 },
      radius: definition.radius,
      hp: definition.health * formation.hpScale,
      maxHp: definition.health * formation.hpScale,
      fireCooldown: definition.rangedCooldown ?? 0,
      skillCooldown: 0,
      secondaryCooldown: 0,
      chargeTimer: 0,
      chargeDirection: { x: 0, y: 0 },
      touchCooldown: 0,
      color: formation.modifier === "volatile" ? 0xffe670 : definition.color
    });
    nextId += 1;
  }

  return {
    ...state,
    nextId,
    run: {
      ...state.run,
      enemies
    }
  };
}

function triggerStageBoss(state: SimulationState): SimulationState {
  const bossActive = state.run.enemies.some((enemy) => enemy.type === "boss");
  let next: SimulationState = {
    ...state,
    nextId: state.nextId + 1,
    run: {
      ...state.run,
      bossSpawnCount: Math.max(state.run.bossSpawnCount, 1) + 1,
      bossAlertTimer: 6,
      announcement: createAnnouncement(
        state.nextId,
        "结点·同事副本",
        "技能侧把同事的航迹加料重训后的强化复制体已切入本区，先活下来，再找输出窗口。",
        "boss"
      ),
      tutorialHint:
        "第 9 阶段触发强化同事复制体：同一套管线加料后的版本，体型与血池高于随机遭遇的复制体。"
    }
  };

  if (bossActive) {
    return {
      ...next,
      run: {
        ...next.run,
        enemies: next.run.enemies.map((enemy) => {
          if (enemy.type !== "boss") {
            return enemy;
          }
          const nextMaxHp = enemy.maxHp * 1.35;
          return {
            ...enemy,
            radius: enemy.radius * 1.14,
            maxHp: nextMaxHp,
            hp: enemy.hp + nextMaxHp * 0.28,
            color: 0xff2f45
          };
        }),
        screenFlash: Math.max(next.run.screenFlash, 1)
      }
    };
  }

  const pattern = state.run.stageTheme === "crossfire" ? "artillery" : "charger";
  next = spawnBoss(next, pattern, {
    hpMultiplier: 1.42,
    radiusMultiplier: 1.18,
    colorOverride: 0xff2f45
  });
  return next;
}

function getWeaponIdByColor(color: number): WeaponId {
  const matched = Object.values(weaponDefinitions).find((weapon) => weapon.color === color);
  return matched?.id ?? "pulse-blaster";
}

function findClosestEnemy(position: Vec2, enemies: EnemyState[], maxDistance: number): EnemyState | null {
  let best: EnemyState | null = null;
  let bestDistance = maxDistance;
  for (const enemy of enemies) {
    const candidateDistance = distance(position, enemy.position);
    if (candidateDistance < bestDistance) {
      best = enemy;
      bestDistance = candidateDistance;
    }
  }
  return best;
}

function createShard(nextId: number, position: Vec2, value: number, xpValue: number): ShardState {
  const spread = ((nextId % 7) - 3) * 12;
  return {
    id: `s-${nextId}-${Math.round(position.x)}-${Math.round(position.y)}`,
    position: { ...position },
    velocity: { x: spread, y: -spread * 0.6 },
    value: Math.max(4, Math.round(value)),
    xpValue,
    radius: 6
  };
}

function isApexSanctuaryInvulnerable(state: SimulationState): boolean {
  return (
    state.run.appliedUpgrades.includes("apex-sanctuary") && (state.run.player.apexInvulnRemaining ?? 0) > 0
  );
}

function applyIncomingDamage(shield: number, hp: number, damage: number): { shield: number; hp: number } {
  const shieldDamage = Math.min(shield, damage);
  const nextShield = shield - shieldDamage;
  const overflow = damage - shieldDamage;
  return {
    shield: nextShield,
    hp: hp - overflow
  };
}

function resolveObstacleCollision(position: Vec2, radius: number, obstacles: ObstacleState[]): Vec2 {
  let next = position;
  for (const obstacle of obstacles) {
    const gap = distance(next, obstacle.position);
    const minGap = radius + obstacle.radius + 2;
    if (gap <= 0 || gap >= minGap) {
      continue;
    }
    const push = scale(normalize(subtract(next, obstacle.position)), minGap);
    next = add(obstacle.position, push);
  }
  return next;
}

function generateChunkObstacles(baseSeed: number, chunkSize: number, chunkKeys: string[]): ObstacleState[] {
  const obstacles: ObstacleState[] = [];
  const kinds = [
    { kind: "rock" as const, color: 0x31445f, min: 18, max: 54, projectileResponse: "block" as const },
    { kind: "crystal" as const, color: 0x3d6f95, min: 16, max: 42, projectileResponse: "reflect" as const },
    { kind: "pillar" as const, color: 0x4f5d7a, min: 20, max: 38, projectileResponse: "block" as const }
  ];

  for (const chunkKey of chunkKeys) {
    const [xText, yText] = chunkKey.split(":");
    const x = Number(xText);
    const y = Number(yText);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }

      const chunkSeed = hashChunkSeed(baseSeed, x, y);
      let seed = chunkSeed;
      const countRoll = randomFloat(seed);
      seed = countRoll.seed;
      const count = 2 + Math.floor(countRoll.value * 4);

      for (let index = 0; index < count; index += 1) {
        const kindRoll = randomChoice(seed, kinds);
        seed = kindRoll.seed;
        const offsetXRoll = randomFloat(seed);
        seed = offsetXRoll.seed;
        const offsetYRoll = randomFloat(seed);
        seed = offsetYRoll.seed;
        const sizeRoll = randomFloat(seed);
        seed = sizeRoll.seed;

        const radius = kindRoll.value.min + (kindRoll.value.max - kindRoll.value.min) * sizeRoll.value;
        const position = {
          x: x * chunkSize + 70 + offsetXRoll.value * (chunkSize - 140),
          y: y * chunkSize + 70 + offsetYRoll.value * (chunkSize - 140)
        };

        obstacles.push({
          id: `o-${x}-${y}-${index}`,
          chunkKey,
          position,
          radius,
          kind: kindRoll.value.kind,
          color: kindRoll.value.color,
          projectileResponse: kindRoll.value.projectileResponse
        });
      }
  }

  return obstacles;
}

function hashChunkSeed(baseSeed: number, chunkX: number, chunkY: number): number {
  let hash = baseSeed ^ (chunkX * 374761393) ^ (chunkY * 668265263);
  hash = (hash ^ (hash >>> 13)) * 1274126177;
  return hash >>> 0;
}

function collectChunkKeys(center: Vec2, chunkSize: number, radius: number): string[] {
  const chunkX = Math.floor(center.x / chunkSize);
  const chunkY = Math.floor(center.y / chunkSize);
  const chunkKeys: string[] = [];

  for (let y = chunkY - radius; y <= chunkY + radius; y += 1) {
    for (let x = chunkX - radius; x <= chunkX + radius; x += 1) {
      chunkKeys.push(`${x}:${y}`);
    }
  }

  return chunkKeys;
}

