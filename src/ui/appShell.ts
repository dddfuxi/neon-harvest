import { characterSkillDefinitions } from "../game/content/skills";
import {
  queueVirtualDash,
  queueVirtualPause,
  setVirtualAim,
  setVirtualControlsEnabled,
  setVirtualFire,
  setVirtualInteract,
  setVirtualMove
} from "../game/input/virtualControls";
import { upgradeDefinitions } from "../game/content/upgrades";
import { weaponDefinitions, type WeaponId } from "../game/content/weapons";
import { type UiCommand } from "../game/simulation/engine";
import { metaUpgrades } from "../game/simulation/meta";
import { loadState, persistState } from "../game/storage/save";
import type { LeaderboardEntry, SimulationState } from "../game/simulation/types";
import { createGame } from "../phaser/createGame";

const categoryMap = {
  weapon: "武器",
  survivability: "生存",
  mobility: "机动",
  economy: "收益"
} as const;

const rarityMap = {
  common: "标准",
  rare: "稀有",
  epic: "史诗"
} as const;

export function createAppShell(root: HTMLElement): void {
  let state = loadState();
  let selectedWeapon: WeaponId = state.meta.unlockedWeapons[0] ?? "pulse-blaster";
  let onlineLeaderboard: LeaderboardEntry[] = [];
  let leaderboardNotice = "";
  let isUploadingScore = false;
  let leaderboardName = window.localStorage.getItem("neon-harvest-player-name") ?? "";
  const commandQueue: UiCommand[] = [];

  root.innerHTML = `
    <div class="shell">
      <div class="game-stage">
        <div class="game-frame">
          <div class="game-canvas" id="game-canvas"></div>
          <div class="hud-layer" id="hud-layer"></div>
          <div class="touch-layer" id="touch-layer"></div>
          <div class="orientation-layer hidden" id="orientation-layer">
            <div class="orientation-card panel">
              <strong>请横屏游玩</strong>
              <span>手机端战斗界面已改为横屏优先。旋转设备后继续。</span>
            </div>
          </div>
        </div>
        <div class="modal-layer" id="modal-layer"></div>
      </div>
    </div>
  `;

  const gameCanvas = root.querySelector<HTMLElement>("#game-canvas")!;
  const hudLayer = root.querySelector<HTMLElement>("#hud-layer")!;
  const touchLayer = root.querySelector<HTMLElement>("#touch-layer")!;
  const modalLayer = root.querySelector<HTMLElement>("#modal-layer")!;
  const orientationLayer = root.querySelector<HTMLElement>("#orientation-layer")!;

  setupTouchControls(touchLayer);

  const renderAll = (next: SimulationState) => {
    state = next;
    persistState(state);
    renderHud(hudLayer, state);
    renderModal(modalLayer, state, selectedWeapon, onlineLeaderboard, leaderboardNotice, isUploadingScore, leaderboardName);
    modalLayer.style.pointerEvents = state.run.status === "running" ? "none" : "auto";
    touchLayer.classList.toggle("active", state.run.status === "running");
    updateOrientationOverlay(orientationLayer, state.run.status === "running");
  };

  renderAll(state);
  void refreshOnlineLeaderboard(() => {
    renderAll(state);
  });

  try {
    createGame(gameCanvas, {
      getState: () => state,
      setState: (next) => {
        state = next;
      },
      flushCommands: () => commandQueue.splice(0, commandQueue.length),
      onStateChange: renderAll
    });
  } catch (error) {
    console.error("Failed to initialize Phaser runtime", error);
    gameCanvas.innerHTML = `
      <div class="runtime-fallback">
        <strong>移动端渲染初始化失败</strong>
        <span>请尝试刷新页面，或切换到 Chrome / Safari 最新版本后重试。</span>
      </div>
    `;
  }

  modalLayer.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    const commandButton = target.closest<HTMLElement>("[data-command]");
    if (commandButton) {
      const command = commandButton.dataset.command!;
      if (command === "start-run") {
        commandQueue.push({ type: "start-run", weaponId: selectedWeapon });
      } else if (command === "enter-meta") {
        commandQueue.push({ type: "enter-meta" });
      } else if (command === "exit-meta") {
        commandQueue.push({ type: "exit-meta" });
      } else if (command === "resume-run") {
        commandQueue.push({ type: "resume-run" });
      } else if (command === "exit-run") {
        commandQueue.push({ type: "exit-run" });
      } else if (command === "upload-score") {
        void uploadLatestScore();
      }
      return;
    }

    const upgradeButton = target.closest<HTMLElement>("[data-upgrade]");
    if (upgradeButton) {
      commandQueue.push({
        type: "choose-upgrade",
        upgradeId: upgradeButton.dataset.upgrade as keyof typeof upgradeDefinitions
      });
      return;
    }

    const metaUpgradeButton = target.closest<HTMLElement>("[data-meta-upgrade]");
    if (metaUpgradeButton) {
      commandQueue.push({ type: "buy-meta", upgradeId: metaUpgradeButton.dataset.metaUpgrade! });
      return;
    }

    const weaponButton = target.closest<HTMLElement>("[data-weapon]");
    if (weaponButton) {
      selectedWeapon = weaponButton.dataset.weapon as WeaponId;
      renderModal(modalLayer, state, selectedWeapon, onlineLeaderboard, leaderboardNotice, isUploadingScore, leaderboardName);
      modalLayer.style.pointerEvents = state.run.status === "running" ? "none" : "auto";
    }
  });

  modalLayer.addEventListener("input", (event) => {
    const target = event.target as HTMLInputElement | null;
    if (!target || target.dataset.field !== "leaderboard-name") {
      return;
    }
    leaderboardName = target.value.slice(0, 24);
    window.localStorage.setItem("neon-harvest-player-name", leaderboardName);
  });

  window.addEventListener("resize", () => {
    updateOrientationOverlay(orientationLayer, state.run.status === "running");
  });

  async function refreshOnlineLeaderboard(onDone?: () => void): Promise<void> {
    try {
      const response = await fetch("/api/leaderboard");
      const payload = (await response.json()) as { entries?: LeaderboardEntry[]; error?: string };
      onlineLeaderboard = Array.isArray(payload.entries) ? payload.entries : [];
      leaderboardNotice = payload.error ?? "";
    } catch {
      leaderboardNotice = "在线排行榜暂时不可用";
    } finally {
      onDone?.();
    }
  }

  async function uploadLatestScore(): Promise<void> {
    const summary = state.meta.lastRunSummary ?? state.run.runSummary;
    if (!summary || isUploadingScore) {
      return;
    }

    isUploadingScore = true;
    leaderboardNotice = "正在上传战绩...";
    renderAll(state);

    const payload: LeaderboardEntry = {
      id: `score-${summary.result}-${summary.duration}-${summary.level}-${summary.enemiesDestroyed}-${summary.shardsBanked}`,
      recordedAt: Date.now(),
      playerName: leaderboardName.trim() || "匿名回收员",
      weaponId: state.run.player.weaponId,
      score: summary.shardsBanked,
      result: summary.result,
      duration: summary.duration,
      level: summary.level,
      enemiesDestroyed: summary.enemiesDestroyed
    };

    try {
      const response = await fetch("/api/leaderboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const result = (await response.json()) as { entries?: LeaderboardEntry[]; error?: string };
      onlineLeaderboard = Array.isArray(result.entries) ? result.entries : onlineLeaderboard;
      leaderboardNotice = result.error ?? (response.ok ? "战绩已上传到在线排行榜" : "上传失败");
    } catch {
      leaderboardNotice = "上传失败，请稍后重试";
    } finally {
      isUploadingScore = false;
      renderAll(state);
    }
  }
}

function renderHud(container: HTMLElement, state: SimulationState): void {
  const shieldPercent = Math.max(0, (state.run.player.shield / state.run.player.maxShield) * 100);
  const hullPercent = Math.max(0, (state.run.player.hp / state.run.player.maxHp) * 100);
  const dashPercent =
    state.run.player.dashTimer <= 0
      ? 100
      : Math.max(0, 100 - (state.run.player.dashTimer / state.run.player.dashCooldown) * 100);
  const xpPercent = Math.max(0, (state.run.player.xp / state.run.player.xpToNext) * 100);
  const runMinutes = Math.floor(state.run.time / 60)
    .toString()
    .padStart(2, "0");
  const runSeconds = Math.floor(state.run.time % 60)
    .toString()
    .padStart(2, "0");

  container.innerHTML = `
    <div class="hud-top">
      <div class="hud-cluster">
        ${card("护盾", `${Math.max(0, Math.ceil(state.run.player.shield))}<small> / ${state.run.player.maxShield}</small>`, shieldPercent)}
        ${card("机体", `${Math.max(0, Math.ceil(state.run.player.hp))}<small> / ${state.run.player.maxHp}</small>`, hullPercent)}
        ${card("冲刺", `${state.run.player.dashTimer <= 0 ? "就绪" : `${state.run.player.dashTimer.toFixed(1)} 秒`}`, dashPercent)}
      </div>
      <div class="hud-cluster">
        ${card("武器", `${weaponDefinitions[state.run.player.weaponId].name}<small> · Lv.${state.run.player.weaponLevel}</small>`, undefined)}
        ${card("特性", characterSkillDefinitions[state.run.player.characterSkillId].name, undefined)}
        ${card("计时", `${runMinutes}:${runSeconds}`, undefined)}
      </div>
    </div>
    <div class="hud-bottom">
      <div class="panel status-strip">
        <span class="label">战局状态</span>
        <div><strong>${state.run.extraction.unlocked ? "撤离已开启" : "采集阶段进行中"}</strong></div>
        <div class="body-copy">${state.run.tutorialHint}</div>
        <div class="progress"><span style="width:${xpPercent}%"></span></div>
        <div class="body-copy">等级 ${state.run.player.xpLevel}，距离下次升级还差 ${Math.ceil(state.run.player.xpToNext - state.run.player.xp)} 点经验</div>
      </div>
      <div class="panel hint-box">
        <span class="label">操作</span>
        <div><strong>WASD</strong> 移动 · <strong>鼠标</strong> 射击 · <strong>Shift</strong> 冲刺 · <strong>E</strong> 撤离 · <strong>Esc</strong> 暂停</div>
        <div class="body-copy">已入账 ${state.run.bankedShards}，当前场上威胁 ${state.run.enemies.length} 个</div>
        <div class="body-copy">当前角色特性：${characterSkillDefinitions[state.run.player.characterSkillId].description}</div>
      </div>
    </div>
  `;
}

function renderModal(
  container: HTMLElement,
  state: SimulationState,
  selectedWeapon: WeaponId,
  onlineLeaderboard: LeaderboardEntry[],
  leaderboardNotice: string,
  isUploadingScore: boolean,
  leaderboardName: string
): void {
  const summary = state.meta.lastRunSummary ?? state.run.runSummary;
  const weapon = weaponDefinitions[selectedWeapon];

  if (state.run.status === "menu") {
    container.innerHTML = `
      <div class="menu-shell panel">
        <div class="hero-layout">
          <section class="hero-copy">
            <p class="eyebrow">Neon Harvest // Infinite Roguelite</p>
            <h1 class="hero-title">霓虹回收者</h1>
            <p class="hero-text">在无边黑域中搜集能量、拼出弹幕流派、顶住不断升级的威胁。你不是在堆数值，而是在把武器一步步改造成真正有风格的杀伤系统。</p>
            <div class="hero-actions">
              <button type="button" class="button primary launch-button" data-command="start-run">开始战局</button>
              <button type="button" class="button" data-command="enter-meta">进入机库</button>
            </div>
            <div class="build-pill-row">
              <span class="build-pill">${weapon.subtitle}</span>
              <span class="build-pill muted">${characterSkillDefinitions[state.run.player.characterSkillId].name}</span>
              ${weapon.traits.map((trait) => `<span class="build-pill muted">${trait}</span>`).join("")}
            </div>
          </section>
          <section class="demo-stage">
            ${renderCombatDemo(weapon)}
          </section>
        </div>
        <div class="menu-grid">
          <section class="panel menu-section">
            <div class="section-header">
              <span class="label">武器系统</span>
              <strong>选择开局核心</strong>
            </div>
            <div class="weapon-grid">
              ${state.meta.unlockedWeapons.map((weaponId) => renderWeaponCard(weaponId, selectedWeapon)).join("")}
            </div>
          </section>
          <section class="panel menu-section">
            <div class="section-header">
              <span class="label">构筑方向</span>
              <strong>预览几条成型路线</strong>
            </div>
            <div class="archetype-grid">
              ${renderArchetypePreview()}
            </div>
          </section>
        </div>
        <div class="menu-grid lower">
          <section class="panel menu-section">
            <div class="section-header">
              <span class="label">当前武器</span>
              <strong>${weapon.name}</strong>
            </div>
            <p class="body-copy">${weapon.description}</p>
            <div class="stat-ribbon">
              <span>伤害 ${weapon.damage}</span>
              <span>射速 ${weapon.fireRate.toFixed(1)}</span>
              <span>弹速 ${weapon.projectileSpeed}</span>
              <span>等级 Lv.${state.run.player.weaponLevel}</span>
              <span>穿透 ${weapon.pierce}</span>
            </div>
          </section>
          <section class="panel menu-section">
            <div class="section-header">
              <span class="label">最近战绩</span>
              <strong>${summary ? translateResult(summary.result) : "暂无记录"}</strong>
            </div>
            ${
              summary
                ? renderSummary(summary)
                : `<p class="body-copy">开局优先拿视野、射速或双发，先确保能在黑暗边缘及时发现敌人，再逐步补伤害和续航。</p>`
            }
          </section>
        </div>
        <section class="panel menu-section leaderboard-section">
          <div class="section-header">
            <span class="label">排行榜</span>
            <strong>本机最高回收记录</strong>
          </div>
          ${renderLeaderboard(state.meta.leaderboard)}
        </section>
        <section class="panel menu-section leaderboard-section">
          <div class="section-header">
            <span class="label">在线榜</span>
            <strong>公开战绩排行</strong>
          </div>
          ${leaderboardNotice ? `<p class="body-copy">${leaderboardNotice}</p>` : ""}
          ${renderLeaderboard(onlineLeaderboard)}
        </section>
      </div>
    `;
    return;
  }

  if (state.run.status === "level-up") {
    container.innerHTML = `
      <div class="modal-card panel">
        <p class="label">构筑升级</p>
        <h2 class="screen-title compact">选择本轮强化</h2>
        <p class="screen-subtitle">先看流派定位，再决定是补短板，还是继续把强项推到极致。</p>
        <div class="upgrade-grid rich">
          ${state.run.offeredUpgrades
            .map((upgradeId) => {
              const upgrade = upgradeDefinitions[upgradeId];
              return `
                <button type="button" class="choice-card rarity-${upgrade.rarity}" data-upgrade="${upgradeId}">
                  <div class="choice-meta">
                    <span class="rarity-pill">${rarityMap[upgrade.rarity]}</span>
                    <span class="rarity-type">${categoryMap[upgrade.category]}</span>
                  </div>
                  <h3>${upgrade.title}</h3>
                  <p>${describeUpgrade(upgrade.id)}</p>
                  <div class="tag-row">${[
                    ...upgrade.tags,
                    ...(upgrade.once ? ["单局唯一"] : [])
                  ]
                    .map((tag) => `<span class="tag">${tag}</span>`)
                    .join("")}</div>
                  <footer class="label">${upgrade.archetype}</footer>
                </button>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
    return;
  }

  if (state.run.status === "paused") {
    container.innerHTML = `
      <div class="modal-card panel">
        <p class="label">已暂停</p>
        <h2 class="screen-title compact">战术整理</h2>
        <p class="screen-subtitle">当前武器为 ${weaponDefinitions[state.run.player.weaponId].name}。下一次升级建议优先补足你现在最薄弱的那一环。</p>
        <div class="button-row">
          <button type="button" class="button primary" data-command="resume-run">继续战斗</button>
          <button type="button" class="button" data-command="exit-run">退出本局</button>
        </div>
      </div>
    `;
    return;
  }

  if (state.run.status === "meta") {
    container.innerHTML = `
      <div class="modal-card panel">
        <p class="label">机库</p>
        <h2 class="screen-title compact">永久升级</h2>
        <p class="screen-subtitle">局外强化负责开局质量，真正决定上限的，仍然是局内的路线选择和临场操作。</p>
        <div class="summary-grid">
          <div class="panel"><span class="label">积分</span><div class="value">${state.meta.credits}</div></div>
          <div class="panel"><span class="label">已解锁武器</span><div class="value">${state.meta.unlockedWeapons.length}</div></div>
          <div class="panel"><span class="label">上次结果</span><div class="value">${summary ? translateResult(summary.result) : "暂无"}</div></div>
        </div>
        <div class="panel menu-section">
          <div class="section-header">
            <span class="label">机库武器</span>
            <strong>当前已开放清单</strong>
          </div>
          <div class="weapon-grid">
            ${state.meta.unlockedWeapons.map((weaponId) => renderWeaponCard(weaponId, selectedWeapon)).join("")}
          </div>
        </div>
        <div class="panel menu-section leaderboard-section">
          <div class="section-header">
            <span class="label">排行榜</span>
            <strong>最高战绩</strong>
          </div>
          ${renderLeaderboard(state.meta.leaderboard)}
        </div>
        <div class="card-grid">
          ${metaUpgrades
            .map((upgrade) => {
              const purchased = state.meta.purchases.includes(upgrade.id);
              const afford = state.meta.credits >= upgrade.cost;
              return `
                <div class="meta-card">
                  <h3>${translateMetaName(upgrade.id, upgrade.name)}</h3>
                  <p>${translateMetaDescription(upgrade.id, upgrade.description)}</p>
                  <footer>${purchased ? "已购买" : afford ? `${upgrade.cost} 积分` : `需要 ${upgrade.cost} 积分`}</footer>
                  ${purchased ? "" : `<div class="button-row"><button type="button" class="button" data-meta-upgrade="${upgrade.id}">购买</button></div>`}
                </div>
              `;
            })
            .join("")}
        </div>
        <div class="button-row">
          <button type="button" class="button primary" data-command="exit-meta">返回主界面</button>
        </div>
      </div>
    `;
    return;
  }

  if (state.run.status === "run-over") {
    container.innerHTML = `
      <div class="modal-card panel">
        <p class="label">${state.run.runSummary?.result === "extracted" ? "成功撤离" : "机体损毁"}</p>
        <h2 class="screen-title compact">${state.run.runSummary?.result === "extracted" ? "结算完成" : "本轮失败"}</h2>
        <p class="screen-subtitle">${state.run.tutorialHint}</p>
        ${summary ? renderSummary(summary) : ""}
        <div class="panel leaderboard-section">
          <div class="section-header">
            <span class="label">排行榜</span>
            <strong>本机前十</strong>
          </div>
          ${renderLeaderboard(state.meta.leaderboard)}
        </div>
        <div class="panel leaderboard-section">
          <div class="section-header">
            <span class="label">在线榜</span>
            <strong>公开战绩排行</strong>
          </div>
          ${leaderboardNotice ? `<p class="body-copy">${leaderboardNotice}</p>` : ""}
          ${renderLeaderboard(onlineLeaderboard)}
          <label class="leaderboard-name-field">
            <span class="label">上传昵称</span>
            <input type="text" maxlength="24" value="${escapeHtml(leaderboardName)}" placeholder="输入你的名字" data-field="leaderboard-name" />
          </label>
          <div class="button-row">
            <button type="button" class="button primary" data-command="upload-score" ${isUploadingScore ? "disabled" : ""}>${isUploadingScore ? "上传中..." : "上传本局战绩"}</button>
          </div>
        </div>
        <div class="button-row">
          <button type="button" class="button primary" data-command="start-run">再来一局</button>
          <button type="button" class="button" data-command="enter-meta">前往机库</button>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = "";
}

function renderWeaponCard(weaponId: WeaponId, selectedWeapon: WeaponId): string {
  const weapon = weaponDefinitions[weaponId];
  const selected = selectedWeapon === weaponId ? "selected-card" : "";
  return `
    <button type="button" class="choice-card weapon-card ${selected}" data-weapon="${weaponId}">
      <div class="weapon-headline">
        <span class="weapon-swatch" style="background:#${weapon.color.toString(16).padStart(6, "0")}"></span>
        <div>
          <h3>${weapon.name}</h3>
          <p class="weapon-subtitle">${weapon.subtitle}</p>
        </div>
      </div>
      <p>${weapon.description}</p>
      <div class="tag-row">${weapon.traits.map((trait) => `<span class="tag">${trait}</span>`).join("")}</div>
    </button>
  `;
}

function renderArchetypePreview(): string {
  const featured = [
    ["追踪散射流", "双牙并列 + 三联祷文 + 追踪透镜", "先铺覆盖，再让追踪修正边缘目标，打起来稳定而省操作。"],
    ["爆裂清场流", "幽灵弹壳 + 圣环裂片 + 高速循环", "单点击杀会迅速扩散成一整片爆裂区，清群效率极高。"],
    ["重炮贯穿流", "巨构弹核 + 穿刺回响 + 压力核心", "低频高伤，适合远距离点掉精英和首领关键目标。"],
    ["深空侦测流", "勘测阵列 + 深空雷达 + 斥力尾翼", "先看到、先走位、先开火，用信息差换生存空间。"]
  ];

  return featured
    .map(
      ([title, combo, desc]) => `
        <article class="archetype-card">
          <h3>${title}</h3>
          <strong>${combo}</strong>
          <p>${desc}</p>
        </article>
      `
    )
    .join("");
}

function renderCombatDemo(weapon: (typeof weaponDefinitions)[WeaponId]): string {
  const color = `#${weapon.color.toString(16).padStart(6, "0")}`;
  const variantClass = `demo-variant-${weapon.id}`;
  const shotCount = weapon.id === "nova-driver" ? 6 : weapon.id === "arc-caster" ? 3 : weapon.id === "shard-lance" ? 2 : 3;
  const summary =
    weapon.id === "shard-lance"
      ? "高伤直线贯穿"
      : weapon.id === "arc-caster"
        ? "近距散射压制"
        : weapon.id === "nova-driver"
          ? "高频爆发喷射"
          : weapon.id === "rift-carbine"
            ? "中距快节奏追射"
            : "稳定连续点射";
  return `
    <div class="demo-panel ${variantClass}">
      <div class="demo-label-row">
        <span class="label">顶部演示</span>
        <span class="demo-weapon-name">${weapon.name}</span>
      </div>
      <div class="demo-battlefield">
        <div class="demo-player-core" style="--weapon-color:${color}">
          <span class="demo-core-ring"></span>
          <span class="demo-core-body"></span>
        </div>
        <div class="demo-enemy enemy-a"></div>
        <div class="demo-enemy enemy-b"></div>
        <div class="demo-enemy enemy-c"></div>
        ${Array.from({ length: shotCount }, (_, index) => {
          const shotClass = ["shot-a", "shot-b", "shot-c", "shot-d", "shot-e"][index] ?? "shot-a";
          const style = [
            `--weapon-color:${color}`,
            `--shot-width:${weapon.projectileVisual.widthScale * 9}px`,
            `--shot-height:${weapon.projectileVisual.heightScale * 4.5}px`,
            `--shot-radius:${weapon.projectileVisual.kind === "ellipse" ? "999px" : "4px"}`
          ].join(";");
          return `<div class="demo-shot ${shotClass}" style="${style}"></div>`;
        }).join("")}
        <div class="demo-impact impact-a"></div>
        <div class="demo-impact impact-b"></div>
        <div class="demo-impact impact-c"></div>
      </div>
      <div class="demo-caption">演示特征：${summary}</div>
    </div>
  `;
}

function card(labelText: string, valueText: string, percent?: number): string {
  return `
    <div class="panel stat-card">
      <span class="label">${labelText}</span>
      <div class="value">${valueText}</div>
      ${typeof percent === "number" ? `<div class="progress"><span style="width:${percent}%"></span></div>` : ""}
    </div>
  `;
}

function renderSummary(summary: NonNullable<SimulationState["meta"]["lastRunSummary"]>): string {
  return `
    <div class="summary-grid">
      <div class="panel"><span class="label">结果</span><div class="value">${translateResult(summary.result)}</div></div>
      <div class="panel"><span class="label">时长</span><div class="value">${Math.floor(summary.duration / 60)} 分</div></div>
      <div class="panel"><span class="label">等级</span><div class="value">${summary.level}</div></div>
      <div class="panel"><span class="label">击毁数</span><div class="value">${summary.enemiesDestroyed}</div></div>
      <div class="panel"><span class="label">带回积分</span><div class="value">${summary.shardsBanked}</div></div>
    </div>
  `;
}

function describeUpgrade(upgradeId: keyof typeof upgradeDefinitions): string {
  const repeatable = upgradeDefinitions[upgradeId].once ? "单局只能选一次。" : "可重复获取。";

  const descriptions: Record<keyof typeof upgradeDefinitions, string> = {
    "weapon-tuning": `当前武器等级 +1。每级提高伤害、射速和弹速。${repeatable}`,
    "overclock-rounds": `伤害 +18%。${repeatable}`,
    "heat-sink": `射速 +8%，弹速 +5%。${repeatable}`,
    "kinetic-echo": `子弹额外穿透 1 个敌人。${repeatable}`,
    "phase-cooling": `最大护盾 +20，并立刻恢复 20 点护盾。${repeatable}`,
    "ion-shell": `受到的伤害降低 12%。${repeatable}`,
    "rapid-cycle": `射速 +20%。${repeatable}`,
    "blink-drive": `冲刺冷却缩短 18%，冲刺距离 +26。${repeatable}`,
    "repulsor-fins": `移动速度 +12%，碎片吸附范围 +34。${repeatable}`,
    "salvage-net": `经验获取 +20%。${repeatable}`,
    "compound-interest": `局内收益倍率 +18%。${repeatable}`,
    "pressure-core": `撤离阶段解锁后，额外伤害倍率提高。${repeatable}`,
    "auto-forge": `选择后立刻恢复 12 点护盾。${repeatable}`,
    "lattice-armor": `最大生命 +28，并立刻恢复 28 点生命。${repeatable}`,
    "fracture-grid": `强化危险区域联动伤害。更适合围绕地形和红圈作战。${repeatable}`,
    "weapon-swap": `把当前武器切换为电弧发射器。${repeatable}`,
    "twin-fang": `额外 +1 发并列子弹。${repeatable}`,
    triptych: `最少变为三联发，但射速降低 8%。${repeatable}`,
    "rear-array": `身后追加一发自动副炮。${repeatable}`,
    "catacomb-rounds": `子弹额外获得 1 次弹射。${repeatable}`,
    "halo-shards": `击杀敌人时额外释放一圈裂片弹。${repeatable}`,
    "seeker-lens": `子弹获得追踪修正，追踪强度 +0.08。${repeatable}`,
    "giant-core": `弹体尺寸 +32%，伤害 +8%，弹速 -8%。${repeatable}`,
    "blood-siphon": `造成伤害时获得 3.5% 吸血。${repeatable}`,
    "ghost-shell": `子弹命中后附带小范围爆炸，并额外穿透 1 个敌人。${repeatable}`,
    "bank-heist": `收益倍率 +14%，经验获取 +10%。${repeatable}`,
    "survey-array": `视野范围 +70。${repeatable}`,
    "deep-radar": `视野范围 +120。${repeatable}`
  };

  return descriptions[upgradeId];
}

function renderLeaderboard(entries: LeaderboardEntry[]): string {
  if (entries.length === 0) {
    return `<p class="body-copy">还没有排行榜记录。完成一局后，这里会展示本机回收积分前十名。</p>`;
  }

  return `
    <div class="leaderboard-list">
      ${entries
        .map((entry, index) => {
          const weapon = weaponDefinitions[entry.weaponId];
          const minutes = Math.floor(entry.duration / 60)
            .toString()
            .padStart(2, "0");
          const seconds = Math.floor(entry.duration % 60)
            .toString()
            .padStart(2, "0");
          return `
            <article class="leaderboard-row">
              <div class="leaderboard-rank">#${index + 1}</div>
              <div class="leaderboard-main">
                <strong>${escapeHtml(entry.playerName || "Anonymous")}</strong>
                <span>${entry.score} 分</span>
                <span>${weapon.name} · ${entry.result === "extracted" ? "成功撤离" : "战败"}</span>
              </div>
              <div class="leaderboard-meta">
                <span>Lv.${entry.level}</span>
                <span>${entry.enemiesDestroyed} 击破</span>
                <span>${minutes}:${seconds}</span>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function translateResult(result: "dead" | "extracted"): string {
  return result === "extracted" ? "成功撤离" : "战败";
}

function translateMetaName(id: string, fallback: string): string {
  const labels: Record<string, string> = {
    "weapon-cache": "武器仓扩容",
    "dash-tuning": "冲刺调校",
    "salvage-charter": "打捞执照"
  };
  return labels[id] ?? fallback;
}

function translateMetaDescription(id: string, fallback: string): string {
  const labels: Record<string, string> = {
    "weapon-cache": "在机库中解锁碎片长枪和新星驱动炮。",
    "dash-tuning": "解锁更远距离的备用冲刺模块。",
    "salvage-charter": "让稀有收益类升级进入局内升级池。"
  };
  return labels[id] ?? fallback;
}

function setupTouchControls(container: HTMLElement): void {
  container.innerHTML = `
    <div class="touch-joystick" data-role="move-pad">
      <div class="touch-ring"></div>
      <div class="touch-thumb" data-role="move-thumb"></div>
      <span class="touch-caption">移动</span>
    </div>
    <div class="touch-aimpad" data-role="aim-pad">
      <div class="touch-ring"></div>
      <div class="touch-thumb" data-role="aim-thumb"></div>
      <span class="touch-caption">瞄准 / 射击</span>
    </div>
    <div class="touch-buttons">
      <button type="button" class="touch-button" data-touch="dash">冲刺</button>
      <button type="button" class="touch-button" data-touch="interact">撤离</button>
      <button type="button" class="touch-button" data-touch="pause">暂停</button>
    </div>
  `;

  const movePad = container.querySelector<HTMLElement>("[data-role='move-pad']")!;
  const moveThumb = container.querySelector<HTMLElement>("[data-role='move-thumb']")!;
  const aimPad = container.querySelector<HTMLElement>("[data-role='aim-pad']")!;
  const aimThumb = container.querySelector<HTMLElement>("[data-role='aim-thumb']")!;
  let movePointerId: number | null = null;
  let aimPointerId: number | null = null;

  const updatePad = (event: PointerEvent, pad: HTMLElement, thumb: HTMLElement, radius: number) => {
    const rect = pad.getBoundingClientRect();
    const centerX = rect.left + rect.width * 0.5;
    const centerY = rect.top + rect.height * 0.5;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const clamped = Math.min(radius, distance);
    const x = (dx / distance) * clamped;
    const y = (dy / distance) * clamped;
    thumb.style.transform = `translate(${x}px, ${y}px)`;
    return { x: dx / radius, y: dy / radius };
  };

  const resetThumb = (thumb: HTMLElement) => {
    thumb.style.transform = "translate(0px, 0px)";
  };

  movePad.addEventListener("pointerdown", (event) => {
    movePointerId = event.pointerId;
    movePad.setPointerCapture(event.pointerId);
    setVirtualControlsEnabled(true);
    const vector = updatePad(event, movePad, moveThumb, 42);
    setVirtualMove(normalizeVector(vector));
  });
  movePad.addEventListener("pointermove", (event) => {
    if (movePointerId !== event.pointerId) {
      return;
    }
    const vector = updatePad(event, movePad, moveThumb, 42);
    setVirtualMove(normalizeVector(vector));
  });
  movePad.addEventListener("pointerup", (event) => {
    if (movePointerId !== event.pointerId) {
      return;
    }
    movePointerId = null;
    resetThumb(moveThumb);
    setVirtualMove({ x: 0, y: 0 });
  });
  movePad.addEventListener("pointercancel", () => {
    movePointerId = null;
    resetThumb(moveThumb);
    setVirtualMove({ x: 0, y: 0 });
  });

  aimPad.addEventListener("pointerdown", (event) => {
    aimPointerId = event.pointerId;
    aimPad.setPointerCapture(event.pointerId);
    setVirtualControlsEnabled(true);
    const vector = updatePad(event, aimPad, aimThumb, 42);
    setVirtualAim(normalizeVector(vector));
    setVirtualFire(true);
  });
  aimPad.addEventListener("pointermove", (event) => {
    if (aimPointerId !== event.pointerId) {
      return;
    }
    const vector = updatePad(event, aimPad, aimThumb, 42);
    setVirtualAim(normalizeVector(vector));
    setVirtualFire(true);
  });
  const releaseAim = (pointerId: number) => {
    if (aimPointerId !== pointerId) {
      return;
    }
    aimPointerId = null;
    resetThumb(aimThumb);
    setVirtualFire(false);
  };
  aimPad.addEventListener("pointerup", (event) => {
    releaseAim(event.pointerId);
  });
  aimPad.addEventListener("pointercancel", (event) => {
    releaseAim(event.pointerId);
  });

  container.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const action = target?.dataset.touch;
    if (!action) {
      return;
    }
    setVirtualControlsEnabled(true);
    if (action === "dash") {
      queueVirtualDash();
    } else if (action === "pause") {
      queueVirtualPause();
    }
  });

  const interactButton = container.querySelector<HTMLElement>("[data-touch='interact']")!;
  interactButton.addEventListener("pointerdown", () => {
    setVirtualControlsEnabled(true);
    setVirtualInteract(true);
  });
  interactButton.addEventListener("pointerup", () => {
    setVirtualInteract(false);
  });
  interactButton.addEventListener("pointercancel", () => {
    setVirtualInteract(false);
  });
}

function normalizeVector(vector: { x: number; y: number }): { x: number; y: number } {
  const length = Math.hypot(vector.x, vector.y);
  if (length <= 0.0001) {
    return { x: 0, y: 0 };
  }
  const scale = Math.min(1, length);
  return {
    x: (vector.x / length) * scale,
    y: (vector.y / length) * scale
  };
}

function updateOrientationOverlay(container: HTMLElement, isRunning: boolean): void {
  const shouldShow =
    isRunning &&
    window.matchMedia("(pointer: coarse)").matches &&
    window.matchMedia("(orientation: portrait)").matches;
  container.classList.toggle("hidden", !shouldShow);
}
