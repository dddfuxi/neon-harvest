export type EnemyType = "drone" | "sniper" | "brute" | "boss";
export type EliteModifier = "fast" | "volatile";

export type EnemyDefinition = {
  type: EnemyType;
  name: string;
  radius: number;
  speed: number;
  health: number;
  contactDamage: number;
  rangedCooldown?: number;
  shardDrop: number;
  xp: number;
  color: number;
};

export const enemyDefinitions: Record<EnemyType, EnemyDefinition> = {
  drone: {
    type: "drone",
    name: "Razor Drone",
    radius: 12,
    speed: 106,
    health: 38,
    contactDamage: 12,
    shardDrop: 9,
    xp: 10,
    color: 0xff728f
  },
  sniper: {
    type: "sniper",
    name: "Signal Sniper",
    radius: 13,
    speed: 72,
    health: 32,
    contactDamage: 10,
    rangedCooldown: 2.8,
    shardDrop: 12,
    xp: 13,
    color: 0xb482ff
  },
  brute: {
    type: "brute",
    name: "Siege Brute",
    radius: 18,
    speed: 58,
    health: 96,
    contactDamage: 22,
    shardDrop: 20,
    xp: 26,
    color: 0xff9c47
  },
  boss: {
    type: "boss",
    name: "Apex Harvester",
    radius: 34,
    speed: 74,
    health: 760,
    contactDamage: 32,
    rangedCooldown: 4.2,
    shardDrop: 120,
    xp: 220,
    color: 0xff445f
  }
};

export function getEnemySpawnMix(elapsed: number, theme: "skirmish" | "crossfire" | "siege" = "skirmish"): EnemyType[] {
  if (theme === "crossfire") {
    if (elapsed < 120) {
      return ["drone", "sniper"];
    }
    if (elapsed < 300) {
      return ["drone", "sniper", "sniper"];
    }
    return ["drone", "sniper", "sniper", "brute"];
  }

  if (theme === "siege") {
    if (elapsed < 120) {
      return ["drone", "brute"];
    }
    if (elapsed < 300) {
      return ["drone", "brute", "brute"];
    }
    return ["drone", "sniper", "brute", "brute"];
  }

  if (elapsed < 90) {
    return ["drone"];
  }

  if (elapsed < 210) {
    return ["drone", "sniper"];
  }

  return ["drone", "sniper", "brute"];
}
