# Neon Harvest 技能文档

本文档列出当前项目中所有玩家可获得的技能相关内容，包括：
- 局内升级技能
- 角色被动技能
- 机库局外成长

这份文档用于玩家可读说明和开发校对。修改技能定义、技能树、角色技能、图鉴或复盘逻辑时，需要同步更新本文档。

## 技能树分支

| 分支 ID | 分支名 | 用途 |
| --- | --- | --- |
| `core` | 核心火力 | 稳定提升基础输出与武器成长 |
| `barrage` | 弹幕扩展 | 增加弹数、覆盖面和清群能力 |
| `precision` | 穿透重炮 | 强化穿透、追踪、重弹和定点压制 |
| `survival` | 生存续航 | 提升护盾、机体与持续作战能力 |
| `mobility` | 机动位移 | 强化冲刺、移速、走位与吸附 |
| `economy` | 收益运营 | 提升经验、积分与长局收益 |
| `scout` | 侦测视野 | 扩大视野，提前读场 |

## 局内升级技能

| ID | 名称 | 分支 | 层级 | 稀有度 | 类型 | 前置 | 可重复 | 效果摘要 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `weapon-tuning` | 武器调校 | `core` | 1 | common | weapon | 无 | 是 | 当前武器等级 +1，提升主武器成长。 |
| `overclock-rounds` | 过载弹舱 | `core` | 1 | common | weapon | 无 | 是 | 稳定提高子弹伤害。 |
| `heat-sink` | 散热阵列 | `core` | 1 | common | weapon | 无 | 是 | 提高射速与弹速，改善持续压制。 |
| `kinetic-echo` | 穿刺回响 | `precision` | 2 | rare | weapon | `overclock-rounds` | 否 | 明显提高穿透层数，更适合直线清场和点杀。 |
| `phase-cooling` | 相位冷却 | `survival` | 1 | common | survivability | 无 | 是 | 增加护盾上限并改善护盾恢复窗口。 |
| `ion-shell` | 离子外壳 | `survival` | 1 | common | survivability | 无 | 是 | 降低承受伤害，提升贴身容错。 |
| `rapid-cycle` | 高速循环 | `barrage` | 1 | common | weapon | `heat-sink` | 是 | 进一步强化射速，适合高频弹幕流。 |
| `blink-drive` | 闪跃驱动 | `mobility` | 1 | common | mobility | 无 | 是 | 缩短冲刺冷却并提高冲刺距离。 |
| `repulsor-fins` | 斥力尾翼 | `mobility` | 1 | common | mobility | 无 | 是 | 提高移速和拾取范围。 |
| `salvage-net` | 打捞网 | `economy` | 1 | common | economy | 无 | 是 | 提高碎片转经验效率，加快成型；拾取碎片时有轻微屏幕闪烁反馈。 |
| `compound-interest` | 复利芯片 | `economy` | 2 | rare | economy | `salvage-net` | 否 | 提高局后收益，获得时立刻入账 18 点积分，偏运营路线。 |
| `pressure-core` | 压力核心 | `precision` | 3 | rare | weapon | `kinetic-echo`, `giant-core` | 否 | 撤离开启后继续增伤，鼓励贪场。 |
| `auto-forge` | 自动锻炉 | `survival` | 2 | rare | survivability | `phase-cooling` | 否 | 每次升级回复护盾，把成长与续航绑定。 |
| `lattice-armor` | 晶格装甲 | `survival` | 1 | common | survivability | 无 | 是 | 提高机体生命上限，减少破盾暴毙。 |
| `fracture-grid` | 裂隙网格 | `precision` | 3 | rare | weapon | `kinetic-echo` | 否 | 强化危险区域联动伤害；持有期间环境威胁阶段推进更快（等效 +1 阶），偏地形打法。 |
| `weapon-swap` | 电弧缓存 | `core` | 2 | rare | weapon | `heat-sink` | 否 | 将当前武器切换为 `arc-caster`。 |
| `twin-fang` | 双牙并列 | `barrage` | 1 | common | weapon | 无 | 否 | 增加并列双发，明显提高覆盖率。 |
| `triptych` | 三联祷文 | `barrage` | 2 | epic | weapon | `twin-fang` | 否 | 扇形再 +2 发（单发武器合计三联）；与双牙并列叠加为四连发。 |
| `sidewinder-rack` | 侧翼武库 | `barrage` | 3 | epic | weapon | `triptych`, `rear-array` | 否 | 解锁左右侧翼副炮，把火力铺成半包围火网。 |
| `rear-array` | 尾翼炮塔 | `barrage` | 2 | rare | weapon | `twin-fang` | 否 | 增加身后火力，适合风筝与拉扯。 |
| `catacomb-rounds` | 墓窖跳弹 | `precision` | 2 | rare | weapon | `kinetic-echo` | 否 | 子弹可在障碍间反弹；弹射后首次命中敌人获得额外伤害，地图越复杂越强。 |
| `halo-shards` | 圣环裂片 | `barrage` | 3 | epic | weapon | `triptych` | 否 | 击杀后触发裂片扩散，强化连锁清场。 |
| `supernova-heart` | 超新星心核 | `barrage` | 3 | legendary | weapon | `halo-shards`, `sidewinder-rack` | 否 | 传说弹幕核心，额外主弹、爆裂与击杀裂片同时拉满。 |
| `seeker-lens` | 追迹透镜 | `precision` | 2 | rare | weapon | `rapid-cycle` | 否 | 明显增强追踪修正，并小幅提高弹速。 |
| `giant-core` | 巨构弹核 | `precision` | 2 | epic | weapon | `overclock-rounds` | 否 | 放大弹体并提高威力，偏重炮路线。 |
| `zero-point-lattice` | 零点晶格 | `precision` | 3 | legendary | weapon | `giant-core`, `pressure-core` | 否 | 传说重炮核心，同时强化伤害、弹体、穿透与锁定。 |
| `blood-siphon` | 血虹吸 | `survival` | 2 | epic | survivability | `rapid-cycle` | 否 | 直接提供明显吸血，把输出稳定转成续航；单次回复较高时有绿色闪光提示。 |
| `aegis-surge` | 神盾奔涌 | `survival` | 3 | epic | survivability | `auto-forge`, `lattice-armor` | 否 | 同时强化护盾、生命和减伤，显著提高站场能力。 |
| `phoenix-protocol` | 不死协议 | `survival` | 3 | legendary | survivability | `blood-siphon`, `aegis-surge` | 否 | 传说续命核心，抬高血盾并额外提供一次应急修复。 |
| `ghost-shell` | 幽灵弹壳 | `barrage` | 2 | rare | weapon | `twin-fang` | 否 | 命中后触发小范围爆裂，提高群压能力。 |
| `bank-heist` | 深空劫运 | `economy` | 2 | rare | economy | `salvage-net` | 是 | 提高未结算碎片与即时积分收益；HUD 显示资源倍率、未入账碎片与劫运状态。 |
| `survey-array` | 勘测阵列 | `scout` | 1 | common | mobility | 无 | 是 | 明显扩大视野范围，让侦测收益更容易体感到。 |
| `deep-radar` | 深空雷达 | `scout` | 2 | epic | mobility | `survey-array` | 否 | 大幅拉高视野上限，在黑暗地图里会非常明显。 |
| `vector-plate` | 向矢偏转板 | `survival` | 2 | rare | survivability | `phase-cooling` | 否 | 瞄准朝向上的窄屏障，拦截敌方远程弹体；不挡近身接触。 |
| `orbit-plates` | 环轨盾阵 | `survival` | 3 | epic | survivability | `vector-plate` | 否 | 三面屏障绕机体公转拦截远程；与向矢偏转板同时持有时以本效果为准。 |
| `salvo-duel` | 对消齐射 | `core` | 2 | rare | weapon | `overclock-rounds` | 否 | 我方弹体与敌方远程弹体相撞时双方同时湮灭。 |

## 角色被动技能

| ID | 名称 | 效果 |
| --- | --- | --- |
| `phase-burst` | 相位震爆 | 冲刺结束时释放一次范围震爆，对周围敌人造成伤害。 |
| `overdrive-core` | 过载核心 | 护盾被打空后短暂进入过载状态，提高机动和射速。 |

## 机库局外成长

| ID | 名称 | 效果 |
| --- | --- | --- |
| `weapon-cache` | 实验武器架 | 解锁 `shard-lance` 与 `nova-driver`。 |
| `dash-tuning` | 冲刺调校 | 解锁更远距离的冲刺变体。 |
| `salvage-charter` | 打捞特许 | 将高收益类升级加入局内池。 |

## 起始补给

| ID | 名称 | 效果 |
| --- | --- | --- |
| `weapon-oil` | 火控校准包 | 开局武器等级 +1，只影响当前这一局的起步火力。 |
| `shield-pack` | 护盾应急包 | 开局额外恢复一段护盾，帮助前期站稳。 |
| `field-notes` | 战场记录片 | 开局获得额外经验，更快进入第一次升级。 |
| `emergency-repair` | 应急修复单元 | 本局死亡时自动抢修 1 次，把机体强行拉回战线。 |
| `risk-protocol` | 风险协议 | 本局提高威胁等级，敌群和危险区更强，但结算倍率同步上调。 |

## 技能图鉴与复盘

- 首次获得某个局内升级后，会写入 `discoveredUpgradeIds`，用于技能图鉴。
- 结算页会根据 `upgradeSequence` 渲染本轮构筑树。
- 普通升级仍然是三选一，但中后期会更容易刷新到 `rare` 与 `epic`。
- 击破首领后会立即弹出一次高阶奖励：
  - 常规首领击破：弹出偏 `epic` 的首领宝箱三选一
  - 每累计击破 3 次首领：触发一次 `legendary` 传说奖励三选一
- 结算复盘至少应包含：
  - 本轮武器与等级
  - 关键升级
  - 完成任务数
  - 击杀数
  - 存活时间
  - 到达阶段
  - 死亡原因或失败点

## 更新技能时的开发约束

修改任意技能后，至少检查以下内容：

1. `src/game/content/upgrades.ts` 或 `src/game/content/skills.ts` 的定义是否完整。
2. `src/game/simulation/engine.ts` 是否存在实际生效逻辑，避免“卡面有技能、引擎没处理”。
3. `docs/skills.md` 是否同步更新。
4. 技能树前置是否仍然可达，避免死节点。
5. 结算复盘、技能图鉴、主界面技能展示是否仍然能读到该技能。
6. 运行构建验证，并说明改动后的实际一阶影响，避免名义增益实际变弱的负面效果。
