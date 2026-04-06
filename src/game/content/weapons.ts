export type WeaponId = "pulse-blaster" | "arc-caster" | "shard-lance" | "rift-carbine" | "nova-driver";

export type WeaponModId =
  | "pulse-choke"
  | "pulse-rotor"
  | "pulse-fork"
  | "pulse-overmix"
  | "arc-feed"
  | "arc-prism"
  | "arc-breach"
  | "arc-overcurrent"
  | "lance-core"
  | "lance-rail"
  | "lance-breach"
  | "lance-fracture"
  | "rift-focus"
  | "rift-cycler"
  | "rift-tandem"
  | "rift-hunter"
  | "nova-feed"
  | "nova-spread"
  | "nova-rend"
  | "nova-bloom";

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

export type WeaponModEffect = {
  damageMultiplier?: number;
  fireRateMultiplier?: number;
  projectileSpeedMultiplier?: number;
  extraPierce?: number;
  extraShots?: number;
  projectileSizeMultiplier?: number;
  explosiveShots?: number;
  homingStrength?: number;
};

export type WeaponModDefinition = {
  id: WeaponModId;
  weaponId: WeaponId;
  tier: 1 | 2 | 3;
  slot: 0 | 1 | 2;
  title: string;
  description: string;
  cost: number;
  parents?: WeaponModId[];
  effects: WeaponModEffect;
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
      widthScale: 4.9,
      heightScale: 1.5,
      strokeWidth: 2,
      strokeAlpha: 0.36
    },
    color: 0x6cf3ff,
    traits: ["稳定", "速射", "泛用"]
  },
  "arc-caster": {
    id: "arc-caster",
    name: "电弧发射器",
    subtitle: "近距离扇面压制",
    description: "单次喷出更宽的电弧扇面，贴脸时清群和吸血都更凶，但中远距离衰减明显。",
    damage: 9,
    fireRate: 5.4,
    projectileSpeed: 500,
    projectileLife: 0.74,
    spread: 0.18,
    pierce: 2,
    obstaclePierce: 0,
    baseShotCount: 3,
    shotSpacing: 0.2,
    projectileVisual: {
      kind: "ellipse",
      widthScale: 3.7,
      heightScale: 2.35,
      strokeWidth: 2,
      strokeAlpha: 0.34
    },
    color: 0xd4ff63,
    traits: ["贴脸", "扇面", "清群"]
  },
  "shard-lance": {
    id: "shard-lance",
    name: "碎片长枪",
    subtitle: "高伤贯穿重炮",
    description: "单发威力高、弹速快，适合走巨弹、穿刺和远程点杀流派。",
    damage: 30,
    fireRate: 2,
    projectileSpeed: 840,
    projectileLife: 1.24,
    spread: 0.01,
    pierce: 3,
    obstaclePierce: 1,
    baseShotCount: 1,
    shotSpacing: 0.08,
    projectileVisual: {
      kind: "rect",
      widthScale: 8.1,
      heightScale: 1.2,
      strokeWidth: 3,
      strokeAlpha: 0.46
    },
    color: 0xffc46b,
    traits: ["高伤", "贯穿", "重炮"]
  },
  "rift-carbine": {
    id: "rift-carbine",
    name: "裂隙卡宾枪",
    subtitle: "中远距离精准追射",
    description: "高弹速、低散布、单发更扎实，适合边拉扯边点掉远处高威胁目标。",
    damage: 15,
    fireRate: 6,
    projectileSpeed: 860,
    projectileLife: 1.18,
    spread: 0.022,
    pierce: 0,
    obstaclePierce: 0,
    baseShotCount: 1,
    shotSpacing: 0.08,
    projectileVisual: {
      kind: "rect",
      widthScale: 6.2,
      heightScale: 1.12,
      strokeWidth: 3,
      strokeAlpha: 0.42
    },
    color: 0xb98cff,
    traits: ["精准", "中远距", "点杀"]
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
    pierce: 2,
    obstaclePierce: 0,
    baseShotCount: 6,
    shotSpacing: 0.21,
    projectileVisual: {
      kind: "ellipse",
      widthScale: 2.1,
      heightScale: 3.3,
      strokeWidth: 2,
      strokeAlpha: 0.3
    },
    color: 0xff6f8f,
    traits: ["爆发", "扩散", "近战"]
  }
};

export const weaponModDefinitions: Record<WeaponModId, WeaponModDefinition> = {
  "pulse-choke": {
    id: "pulse-choke",
    weaponId: "pulse-blaster",
    tier: 1,
    slot: 1,
    title: "聚焦枪膛",
    description: "基础伤害提高 12%，让脉冲炮的每一发更扎实。",
    cost: 42,
    effects: { damageMultiplier: 1.12 }
  },
  "pulse-rotor": {
    id: "pulse-rotor",
    weaponId: "pulse-blaster",
    tier: 2,
    slot: 0,
    title: "高速转子",
    description: "射速提高 12%，进一步放大稳定压制能力。",
    cost: 58,
    parents: ["pulse-choke"],
    effects: { fireRateMultiplier: 1.12 }
  },
  "pulse-fork": {
    id: "pulse-fork",
    weaponId: "pulse-blaster",
    tier: 2,
    slot: 2,
    title: "分岔线圈",
    description: "主射流额外分裂 1 发，让脉冲炮开始具备覆盖能力。",
    cost: 62,
    parents: ["pulse-choke"],
    effects: { extraShots: 1 }
  },
  "pulse-overmix": {
    id: "pulse-overmix",
    weaponId: "pulse-blaster",
    tier: 3,
    slot: 1,
    title: "过载混频",
    description: "弹速提高 10%，伤害再提高 10%，把均衡枪推成完整主力。",
    cost: 96,
    parents: ["pulse-rotor", "pulse-fork"],
    effects: { projectileSpeedMultiplier: 1.1, damageMultiplier: 1.1 }
  },
  "arc-feed": {
    id: "arc-feed",
    weaponId: "arc-caster",
    tier: 1,
    slot: 1,
    title: "电弧供弹",
    description: "射速提高 12%，近身压制的节奏更凶。",
    cost: 44,
    effects: { fireRateMultiplier: 1.12 }
  },
  "arc-prism": {
    id: "arc-prism",
    weaponId: "arc-caster",
    tier: 2,
    slot: 0,
    title: "棱镜喷口",
    description: "再分裂 1 发电弧，让扇面更宽。",
    cost: 64,
    parents: ["arc-feed"],
    effects: { extraShots: 1 }
  },
  "arc-breach": {
    id: "arc-breach",
    weaponId: "arc-caster",
    tier: 2,
    slot: 2,
    title: "穿流电针",
    description: "额外穿透 1 层，贴脸时更容易一串多。",
    cost: 60,
    parents: ["arc-feed"],
    effects: { extraPierce: 1 }
  },
  "arc-overcurrent": {
    id: "arc-overcurrent",
    weaponId: "arc-caster",
    tier: 3,
    slot: 1,
    title: "过流回路",
    description: "伤害提高 14%，弹速提高 8%，让近战压制更稳定。",
    cost: 98,
    parents: ["arc-prism", "arc-breach"],
    effects: { damageMultiplier: 1.14, projectileSpeedMultiplier: 1.08 }
  },
  "lance-core": {
    id: "lance-core",
    weaponId: "shard-lance",
    tier: 1,
    slot: 1,
    title: "穿甲弹芯",
    description: "基础伤害提高 14%，让长枪更接近重炮上限。",
    cost: 48,
    effects: { damageMultiplier: 1.14 }
  },
  "lance-rail": {
    id: "lance-rail",
    weaponId: "shard-lance",
    tier: 2,
    slot: 0,
    title: "超导轨道",
    description: "弹速提高 12%，远距点杀更利落。",
    cost: 68,
    parents: ["lance-core"],
    effects: { projectileSpeedMultiplier: 1.12 }
  },
  "lance-breach": {
    id: "lance-breach",
    weaponId: "shard-lance",
    tier: 2,
    slot: 2,
    title: "破阵尖锥",
    description: "额外穿透 1 层，把贯穿路线推得更彻底。",
    cost: 66,
    parents: ["lance-core"],
    effects: { extraPierce: 1 }
  },
  "lance-fracture": {
    id: "lance-fracture",
    weaponId: "shard-lance",
    tier: 3,
    slot: 1,
    title: "裂枪副轨",
    description: "额外分裂 1 发，并让弹体尺寸略增，形成双矛压制。",
    cost: 108,
    parents: ["lance-rail", "lance-breach"],
    effects: { extraShots: 1, projectileSizeMultiplier: 1.1 }
  },
  "rift-focus": {
    id: "rift-focus",
    weaponId: "rift-carbine",
    tier: 1,
    slot: 1,
    title: "裂隙聚焦",
    description: "基础伤害提高 12%，让每发点杀更扎实。",
    cost: 42,
    effects: { damageMultiplier: 1.12 }
  },
  "rift-cycler": {
    id: "rift-cycler",
    weaponId: "rift-carbine",
    tier: 2,
    slot: 0,
    title: "快拆循环",
    description: "射速提高 14%，更适合边拉扯边持续点杀。",
    cost: 58,
    parents: ["rift-focus"],
    effects: { fireRateMultiplier: 1.14 }
  },
  "rift-tandem": {
    id: "rift-tandem",
    weaponId: "rift-carbine",
    tier: 2,
    slot: 2,
    title: "双联裂束",
    description: "额外分裂 1 发，把精准点射扩成双束追击。",
    cost: 64,
    parents: ["rift-focus"],
    effects: { extraShots: 1 }
  },
  "rift-hunter": {
    id: "rift-hunter",
    weaponId: "rift-carbine",
    tier: 3,
    slot: 1,
    title: "猎相标定",
    description: "弹速提高 14%，并附带少量追踪修正，远距压制更稳。",
    cost: 94,
    parents: ["rift-cycler", "rift-tandem"],
    effects: { projectileSpeedMultiplier: 1.14, homingStrength: 0.08 }
  },
  "nova-feed": {
    id: "nova-feed",
    weaponId: "nova-driver",
    tier: 1,
    slot: 1,
    title: "新星供能",
    description: "射速提高 12%，爆发节奏更凶。",
    cost: 44,
    effects: { fireRateMultiplier: 1.12 }
  },
  "nova-spread": {
    id: "nova-spread",
    weaponId: "nova-driver",
    tier: 2,
    slot: 0,
    title: "簇射喷口",
    description: "再分裂 1 发，让近身喷射更像一堵火墙。",
    cost: 62,
    parents: ["nova-feed"],
    effects: { extraShots: 1 }
  },
  "nova-rend": {
    id: "nova-rend",
    weaponId: "nova-driver",
    tier: 2,
    slot: 2,
    title: "撕裂弹群",
    description: "额外穿透 1 层，贴脸爆发更容易扫穿前排。",
    cost: 60,
    parents: ["nova-feed"],
    effects: { extraPierce: 1 }
  },
  "nova-bloom": {
    id: "nova-bloom",
    weaponId: "nova-driver",
    tier: 3,
    slot: 1,
    title: "灼光绽放",
    description: "伤害提高 12%，并附带额外爆裂半径，让近战清群更夸张。",
    cost: 96,
    parents: ["nova-spread", "nova-rend"],
    effects: { damageMultiplier: 1.12, explosiveShots: 10 }
  }
};

export const weaponModTreeByWeapon: Record<WeaponId, WeaponModDefinition[]> = {
  "pulse-blaster": [
    weaponModDefinitions["pulse-choke"],
    weaponModDefinitions["pulse-rotor"],
    weaponModDefinitions["pulse-fork"],
    weaponModDefinitions["pulse-overmix"]
  ],
  "arc-caster": [
    weaponModDefinitions["arc-feed"],
    weaponModDefinitions["arc-prism"],
    weaponModDefinitions["arc-breach"],
    weaponModDefinitions["arc-overcurrent"]
  ],
  "shard-lance": [
    weaponModDefinitions["lance-core"],
    weaponModDefinitions["lance-rail"],
    weaponModDefinitions["lance-breach"],
    weaponModDefinitions["lance-fracture"]
  ],
  "rift-carbine": [
    weaponModDefinitions["rift-focus"],
    weaponModDefinitions["rift-cycler"],
    weaponModDefinitions["rift-tandem"],
    weaponModDefinitions["rift-hunter"]
  ],
  "nova-driver": [
    weaponModDefinitions["nova-feed"],
    weaponModDefinitions["nova-spread"],
    weaponModDefinitions["nova-rend"],
    weaponModDefinitions["nova-bloom"]
  ]
};
