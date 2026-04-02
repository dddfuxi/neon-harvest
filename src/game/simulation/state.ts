import { defaultMetaState } from "./meta";
import { characterSkillPool } from "../content/skills";
import { distance } from "./math";
import { randomChoice, randomFloat } from "./random";
import type { PlayerState, RunObjectiveState, RunTheme, SimulationState } from "./types";

function createPlayerState(
  weaponId: PlayerState["weaponId"],
  dashVariantUnlocked: boolean,
  characterSkillId: PlayerState["characterSkillId"]
): PlayerState {
  return {
    position: { x: 640, y: 360 },
    velocity: { x: 0, y: 0 },
    radius: 14,
    hp: 120,
    maxHp: 120,
    shield: 80,
    maxShield: 80,
    xp: 0,
    xpLevel: 1,
    xpToNext: 82,
    moveSpeed: 220,
    dashCooldown: dashVariantUnlocked ? 2.2 : 2.8,
    dashTimer: 0,
    dashDistance: dashVariantUnlocked ? 168 : 142,
    weaponId,
    weaponLevel: 1,
    weaponCooldown: 0,
    weaponHeat: 0,
    shieldRegenDelay: 0,
    shardMagnet: 118,
    damageMultiplier: 1,
    fireRateMultiplier: 1,
    damageReduction: 0,
    extraPierce: 0,
    economyMultiplier: 1,
    xpMultiplier: 1,
    shotCount: 1,
    sideShotLevel: 0,
    rearShot: false,
    projectileSize: 1,
    projectileSpeedMultiplier: 1,
    ricochetShots: 0,
    explosiveShots: 0,
    homingStrength: 0,
    lifeSteal: 0,
    killBurst: false,
    visionRadius: 360,
    characterSkillId,
    skillCooldown: 0,
    skillEffectTimer: 0
  };
}

function getThemeForStage(stage: number): RunTheme {
  const cycle = Math.max(0, stage - 1) % 3;
  if (cycle === 1) {
    return "crossfire";
  }
  if (cycle === 2) {
    return "siege";
  }
  return "skirmish";
}

function createRunObjective(
  stage: number,
  time: number,
  bankedShards: number,
  enemiesDestroyed: number
): RunObjectiveState {
  const cycle = Math.max(0, stage - 1);
  const kindIndex = cycle % 3;

  if (kindIndex === 0) {
    const target = 26 + Math.floor(cycle / 3) * 10;
    return {
      id: `objective-${stage}`,
      stage,
      cycle,
      kind: "collect-shards",
      title: "\u56de\u6536\u4fe1\u6807",
      description: `\u518d\u56de\u6536 ${target} \u70b9\u80fd\u91cf\u788e\u7247\uff0c\u7a33\u5b9a\u672c\u533a\u822a\u9053\u3002`,
      target,
      progress: 0,
      rewardShards: 18 + cycle * 4,
      rewardXp: 6 + cycle * 2,
      baselineTime: time,
      baselineBankedShards: bankedShards,
      baselineEnemiesDestroyed: enemiesDestroyed,
      completed: false,
      completionFlash: 0
    };
  }

  if (kindIndex === 1) {
    const target = 8 + Math.floor(cycle / 3) * 3;
    return {
      id: `objective-${stage}`,
      stage,
      cycle,
      kind: "defeat-enemies",
      title: "\u6e05\u527f\u8282\u70b9",
      description: `\u51fb\u7834 ${target} \u4e2a\u654c\u65b9\u76ee\u6807\uff0c\u538b\u4f4e\u5c40\u90e8\u5a01\u80c1\u3002`,
      target,
      progress: 0,
      rewardShards: 22 + cycle * 4,
      rewardXp: 8 + cycle * 2,
      baselineTime: time,
      baselineBankedShards: bankedShards,
      baselineEnemiesDestroyed: enemiesDestroyed,
      completed: false,
      completionFlash: 0
    };
  }

  const target = 24 + Math.floor(cycle / 3) * 6;
  return {
    id: `objective-${stage}`,
    stage,
    cycle,
    kind: "survive",
    title: "\u7a33\u6001\u7ef4\u6301",
    description: `\u5b88\u4f4f\u9635\u7ebf ${target} \u79d2\uff0c\u7b49\u5f85\u56de\u6536\u94fe\u8def\u91cd\u8fde\u3002`,
    target,
    progress: 0,
    rewardShards: 20 + cycle * 5,
    rewardXp: 10 + cycle * 2,
    baselineTime: time,
    baselineBankedShards: bankedShards,
    baselineEnemiesDestroyed: enemiesDestroyed,
    completed: false,
    completionFlash: 0
  };
}

export function createInitialState(): SimulationState {
  return {
    world: { chunkSize: 480, seed: 1337 },
    run: {
      status: "menu",
      time: 0,
      spawnAccumulator: 0,
      runOverDelay: 0,
      player: createPlayerState("pulse-blaster", false, "phase-burst"),
      obstacles: [],
      activeChunkKeys: [],
      enemies: [],
      projectiles: [],
      shards: [],
      hazards: [],
      hitEffects: [],
      announcement: null,
      objective: createRunObjective(1, 0, 0, 0),
      stageTheme: getThemeForStage(1),
      extraction: {
        unlocked: false,
        active: false,
        zoneCenter: { x: 540, y: -260 },
        radius: 72,
        holdTimer: 0,
        holdDuration: 4,
        rewardMultiplier: 1
      },
      score: 0,
      bankedShards: 0,
      unbankedShards: 0,
      enemiesDestroyed: 0,
      offeredUpgrades: [],
      appliedUpgrades: [],
      activeHazardTier: 0,
      bossEventTriggered: false,
      bossSpawnCount: 0,
      bossAlertTimer: 0,
      emergencyRepairCharges: 0,
      riskProtocolTier: 0,
      lastDamageSource: "",
      tutorialHint: "\u7528 WASD \u79fb\u52a8\uff0c\u7528\u9f20\u6807\u7784\u51c6\uff0c\u5148\u7a33\u4f4f\u9635\u811a\u7b49\u5f85\u64a4\u79bb\u7a97\u53e3\u5f00\u542f\u3002",
      screenFlash: 0,
      runSummary: null
    },
    meta: { ...defaultMetaState },
    rngSeed: 1337,
    nextId: 1
  };
}

export function createRunState(previous: SimulationState, weaponId?: PlayerState["weaponId"]): SimulationState {
  const chosenWeapon = weaponId ?? previous.meta.unlockedWeapons[0] ?? "pulse-blaster";
  const skillRoll = randomChoice(previous.rngSeed, characterSkillPool);
  const basePlayer = createPlayerState(chosenWeapon, previous.meta.dashVariantUnlocked, skillRoll.value);
  const obstacleResult = generateObstacles(previous.world.seed, previous.world.chunkSize, basePlayer.position);
  const supplyInventory = { ...previous.meta.supplyInventory };
  const activatedSupplies: string[] = [];
  let emergencyRepairCharges = 0;
  let riskProtocolTier = 0;

  if ((supplyInventory["weapon-oil"] ?? 0) > 0) {
    supplyInventory["weapon-oil"] = (supplyInventory["weapon-oil"] ?? 0) - 1;
    basePlayer.weaponLevel += 1;
    activatedSupplies.push("武器 Lv.+1");
  }

  if ((supplyInventory["shield-pack"] ?? 0) > 0) {
    supplyInventory["shield-pack"] = (supplyInventory["shield-pack"] ?? 0) - 1;
    basePlayer.shield = Math.min(basePlayer.maxShield, basePlayer.shield + 24);
    activatedSupplies.push("额外护盾");
  }

  if ((supplyInventory["field-notes"] ?? 0) > 0) {
    supplyInventory["field-notes"] = (supplyInventory["field-notes"] ?? 0) - 1;
    basePlayer.xp += 26;
    activatedSupplies.push("额外经验");
  }

  if ((supplyInventory["emergency-repair"] ?? 0) > 0) {
    supplyInventory["emergency-repair"] = (supplyInventory["emergency-repair"] ?? 0) - 1;
    emergencyRepairCharges = 1;
    activatedSupplies.push("应急修复");
  }

  if ((supplyInventory["risk-protocol"] ?? 0) > 0) {
    supplyInventory["risk-protocol"] = (supplyInventory["risk-protocol"] ?? 0) - 1;
    riskProtocolTier = 1;
    activatedSupplies.push("风险协议");
  }

  return {
    ...previous,
    rngSeed: skillRoll.seed,
    meta: {
      ...previous.meta,
      supplyInventory
    },
    run: {
      ...previous.run,
      status: "running",
      time: 0,
      spawnAccumulator: 1.2,
      runOverDelay: 0,
      player: basePlayer,
      obstacles: obstacleResult.obstacles,
      activeChunkKeys: obstacleResult.chunkKeys,
      enemies: [],
      projectiles: [],
      shards: [],
      hazards: [],
      hitEffects: [],
      announcement: null,
      objective: createRunObjective(1, 0, 0, 0),
      stageTheme: getThemeForStage(1),
      extraction: {
        unlocked: false,
        active: false,
        zoneCenter: { x: 540, y: -260 },
        radius: 72,
        holdTimer: 0,
        holdDuration: 4,
        rewardMultiplier: 1
      },
      score: 0,
      bankedShards: 0,
      unbankedShards: 0,
      enemiesDestroyed: 0,
      offeredUpgrades: [],
      appliedUpgrades: [],
      activeHazardTier: 0,
      bossEventTriggered: false,
      bossSpawnCount: 0,
      bossAlertTimer: 0,
      emergencyRepairCharges,
      riskProtocolTier,
      lastDamageSource: "",
      tutorialHint:
        activatedSupplies.length > 0
          ? `起始补给已生效：${activatedSupplies.join(" · ")}。先稳住第一轮阵线。`
          : "\u5148\u505a\u51fa\u7b2c\u4e00\u8f6e\u6218\u6597\u6784\u7b51\uff0c\u4e4b\u540e\u518d\u51b3\u5b9a\u662f\u7ee7\u7eed\u63a8\u8fdb\u8fd8\u662f\u64a4\u79bb\u3002",
      screenFlash: 0,
      runSummary: null
    }
  };
}

function generateObstacles(
  seed: number,
  chunkSize: number,
  center: PlayerState["position"]
): {
  chunkKeys: string[];
  seed: number;
  obstacles: SimulationState["run"]["obstacles"];
} {
  const obstacles: SimulationState["run"]["obstacles"] = [];
  const chunkKeys: string[] = [];
  const kinds = [
    { kind: "rock" as const, color: 0x31445f, min: 22, max: 36, projectileResponse: "block" as const },
    { kind: "crystal" as const, color: 0x3d6f95, min: 18, max: 30, projectileResponse: "reflect" as const },
    { kind: "pillar" as const, color: 0x4f5d7a, min: 20, max: 28, projectileResponse: "block" as const }
  ];
  const chunkX = Math.floor(center.x / chunkSize);
  const chunkY = Math.floor(center.y / chunkSize);

  for (let y = chunkY - 2; y <= chunkY + 2; y += 1) {
    for (let x = chunkX - 2; x <= chunkX + 2; x += 1) {
      const chunkSeed = hashChunkSeed(seed, x, y);
      chunkKeys.push(`${x}:${y}`);
      let currentSeed = chunkSeed;
      const countRoll = randomFloat(currentSeed);
      currentSeed = countRoll.seed;
      const obstacleCount = 2 + Math.floor(countRoll.value * 4);

      for (let index = 0; index < obstacleCount; index += 1) {
        const kindRoll = randomChoice(currentSeed, kinds);
        currentSeed = kindRoll.seed;
        const offsetXRoll = randomFloat(currentSeed);
        currentSeed = offsetXRoll.seed;
        const offsetYRoll = randomFloat(currentSeed);
        currentSeed = offsetYRoll.seed;
        const sizeRoll = randomFloat(currentSeed);
        currentSeed = sizeRoll.seed;

        const radius = kindRoll.value.min + (kindRoll.value.max - kindRoll.value.min) * sizeRoll.value * 1.4;
        const position = {
          x: x * chunkSize + 80 + offsetXRoll.value * (chunkSize - 160),
          y: y * chunkSize + 80 + offsetYRoll.value * (chunkSize - 160)
        };

        if (distance(position, center) < 150) {
          continue;
        }

        obstacles.push({
          id: `o-${x}-${y}-${index}`,
          chunkKey: `${x}:${y}`,
          position,
          radius,
          kind: kindRoll.value.kind,
          color: kindRoll.value.color,
          projectileResponse: kindRoll.value.projectileResponse
        });
      }
    }
  }

  return { seed, chunkKeys, obstacles };
}

function hashChunkSeed(baseSeed: number, chunkX: number, chunkY: number): number {
  let hash = baseSeed ^ (chunkX * 374761393) ^ (chunkY * 668265263);
  hash = (hash ^ (hash >>> 13)) * 1274126177;
  return hash >>> 0;
}


