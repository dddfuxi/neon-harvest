import type { EliteModifier, EnemyType } from "../content/enemies";
import type { CharacterSkillId } from "../content/skills";
import type { UpgradeId } from "../content/upgrades";
import type { WeaponId } from "../content/weapons";

export type Vec2 = {
  x: number;
  y: number;
};

export type PlayerState = {
  position: Vec2;
  velocity: Vec2;
  radius: number;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  xp: number;
  xpLevel: number;
  xpToNext: number;
  moveSpeed: number;
  dashCooldown: number;
  dashTimer: number;
  dashDistance: number;
  weaponId: WeaponId;
  weaponLevel: number;
  weaponCooldown: number;
  weaponHeat: number;
  shieldRegenDelay: number;
  shardMagnet: number;
  damageMultiplier: number;
  fireRateMultiplier: number;
  damageReduction: number;
  extraPierce: number;
  economyMultiplier: number;
  xpMultiplier: number;
  shotCount: number;
  sideShotLevel: number;
  rearShot: boolean;
  projectileSize: number;
  projectileSpeedMultiplier: number;
  ricochetShots: number;
  explosiveShots: number;
  homingStrength: number;
  lifeSteal: number;
  killBurst: boolean;
  visionRadius: number;
  characterSkillId: CharacterSkillId;
  skillCooldown: number;
  skillEffectTimer: number;
};

export type BossPattern = "artillery" | "charger";

export type EnemyState = {
  id: string;
  type: EnemyType;
  modifier: EliteModifier | null;
  bossPattern: BossPattern | null;
  position: Vec2;
  velocity: Vec2;
  radius: number;
  hp: number;
  maxHp: number;
  fireCooldown: number;
  skillCooldown: number;
  secondaryCooldown: number;
  chargeTimer: number;
  chargeDirection: Vec2;
  touchCooldown: number;
  color: number;
};

export type ProjectileState = {
  id: string;
  source: "player" | "enemy";
  position: Vec2;
  velocity: Vec2;
  radius: number;
  life: number;
  damage: number;
  color: number;
  pierceLeft: number;
  obstaclePierceLeft: number;
  explosiveRadius: number;
  ricochetLeft: number;
  homingStrength: number;
};

export type ShardState = {
  id: string;
  position: Vec2;
  velocity: Vec2;
  value: number;
  xpValue: number;
  radius: number;
};

export type HazardState = {
  id: string;
  position: Vec2;
  radius: number;
  damagePerSecond: number;
  active: boolean;
  telegraphTime: number;
  duration: number;
  source: "storm" | "boss";
};

export type HitEffectState = {
  id: string;
  position: Vec2;
  color: number;
  weaponId: WeaponId;
  kind: "spark" | "burst" | "pierce-trail" | "ricochet-flash";
  ttl: number;
};

export type RunAnnouncement = {
  id: string;
  title: string;
  subtitle: string;
  tone: "phase" | "upgrade" | "boss";
  timer: number;
  duration: number;
};

export type ObstacleState = {
  id: string;
  chunkKey: string;
  position: Vec2;
  radius: number;
  kind: "rock" | "crystal" | "pillar";
  color: number;
  projectileResponse: "block" | "reflect";
};

export type ExtractionState = {
  unlocked: boolean;
  active: boolean;
  zoneCenter: Vec2;
  radius: number;
  holdTimer: number;
  holdDuration: number;
  rewardMultiplier: number;
};

export type RunObjectiveKind = "collect-shards" | "defeat-enemies" | "survive";
export type RunTheme = "skirmish" | "crossfire" | "siege";

export type RunObjectiveState = {
  id: string;
  stage: number;
  cycle: number;
  kind: RunObjectiveKind;
  title: string;
  description: string;
  target: number;
  progress: number;
  rewardShards: number;
  rewardXp: number;
  baselineTime: number;
  baselineBankedShards: number;
  baselineEnemiesDestroyed: number;
  completed: boolean;
  completionFlash: number;
};

export type RunSummary = {
  result: "dead" | "extracted";
  duration: number;
  level: number;
  weaponId: WeaponId;
  weaponLevel: number;
  shardsBanked: number;
  enemiesDestroyed: number;
  objectivesCompleted: number;
  highestStage: number;
  buildRecap: string;
  keyUpgrades: string[];
  deathReason: string;
  extractionBonus: number;
};

export type LeaderboardEntry = {
  id: string;
  recordedAt: number;
  playerName: string;
  weaponId: WeaponId;
  score: number;
  result: RunSummary["result"];
  duration: number;
  level: number;
  enemiesDestroyed: number;
};

export type MetaUpgrade = {
  id: "weapon-cache" | "dash-tuning" | "salvage-charter";
  name: string;
  description: string;
  cost: number;
};

export type MetaProgressState = {
  credits: number;
  unlockedWeapons: WeaponId[];
  dashVariantUnlocked: boolean;
  unlockedUpgradeIds: UpgradeId[];
  purchases: string[];
  lastRunSummary: RunSummary | null;
  leaderboard: LeaderboardEntry[];
};

export type RunState = {
  status: "menu" | "running" | "paused" | "level-up" | "run-over" | "meta";
  time: number;
  spawnAccumulator: number;
  runOverDelay: number;
  player: PlayerState;
  obstacles: ObstacleState[];
  activeChunkKeys: string[];
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  shards: ShardState[];
  hazards: HazardState[];
  hitEffects: HitEffectState[];
  announcement: RunAnnouncement | null;
  objective: RunObjectiveState;
  stageTheme: RunTheme;
  extraction: ExtractionState;
  score: number;
  bankedShards: number;
  unbankedShards: number;
  enemiesDestroyed: number;
  offeredUpgrades: UpgradeId[];
  appliedUpgrades: UpgradeId[];
  activeHazardTier: number;
  bossEventTriggered: boolean;
  bossSpawnCount: number;
  bossAlertTimer: number;
  lastDamageSource: string;
  tutorialHint: string;
  screenFlash: number;
  runSummary: RunSummary | null;
};

export type SimulationState = {
  world: { chunkSize: number; seed: number };
  run: RunState;
  meta: MetaProgressState;
  rngSeed: number;
  nextId: number;
};
