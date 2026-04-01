import type { WeaponId } from "./weapons";

export type UpgradeCategory = "weapon" | "survivability" | "mobility" | "economy";
export type UpgradeRarity = "common" | "rare" | "epic";

export type UpgradeId =
  | "weapon-tuning"
  | "overclock-rounds"
  | "heat-sink"
  | "kinetic-echo"
  | "phase-cooling"
  | "ion-shell"
  | "rapid-cycle"
  | "blink-drive"
  | "repulsor-fins"
  | "salvage-net"
  | "compound-interest"
  | "pressure-core"
  | "auto-forge"
  | "lattice-armor"
  | "fracture-grid"
  | "weapon-swap"
  | "twin-fang"
  | "triptych"
  | "rear-array"
  | "catacomb-rounds"
  | "halo-shards"
  | "seeker-lens"
  | "giant-core"
  | "blood-siphon"
  | "ghost-shell"
  | "bank-heist"
  | "survey-array"
  | "deep-radar";

export type UpgradeDefinition = {
  id: UpgradeId;
  title: string;
  description: string;
  category: UpgradeCategory;
  rarity: UpgradeRarity;
  archetype: string;
  tags: string[];
  weight: number;
  once?: boolean;
  weaponSwapTo?: WeaponId;
};

export const upgradeDefinitions: Record<UpgradeId, UpgradeDefinition> = {
  "weapon-tuning": {
    id: "weapon-tuning",
    title: "武器调校",
    description: "当前武器提升 1 级，增加伤害、射速和弹速。可重复获取，是最直接的主武器成长手段。",
    category: "weapon",
    rarity: "common",
    archetype: "武器升级",
    tags: ["等级", "成长", "主武器"],
    weight: 1.15
  },
  "overclock-rounds": {
    id: "overclock-rounds",
    title: "过载弹仓",
    description: "子弹伤害明显提高，适合作为任何输出构筑的基础补强。",
    category: "weapon",
    rarity: "common",
    archetype: "火力底座",
    tags: ["伤害", "泛用"],
    weight: 1
  },
  "heat-sink": {
    id: "heat-sink",
    title: "散热阵列",
    description: "开火节奏更顺，射速和弹速同步改善，适合持续压制流。",
    category: "weapon",
    rarity: "common",
    archetype: "速射",
    tags: ["射速", "手感"],
    weight: 1
  },
  "kinetic-echo": {
    id: "kinetic-echo",
    title: "穿刺回响",
    description: "子弹能贯穿更多目标，适合直线清群和点线击穿。",
    category: "weapon",
    rarity: "rare",
    archetype: "贯穿",
    tags: ["穿透", "清线"],
    weight: 0.8
  },
  "phase-cooling": {
    id: "phase-cooling",
    title: "相位冷却",
    description: "提高最大护盾，并让护盾恢复窗口更宽松。",
    category: "survivability",
    rarity: "common",
    archetype: "护盾",
    tags: ["护盾", "续航"],
    weight: 1
  },
  "ion-shell": {
    id: "ion-shell",
    title: "离子外壳",
    description: "降低承受的直接伤害，适合贴身压制和险位换血。",
    category: "survivability",
    rarity: "common",
    archetype: "硬抗",
    tags: ["减伤", "近战"],
    weight: 1
  },
  "rapid-cycle": {
    id: "rapid-cycle",
    title: "高速循环",
    description: "纯粹强化射速，适合与多重、追踪和吸血联动。",
    category: "weapon",
    rarity: "common",
    archetype: "速射",
    tags: ["射速", "联动"],
    weight: 1
  },
  "blink-drive": {
    id: "blink-drive",
    title: "闪跃驱动",
    description: "冲刺更远也更频繁，方便在黑暗边缘拉扯战线。",
    category: "mobility",
    rarity: "common",
    archetype: "位移",
    tags: ["冲刺", "拉扯"],
    weight: 1
  },
  "repulsor-fins": {
    id: "repulsor-fins",
    title: "斥力尾翼",
    description: "移动速度和碎片吸附范围一起提升，滚雪球更顺手。",
    category: "mobility",
    rarity: "common",
    archetype: "机动",
    tags: ["移速", "吸附"],
    weight: 1
  },
  "salvage-net": {
    id: "salvage-net",
    title: "打捞网",
    description: "碎片转化为经验的效率更高，能更快进入成型期。",
    category: "economy",
    rarity: "common",
    archetype: "成长",
    tags: ["经验", "成型"],
    weight: 1
  },
  "compound-interest": {
    id: "compound-interest",
    title: "复利芯片",
    description: "结算收益更高，适合稳扎稳打的长局路线。",
    category: "economy",
    rarity: "rare",
    archetype: "结算",
    tags: ["积分", "收益"],
    weight: 1
  },
  "pressure-core": {
    id: "pressure-core",
    title: "压力核心",
    description: "撤离开启后伤害进一步上升，鼓励继续贪场内收益。",
    category: "weapon",
    rarity: "rare",
    archetype: "后期爆发",
    tags: ["爆发", "贪局"],
    weight: 0.7
  },
  "auto-forge": {
    id: "auto-forge",
    title: "自动锻炉",
    description: "每次升级都会回一段护盾，适合频繁升级的节奏流。",
    category: "survivability",
    rarity: "rare",
    archetype: "升级续航",
    tags: ["回盾", "升级"],
    weight: 0.8
  },
  "lattice-armor": {
    id: "lattice-armor",
    title: "晶格装甲",
    description: "提高机体耐久，避免护盾破裂后被瞬间带走。",
    category: "survivability",
    rarity: "common",
    archetype: "机体",
    tags: ["生命", "容错"],
    weight: 1
  },
  "fracture-grid": {
    id: "fracture-grid",
    title: "裂隙网格",
    description: "把危险区域变成你的伤害放大器，适合地形联动构筑。",
    category: "weapon",
    rarity: "rare",
    archetype: "场地联动",
    tags: ["地形", "陷阱"],
    weight: 0.7
  },
  "weapon-swap": {
    id: "weapon-swap",
    title: "电弧缓存",
    description: "将当前武器切换为电弧发射器，立刻转向近身压制打法。",
    category: "weapon",
    rarity: "rare",
    archetype: "武器切换",
    tags: ["换枪", "重构"],
    weight: 0.5,
    once: true,
    weaponSwapTo: "arc-caster"
  },
  "twin-fang": {
    id: "twin-fang",
    title: "双牙并列",
    description: "形成并排双发，直接提高弹幕密度和命中覆盖。",
    category: "weapon",
    rarity: "common",
    archetype: "弹幕扩张",
    tags: ["双发", "覆盖"],
    weight: 0.9
  },
  triptych: {
    id: "triptych",
    title: "三联祷文",
    description: "把弹幕扩成扇形三发，适合清群和中近距离控场。",
    category: "weapon",
    rarity: "epic",
    archetype: "扇形弹幕",
    tags: ["三连", "扇形"],
    weight: 0.65,
    once: true
  },
  "rear-array": {
    id: "rear-array",
    title: "尾翼炮塔",
    description: "自动补足身后火力，适合风筝、后撤和边打边走。",
    category: "weapon",
    rarity: "rare",
    archetype: "全向火力",
    tags: ["背射", "风筝"],
    weight: 0.7,
    once: true
  },
  "catacomb-rounds": {
    id: "catacomb-rounds",
    title: "墓窖跳弹",
    description: "子弹会在障碍之间反弹，地图越复杂收益越高。",
    category: "weapon",
    rarity: "rare",
    archetype: "地形弹道",
    tags: ["反弹", "几何"],
    weight: 0.7
  },
  "halo-shards": {
    id: "halo-shards",
    title: "圣环裂片",
    description: "击杀后炸出一圈裂片，连锁清场能力非常强。",
    category: "weapon",
    rarity: "epic",
    archetype: "击杀连锁",
    tags: ["裂片", "连锁"],
    weight: 0.6,
    once: true
  },
  "seeker-lens": {
    id: "seeker-lens",
    title: "追踪透镜",
    description: "子弹获得追踪修正，视野边缘的目标也更容易命中。",
    category: "weapon",
    rarity: "rare",
    archetype: "追踪",
    tags: ["追踪", "锁定"],
    weight: 0.7
  },
  "giant-core": {
    id: "giant-core",
    title: "巨构弹核",
    description: "弹体更大、威力更猛，适合重炮和压制流派。",
    category: "weapon",
    rarity: "epic",
    archetype: "重炮",
    tags: ["巨弹", "压制"],
    weight: 0.7
  },
  "blood-siphon": {
    id: "blood-siphon",
    title: "虹吸脉",
    description: "输出会转化为续航，适合高命中率的速射构筑。",
    category: "survivability",
    rarity: "rare",
    archetype: "吸血",
    tags: ["吸血", "续战"],
    weight: 0.65
  },
  "ghost-shell": {
    id: "ghost-shell",
    title: "幽灵弹壳",
    description: "命中后触发小范围爆裂，显著提高群体压制力。",
    category: "weapon",
    rarity: "rare",
    archetype: "爆裂",
    tags: ["爆炸", "清群"],
    weight: 0.65
  },
  "bank-heist": {
    id: "bank-heist",
    title: "深空劫运",
    description: "未结算碎片和即时积分一起上涨，适合高风险长局。",
    category: "economy",
    rarity: "rare",
    archetype: "风险收益",
    tags: ["积分", "长局"],
    weight: 0.75
  },
  "survey-array": {
    id: "survey-array",
    title: "勘测阵列",
    description: "显著扩大可视范围，让你总能先看见危险。",
    category: "mobility",
    rarity: "common",
    archetype: "视野",
    tags: ["视野", "侦测"],
    weight: 0.8
  },
  "deep-radar": {
    id: "deep-radar",
    title: "深空雷达",
    description: "进一步放大视野，是黑暗地图里最值钱的升级之一。",
    category: "mobility",
    rarity: "epic",
    archetype: "超视距",
    tags: ["视野", "探索"],
    weight: 0.55,
    once: true
  }
};

export const upgradePool = Object.values(upgradeDefinitions);
