import { defaultMetaState } from "./meta";
import { characterSkillPool } from "../content/skills";
import { distance } from "./math";
import { randomChoice, randomFloat } from "./random";
import type { PlayerState, SimulationState } from "./types";

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
    xpToNext: 45,
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

export function createInitialState(): SimulationState {
  return {
    world: { chunkSize: 480, seed: 1337 },
    run: {
      status: "menu",
      time: 0,
      spawnAccumulator: 0,
      player: createPlayerState("pulse-blaster", false, "phase-burst"),
      obstacles: [],
      activeChunkKeys: [],
      enemies: [],
      projectiles: [],
      shards: [],
      hazards: [],
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
      tutorialHint: "WASD 移动，鼠标瞄准。护盾会先承伤，8 分钟后开放撤离。",
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

  return {
    ...previous,
    rngSeed: skillRoll.seed,
    run: {
      ...previous.run,
      status: "running",
      time: 0,
      spawnAccumulator: 1.2,
      player: basePlayer,
      obstacles: obstacleResult.obstacles,
      activeChunkKeys: obstacleResult.chunkKeys,
      enemies: [],
      projectiles: [],
      shards: [],
      hazards: [],
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
      tutorialHint: "收集能量碎片，尽快做出第一轮构筑，8 分钟后再决定要不要撤离。",
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
