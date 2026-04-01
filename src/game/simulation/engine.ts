import { enemyDefinitions, getEnemySpawnMix } from "../content/enemies";
import { upgradeDefinitions, upgradePool, type UpgradeId } from "../content/upgrades";
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
  ObstacleState,
  ProjectileState,
  RunSummary,
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
    return coolScreenFlash(state, deltaSeconds);
  }

  let next = { ...state, run: { ...state.run, time: state.run.time + deltaSeconds } };
  next = coolScreenFlash(next, deltaSeconds);
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
    run: {
      ...state.run,
      status: "running",
      player,
      appliedUpgrades: applied,
      offeredUpgrades: [],
      tutorialHint: `${definition.title} 已安装。`,
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
  const generated = generateChunkObstacles(state.world.seed, state.world.chunkSize, state.run.player.position);
  if (sameChunkSet(generated.chunkKeys, state.run.activeChunkKeys)) {
    return state;
  }

  return {
    ...state,
    run: {
      ...state.run,
      obstacles: generated.obstacles,
      activeChunkKeys: generated.chunkKeys
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
  const desiredCount = Math.max(
    2,
    Math.floor((bossActive ? 2 : 4) + state.run.time / 14 + state.run.unbankedShards / 55 - earlyPenalty)
  );
  const spawnRate = clamp((state.run.time < 75 ? 0.72 + state.run.time / 120 : 1.3 + state.run.time / 55), 0.72, 7.2);
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
  const mix = getEnemySpawnMix(state.run.time);
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

function spawnBoss(state: SimulationState, pattern: BossPattern): SimulationState {
  const definition = enemyDefinitions.boss;
  const angleRoll = randomFloat(state.rngSeed);
  const angle = angleRoll.value * Math.PI * 2;
  const position = add(state.run.player.position, scale(fromAngle(angle), 420));
  const radiusScale = pattern === "artillery" ? 1.42 : 1.28;
  const hpScale = pattern === "artillery" ? 1.14 : 1.06;
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
    color: pattern === "artillery" ? 0xff516b : 0xff7a4a
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
  const hazardTier = Math.floor(state.run.time / 150);
  if (hazardTier <= state.run.activeHazardTier || hazardTier === 0) {
    return state;
  }

  const hazard: HazardState = {
    id: `h-${state.nextId}`,
    position: add(state.run.player.position, {
      x: 180 + ((hazardTier * 260) % 260),
      y: -140 + ((hazardTier * 170) % 240)
    }),
    radius: 58 + hazardTier * 12,
    damagePerSecond: 10 + hazardTier * 4,
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
      tutorialHint: "风暴口袋已成形，把敌群赶进去。"
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
  let screenFlash = state.run.screenFlash;
  const shards = [...state.run.shards];
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
          healed += damage * state.run.player.lifeSteal;

          if (nextProjectile.explosiveRadius > 0) {
            enemies = applyExplosionDamage(enemies, nextProjectile.position, nextProjectile.explosiveRadius, damage * 0.4, enemy.id);
            screenFlash = Math.max(screenFlash, 0.36);
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
        nextProjectile.position = obstacleImpact.position;
        nextProjectile.velocity = obstacleImpact.velocity;
        if (obstacleImpact.response !== "reflect" && nextProjectile.ricochetLeft > 0) {
          nextProjectile.ricochetLeft -= 1;
        }
        screenFlash = Math.max(screenFlash, obstacleImpact.response === "reflect" ? 0.22 : 0.18);
      } else if (obstacleImpact.didImpact && nextProjectile.obstaclePierceLeft > 0) {
        nextProjectile.obstaclePierceLeft -= 1;
        screenFlash = Math.max(screenFlash, 0.12);
      } else if (obstacleImpact.didImpact) {
        collided = true;
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
      projectiles: [...remainingProjectiles, ...spawnedProjectiles],
      shards,
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
      tutorialHint: "撤离窗口已开启，按住 E 可撤离，也可以继续贪收益。",
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
  const nextSpawnTime = 30 + state.run.bossSpawnCount * 60;
  if (bossActive || state.run.time < nextSpawnTime) {
    return state;
  }

  const patternRoll = randomFloat(state.rngSeed);
  let next = {
    ...state,
    rngSeed: patternRoll.seed,
    run: {
      ...state.run,
      bossEventTriggered: true,
      bossSpawnCount: state.run.bossSpawnCount + 1,
      bossAlertTimer: 5,
      tutorialHint: patternRoll.value > 0.5 ? "首领进入战场：炮击型，红圈落点将压缩走位。" : "首领进入战场：冲锋型，保持横向位移，别站在直线上。"
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
  player.xpToNext = Math.floor(player.xpToNext * 1.34 + 16);

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
  if (state.run.time < 30) {
    return state;
  }

  if (!state.run.extraction.unlocked) {
    return {
      ...state,
      run: {
        ...state.run,
        tutorialHint: "只看得见视野内的敌人与障碍。扩大视野，或者把战斗拖近。"
      }
    };
  }

  return state;
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
  const summary: RunSummary = {
    result,
    duration: state.run.time,
    level: state.run.player.xpLevel,
    shardsBanked: result === "extracted" ? state.run.bankedShards + payout : payout,
    enemiesDestroyed: state.run.enemiesDestroyed,
    extractionBonus
  };
  const leaderboardEntry = {
    id: `lb-${state.nextId}-${Math.floor(state.run.time)}`,
    recordedAt: Date.now(),
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
      runSummary: summary,
      tutorialHint: result === "extracted" ? "成功带回战利品。下一次可以把视野和盾量做大。" : "护盾破裂后 hull 被击穿。下次优先做视野或续航。",
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

function generateChunkObstacles(
  baseSeed: number,
  chunkSize: number,
  center: Vec2
): { chunkKeys: string[]; obstacles: ObstacleState[] } {
  const obstacles: ObstacleState[] = [];
  const chunkKeys: string[] = [];
  const chunkX = Math.floor(center.x / chunkSize);
  const chunkY = Math.floor(center.y / chunkSize);
  const kinds = [
    { kind: "rock" as const, color: 0x31445f, min: 18, max: 54, projectileResponse: "block" as const },
    { kind: "crystal" as const, color: 0x3d6f95, min: 16, max: 42, projectileResponse: "reflect" as const },
    { kind: "pillar" as const, color: 0x4f5d7a, min: 20, max: 38, projectileResponse: "block" as const }
  ];

  for (let y = chunkY - 3; y <= chunkY + 3; y += 1) {
    for (let x = chunkX - 3; x <= chunkX + 3; x += 1) {
      const chunkSeed = hashChunkSeed(baseSeed, x, y);
      chunkKeys.push(`${x}:${y}`);
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

        if (distance(position, center) < 150) {
          continue;
        }

        obstacles.push({
          id: `o-${x}-${y}-${index}`,
          position,
          radius,
          kind: kindRoll.value.kind,
          color: kindRoll.value.color,
          projectileResponse: kindRoll.value.projectileResponse
        });
      }
    }
  }

  return { chunkKeys, obstacles };
}

function hashChunkSeed(baseSeed: number, chunkX: number, chunkY: number): number {
  let hash = baseSeed ^ (chunkX * 374761393) ^ (chunkY * 668265263);
  hash = (hash ^ (hash >>> 13)) * 1274126177;
  return hash >>> 0;
}

function sameChunkSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}
