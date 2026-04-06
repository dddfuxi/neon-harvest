import type { EliteModifier, EnemyType } from "../content/enemies";
import type { CharacterSkillId } from "../content/skills";
import type { UpgradeId } from "../content/upgrades";
import type { WeaponId, WeaponModId } from "../content/weapons";

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
  /** 最后一次非零瞄准方向（用于向矢偏转板等） */
  lastAimDirection: Vec2;
  /** 环轨盾阵公转角速度积分（弧度） */
  barrierOrbitPhase: number;
};

export type BossPattern = "artillery" | "charger" | "laser-prime";

export type HazardShape = "circle" | "beam-v" | "beam-h";

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
  /** 终幕复写体（laser-prime）：用你的航迹合成的镜像，交替纵/横激光栅格 */
  bossLaserPhase?: number;
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
  /** 已完成的障碍弹射次数（用于地穴弹壳首跳增伤） */
  obstacleRicochets?: number;
  /** 地穴弹壳：弹射后首次命中敌人是否已消耗加成 */
  catacombBonusSpent?: boolean;
  homingStrength: number;
  /** 敌方弹体：远程可被屏障拦截；近战弹体不可 */
  damageChannel?: "ranged" | "melee";
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
  /** 圆形区域半径；束状 hazard 仍保留作兼容与粗略范围 */
  radius: number;
  damagePerSecond: number;
  active: boolean;
  telegraphTime: number;
  duration: number;
  source: "storm" | "boss";
  shape?: HazardShape;
  beamHalfThickness?: number;
  beamHalfLength?: number;
};

export type HitEffectState = {
  id: string;
  position: Vec2;
  color: number;
  weaponId: WeaponId;
  kind: "spark" | "burst" | "pierce-trail" | "ricochet-flash" | "heal-glint" | "barrier-block";
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

export type UpgradeOfferSource = "level-up" | "boss-epic" | "boss-legendary";

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

export type BossRewardChestState = {
  active: boolean;
  position: Vec2;
  radius: number;
  rewardType: Exclude<UpgradeOfferSource, "level-up"> | null;
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

/** 故事模式：完成第 N 阶段主线目标后出现抉择（与引擎内判定一致） */
export const STORY_FINAL_STAGE = 12;

export type RunMode = "story" | "infinite";

export type RunSummary = {
  result: "dead" | "extracted" | "cleared";
  duration: number;
  level: number;
  weaponId: WeaponId;
  weaponLevel: number;
  riskProtocolTier: number;
  shardsBanked: number;
  enemiesDestroyed: number;
  objectivesCompleted: number;
  highestStage: number;
  buildRecap: string;
  keyUpgrades: string[];
  upgradeSequence: UpgradeId[];
  deathReason: string;
  extractionBonus: number;
};

export type SkillVoteKind = "up" | "down";

export type SkillFeedbackEntry = {
  skillId: UpgradeId;
  totalUp: number;
  totalDown: number;
  dailyUp: number;
  dailyDown: number;
  dailyDate: string;
  userVote: SkillVoteKind | null;
  userVotedToday: boolean;
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

export type PreRunSupplyId =
  | "weapon-oil"
  | "shield-pack"
  | "field-notes"
  | "emergency-repair"
  | "risk-protocol";

export type PreRunSupply = {
  id: PreRunSupplyId;
  name: string;
  description: string;
  cost: number;
  maxStock: number;
};

export type MetaUpgrade = {
  id: "weapon-cache" | "dash-tuning" | "salvage-charter";
  name: string;
  description: string;
  cost: number;
};

export type MetaProgressState = {
  credits: number;
  /** 通关印记：战役通关或故事模式高阶段撤离时获得，仅用于武器库改装 */
  armoryMarks: number;
  unlockedWeapons: WeaponId[];
  dashVariantUnlocked: boolean;
  unlockedUpgradeIds: UpgradeId[];
  purchasedWeaponModIds: WeaponModId[];
  discoveredUpgradeIds: UpgradeId[];
  skillFeedbackClientId: string;
  skillFeedback: Partial<Record<UpgradeId, SkillFeedbackEntry>>;
  supplyInventory: Partial<Record<PreRunSupplyId, number>>;
  purchases: string[];
  lastRunSummary: RunSummary | null;
  leaderboard: LeaderboardEntry[];
};

export type RunState = {
  status: "menu" | "running" | "paused" | "level-up" | "run-over" | "meta" | "story-clear-pending";
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
  bossRewardChest: BossRewardChestState;
  score: number;
  bankedShards: number;
  unbankedShards: number;
  enemiesDestroyed: number;
  offeredUpgrades: UpgradeId[];
  upgradeOfferSource: UpgradeOfferSource;
  appliedUpgrades: UpgradeId[];
  activeHazardTier: number;
  bossEventTriggered: boolean;
  bossSpawnCount: number;
  bossDefeats: number;
  bossLegendaryCharge: number;
  pendingBossReward: Exclude<UpgradeOfferSource, "level-up"> | null;
  bossAlertTimer: number;
  emergencyRepairCharges: number;
  riskProtocolTier: number;
  lastDamageSource: string;
  tutorialHint: string;
  screenFlash: number;
  runSummary: RunSummary | null;
  /** 开局选择的模式 */
  runMode: RunMode;
  /** 故事模式：主线已完成后选择「继续作战」则为 true，之后不再弹出抉择 */
  storyArcComplete: boolean;
  /** 战役叙事：存在时冻结战斗，直至玩家关闭（仅 story） */
  stageLore: null | { stage: number };
};

export type SimulationState = {
  world: { chunkSize: number; seed: number };
  run: RunState;
  meta: MetaProgressState;
  rngSeed: number;
  nextId: number;
};
