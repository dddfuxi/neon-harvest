import type { RunObjectiveState, RunTheme } from "../simulation/types";
import { STORY_FINAL_STAGE } from "../simulation/types";

/**
 * 战役模式（story）每阶段叙事：与 objective.stage 对应，第 13 阶段起按 12 段循环。
 * 无限模式（infinite）不使用本表。
 */
export type StageLoreBlock = {
  title: string;
  /** 打字机正文（纯文本），需与局内目标/威胁呼应 */
  body: string;
};

const LORE: StageLoreBlock[] = [
  {
    title: "首轮调用",
    body: "公司管这叫「黑域打捞」：船不是来打仗的，是把散落的霓虹碎片扫进账里。回收信标亮了，HUD 里阶段目标已经写好——跟紧走。别还没入账，先把机体赔进去；这一趟点名要你，是因为**机器也会写报告，但不敢在黑域里签字**。"
  },
  {
    title: "采样变密",
    body: "第二段航程，敌影比教程区黏得多。雷达上的清剿计数不是装饰，是合约写死的 KPI。你边躲边骂：对面往你脸上堆的每一只杂兵，在系统那头都是**烧掉的 token**——它多吐一只，就多亏一截预算；你多清一只，就等于帮它把账打穿。**至少碎片是真的，能换积分也是真的。**"
  },
  {
    title: "噪声抬升",
    body: "这片区的电磁噪声像被人拧大了。你心里清楚，接下来不是「多刷几只怪」那么简单：环境威胁会跟着阶段往上抬，像有人在背后**一格一格拧紧采样率**——专门试你还会不会跑偏。"
  },
  {
    title: "围城接管",
    body: "警报跳出两个字：围城。不是形容词，是系统状态。敌群会像潮水一样堆上来，弹幕把你的走位挤成一条线。别贪回收，先活下来；**合约只认你活着时的工时**，不认你脑子里骂了多少句。"
  },
  {
    title: "清剿节律",
    body: "回收、清剿、再硬撑一段——三种任务换着来，逼你换肌肉记忆。舰内日志自动记阶段编号，那不是文学，是**风险分层**；编号越大，对面越舍得烧 token，你也越不能失手。"
  },
  {
    title: "精英刻度",
    body: "雷达把「精英」标得比谁都大。它们不是颜色亮一点的杂兵，是**高配原型**：专治你的习惯走位。合约不跟你讲公平，只要求计数清零之前别爆舰；爆了你，对面正好写一句：**人类也不过如此**。"
  },
  {
    title: "火线拉长",
    body: "交火被拉得很长，长得不像打捞，更像护送一场随时会反噬的运输。你盯着护盾和入账池，知道自己是在用操作换资源——换得到，机库里就能多一档改装；**换不到，连「人类溢价」都写不进报告**。"
  },
  {
    title: "残响关掉",
    body: "偶尔捡到旧通讯残帧，像废墟里有人在讨价还价。你顺手关掉：在黑域，共情不结算，**只有碎片和击破数会计进合约**。情绪留在船外，积分带回去；心软不算 KPI。"
  },
  {
    title: "加压前夜",
    body: "第 9 阶段战线已经拉满，雷达噪声还在叠。下一节，公司会往航迹里塞进**「同事」的复制体**——技能模型从同事的操作数据里拷出来的假货，块头比杂兵大得多。先把护盾和入账稳住：**别在验收前把自己打成异常样本**。"
  },
  {
    title: "同事副本",
    body: "HUD 锁死一个巨型热源：**结点强化同事复制体**。技能侧把同事的航迹加料重训，按副本战规则占满你的注意力——打掉它，**副本宝箱**和升级才会掉，和局内高阶奖励一条线。别把它当巡逻队长；**这是带编制的压制程序**，不是杂兵那种随便烧的 token。"
  },
  {
    title: "深度打捞",
    body: "越往深处，打捞越像赌博：收益更高，惩罚也更直。你心里清楚——再漂亮的霓虹也救不了连续失误。日志里还有一行小字没念出来：**再往下，终局会塞给你「你自己」**——技能模型攒够了你的 telemetry，就能合成**终幕复写**。"
  },
  {
    title: "战役刻度",
    body: "导航跳出「黑域节点」时，你知道这不是普通阶段结算。公司要一个结果：要么把主线做完、体面撤离，要么继续清剿把风险吃到底。最后一关若撞上**终幕·你的复写**，别愣神——**那就是最终被复制的你**，打赢了才算这一轮没被优化掉。"
  }
];

export function getStageLore(stage: number): StageLoreBlock {
  const safe = Math.max(1, Math.floor(stage));
  const idx = (safe - 1) % LORE.length;
  return LORE[idx] ?? LORE[0];
}

/** HUD 下方黄/红标注：与当前 objective、主题、关键阶段对齐 */
export function getStageLoreHudBeats(
  stage: number,
  objective: Pick<RunObjectiveState, "title" | "description" | "kind">,
  stageTheme: RunTheme
): { goal: string; amber: string | null; red: string | null } {
  const goal = `【阶段目标】${objective.title}：${objective.description}`;

  let red: string | null = null;
  let amber: string | null = null;

  if (stage === 4) {
    red =
      "【节点异变·围城】完成第 3 阶段后本区被接管为围城态：敌群加厚、弹幕加密；与公告「节点异变」一致，优先拉扯再输出。";
  } else if (stage === 7) {
    red =
      "【威胁·精英增援】完成第 6 阶段后本阶段将切入精英波（多组高威胁单位），先拆远程与爆发点。";
  } else if (stage === 10) {
    red =
      "【威胁·结点副本】完成第 9 阶段后本阶段将生成强化同事复制体（触发副本宝箱/升级），体型与血池显著高于随机遭遇的同事复制体。";
  } else if (stage === STORY_FINAL_STAGE) {
    red =
      "【黑域主线结点】完成本阶段任务即达成战役胜利条件；随后弹出抉择：撤离结算战利品，或继续清剿（与故事模式规则一致）。若已生成终幕复写体，需先击溃这具「你的镜像」。";
  }

  if (red) {
    return { goal, amber: null, red };
  }

  if (stageTheme === "siege") {
    amber = "【环境·围城】敌潮密集，杂兵多是系统在堆采样；注意走位与冲刺冷却，优先处理贴脸与侧翼，避免被弹幕封死。";
  } else if (stageTheme === "crossfire") {
    amber = "【环境·交叉火力】侧向火力增多，保持移动射击，别停在开阔区给人当靶子。";
  } else {
    amber = "【环境·遭遇】威胁逐步抬升，先保视野与生存，再追回收效率。";
  }

  if (objective.kind === "collect-shards") {
    amber = `${amber} 【行动】以回收碎片、完成信标计数为主。`;
  } else if (objective.kind === "defeat-enemies") {
    amber = `${amber} 【行动】以击破敌方单位、压低清剿计数为主。`;
  } else {
    amber = `${amber} 【行动】以坚守计时、撑过风险窗口为主。`;
  }

  return { goal, amber, red: null };
}
