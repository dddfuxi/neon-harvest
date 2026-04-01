export type WeaponId = "pulse-blaster" | "arc-caster" | "shard-lance" | "rift-carbine" | "nova-driver";

export type WeaponDefinition = {
  id: WeaponId;
  name: string;
  subtitle: string;
  description: string;
  damage: number;
  fireRate: number;
  projectileSpeed: number;
  projectileLife: number;
  spread: number;
  pierce: number;
  obstaclePierce: number;
  baseShotCount: number;
  shotSpacing: number;
  projectileVisual: {
    kind: "rect" | "ellipse";
    widthScale: number;
    heightScale: number;
    strokeWidth: number;
    strokeAlpha: number;
  };
  color: number;
  traits: string[];
};

export const weaponDefinitions: Record<WeaponId, WeaponDefinition> = {
  "pulse-blaster": {
    id: "pulse-blaster",
    name: "脉冲爆裂炮",
    subtitle: "均衡型主武器",
    description: "节奏稳定、泛用性强，适合作为大多数弹幕构筑的起点。",
    damage: 12,
    fireRate: 4.8,
    projectileSpeed: 620,
    projectileLife: 1.08,
    spread: 0.04,
    pierce: 0,
    obstaclePierce: 0,
    baseShotCount: 1,
    shotSpacing: 0.12,
    projectileVisual: {
      kind: "rect",
      widthScale: 4.2,
      heightScale: 1.7,
      strokeWidth: 1,
      strokeAlpha: 0.2
    },
    color: 0x6cf3ff,
    traits: ["稳定", "速射", "泛用"]
  },
  "arc-caster": {
    id: "arc-caster",
    name: "电弧发射器",
    subtitle: "近中距离压制",
    description: "射速快、弹幕散，适合走吸血、裂片和贴脸压制路线。",
    damage: 12,
    fireRate: 5.1,
    projectileSpeed: 570,
    projectileLife: 0.88,
    spread: 0.11,
    pierce: 1,
    obstaclePierce: 0,
    baseShotCount: 2,
    shotSpacing: 0.14,
    projectileVisual: {
      kind: "ellipse",
      widthScale: 2.9,
      heightScale: 2.05,
      strokeWidth: 1,
      strokeAlpha: 0.2
    },
    color: 0xd4ff63,
    traits: ["连射", "扩散", "清群"]
  },
  "shard-lance": {
    id: "shard-lance",
    name: "碎片长枪",
    subtitle: "高伤贯穿重炮",
    description: "单发威力高、弹速快，适合走巨弹、穿刺和远程点杀流派。",
    damage: 26,
    fireRate: 2,
    projectileSpeed: 840,
    projectileLife: 1.24,
    spread: 0.01,
    pierce: 2,
    obstaclePierce: 1,
    baseShotCount: 1,
    shotSpacing: 0.08,
    projectileVisual: {
      kind: "rect",
      widthScale: 7.4,
      heightScale: 1.35,
      strokeWidth: 2,
      strokeAlpha: 0.34
    },
    color: 0xffc46b,
    traits: ["高伤", "贯穿", "重炮"]
  },
  "rift-carbine": {
    id: "rift-carbine",
    name: "裂隙卡宾枪",
    subtitle: "中距离追射",
    description: "节奏快、散布小，适合边走位边持续输出的快节奏打法。",
    damage: 11,
    fireRate: 5.7,
    projectileSpeed: 700,
    projectileLife: 0.96,
    spread: 0.06,
    pierce: 0,
    obstaclePierce: 0,
    baseShotCount: 2,
    shotSpacing: 0.1,
    projectileVisual: {
      kind: "rect",
      widthScale: 4.8,
      heightScale: 1.55,
      strokeWidth: 1,
      strokeAlpha: 0.24
    },
    color: 0xb98cff,
    traits: ["快节奏", "中距", "压制"]
  },
  "nova-driver": {
    id: "nova-driver",
    name: "新星驱动炮",
    subtitle: "近身爆发武器",
    description: "短射程、高扩散、爆发强，适合贴身推进和裂变清群。",
    damage: 6,
    fireRate: 8.2,
    projectileSpeed: 390,
    projectileLife: 0.46,
    spread: 0.26,
    pierce: 1,
    obstaclePierce: 0,
    baseShotCount: 6,
    shotSpacing: 0.21,
    projectileVisual: {
      kind: "ellipse",
      widthScale: 1.85,
      heightScale: 3.15,
      strokeWidth: 1,
      strokeAlpha: 0.16
    },
    color: 0xff6f8f,
    traits: ["爆发", "扩散", "近战"]
  }
};
