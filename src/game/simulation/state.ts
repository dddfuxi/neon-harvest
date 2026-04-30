import { defaultMetaState } from "./meta";
import { characterSkillPool } from "../content/skills";
import { calculateBranchProgress, getDominantUpgradeBranch } from "../content/upgrades";
import { weaponModDefinitions } from "../content/weapons";
import { distance } from "./math";
import { randomChoice, randomFloat } from "./random";
import { STORY_FINAL_STAGE, type PlayerState, type RunMode, type RunObjectiveState, type RunTheme, type SimulationState } from "./types";

export function getXpToNextForLevel(level: number): number {
  if (level <= 1) {
    return 136;
  }
  return Math.round(116 + level * 58 + Math.max(0, level - 4) * 16 + Math.max(0, level - 9) * 24);
}

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
    xpToNext: getXpToNextForLevel(1),
    moveSpeed: 220,
    dashCooldown: dashVariantUnlocked ? 2.2 : 2.8,
    dashTimer: 0,
    dashDistance: dashVariantUnlocked ? 168 : 142,
    dashState: null,
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
    visionRadius: 300,
    characterSkillId,
    skillCooldown: 0,
    skillEffectTimer: 0,
    lastAimDirection: { x: 1, y: 0 },
    barrierOrbitPhase: 0,
    apexInvulnRemaining: 0,
    apexPulseCooldown: 0
  };
}

function getThemeForStage(stage: number): RunTheme {
  if (stage >= 10) {
    return "siege";
  }
  if (stage >= 7) {
    return "crossfire";
  }
  if (stage >= 4) {
    return "siege";
  }
  return "skirmish";
}

/**
 * 战役模式单阶段目标更高，拉长每节停留，方便读完叙事；清剿模式保持原数值。
 */
export function getObjectiveTargetForStage(
  stage: number,
  kind: "collect-shards" | "defeat-enemies" | "survive",
  runMode: RunMode
): number {
  const cycle = Math.max(0, stage - 1);
  let base: number;
  if (kind === "collect-shards") {
    base = 26 + Math.floor(cycle / 3) * 10;
  } else if (kind === "defeat-enemies") {
    base = 8 + Math.floor(cycle / 3) * 3;
  } else {
    base = 24 + Math.floor(cycle / 3) * 6;
  }
  if (runMode !== "story") {
    return base;
  }
  if (stage <= 3) {
    if (kind === "collect-shards") {
      return Math.round(base * 1.18) + 4;
    }
    if (kind === "defeat-enemies") {
      return Math.round(base * 1.18) + 2;
    }
    return Math.round(base * 1.16) + 6;
  }
  if (kind === "collect-shards") {
    return Math.round(base * 1.38) + 6;
  }
  if (kind === "defeat-enemies") {
    return Math.round(base * 1.34) + 3;
  }
  return Math.round(base * 1.3) + 10;
}

function createRunObjective(
  stage: number,
  time: number,
  bankedShards: number,
  enemiesDestroyed: number,
  runMode: RunMode = "infinite"
): RunObjectiveState {
  const cycle = Math.max(0, stage - 1);
  const kindIndex = cycle % 3;

  if (kindIndex === 0) {
    const target = getObjectiveTargetForStage(stage, "collect-shards", runMode);
    return {
      id: `objective-${stage}`,
      stage,
      cycle,
      kind: "collect-shards",
      title: "\u56de\u6536\u4fe1\u6807",
      description: `\u518d\u56de\u6536 ${target} \u70b9\u80fd\u91cf\u788e\u7247\uff0c\u7a33\u5b9a\u672c\u533a\u822a\u9053\u3002`,
      target,
      progress: 0,
      rewardShards: 15 + cycle * 3,
      rewardXp: 5 + Math.floor(cycle * 1.3),
      baselineTime: time,
      baselineBankedShards: bankedShards,
      baselineEnemiesDestroyed: enemiesDestroyed,
      completed: false,
      completionFlash: 0
    };
  }

  if (kindIndex === 1) {
    const target = getObjectiveTargetForStage(stage, "defeat-enemies", runMode);
    return {
      id: `objective-${stage}`,
      stage,
      cycle,
      kind: "defeat-enemies",
      title: "\u6e05\u527f\u8282\u70b9",
      description: `\u51fb\u7834 ${target} \u4e2a\u654c\u65b9\u76ee\u6807\uff0c\u538b\u4f4e\u5c40\u90e8\u5a01\u80c1\u3002`,
      target,
      progress: 0,
      rewardShards: 18 + cycle * 3,
      rewardXp: 6 + Math.floor(cycle * 1.3),
      baselineTime: time,
      baselineBankedShards: bankedShards,
      baselineEnemiesDestroyed: enemiesDestroyed,
      completed: false,
      completionFlash: 0
    };
  }

  const target = getObjectiveTargetForStage(stage, "survive", runMode);
  return {
    id: `objective-${stage}`,
    stage,
    cycle,
    kind: "survive",
    title: "\u7a33\u6001\u7ef4\u6301",
    description: `\u5b88\u4f4f\u9635\u7ebf ${target} \u79d2\uff0c\u7b49\u5f85\u56de\u6536\u94fe\u8def\u91cd\u8fde\u3002`,
    target,
    progress: 0,
    rewardShards: 17 + cycle * 4,
    rewardXp: 7 + Math.floor(cycle * 1.3),
    baselineTime: time,
    baselineBankedShards: bankedShards,
    baselineEnemiesDestroyed: enemiesDestroyed,
    completed: false,
    completionFlash: 0
  };
}

function applyWeaponArmoryMods(player: PlayerState, purchasedModIds: string[], weaponId: PlayerState["weaponId"]): PlayerState {
  const nextPlayer = { ...player };
  for (const modId of purchasedModIds) {
    const mod = weaponModDefinitions[modId as keyof typeof weaponModDefinitions];
    if (!mod || mod.weaponId !== weaponId) {
      continue;
    }
    if (mod.effects.damageMultiplier) {
      nextPlayer.damageMultiplier *= mod.effects.damageMultiplier;
    }
    if (mod.effects.fireRateMultiplier) {
      nextPlayer.fireRateMultiplier *= mod.effects.fireRateMultiplier;
    }
    if (mod.effects.projectileSpeedMultiplier) {
      nextPlayer.projectileSpeedMultiplier *= mod.effects.projectileSpeedMultiplier;
    }
    if (mod.effects.extraPierce) {
      nextPlayer.extraPierce += mod.effects.extraPierce;
    }
    if (mod.effects.extraShots) {
      nextPlayer.shotCount += mod.effects.extraShots;
    }
    if (mod.effects.projectileSizeMultiplier) {
      nextPlayer.projectileSize *= mod.effects.projectileSizeMultiplier;
    }
    if (mod.effects.explosiveShots) {
      nextPlayer.explosiveShots += mod.effects.explosiveShots;
    }
    if (mod.effects.homingStrength) {
      nextPlayer.homingStrength += mod.effects.homingStrength;
    }
  }
  return nextPlayer;
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
      objective: createRunObjective(1, 0, 0, 0, "infinite"),
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
      bossRewardChest: {
        active: false,
        claimed: false,
        position: { x: 0, y: 0 },
        radius: 48,
        rewardType: null
      },
      score: 0,
      bankedShards: 0,
      unbankedShards: 0,
      enemiesDestroyed: 0,
      offeredUpgrades: [],
      upgradeOfferSource: "level-up",
      appliedUpgrades: [],
      upgradeStacks: {},
      branchProgress: {},
      dominantBranch: null,
      activeSynergies: [],
      antiCamp: {
        anchor: { x: 640, y: 360 },
        lowMoveTime: 0,
        shotHeat: 0,
        obstacleDensity: 0,
        activeUntil: 0
      },
      queuedLevelUpAfterReward: false,
      queuedLevelUpTimer: 0,
      activeHazardTier: 0,
      bossEventTriggered: false,
      bossSpawnCount: 0,
      timeBossSpawnCount: 0,
      stageBossSpawnCount: 0,
      nextTimeBossAt: 30,
      bossCooldownUntil: 0,
      bossDefeats: 0,
      bossLegendaryCharge: 0,
      pendingBossReward: null,
      bossAlertTimer: 0,
      emergencyRepairCharges: 0,
      riskProtocolTier: 0,
      lastDamageSource: "",
      tutorialHint: "\u7528 WASD \u79fb\u52a8\uff0c\u7528\u9f20\u6807\u7784\u51c6\uff0c\u5148\u7a33\u4f4f\u9635\u811a\u7b49\u5f85\u64a4\u79bb\u7a97\u53e3\u5f00\u542f\u3002",
      screenFlash: 0,
      runSummary: null,
      runMode: "infinite",
      storyArcComplete: false,
      stageLore: null,
      pendingStageLoreQueue: [],
      stageAdvanceLocked: false,
      stageReadyToAdvance: false
    },
    meta: { ...defaultMetaState },
    rngSeed: 1337,
    nextId: 1
  };
}

export function createRunState(
  previous: SimulationState,
  weaponId?: PlayerState["weaponId"],
  runMode: RunMode = "story"
): SimulationState {
  const chosenWeapon = weaponId ?? previous.meta.unlockedWeapons[0] ?? "pulse-blaster";
  const skillRoll = randomChoice(previous.rngSeed, characterSkillPool);
  const basePlayer = applyWeaponArmoryMods(
    createPlayerState(chosenWeapon, previous.meta.dashVariantUnlocked, skillRoll.value),
    previous.meta.purchasedWeaponModIds,
    chosenWeapon
  );
  const obstacleResult = generateObstacles(previous.world.seed, previous.world.chunkSize, basePlayer.position);
  const initialBranchProgress = calculateBranchProgress({}, []);
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
      objective: createRunObjective(1, 0, 0, 0, runMode),
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
      bossRewardChest: {
        active: false,
        claimed: false,
        position: { x: 0, y: 0 },
        radius: 48,
        rewardType: null
      },
      score: 0,
      bankedShards: 0,
      unbankedShards: 0,
      enemiesDestroyed: 0,
      offeredUpgrades: [],
      upgradeOfferSource: "level-up",
      appliedUpgrades: [],
      upgradeStacks: {},
      branchProgress: initialBranchProgress,
      dominantBranch: getDominantUpgradeBranch(initialBranchProgress),
      activeSynergies: [],
      antiCamp: {
        anchor: { ...basePlayer.position },
        lowMoveTime: 0,
        shotHeat: 0,
        obstacleDensity: 0,
        activeUntil: 0
      },
      queuedLevelUpAfterReward: false,
      queuedLevelUpTimer: 0,
      activeHazardTier: 0,
      bossEventTriggered: false,
      bossSpawnCount: 0,
      timeBossSpawnCount: 0,
      stageBossSpawnCount: 0,
      nextTimeBossAt: 30,
      bossCooldownUntil: 0,
      bossDefeats: 0,
      bossLegendaryCharge: 0,
      pendingBossReward: null,
      bossAlertTimer: 0,
      emergencyRepairCharges,
      riskProtocolTier,
      lastDamageSource: "",
      tutorialHint:
        runMode === "story"
          ? `${activatedSupplies.length > 0 ? `起始补给已生效：${activatedSupplies.join(" · ")}。` : ""}战役模式：完成第 ${STORY_FINAL_STAGE} 阶段任务可通关；约 8 分钟后地图上将出现撤离信标，前往高亮区长按交互键撤离。`.trim()
          : activatedSupplies.length > 0
            ? `起始补给已生效：${activatedSupplies.join(" · ")}。先稳住第一轮阵线。`
            : "\u5148\u505a\u51fa\u7b2c\u4e00\u8f6e\u6218\u6597\u6784\u7b51\uff0c\u4e4b\u540e\u518d\u51b3\u5b9a\u662f\u7ee7\u7eed\u63a8\u8fdb\u8fd8\u662f\u64a4\u79bb\u3002",
      screenFlash: 0,
      runSummary: null,
      runMode,
      storyArcComplete: false,
      stageLore: runMode === "story" ? { stage: 1 } : null,
      pendingStageLoreQueue: [],
      stageAdvanceLocked: false,
      stageReadyToAdvance: false
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
