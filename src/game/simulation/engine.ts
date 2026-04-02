import { enemyDefinitions, getEnemySpawnMix } from "../content/enemies";
import { upgradeDefinitions, upgradePool, type UpgradeId } from "../content/upgrades";
import type { EnemyType } from "../content/enemies";
import { weaponDefinitions, type WeaponId } from "../content/weapons";
import type { InputSnapshot } from "../input/actions";
import { add, clamp, distance, fromAngle, normalize, scale, subtract } from "./math";
import { buyMetaUpgrade } from "./meta";
import { randomChoice, randomFloat } from "./random";
import { createRunState } from "./state";
import type {
  BossPattern,
  EnemyState,
  HazardState,
  HitEffectState,
  ObstacleState,
  ProjectileState,
  RunAnnouncement,
  RunObjectiveState,
  RunSummary,
  RunTheme,
  ShardState,
  SimulationState,
  Vec2
} from "./types";

export type UiCommand =
  | { type: "start-run"; weaponId?: WeaponId }
  | { type: "toggle-pause" }
  | { type: "resume-run" }
  | { type: "exit-run" }
  | { type: "choose-upgrade"; upgradeId: UpgradeId }
  | { type: "enter-meta" }
  | { type: "exit-meta" }
  | { type: "buy-meta"; upgradeId: string };

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

  let next = { ...state, run: { ...state.run, time: state.run.time + deltaSeconds } };
  next = coolScreenFlash(next, deltaSeconds);
  next = tickHitEffects(next, deltaSeconds);
  next = tickAnnouncement(next, deltaSeconds);
  next = tickPlayer(next, deltaSeconds, input);
  next = refreshWorldChunks(next);
  next = spawnEnemies(next, deltaSeconds);
  next = updateEnemies(next, deltaSeconds);
  next = updateProjectiles(next, deltaSeconds);
  next = updateShards(next, deltaSeconds);
  next = updateHazards(next, deltaSeconds);
  next = maybeUnlockExtraction(next);
  next = updateExtraction(next, deltaSeconds, input);
  next = maybeTriggerBossEvent(next);
  next = maybeOfferLevelUp(next);
  next = updateObjective(next, deltaSeconds);
  next = updateTutorialHint(next);
  next = checkDefeat(next);

  return next;
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
      return createRunState(state, command.weaponId);
    case "toggle-pause":
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
        return { ...state, run: { ...state.run, status: "menu" } };
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
    default:
      return state;
  }
}

function applyUpgrade(state: SimulationState, upgradeId: UpgradeId): SimulationState {
  const player = { ...state.run.player };
  const applied = [...state.run.appliedUpgrades, upgradeId];
  const definition = upgradeDefinitions[upgradeId];

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
      player.extraPierce += 1;
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
      break;
    case "auto-forge":
      player.shield = Math.min(player.maxShield, player.shield + 12);
      break;
    case "lattice-armor":
      player.maxHp += 28;
      player.hp += 28;
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
      player.shotCount = Math.max(player.shotCount, 3);
      player.fireRateMultiplier *= 0.92;
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
      player.homingStrength += 0.08;
      break;
    case "giant-core":
      player.projectileSize *= 1.32;
      player.projectileSpeedMultiplier *= 0.92;
      player.damageMultiplier *= 1.08;
      break;
    case "blood-siphon":
      player.lifeSteal += 0.035;
      break;
    case "bank-heist":
      player.economyMultiplier *= 1.14;
      player.xpMultiplier *= 1.1;
      break;
    case "survey-array":
      player.visionRadius += 70;
      break;
    case "deep-radar":
      player.visionRadius += 120;
      break;
    default:
      break;
  }

  return {
    ...state,
    nextId: state.nextId + 1,
    run: {
      ...state.run,
      status: "running",
      player,
      appliedUpgrades: applied,
      offeredUpgrades: [],
      tutorialHint: `构筑已接入：${definition.title}。`,
      announcement: createAnnouncement(
        state.nextId,
        "构筑完成",
        `${definition.title} 已接入，继续沿当前路线推进。`,
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

  return {
    id: `p-${state.nextId + indexOffset}`,
    source: "player",
    position: add(player.position, scale(direction, player.radius + 12)),
    velocity: scale(direction, speed),
    radius: size,
    life: weapon.projectileLife * (1 + (player.projectileSize - 1) * 0.15),
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
    homingStrength: player.homingStrength
  };
}

function spawnEnemies(state: SimulationState, deltaSeconds: number): SimulationState {
  const bossActive = state.run.enemies.some((enemy) => enemy.type === "boss");
  const earlyPenalty = state.run.time < 45 ? 2 : state.run.time < 90 ? 1 : 0;
  const stagePressure = Math.floor((state.run.objective.stage - 1) / 3);
  const themeCountBonus = state.run.stageTheme === "siege" ? 2 : state.run.stageTheme === "crossfire" ? 1 : 0;
  const desiredCount = Math.max(
    2,
    Math.floor((bossActive ? 2 : 4) + state.run.time / 14 + state.run.unbankedShards / 55 + stagePressure * 1.5 + themeCountBonus - earlyPenalty)
  );
  const themeRateBonus = state.run.stageTheme === "siege" ? 0.26 : state.run.stageTheme === "crossfire" ? 0.14 : 0;
  const spawnRate = clamp((state.run.time < 75 ? 0.72 + state.run.time / 120 : 1.3 + state.run.time / 55) + stagePressure * 0.18 + themeRateBonus, 0.72, 7.2);
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
  const hpBonus = eliteModifier ? 1.35 : 1;
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
  const radiusScale = (pattern === "artillery" ? 1.42 : 1.28) * (options?.radiusMultiplier ?? 1);
  const hpScale = (pattern === "artillery" ? 1.14 : 1.06) * (options?.hpMultiplier ?? 1);
  const enemy: EnemyState = {
    id: `e-${state.nextId}`,
    type: "boss",
    modifier: null,
    bossPattern: pattern,
    position: resolveObstacleCollision(position, definition.radius * radiusScale, state.run.obstacles),
    velocity: { x: 0, y: 0 },
    radius: definition.radius * radiusScale,
    hp: definition.health * hpScale,
    maxHp: definition.health * hpScale,
    fireCooldown: 0.7,
    skillCooldown: 1.8,
    secondaryCooldown: 3.4,
    chargeTimer: 0,
    chargeDirection: { x: 0, y: 0 },
    touchCooldown: 0,
    color: options?.colorOverride ?? (pattern === "artillery" ? 0xff516b : 0xff7a4a)
  };

  return {
    ...state,
    rngSeed: angleRoll.seed,
    nextId: state.nextId + 1,
    run: {
      ...state.run,
      enemies: [...state.run.enemies, enemy],
      screenFlash: 1
    }
  };
}

function maybeAddHazards(state: SimulationState): SimulationState {
  const hazardTier = Math.max(Math.floor(state.run.time / 150), Math.floor((state.run.objective.stage - 1) / 3));
  if (hazardTier <= state.run.activeHazardTier || hazardTier === 0) {
    return state;
  }

  const hazardRadiusBonus = state.run.stageTheme === "siege" ? 18 : state.run.stageTheme === "crossfire" ? -6 : 0;
  const hazardDamageBonus = state.run.stageTheme === "siege" ? 4 : state.run.stageTheme === "crossfire" ? 2 : 0;

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
      const damageResult = applyIncomingDamage(shield, hp, contactDamage * (1 - clamp(player.damageReduction, 0, 0.6)));
      if (player.characterSkillId === "overdrive-core" && damageResult.hp < hp && skillCooldown <= 0) {
        skillCooldown = 14;
        skillEffectTimer = 4.5;
        screenFlash = Math.max(screenFlash, 0.72);
      }
      shield = damageResult.shield;
      hp = damageResult.hp;
      lastDamageSource =
        enemy.type === "boss"
          ? enemyNext.chargeTimer > 0
            ? "被首领冲锋正面撞穿"
            : "被首领近身压制击毁"
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
        life: 2.8,
        damage: 14,
        color: 0xff72c8,
        pierceLeft: 0,
        obstaclePierceLeft: 0,
        explosiveRadius: 0,
        ricochetLeft: 0,
        homingStrength: 0
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
          life: 3.2,
          damage: enemy.bossPattern === "artillery" ? 20 : 16,
          color: 0xff5c6f,
          pierceLeft: 0,
          obstaclePierceLeft: 0,
          explosiveRadius: 0,
          ricochetLeft: 0,
          homingStrength: 0
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

  return { nextId: localNextId, screenFlash };
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

  for (const projectile of state.run.projectiles) {
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
      continue;
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
          const damage = nextProjectile.damage;
          const nextEnemy = { ...enemy, hp: enemy.hp - damage };
          const weaponId = getWeaponIdByColor(nextProjectile.color);
          healed += damage * state.run.player.lifeSteal;
          pushHitEffect(hitEffects, nextId, {
            position: { ...nextProjectile.position },
            color: nextProjectile.color,
            weaponId,
            kind: weaponId === "nova-driver" ? "burst" : weaponId === "shard-lance" ? "pierce-trail" : "spark",
            ttl: weaponId === "nova-driver" ? 0.24 : weaponId === "shard-lance" ? 0.18 : 0.14
          });
          nextId += 1;

          if (nextProjectile.explosiveRadius > 0) {
            enemies = applyExplosionDamage(enemies, nextProjectile.position, nextProjectile.explosiveRadius, damage * 0.4, enemy.id);
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
              const burst = createKillBurstProjectiles(nextId + spawnedProjectiles.length, enemy.position, nextProjectile.color, damage * 0.38);
              spawnedProjectiles.push(...burst);
              nextId += burst.length;
            }
            score += 25 + definition.xp;
            enemiesDestroyed += 1;
            xp += definition.xp * state.run.player.xpMultiplier;
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
      }

      const obstacleImpact = resolveProjectileObstacleImpact(nextProjectile, state.run.obstacles);
      if (obstacleImpact.didImpact && (obstacleImpact.response === "reflect" || nextProjectile.ricochetLeft > 0)) {
        const weaponId = getWeaponIdByColor(nextProjectile.color);
        nextProjectile.position = obstacleImpact.position;
        nextProjectile.velocity = obstacleImpact.velocity;
        if (obstacleImpact.response !== "reflect" && nextProjectile.ricochetLeft > 0) {
          nextProjectile.ricochetLeft -= 1;
        }
        screenFlash = Math.max(screenFlash, obstacleImpact.response === "reflect" ? 0.22 : 0.18);
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
      } else if (distance(nextProjectile.position, state.run.player.position) <= nextProjectile.radius + state.run.player.radius) {
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
      if (distance(enemy.position, hazard.position) >= hazard.radius + enemy.radius) {
        return enemy;
      }
      return {
        ...enemy,
        hp: enemy.hp - hazard.damagePerSecond * deltaSeconds * (state.run.appliedUpgrades.includes("fracture-grid") ? 1.22 : 1)
      };
    });

    if (distance(state.run.player.position, hazard.position) <= hazard.radius + state.run.player.radius) {
      const damageResult = applyIncomingDamage(shield, hp, hazard.damagePerSecond * deltaSeconds);
      shield = damageResult.shield;
      hp = damageResult.hp;
      regenDelay = 4;
    }
  }

  enemies = enemies.flatMap((enemy) => {
    if (enemy.hp > 0) {
      return [enemy];
    }
    const definition = enemyDefinitions[enemy.type];
    shards.push(createShard(nextId, enemy.position, definition.shardDrop, definition.xp));
    nextId += 1;
    banked += Math.round(definition.shardDrop * 0.15);
    unbanked += definition.shardDrop;
    score += 25 + definition.xp;
    enemiesDestroyed += 1;
    xp += definition.xp * state.run.player.xpMultiplier;
    return [];
  });

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
      screenFlash
    }
  };
}

function updateShards(state: SimulationState, deltaSeconds: number): SimulationState {
  let xp = state.run.player.xp;
  let unbanked = state.run.unbankedShards;
  let banked = state.run.bankedShards;

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
      bankedShards: banked
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

    if (nextHazard.active && distance(state.run.player.position, nextHazard.position) <= nextHazard.radius + state.run.player.radius) {
      const damageScale = nextHazard.source === "boss" ? 1.2 : 1;
      const damageResult = applyIncomingDamage(shield, hp, nextHazard.damagePerSecond * deltaSeconds * damageScale);
      if (state.run.player.characterSkillId === "overdrive-core" && damageResult.hp < hp && skillCooldown <= 0) {
        skillCooldown = 14;
        skillEffectTimer = 4.5;
        screenFlash = Math.max(screenFlash, 0.72);
      }
      shield = damageResult.shield;
      hp = damageResult.hp;
      lastDamageSource = nextHazard.source === "boss" ? "被首领炮击区域吞没" : "在风暴区里持续失血";
      regenDelay = 4;
      screenFlash = Math.max(screenFlash, nextHazard.source === "boss" ? 0.72 : 0.28);
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

  extraction.rewardMultiplier = 1 + clamp((state.run.time - 480) / 120, 0, 0.85);
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
        "首领入场",
        patternRoll.value > 0.5 ? "炮击型目标已锁定本区，立刻脱离收缩红圈。" : "冲锋型目标已锁定航线，优先横向脱离蓄力线。",
        "boss"
      ),
      tutorialHint:
        patternRoll.value > 0.5
          ? "\u9996\u9886\u8fdb\u5165\u6218\u573a\uff1a\u70ae\u51fb\u578b\uff0c\u79bb\u5f00\u7ea2\u5708\u9884\u8b66\u533a\u57df\u3002"
          : "\u9996\u9886\u8fdb\u5165\u6218\u573a\uff1a\u51b2\u950b\u578b\uff0c\u4fdd\u6301\u4fa7\u5411\u4f4d\u79fb\u907f\u5f00\u76f4\u7ebf\u51b2\u649e\u3002",
    }
  };
  next = spawnBoss(next, patternRoll.value > 0.5 ? "artillery" : "charger");
  return next;
}

function maybeOfferLevelUp(state: SimulationState): SimulationState {
  if (state.run.status !== "running") {
    return state;
  }

  const player = { ...state.run.player };
  if (player.xp < player.xpToNext) {
    return state;
  }

  player.xp -= player.xpToNext;
  player.xpLevel += 1;
  player.xpToNext = Math.floor(player.xpToNext * 1.52 + 26);

  return {
    ...state,
    run: {
      ...state.run,
      status: "level-up",
      player,
      offeredUpgrades: rollUpgrades(state)
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
        xp: state.run.player.xp + objective.rewardXp,
        shield: Math.min(state.run.player.maxShield, state.run.player.shield + 14)
      },
      bankedShards: state.run.bankedShards + objective.rewardShards,
      objective: {
        ...objective,
        progress: objective.target,
        completed: true,
        completionFlash: 2.4
      },
      tutorialHint: `${objective.title} \u5df2\u5b8c\u6210\uff0c\u83b7\u5f97 ${objective.rewardShards} \u79ef\u5206\u4e0e ${objective.rewardXp} \u7ecf\u9a8c\u3002`,
      announcement: createAnnouncement(
        state.nextId,
        "阶段完成",
        `${objective.title} 达成 · +${objective.rewardShards} 积分 · +${objective.rewardXp} 经验`,
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

  if (kindIndex === 0) {
    const target = 26 + Math.floor(cycle / 3) * 10;
    return {
      id: `objective-${nextStage}`,
      stage: nextStage,
      cycle,
      kind: "collect-shards",
      title: "回收信标",
      description: `再回收 ${target} 点能量碎片，稳定本区航道。`,
      target,
      progress: 0,
      rewardShards: 18 + cycle * 4,
      rewardXp: 8 + cycle * 2,
      baselineTime: state.run.time,
      baselineBankedShards: state.run.bankedShards,
      baselineEnemiesDestroyed: state.run.enemiesDestroyed,
      completed: false,
      completionFlash: 0
    };
  }

  if (kindIndex === 1) {
    const target = 8 + Math.floor(cycle / 3) * 3;
    return {
      id: `objective-${nextStage}`,
      stage: nextStage,
      cycle,
      kind: "defeat-enemies",
      title: "清剿节点",
      description: `击破 ${target} 个敌方目标，压低局部威胁。`,
      target,
      progress: 0,
      rewardShards: 22 + cycle * 4,
      rewardXp: 10 + cycle * 2,
      baselineTime: state.run.time,
      baselineBankedShards: state.run.bankedShards,
      baselineEnemiesDestroyed: state.run.enemiesDestroyed,
      completed: false,
      completionFlash: 0
    };
  }

  const target = 24 + Math.floor(cycle / 3) * 6;
  return {
    id: `objective-${nextStage}`,
    stage: nextStage,
    cycle,
    kind: "survive",
    title: "稳态维持",
    description: `守住阵线 ${target} 秒，等待回收链路重连。`,
    target,
    progress: 0,
    rewardShards: 20 + cycle * 5,
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

function rollUpgrades(state: SimulationState): UpgradeId[] {
  let seed = state.rngSeed;
  const available = upgradePool.filter((upgrade) => {
    if (upgrade.once && state.run.appliedUpgrades.includes(upgrade.id)) {
      return false;
    }
    if (upgrade.id === "compound-interest" && !state.meta.unlockedUpgradeIds.includes("compound-interest")) {
      return false;
    }
    return true;
  });

  const selections: UpgradeId[] = [];
  while (selections.length < 3 && available.length > 0) {
    const result = randomFloat(seed);
    seed = result.seed;
    const totalWeight = available.reduce((sum, entry) => sum + entry.weight, 0);
    let cursor = result.value * totalWeight;
    let chosenIndex = 0;
    for (let i = 0; i < available.length; i += 1) {
      cursor -= available[i].weight;
      if (cursor <= 0) {
        chosenIndex = i;
        break;
      }
    }
    selections.push(available[chosenIndex].id);
    available.splice(chosenIndex, 1);
  }

  return selections;
}

function updateTutorialHint(state: SimulationState): SimulationState {
  if (state.run.objective.completed && state.run.objective.completionFlash > 0) {
    return state;
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
  return endRun(state, "dead");
}

function endRun(state: SimulationState, result: RunSummary["result"]): SimulationState {
  const extractionBonus = result === "extracted" ? state.run.extraction.rewardMultiplier : 0.55;
  const payout = Math.round(state.run.unbankedShards * extractionBonus * (result === "extracted" ? state.run.player.economyMultiplier : 0.45));
  const objectivesCompleted = Math.max(0, state.run.objective.stage - 1 + (state.run.objective.completed ? 1 : 0));
  const keyUpgradeIds = state.run.appliedUpgrades.filter((upgradeId) => upgradeId !== "weapon-tuning");
  const keyUpgradeTitles = keyUpgradeIds
    .slice(-4)
    .map((upgradeId) => upgradeDefinitions[upgradeId]?.title)
    .filter((title): title is string => Boolean(title));
  const buildRecap =
    keyUpgradeTitles.length > 0
      ? `武器 Lv.${state.run.player.weaponLevel} · 关键升级：${keyUpgradeTitles.join(" / ")}`
      : `武器 Lv.${state.run.player.weaponLevel} · 本轮主要依靠基础火力推进`;
  const deathReason =
    result === "extracted" ? "成功撤离，结算完成" : state.run.lastDamageSource || "在持续交火中被压垮";
  const summary: RunSummary = {
    result,
    duration: state.run.time,
    level: state.run.player.xpLevel,
    weaponId: state.run.player.weaponId,
    weaponLevel: state.run.player.weaponLevel,
    shardsBanked: result === "extracted" ? state.run.bankedShards + payout : payout,
    enemiesDestroyed: state.run.enemiesDestroyed,
    objectivesCompleted,
    highestStage: state.run.objective.stage,
    buildRecap,
    keyUpgrades: keyUpgradeTitles,
    deathReason,
    extractionBonus
  };
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

  return {
    ...state,
    meta: {
      ...state.meta,
      credits: state.meta.credits + summary.shardsBanked,
      lastRunSummary: summary,
      leaderboard
    },
    run: {
      ...state.run,
      status: "run-over",
      runOverDelay: result === "dead" ? 1 : 0,
      runSummary: summary,
      tutorialHint:
        result === "extracted"
          ? `本轮成功撤离。${summary.buildRecap}。完成 ${summary.objectivesCompleted} 个阶段任务，击破 ${summary.enemiesDestroyed} 个敌人，推进到第 ${summary.highestStage} 阶段。`
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
      life: 0.5,
      damage,
      color,
      pierceLeft: 0,
      obstaclePierceLeft: 0,
      explosiveRadius: 0,
      ricochetLeft: 0,
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
    return next;
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
    return next;
  }

  if (state.run.objective.stage === 9) {
    next = triggerStageBoss(next);
    return next;
  }

  return next;
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
      announcement: createAnnouncement(state.nextId, "结点首领", "强化首领已切入本区，先活下来，再找输出窗口。", "boss"),
      tutorialHint: "第 9 阶段触发强化首领。它的体型、血量和压制能力都高于常规首领。"
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

