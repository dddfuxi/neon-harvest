import type { WeaponId } from "./weapons";

export type UpgradeCategory = "weapon" | "survivability" | "mobility" | "economy";
export type UpgradeRarity = "common" | "rare" | "epic" | "legendary";

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
  | "sidewinder-rack"
  | "rear-array"
  | "catacomb-rounds"
  | "halo-shards"
  | "supernova-heart"
  | "seeker-lens"
  | "giant-core"
  | "zero-point-lattice"
  | "blood-siphon"
  | "aegis-surge"
  | "phoenix-protocol"
  | "ghost-shell"
  | "bank-heist"
  | "survey-array"
  | "deep-radar"
  | "vector-plate"
  | "orbit-plates"
  | "salvo-duel";

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

export type UpgradeBranch =
  | "core"
  | "barrage"
  | "precision"
  | "survival"
  | "mobility"
  | "economy"
  | "scout";

export type UpgradeTreeMeta = {
  branch: UpgradeBranch;
  tier: 1 | 2 | 3;
  parents?: UpgradeId[];
  codexSummary: string;
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
    weight: 0.8,
    once: true
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
    description: "碎片转化为经验的效率更高，能更快进入成型期；拾取碎片时有轻微屏幕闪烁反馈。",
    category: "economy",
    rarity: "common",
    archetype: "成长",
    tags: ["经验", "成型"],
    weight: 1
  },
  "compound-interest": {
    id: "compound-interest",
    title: "复利芯片",
    description: "结算收益更高，获得时立刻入账 18 点积分；适合稳扎稳打的长局路线。",
    category: "economy",
    rarity: "rare",
    archetype: "结算",
    tags: ["积分", "收益"],
    weight: 1,
    once: true
  },
  "pressure-core": {
    id: "pressure-core",
    title: "压力核心",
    description: "撤离开启后伤害进一步上升，鼓励继续贪场内收益。",
    category: "weapon",
    rarity: "rare",
    archetype: "后期爆发",
    tags: ["爆发", "贪局"],
    weight: 0.7,
    once: true
  },
  "auto-forge": {
    id: "auto-forge",
    title: "自动锻炉",
    description: "每次升级都会回一段护盾，适合频繁升级的节奏流。",
    category: "survivability",
    rarity: "rare",
    archetype: "升级续航",
    tags: ["回盾", "升级"],
    weight: 0.8,
    once: true
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
    description: "把危险区域变成你的伤害放大器；持有期间环境威胁阶段推进更快（等效 +1 阶），适合地形联动构筑。",
    category: "weapon",
    rarity: "rare",
    archetype: "场地联动",
    tags: ["地形", "陷阱"],
    weight: 0.7,
    once: true
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
    weight: 0.9,
    once: true
  },
  triptych: {
    id: "triptych",
    title: "三联祷文",
    description: "扇形再 +2 发（与基础单发合计为三联）。若已拥有双牙并列，则叠加为四连发。",
    category: "weapon",
    rarity: "epic",
    archetype: "扇形弹幕",
    tags: ["三连", "扇形"],
    weight: 0.65,
    once: true
  },
  "sidewinder-rack": {
    id: "sidewinder-rack",
    title: "侧翼武库",
    description: "在主射流之外挂上双侧副炮，正面和斜侧都会同时出火，清屏效率大幅跃升。",
    category: "weapon",
    rarity: "epic",
    archetype: "侧射火网",
    tags: ["侧射", "弹幕", "清群"],
    weight: 0.56,
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
    description: "子弹会在障碍之间反弹；弹射后首次命中敌人获得额外伤害，地图越复杂收益越高。",
    category: "weapon",
    rarity: "rare",
    archetype: "地形弹道",
    tags: ["反弹", "几何"],
    weight: 0.7,
    once: true
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
  "supernova-heart": {
    id: "supernova-heart",
    title: "超新星心核",
    description: "把整套弹幕系统推到失控边缘：更多主弹、更多爆裂、更多击杀扩散，是真正的清场传说。",
    category: "weapon",
    rarity: "legendary",
    archetype: "传说弹幕",
    tags: ["传说", "清屏", "连锁"],
    weight: 0.12,
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
    weight: 0.7,
    once: true
  },
  "giant-core": {
    id: "giant-core",
    title: "巨构弹核",
    description: "弹体更大、威力更猛，适合重炮和压制流派。",
    category: "weapon",
    rarity: "epic",
    archetype: "重炮",
    tags: ["巨弹", "压制"],
    weight: 0.7,
    once: true
  },
  "zero-point-lattice": {
    id: "zero-point-lattice",
    title: "零点晶格",
    description: "将弹体压缩为极限杀伤核心，贯穿、伤害、体积与锁定同时拉高，适合把首领当成固定靶击穿。",
    category: "weapon",
    rarity: "legendary",
    archetype: "传说重炮",
    tags: ["传说", "重炮", "贯穿"],
    weight: 0.11,
    once: true
  },
  "blood-siphon": {
    id: "blood-siphon",
    title: "血虹吸",
    description: "把输出直接转成吸血续航；单次回复较高时会有绿色闪光提示，是高命中率构筑最稳定的生存核心之一。",
    category: "survivability",
    rarity: "epic",
    archetype: "吸血",
    tags: ["吸血", "续战"],
    weight: 0.52,
    once: true
  },
  "aegis-surge": {
    id: "aegis-surge",
    title: "神盾奔涌",
    description: "把护盾、机体和减伤同时抬高，属于能明显改变生存上限的史诗续航卡。",
    category: "survivability",
    rarity: "epic",
    archetype: "硬抗续战",
    tags: ["护盾", "减伤", "续航"],
    weight: 0.5,
    once: true
  },
  "phoenix-protocol": {
    id: "phoenix-protocol",
    title: "不死协议",
    description: "把机体推入超载再生态：更厚的血盾、更强的吸血和额外一次抢修机会，拿到后容错会陡增。",
    category: "survivability",
    rarity: "legendary",
    archetype: "传说续命",
    tags: ["传说", "续命", "回血"],
    weight: 0.11,
    once: true
  },
  "ghost-shell": {
    id: "ghost-shell",
    title: "幽灵弹壳",
    description: "命中后触发小范围爆裂，显著提高群体压制力。",
    category: "weapon",
    rarity: "rare",
    archetype: "爆裂",
    tags: ["爆炸", "清群"],
    weight: 0.65,
    once: true
  },
  "bank-heist": {
    id: "bank-heist",
    title: "深空劫运",
    description: "未结算碎片和即时积分一起上涨；战局 HUD 会显示资源倍率、未入账碎片与劫运状态，适合高风险长局。",
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
  },
  "vector-plate": {
    id: "vector-plate",
    title: "向矢偏转板",
    description: "在瞄准朝向上展开一道窄屏障，可拦截敌方远程弹体；无法阻挡敌人近身接触伤害。",
    category: "survivability",
    rarity: "rare",
    archetype: "定向屏障",
    tags: ["拦截", "远程"],
    weight: 0.72,
    once: true
  },
  "orbit-plates": {
    id: "orbit-plates",
    title: "环轨盾阵",
    description: "三面小型屏障绕机体公转，拦截敌方远程火力；与向矢偏转板同时持有时以环轨模式为准。无法阻挡近身攻击。",
    category: "survivability",
    rarity: "epic",
    archetype: "旋转屏障",
    tags: ["拦截", "公转"],
    weight: 0.48,
    once: true
  },
  "salvo-duel": {
    id: "salvo-duel",
    title: "对消齐射",
    description: "我方弹体与敌方远程弹体相撞时双方同时湮灭，减轻弹幕压力。",
    category: "weapon",
    rarity: "rare",
    archetype: "弹幕对消",
    tags: ["拦截", "弹幕"],
    weight: 0.68,
    once: true
  }
};

export const upgradePool = Object.values(upgradeDefinitions);

export const upgradeBranchLabels: Record<UpgradeBranch, string> = {
  core: "武器核心",
  barrage: "弹幕扩张",
  precision: "重炮精确",
  survival: "生存续航",
  mobility: "机动位移",
  economy: "收益运营",
  scout: "侦测视野"
};

export const upgradeTreeMeta: Record<UpgradeId, UpgradeTreeMeta> = {
  "weapon-tuning": { branch: "core", tier: 1, codexSummary: "当前武器等级 +1，直接提高主武器成长。" },
  "overclock-rounds": { branch: "core", tier: 1, codexSummary: "稳定提高子弹伤害，是所有输出流的底座。" },
  "heat-sink": { branch: "core", tier: 1, codexSummary: "提高射速与弹速，强化持续压制感。" },
  "kinetic-echo": { branch: "precision", tier: 2, parents: ["overclock-rounds"], codexSummary: "额外穿透敌人，适合直线清场与点杀。" },
  "phase-cooling": { branch: "survival", tier: 1, codexSummary: "最大护盾与即时护盾回复同步提高。" },
  "ion-shell": { branch: "survival", tier: 1, codexSummary: "降低承受伤害，适合高压站场。" },
  "rapid-cycle": { branch: "barrage", tier: 1, parents: ["heat-sink"], codexSummary: "大幅强化射速，推动弹幕流成型。" },
  "blink-drive": { branch: "mobility", tier: 1, codexSummary: "缩短冲刺冷却并提高冲刺距离。" },
  "repulsor-fins": { branch: "mobility", tier: 1, codexSummary: "提高移速与拾取效率，利于拉扯滚雪球。" },
  "salvage-net": { branch: "economy", tier: 1, codexSummary: "提高碎片转化效率；拾取碎片时有轻微闪光反馈。" },
  "compound-interest": { branch: "economy", tier: 2, parents: ["salvage-net"], codexSummary: "提高局后收益，获得时立刻入账积分，偏长局运营。" },
  "pressure-core": { branch: "precision", tier: 3, parents: ["kinetic-echo", "giant-core"], codexSummary: "撤离开启后火力继续提高，奖励高风险贪场。" },
  "auto-forge": { branch: "survival", tier: 2, parents: ["phase-cooling"], codexSummary: "每次升级回盾，让成长和续航绑定。" },
  "lattice-armor": { branch: "survival", tier: 1, codexSummary: "提高机体耐久，减少护盾失守后的暴毙。" },
  "fracture-grid": { branch: "precision", tier: 3, parents: ["kinetic-echo"], codexSummary: "危险区增伤并加快威胁阶段推进，强调地形联动。" },
  "weapon-swap": { branch: "core", tier: 2, parents: ["heat-sink"], codexSummary: "将当前武器重构为另一种打法核心。" },
  "twin-fang": { branch: "barrage", tier: 1, codexSummary: "并列双发，直接拉高覆盖与命中。" },
  triptych: { branch: "barrage", tier: 2, parents: ["twin-fang"], codexSummary: "扇形再 +2 发，可与双牙并列叠成四连发。" },
  "sidewinder-rack": { branch: "barrage", tier: 3, parents: ["triptych", "rear-array"], codexSummary: "挂出双侧副炮，把正面火力扩展成半包围火网。" },
  "rear-array": { branch: "barrage", tier: 2, parents: ["twin-fang"], codexSummary: "补足身后火力，适合风筝与边走边打。" },
  "catacomb-rounds": { branch: "precision", tier: 2, parents: ["kinetic-echo"], codexSummary: "障碍弹射后首段命中增伤，地图越复杂越强。" },
  "halo-shards": { branch: "barrage", tier: 3, parents: ["triptych"], codexSummary: "击杀后裂片扩散，快速形成连锁清屏。" },
  "supernova-heart": { branch: "barrage", tier: 3, parents: ["halo-shards", "sidewinder-rack"], codexSummary: "主弹、爆裂和击杀扩散一起失控，属于整局最爽的清场传说之一。" },
  "seeker-lens": { branch: "precision", tier: 2, parents: ["rapid-cycle"], codexSummary: "为弹体加入追踪修正，提升边缘命中率。" },
  "giant-core": { branch: "precision", tier: 2, parents: ["overclock-rounds"], codexSummary: "弹体更大更重，强化重炮压制感。" },
  "zero-point-lattice": { branch: "precision", tier: 3, parents: ["giant-core", "pressure-core"], codexSummary: "把重炮路线推到传说级，直接提高击穿首领和精英的能力。" },
  "blood-siphon": { branch: "survival", tier: 2, parents: ["rapid-cycle"], codexSummary: "把输出转为续航；大额回复时有绿色闪光提示。" },
  "aegis-surge": { branch: "survival", tier: 3, parents: ["auto-forge", "lattice-armor"], codexSummary: "同步强化护盾、机体和减伤，让站场上限明显抬高。" },
  "phoenix-protocol": { branch: "survival", tier: 3, parents: ["blood-siphon", "aegis-surge"], codexSummary: "提供额外抢修机会与超额生存面板，是最稳的传说续命卡。" },
  "ghost-shell": { branch: "barrage", tier: 2, parents: ["twin-fang"], codexSummary: "命中后触发小范围爆裂，强化清群效率。" },
  "bank-heist": { branch: "economy", tier: 2, parents: ["salvage-net"], codexSummary: "提高未结算收益；HUD 显示劫运与资源倍率，鼓励长局贪场。" },
  "survey-array": { branch: "scout", tier: 1, codexSummary: "扩大视野范围，让玩家更早读场。" },
  "deep-radar": { branch: "scout", tier: 2, parents: ["survey-array"], codexSummary: "进一步拉大视野，适合黑暗地图与远程打法。" },
  "vector-plate": { branch: "survival", tier: 2, parents: ["phase-cooling"], codexSummary: "瞄准朝向上的窄屏障，挡远程子弹。" },
  "orbit-plates": { branch: "survival", tier: 3, parents: ["vector-plate"], codexSummary: "三面屏障绕体旋转，挡远程子弹。" },
  "salvo-duel": { branch: "core", tier: 2, parents: ["overclock-rounds"], codexSummary: "敌我弹体相撞时相互抵消。" }
};
