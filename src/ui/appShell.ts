import { characterSkillDefinitions } from "../game/content/skills";
import { weaponModTreeByWeapon, type WeaponModId } from "../game/content/weapons";
import {
  queueVirtualDash,
  queueVirtualPause,
  setVirtualAim,
  setVirtualControlsEnabled,
  setVirtualFire,
  setVirtualInteract,
  setVirtualMove
} from "../game/input/virtualControls";
import { upgradeBranchLabels, upgradeDefinitions, upgradeTreeMeta, type UpgradeBranch, type UpgradeId } from "../game/content/upgrades";
import { weaponDefinitions, type WeaponId } from "../game/content/weapons";
import { type UiCommand } from "../game/simulation/engine";
import { armoryMarksCostForMod, metaUpgrades, preRunSupplyDefinitions } from "../game/simulation/meta";
import { clearPersistedState, loadState, persistState } from "../game/storage/save";
import {
  STORY_FINAL_STAGE,
  type LeaderboardEntry,
  type PreRunSupplyId,
  type RunMode,
  type RunSummary,
  type SimulationState,
  type SkillFeedbackEntry,
  type SkillVoteKind
} from "../game/simulation/types";
import { getStageLore, getStageLoreHudBeats } from "../game/content/stageLore";
import { createGame } from "../phaser/createGame";

type OnlineRunSession = {
  sessionId: string;
  sessionToken: string;
};

/** 传说奖励 UI 时序（与 styles 中 legendary-card-entry 时长一致） */
const LEGENDARY_REVEAL_CLICK_GUARD_MS = 220;
const LEGENDARY_CORE_AUTO_REVEAL_MS = 750;
const LEGENDARY_CARD_ENTRY_MS = 400;
const LEGENDARY_CARD_STAGGER_MS = 70;
const LEGENDARY_CHOICES_TAIL_BUFFER_MS = 80;

const categoryMap = {
  weapon: "武器",
  survivability: "生存",
  mobility: "机动",
  economy: "收益"
} as const;

const rarityMap = {
  common: "标准",
  rare: "稀有",
  epic: "史诗",
  legendary: "传说",
  mythic: "超神"
} as const;

export function createAppShell(root: HTMLElement): void {
  let state = loadState();
  let selectedWeapon: WeaponId = state.meta.unlockedWeapons[0] ?? "pulse-blaster";
  const storedRunMode = window.localStorage.getItem("neon-harvest-run-mode");
  let selectedRunMode: RunMode = storedRunMode === "story" || storedRunMode === "infinite" ? storedRunMode : "story";
  let onlineLeaderboard: LeaderboardEntry[] = [];
  let leaderboardNotice = "";
  let isUploadingScore = false;
  let leaderboardName = window.localStorage.getItem("neon-harvest-player-name") ?? "";
  let activeRunSession: OnlineRunSession | null = null;
  let legendaryRewardRevealKey: string | null = null;
  let legendaryRewardOpened = false;
  let legendaryRewardTimer: number | null = null;
  /** 传说核心界面：忽略「展开」点击，吸收从战斗带入的误触 */
  let legendaryRevealClickUnlockAt = 0;
  /** 三选一卡片：入场动画结束前不可确认 */
  let legendaryChoicesClickUnlockAt = 0;
  let legendaryModalRefreshTimer: number | null = null;
  const pendingSkillFeedback = new Set<UpgradeId>();
  const commandQueue: UiCommand[] = [];
  let loreTwStage = 0;
  let loreTwPos = 0;
  let loreTwFull = "";
  let loreTwTimer: ReturnType<typeof setInterval> | null = null;

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

  const scheduleLegendaryChoicesUnlock = (offerCount: number) => {
    const stagger = Math.max(0, offerCount - 1) * LEGENDARY_CARD_STAGGER_MS;
    legendaryChoicesClickUnlockAt = Date.now() + stagger + LEGENDARY_CARD_ENTRY_MS + LEGENDARY_CHOICES_TAIL_BUFFER_MS;
    scheduleLegendaryModalRefresh();
  };

  const scheduleLegendaryModalRefresh = () => {
    if (legendaryModalRefreshTimer !== null) {
      window.clearTimeout(legendaryModalRefreshTimer);
      legendaryModalRefreshTimer = null;
    }
    const now = Date.now();
    const nextUnlock = Math.min(
      legendaryRevealClickUnlockAt > now ? legendaryRevealClickUnlockAt : Number.POSITIVE_INFINITY,
      legendaryChoicesClickUnlockAt > now ? legendaryChoicesClickUnlockAt : Number.POSITIVE_INFINITY
    );
    if (!Number.isFinite(nextUnlock) || nextUnlock === Number.POSITIVE_INFINITY) {
      return;
    }
    legendaryModalRefreshTimer = window.setTimeout(() => {
      legendaryModalRefreshTimer = null;
      if (state.run.status === "level-up" && state.run.upgradeOfferSource === "boss-legendary") {
        rerenderModal();
        scheduleLegendaryModalRefresh();
      }
    }, Math.max(0, nextUnlock - now) + 20);
  };

  const rerenderModal = () => {
    const previousMenuShell = modalLayer.querySelector<HTMLElement>(".menu-shell");
    const previousScrollTop = previousMenuShell?.scrollTop ?? 0;
    renderModal(
      modalLayer,
      state,
      selectedWeapon,
      selectedRunMode,
      onlineLeaderboard,
      leaderboardNotice,
      isUploadingScore,
      leaderboardName,
      pendingSkillFeedback,
      legendaryRewardOpened,
      legendaryRevealClickUnlockAt,
      legendaryChoicesClickUnlockAt
    );
    const nextMenuShell = modalLayer.querySelector<HTMLElement>(".menu-shell");
    if (nextMenuShell) {
      nextMenuShell.scrollTop = previousScrollTop;
    }
  };

  const syncLegendaryRewardReveal = () => {
    // 必须与公告无关：announcement 数秒后会清空，若 key 含 announcement.id 会突变并重置「核心析出」→ 同一次奖励打开两次。
    const nextKey =
      state.run.status === "level-up" && state.run.upgradeOfferSource === "boss-legendary"
        ? `boss-legendary:${state.run.offeredUpgrades.join(",")}`
        : null;

    if (!nextKey) {
      legendaryRewardRevealKey = null;
      legendaryRewardOpened = false;
      legendaryRevealClickUnlockAt = 0;
      legendaryChoicesClickUnlockAt = 0;
      if (legendaryRewardTimer !== null) {
        window.clearTimeout(legendaryRewardTimer);
        legendaryRewardTimer = null;
      }
      if (legendaryModalRefreshTimer !== null) {
        window.clearTimeout(legendaryModalRefreshTimer);
        legendaryModalRefreshTimer = null;
      }
      return;
    }

    if (legendaryRewardRevealKey === nextKey) {
      return;
    }

    legendaryRewardRevealKey = nextKey;
    legendaryRewardOpened = false;
    legendaryRevealClickUnlockAt = Date.now() + LEGENDARY_REVEAL_CLICK_GUARD_MS;
    legendaryChoicesClickUnlockAt = 0;
    if (legendaryRewardTimer !== null) {
      window.clearTimeout(legendaryRewardTimer);
    }
    legendaryRewardTimer = window.setTimeout(() => {
      if (legendaryRewardRevealKey !== nextKey || legendaryRewardOpened) {
        return;
      }
      legendaryRewardOpened = true;
      scheduleLegendaryChoicesUnlock(state.run.offeredUpgrades.length);
      rerenderModal();
    }, LEGENDARY_CORE_AUTO_REVEAL_MS);
    scheduleLegendaryModalRefresh();
  };

  const syncStageLoreTypewriter = () => {
    if (!state.run.stageLore || state.run.status !== "running") {
      if (loreTwTimer !== null) {
        clearInterval(loreTwTimer);
        loreTwTimer = null;
      }
      loreTwStage = 0;
      loreTwPos = 0;
      loreTwFull = "";
      return;
    }
    const st = state.run.stageLore.stage;
    const full = getStageLore(st).body;
    if (st !== loreTwStage) {
      if (loreTwTimer !== null) {
        clearInterval(loreTwTimer);
        loreTwTimer = null;
      }
      loreTwStage = st;
      loreTwPos = 0;
      loreTwFull = full;
      const tick = () => {
        loreTwPos += 1;
        const node = hudLayer.querySelector<HTMLElement>("#stage-lore-type-text");
        if (node) {
          node.textContent = loreTwFull.slice(0, loreTwPos);
        }
        if (loreTwPos >= loreTwFull.length) {
          if (loreTwTimer !== null) {
            clearInterval(loreTwTimer);
            loreTwTimer = null;
          }
        }
      };
      loreTwTimer = window.setInterval(tick, 28);
      tick();
    } else {
      const node = hudLayer.querySelector<HTMLElement>("#stage-lore-type-text");
      if (node && loreTwFull.length > 0) {
        node.textContent = loreTwFull.slice(0, loreTwPos);
      }
    }
  };

  const renderAll = (next: SimulationState) => {
    state = next;
    persistState(state);
    const touchUiActive = shouldUseTouchUi();
    syncLegendaryRewardReveal();
    renderHud(hudLayer, state);
    syncStageLoreTypewriter();
    renderTouchFeedback(touchLayer, state);
    rerenderModal();
    modalLayer.style.pointerEvents = state.run.status === "running" || isDeathTransitionActive(state) ? "none" : "auto";
    touchLayer.classList.toggle("active", state.run.status === "running" && touchUiActive && !state.run.stageLore);
    updateOrientationOverlay(orientationLayer, state.run.status === "running");
  };

  renderAll(state);
  void refreshOnlineLeaderboard(() => {
    renderAll(state);
  });
  void refreshSkillFeedback(() => {
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

  hudLayer.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-hud-command]");
    if (!btn || btn.dataset.hudCommand !== "dismiss-stage-lore") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    commandQueue.push({ type: "dismiss-stage-lore" });
  });

  window.addEventListener("keydown", (event) => {
    if (state.run.status !== "running" || !state.run.stageLore) {
      return;
    }
    if (event.code === "Escape" || event.code === "Space") {
      event.preventDefault();
      commandQueue.push({ type: "dismiss-stage-lore" });
    }
  });

  modalLayer.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    const commandButton = target.closest<HTMLElement>("[data-command]");
    if (commandButton) {
      const command = commandButton.dataset.command!;
      if (command === "start-run") {
        void beginOnlineRunSession(selectedWeapon);
        commandQueue.push({ type: "start-run", weaponId: selectedWeapon, runMode: selectedRunMode });
      } else if (command === "story-post-continue") {
        commandQueue.push({ type: "choose-story-post-clear", choice: "continue" });
      } else if (command === "story-post-settle") {
        commandQueue.push({ type: "choose-story-post-clear", choice: "settle" });
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
      } else if (command === "reveal-legendary-reward") {
        if (Date.now() < legendaryRevealClickUnlockAt) {
          return;
        }
        legendaryRewardOpened = true;
        if (legendaryRewardTimer !== null) {
          window.clearTimeout(legendaryRewardTimer);
          legendaryRewardTimer = null;
        }
        scheduleLegendaryChoicesUnlock(state.run.offeredUpgrades.length);
        rerenderModal();
      } else if (command === "reset-save") {
        const confirmed = window.confirm("这会清除本地进度、机库改装、图鉴和排行榜。确定要重新开始吗？");
        if (!confirmed) {
          return;
        }
        clearPersistedState();
        state = loadState();
        selectedWeapon = state.meta.unlockedWeapons[0] ?? "pulse-blaster";
        legendaryRewardRevealKey = null;
        legendaryRewardOpened = false;
        legendaryRevealClickUnlockAt = 0;
        legendaryChoicesClickUnlockAt = 0;
        if (legendaryRewardTimer !== null) {
          window.clearTimeout(legendaryRewardTimer);
          legendaryRewardTimer = null;
        }
        if (legendaryModalRefreshTimer !== null) {
          window.clearTimeout(legendaryModalRefreshTimer);
          legendaryModalRefreshTimer = null;
        }
        renderAll(state);
      }
      return;
    }

    const skillVoteButton = target.closest<HTMLElement>("[data-skill-vote]");
    if (skillVoteButton) {
      if (
        state.run.status === "level-up" &&
        state.run.upgradeOfferSource === "boss-legendary" &&
        legendaryRewardOpened &&
        Date.now() < legendaryChoicesClickUnlockAt
      ) {
        return;
      }
      const skillId = skillVoteButton.dataset.skillId as UpgradeId | undefined;
      const vote = skillVoteButton.dataset.skillVote as SkillVoteKind | undefined;
      if (skillId && vote) {
        void submitSkillVote(skillId, vote);
      }
      return;
    }

    const upgradeButton = target.closest<HTMLElement>("[data-upgrade]");
    if (upgradeButton) {
      if (
        state.run.status === "level-up" &&
        state.run.upgradeOfferSource === "boss-legendary" &&
        Date.now() < legendaryChoicesClickUnlockAt
      ) {
        return;
      }
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

    const weaponModButton = target.closest<HTMLElement>("[data-weapon-mod]");
    if (weaponModButton) {
      commandQueue.push({
        type: "buy-weapon-mod",
        weaponId: weaponModButton.dataset.weaponId as WeaponId,
        modId: weaponModButton.dataset.weaponMod as WeaponModId
      });
      return;
    }

    const supplyButton = target.closest<HTMLElement>("[data-supply]");
    if (supplyButton) {
      commandQueue.push({ type: "buy-supply", supplyId: supplyButton.dataset.supply as PreRunSupplyId });
      return;
    }

    const runModeButton = target.closest<HTMLElement>("[data-run-mode]");
    if (runModeButton) {
      const mode = runModeButton.dataset.runMode as RunMode | undefined;
      if (mode === "story" || mode === "infinite") {
        selectedRunMode = mode;
        window.localStorage.setItem("neon-harvest-run-mode", mode);
        rerenderModal();
        modalLayer.style.pointerEvents = state.run.status === "running" || isDeathTransitionActive(state) ? "none" : "auto";
      }
      return;
    }

    const weaponButton = target.closest<HTMLElement>("[data-weapon]");
    if (weaponButton) {
      selectedWeapon = weaponButton.dataset.weapon as WeaponId;
      rerenderModal();
      modalLayer.style.pointerEvents = state.run.status === "running" || isDeathTransitionActive(state) ? "none" : "auto";
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

  function applySkillFeedbackEntries(entries: SkillFeedbackEntry[]): void {
    state = {
      ...state,
      meta: {
        ...state.meta,
        skillFeedback: Object.fromEntries(entries.map((entry) => [entry.skillId, entry])) as SimulationState["meta"]["skillFeedback"]
      }
    };
  }

  async function refreshSkillFeedback(onDone?: () => void): Promise<void> {
    try {
      const response = await fetch(`/api/skill-feedback?clientId=${encodeURIComponent(state.meta.skillFeedbackClientId)}`);
      const payload = (await response.json()) as { entries?: SkillFeedbackEntry[] };
      if (Array.isArray(payload.entries)) {
        applySkillFeedbackEntries(payload.entries);
      }
    } catch {
      return;
    } finally {
      onDone?.();
    }
  }

  async function submitSkillVote(skillId: UpgradeId, vote: SkillVoteKind): Promise<void> {
    if (pendingSkillFeedback.has(skillId)) {
      return;
    }

    pendingSkillFeedback.add(skillId);
    renderAll(state);

    try {
      const response = await fetch("/api/skill-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          skillId,
          vote,
          clientId: state.meta.skillFeedbackClientId
        })
      });
      const payload = (await response.json()) as { entries?: SkillFeedbackEntry[] };
      if (response.ok && Array.isArray(payload.entries)) {
        applySkillFeedbackEntries(payload.entries);
      }
    } catch {
      return;
    } finally {
      pendingSkillFeedback.delete(skillId);
      renderAll(state);
    }
  }

  async function beginOnlineRunSession(weaponId: WeaponId): Promise<void> {
    activeRunSession = null;
    try {
      const response = await fetch("/api/leaderboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "start",
          weaponId
        })
      });
      const payload = (await response.json()) as { sessionId?: string; sessionToken?: string; error?: string };
      if (response.ok && payload.sessionId && payload.sessionToken) {
        activeRunSession = {
          sessionId: payload.sessionId,
          sessionToken: payload.sessionToken
        };
        leaderboardNotice = "";
        return;
      }
      leaderboardNotice = payload.error ?? "在线排行榜会话创建失败";
    } catch {
      leaderboardNotice = "在线排行榜会话创建失败";
    }
  }

  async function uploadLatestScore(): Promise<void> {
    const summary = state.meta.lastRunSummary ?? state.run.runSummary;
    if (!summary || isUploadingScore) {
      return;
    }
    if (!activeRunSession) {
      leaderboardNotice = "本局未建立在线会话，无法上传战绩";
      renderAll(state);
      return;
    }

    isUploadingScore = true;
    leaderboardNotice = "正在上传战绩...";
    renderAll(state);

    try {
      const response = await fetch("/api/leaderboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "submit",
          sessionId: activeRunSession.sessionId,
          sessionToken: activeRunSession.sessionToken,
          playerName: leaderboardName.trim() || "匿名回收员",
          summary
        })
      });
      const result = (await response.json()) as { entries?: LeaderboardEntry[]; error?: string };
      onlineLeaderboard = Array.isArray(result.entries) ? result.entries : onlineLeaderboard;
      leaderboardNotice = result.error ?? (response.ok ? "战绩已上传到在线排行榜" : "上传失败");
      if (response.ok) {
        activeRunSession = null;
      }
    } catch {
      leaderboardNotice = "上传失败，请稍后重试";
    } finally {
      isUploadingScore = false;
      renderAll(state);
    }
    return;
    /*

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
    */
  }
}

function renderStageLoreOverlay(state: SimulationState): string {
  if (!state.run.stageLore || state.run.status !== "running") {
    return "";
  }
  const st = state.run.stageLore.stage;
  const { title } = getStageLore(st);
  const beats = getStageLoreHudBeats(st, state.run.objective, state.run.stageTheme);
  const amberBlock = beats.amber
    ? `<p class="stage-lore-beat stage-lore-beat--amber">${escapeHtml(beats.amber)}</p>`
    : "";
  const redBlock = beats.red
    ? `<p class="stage-lore-beat stage-lore-beat--danger">${escapeHtml(beats.red)}</p>`
    : "";
  return `
    <div class="stage-lore-overlay" role="dialog" aria-modal="true">
      <div class="stage-lore-panel panel">
        <p class="label">阶段 ${st} · 黑域记录</p>
        <h3 class="stage-lore-title">${escapeHtml(title)}</h3>
        <p class="stage-lore-body" id="stage-lore-type-text"></p>
        <div class="stage-lore-beats" aria-label="本阶段目标与威胁提示">
          <p class="stage-lore-beat stage-lore-beat--goal">${escapeHtml(beats.goal)}</p>
          ${redBlock}
          ${amberBlock}
        </div>
        <p class="stage-lore-hint body-copy">空格 / Esc 或点击继续 · 关闭后恢复战斗</p>
        <button type="button" class="button primary stage-lore-continue" data-hud-command="dismiss-stage-lore">继续</button>
      </div>
    </div>
  `;
}

function renderEconomyHudStrip(state: SimulationState): string {
  const p = state.run.player;
  const tagged =
    state.run.appliedUpgrades.includes("bank-heist") ||
    state.run.appliedUpgrades.includes("compound-interest") ||
    state.run.appliedUpgrades.includes("salvage-net");
  if (!tagged && p.economyMultiplier <= 1.001 && p.xpMultiplier <= 1.001) {
    return "";
  }
  const parts = [`转化×${p.economyMultiplier.toFixed(2)}`, `经验×${p.xpMultiplier.toFixed(2)}`, `未入账 ${state.run.unbankedShards}`];
  if (state.run.appliedUpgrades.includes("bank-heist")) {
    parts.push("劫运已生效");
  }
  return `<div class="economy-hud-strip"><span class="label">资源倍率</span><div class="body-copy">${parts.join(" · ")}</div></div>`;
}

function renderExtractionHudStrip(state: SimulationState): string {
  if (!state.run.extraction.unlocked) {
    return "";
  }
  if (state.run.status !== "running" && state.run.status !== "story-clear-pending") {
    return "";
  }
  return `<div class="extraction-hud-strip"><span class="label">撤离信标</span><div class="body-copy">已上线 — 前往地图高亮区，长按 <strong>E</strong> / 交互键撤离</div></div>`;
}

function renderHud(container: HTMLElement, state: SimulationState): void {
  if (state.run.status === "menu" || state.run.status === "meta") {
    container.innerHTML = "";
    return;
  }

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
  const announcementMarkup = state.run.announcement ? renderAnnouncement(state.run.announcement) : "";
  if (isMobileLandscapeHud()) {
    container.innerHTML = `
      ${announcementMarkup}
      <div class="mobile-hud">
        <div class="panel mobile-vitals">
          <div class="mobile-bar-group">
            <span class="label">护盾</span>
            <div class="progress compact"><span style="width:${shieldPercent}%"></span></div>
          </div>
          <div class="mobile-bar-group">
            <span class="label">机体</span>
            <div class="progress compact hull"><span style="width:${hullPercent}%"></span></div>
          </div>
        </div>
        <div class="panel mobile-runtime">
          <div class="mobile-runtime-main">${runMinutes}:${runSeconds}</div>
          <div class="body-copy">${characterSkillDefinitions[state.run.player.characterSkillId].name}</div>
        </div>
        ${renderExtractionHudStrip(state)}
        ${renderEconomyHudStrip(state)}
      </div>
      ${renderStageLoreOverlay(state)}
    `;
    return;
  }

  container.innerHTML = `
    ${announcementMarkup}
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
      ${renderExtractionHudStrip(state)}
      <div class="panel status-strip">
        <span class="label">战局状态</span>
        <div><strong>${state.run.extraction.unlocked ? "撤离已开启" : "采集阶段进行中"}</strong></div>
        <div class="body-copy">${state.run.tutorialHint}</div>
        ${renderEconomyHudStrip(state)}
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
    ${renderStageLoreOverlay(state)}
  `;
}

function renderAnnouncement(announcement: SimulationState["run"]["announcement"]): string {
  if (!announcement) {
    return "";
  }

  const progress = Math.max(0, Math.min(1, announcement.timer / Math.max(0.001, announcement.duration)));
  const phaseClass = announcement.tone === "phase" ? " objective-banner" : "";
  return `<div class="announcement-banner${phaseClass} tone-${announcement.tone}" style="--announcement-progress:${progress.toFixed(3)}">
      <strong>${announcement.title}</strong>
      <span>${announcement.subtitle}</span>
    </div>`;
}

function renderModal(
  container: HTMLElement,
  state: SimulationState,
  selectedWeapon: WeaponId,
  selectedRunMode: RunMode,
  onlineLeaderboard: LeaderboardEntry[],
  leaderboardNotice: string,
  isUploadingScore: boolean,
  leaderboardName: string,
  pendingSkillFeedback: ReadonlySet<UpgradeId>,
  legendaryRewardOpened: boolean,
  legendaryRevealClickUnlockAt: number,
  legendaryChoicesClickUnlockAt: number
): void {
  const summary = state.meta.lastRunSummary ?? state.run.runSummary;
  const weapon = weaponDefinitions[selectedWeapon];

  if (isDeathTransitionActive(state)) {
    container.innerHTML = "";
    return;
  }

  if (state.run.status === "menu") {
    container.innerHTML = `
      <div class="menu-shell panel">
        <div class="hero-layout">
          <section class="hero-copy">
            <p class="eyebrow">Neon Harvest // 黑域打捞 · Roguelite</p>
            <h1 class="hero-title">霓虹回收者</h1>
            <p class="hero-text">在黑域里打捞霓虹碎片、拼出你的弹幕流派；威胁会随阶段与采样一起涨，杂兵只是系统烧掉的 token。你不是在堆面板，而是在把主武器拧成有签名感的杀伤回路——让人类这一侧的操作，还能压过技能模型拷出来的假货。</p>
            <div class="hero-actions">
              <button type="button" class="button primary launch-button" data-command="start-run">开始战局</button>
              <button type="button" class="button" data-command="enter-meta">进入机库</button>
            </div>
            <div class="run-mode-picker">
              <span class="label">合约模式</span>
              <div class="run-mode-buttons">
                <button type="button" class="button ${selectedRunMode === "story" ? "primary" : ""}" data-run-mode="story">战役</button>
                <button type="button" class="button ${selectedRunMode === "infinite" ? "primary" : ""}" data-run-mode="infinite">清剿</button>
              </div>
              <p class="body-copy run-mode-hint">战役：每阶段有黑域叙事，单阶段目标量高于清剿；途中会遭遇技能模型拷出来的<strong>同事复制体</strong>，进入第 ${STORY_FINAL_STAGE} 阶段时会面对<strong>终幕·你的复写</strong>。完成该阶段主线后可撤离结算或继续清剿。清剿：规则与撤离一致，不播放阶段叙事，节奏更偏纯清场。</p>
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
          <section class="panel menu-section current-weapon-section">
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
            ${renderPreRunSupplies(state, "compact")}
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
          <details class="leaderboard-fold">
            <summary class="leaderboard-fold-summary">
              <div class="section-header">
                <span class="label">排行榜</span>
                <strong>本机最高回收记录</strong>
              </div>
            </summary>
            ${renderLeaderboard(state.meta.leaderboard)}
          </details>
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
    const discovered = new Set(state.meta.discoveredUpgradeIds);
    const firstEncounterIds = state.run.offeredUpgrades.filter((id) => !discovered.has(id));
    const isLegendaryReward = state.run.upgradeOfferSource === "boss-legendary";
    const offerTitle =
      state.run.upgradeOfferSource === "boss-legendary"
        ? "传说核心析出"
        : state.run.upgradeOfferSource === "boss-epic"
          ? "副本宝箱开启"
          : "选择本轮强化";
    const offerSubtitle =
      state.run.upgradeOfferSource === "boss-legendary"
        ? "这是三次复制体讨伐后的传说奖励。三选一，拿到就是整局质变。"
        : state.run.upgradeOfferSource === "boss-epic"
          ? "复制体核心崩解后会掉出高阶奖励，本次至少会看到稀有和史诗。"
          : "先看流派定位，再决定是补短板，还是继续把强项推到极致。";
    const shouldShowLegendaryCore = isLegendaryReward && !legendaryRewardOpened;
    const revealInputLocked = Boolean(shouldShowLegendaryCore && Date.now() < legendaryRevealClickUnlockAt);
    const choicesInputLocked = Boolean(
      isLegendaryReward && legendaryRewardOpened && Date.now() < legendaryChoicesClickUnlockAt
    );
    container.innerHTML = `
      <div class="modal-card panel ${isLegendaryReward ? "legendary-reward-panel" : ""}">
        <p class="label">${state.run.upgradeOfferSource === "level-up" ? "构筑升级" : "副本奖励"}</p>
        <h2 class="screen-title compact">${offerTitle}</h2>
        <p class="screen-subtitle">${offerSubtitle}</p>
        ${
          shouldShowLegendaryCore
            ? `
              <button type="button" class="legendary-core-reveal ${revealInputLocked ? "legendary-core-reveal--locked" : ""}" data-command="reveal-legendary-reward" ${revealInputLocked ? "disabled" : ""}>
                <div class="legendary-core-shell">
                  <div class="legendary-core-orbit orbit-a"></div>
                  <div class="legendary-core-orbit orbit-b"></div>
                  <div class="legendary-core-heart"></div>
                  <div class="legendary-core-glow"></div>
                </div>
                <strong>传说核心正在析出</strong>
                <span>${revealInputLocked ? "正在屏蔽误触，稍后可点击展开…" : "约 0.75 秒后自动展开；亦可点击展开"}</span>
              </button>
            `
            : `
              <div class="upgrade-grid rich ${isLegendaryReward ? "legendary-reward-grid" : "upgrade-choice-cards--enter"}">
                ${state.run.offeredUpgrades
                  .map((upgradeId, index) => {
                    const upgrade = upgradeDefinitions[upgradeId];
                    return `
                      <article class="choice-card rarity-${upgrade.rarity} ${isLegendaryReward ? "legendary-reward-card" : ""} ${firstEncounterIds.includes(upgradeId) ? "choice-card--first-encounter" : ""}" style="${isLegendaryReward ? `--entry-delay:${index * LEGENDARY_CARD_STAGGER_MS}ms` : `--enter-stagger:${index * 65}ms`}">
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
                        ${renderSkillFeedbackControls(state, upgrade.id, pendingSkillFeedback.has(upgrade.id), "compact")}
                        <footer class="label">${upgrade.archetype}</footer>
                        <div class="button-row">
                          <button type="button" class="button primary choice-confirm-button" data-upgrade="${upgradeId}" ${choicesInputLocked ? "disabled" : ""}>${choicesInputLocked ? "入场动画中…" : "选择强化"}</button>
                        </div>
                        ${firstEncounterIds.includes(upgradeId) ? `<span class="first-obtain-badge">首次获取</span>` : ""}
                      </article>
                    `;
                  })
                  .join("")}
              </div>
            `
        }
      </div>
    `;
    return;
  }

  if (state.run.status === "story-clear-pending") {
    container.innerHTML = `
      <div class="modal-card panel story-clear-modal">
        <p class="label">黑域节点</p>
        <h2 class="screen-title compact">主线已完成</h2>
        <p class="screen-subtitle">战役阶段目标已全部达成——这一轮<strong>人类席位</strong>暂时保住了。可撤离并结算战利品，或继续在本区清剿（威胁与采样会持续加码）。撤离信标已上线时，也可前往高亮区长按交互键撤离。</p>
        <div class="button-row">
          <button type="button" class="button primary" data-command="story-post-continue">继续作战</button>
          <button type="button" class="button" data-command="story-post-settle">撤离结算</button>
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
        <p class="screen-subtitle">机库里的改装是你的<strong>人类资产底牌</strong>，拉高开局质量；真正跟技能模型对线的，仍是局内构筑与临场操作。</p>
        <div class="summary-grid">
          <div class="panel"><span class="label">积分</span><div class="value">${state.meta.credits}</div></div>
          <div class="panel"><span class="label">通关印记</span><div class="value">${state.meta.armoryMarks ?? 0}</div></div>
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
        ${renderWeaponArmoryTree(state, selectedWeapon)}
        ${renderSkillCodex(state, pendingSkillFeedback)}
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
          <button type="button" class="button" data-command="reset-save">清空本地存档</button>
          <button type="button" class="button primary" data-command="exit-meta">返回主界面</button>
        </div>
      </div>
    `;
    return;
  }

  if (state.run.status === "run-over") {
    const runResult = state.run.runSummary?.result;
    const runOverLabel =
      runResult === "extracted" ? "成功撤离" : runResult === "cleared" ? "战役通关" : "机体损毁";
    const runOverTitle =
      runResult === "extracted" ? "结算完成" : runResult === "cleared" ? "胜利结算" : "本轮失败";
    container.innerHTML = `
      <div class="modal-card panel">
        <p class="label">${runOverLabel}</p>
        <h2 class="screen-title compact">${runOverTitle}</h2>
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

function renderWeaponArmoryTree(state: SimulationState, weaponId: WeaponId): string {
  const mods = weaponModTreeByWeapon[weaponId];
  const purchased = new Set(state.meta.purchasedWeaponModIds);
  const weapon = weaponDefinitions[weaponId];

  return `
    <section class="panel menu-section armory-section">
      <div class="section-header">
        <span class="label">武器库改装</span>
        <strong>${weapon.name} 改装树</strong>
      </div>
      <p class="body-copy">每个改装节点只能兑换一次，消耗<strong>通关印记</strong>（战役通关结算，或故事模式推进至第 12 阶段后成功撤离）。解锁后作为局外永久改装，使用该武器开局时直接生效。</p>
      <div class="armory-tree-grid">
        ${mods
          .map((mod) => {
            const bought = purchased.has(mod.id);
            const unlocked = !mod.parents || mod.parents.every((parentId) => purchased.has(parentId));
            const markCost = armoryMarksCostForMod(mod);
            const marks = state.meta.armoryMarks ?? 0;
            const afford = marks >= markCost;
            const disabled = bought || !unlocked || !afford;
            const stateLabel = bought ? "已改装" : unlocked ? (afford ? `${markCost} 印记` : `需要 ${markCost} 印记`) : "需要前置改装";
            return `
              <article class="armory-node tier-${mod.tier} ${bought ? "purchased" : unlocked ? "available" : "locked"}">
                <span class="armory-node-tier">T${mod.tier}</span>
                <h3>${mod.title}</h3>
                <p>${mod.description}</p>
                <div class="tag-row">
                  ${mod.parents?.map((parentId) => `<span class="tag">前置 ${weaponModTreeByWeapon[weaponId].find((entry) => entry.id === parentId)?.title ?? parentId}</span>`).join("") ?? ""}
                </div>
                <footer>${stateLabel}</footer>
                <div class="button-row">
                  <button type="button" class="button ${bought ? "" : "primary"}" data-weapon-id="${weaponId}" data-weapon-mod="${mod.id}" ${disabled ? "disabled" : ""}>
                    ${bought ? "已完成" : "执行改装"}
                  </button>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderPreRunSupplies(state: SimulationState, layout: "full" | "compact" = "full"): string {
  const stocked = preRunSupplyDefinitions.filter((supply) => (state.meta.supplyInventory[supply.id] ?? 0) > 0);
  const compact = layout === "compact";

  return `
    <section class="${compact ? "armory-inline-section" : "panel menu-section"}">
      <div class="section-header">
        <span class="label">起始补给</span>
        <strong>${compact ? "补给备货" : "用积分换开局底子"}</strong>
      </div>
      <p class="body-copy">${compact ? "补给会在下一局开始时自动消耗 1 份并生效。" : "补给只在开局生效，每局开始时自动消耗 1 份，不改变整局上限，只帮你把前期站稳。"}</p>
      ${
        stocked.length > 0
          ? `<div class="build-pill-row">${stocked
              .map((supply) => `<span class="build-pill">${supply.name} x${state.meta.supplyInventory[supply.id] ?? 0}</span>`)
              .join("")}</div>`
          : `<p class="body-copy">当前没有库存。先备货，下一局开始时会自动结算并生效。</p>`
      }
      <div class="${compact ? "compact-supply-grid" : "card-grid"}">
        ${preRunSupplyDefinitions
          .map((supply) => {
            const stock = state.meta.supplyInventory[supply.id] ?? 0;
            const full = stock >= supply.maxStock;
            const afford = state.meta.credits >= supply.cost;
            const disabled = full || !afford;
            const footer = full ? `库存已满 ${stock}/${supply.maxStock}` : afford ? `${supply.cost} 积分` : `需要 ${supply.cost} 积分`;
            return `
              <div class="meta-card ${compact ? "compact-supply-card" : ""}">
                <h3>${supply.name}</h3>
                <p>${supply.description}</p>
                <footer>${footer}</footer>
                <div class="stat-ribbon">
                  <span>库存 ${stock}/${supply.maxStock}</span>
                  <span>开局自动消耗</span>
                </div>
                <div class="button-row ${compact ? "compact-button-row" : ""}">
                  <button type="button" class="button" data-supply="${supply.id}" ${disabled ? "disabled" : ""}>${full ? "已备满" : "购买补给"}</button>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderArchetypePreview(): string {
  const featured = [
    ["追踪散射流", "双牙并列 + 三联祷文 + 追踪透镜", "先铺覆盖，再让追踪修正边缘目标，打起来稳定而省操作。"],
    ["爆裂清场流", "幽灵弹壳 + 圣环裂片 + 高速循环", "单点击杀会迅速扩散成一整片爆裂区，清群效率极高。"],
    ["重炮贯穿流", "巨构弹核 + 穿刺回响 + 压力核心", "低频高伤，适合远距离点掉精英和复制体关键目标。"],
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
        ? "贴脸扇面压制"
        : weapon.id === "nova-driver"
          ? "高频爆发喷射"
          : weapon.id === "rift-carbine"
            ? "中远距精准追射"
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
  const weapon = weaponDefinitions[summary.weaponId] ?? weaponDefinitions["pulse-blaster"];
  const minutes = Math.floor(summary.duration / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(summary.duration % 60)
    .toString()
    .padStart(2, "0");
  const keyUpgradeTags = ((summary.keyUpgrades ?? []).length > 0 ? summary.keyUpgrades : ["基础火力推进"])
    .map((upgrade) => `<span class="tag">${upgrade}</span>`)
    .join("");
  return `
    <div class="summary-grid">
      <div class="panel"><span class="label">结果</span><div class="value">${translateResult(summary.result)}</div></div>
      <div class="panel"><span class="label">本轮武器</span><div class="value">${weapon.name}<small> / Lv.${summary.weaponLevel ?? 1}</small></div></div>
      <div class="panel"><span class="label">存活时间</span><div class="value">${minutes}:${seconds}</div></div>
      <div class="panel"><span class="label">到达阶段</span><div class="value">第 ${summary.highestStage ?? 1} 阶段</div></div>
      <div class="panel"><span class="label">完成任务数</span><div class="value">${summary.objectivesCompleted ?? 0}</div></div>
      <div class="panel"><span class="label">击杀数</span><div class="value">${summary.enemiesDestroyed}</div></div>
      <div class="panel"><span class="label">回收积分</span><div class="value">${summary.shardsBanked}</div></div>
      <div class="panel"><span class="label">失败点</span><div class="value">${summary.deathReason ?? "未记录"}</div></div>
    </div>
    <div class="panel recap-card">
      <span class="label">本轮构筑回顾</span>
      <div class="body-copy">${summary.buildRecap ?? "本轮记录来自旧版本存档。"}</div>
      <div class="tag-row">${keyUpgradeTags}</div>
    </div>
    ${renderRunSkillTree(summary)}
  `;
}

function describeUpgrade(upgradeId: keyof typeof upgradeDefinitions): string {
  const repeatable = upgradeDefinitions[upgradeId].once ? "单局只能选一次。" : "可重复获取。";

  const descriptions: Record<keyof typeof upgradeDefinitions, string> = {
    "weapon-tuning": `当前武器等级 +1。每级提高伤害、射速和弹速。${repeatable}`,
    "overclock-rounds": `伤害 +18%。${repeatable}`,
    "heat-sink": `射速 +8%，弹速 +5%。${repeatable}`,
    "kinetic-echo": `子弹额外穿透 2 个敌人。${repeatable}`,
    "phase-cooling": `最大护盾 +20，并立刻恢复 20 点护盾。${repeatable}`,
    "ion-shell": `受到的伤害降低 12%。${repeatable}`,
    "rapid-cycle": `射速 +20%。${repeatable}`,
    "blink-drive": `冲刺冷却缩短 18%，冲刺距离 +26。${repeatable}`,
    "repulsor-fins": `移动速度 +12%，碎片吸附范围 +34。${repeatable}`,
    "salvage-net": `经验获取 +20%；拾取碎片时有轻微屏幕闪烁反馈。${repeatable}`,
    "compound-interest": `局内收益倍率 +18%；获得时立刻将 18 点积分记入已入账池。${repeatable}`,
    "pressure-core": `立刻获得 6% 伤害和 4% 弹速加成；撤离开启后再额外提高伤害。${repeatable}`,
    "auto-forge": `最大护盾 +10，立刻恢复 18 点护盾；之后每次升级再恢复 18 点护盾。${repeatable}`,
    "lattice-armor": `最大生命 +28，并立刻恢复 28 点生命。${repeatable}`,
    "fracture-grid": `现有危险区立刻扩大并增强伤害；身处危险区内的敌人额外承受 14% 子弹伤害；持有期间环境威胁阶段推进更快（等效 +1 阶）。${repeatable}`,
    "weapon-swap": `把当前武器切换为电弧发射器。${repeatable}`,
    "twin-fang": `额外 +1 发并列子弹。${repeatable}`,
    triptych: `扇形再 +2 发（单发武器上合计为三联）；与双牙并列叠加可达四连发。射速降低 8%。${repeatable}`,
    "sidewinder-rack": `额外解锁左右两侧副炮，射速 +8%，弹速 +4%。${repeatable}`,
    "rear-array": `身后追加一发自动副炮。${repeatable}`,
    "catacomb-rounds": `子弹额外获得 1 次弹射；障碍弹射后首次命中敌人的伤害 +22%。${repeatable}`,
    "halo-shards": `击杀敌人时额外释放一圈裂片弹。${repeatable}`,
    "supernova-heart": `额外 +2 发主弹，射速 +15%，爆裂半径提升，并强制开启击杀裂片。${repeatable}`,
    "seeker-lens": `子弹追踪强度 +0.22，弹速 +6%，边缘目标更容易命中。${repeatable}`,
    "giant-core": `弹体尺寸 +32%，伤害 +8%，弹速 -8%。${repeatable}`,
    "zero-point-lattice": `伤害 +35%，弹体尺寸 +22%，弹速 +8%，额外穿透 +2，并附带少量追踪。${repeatable}`,
    "blood-siphon": `造成伤害时获得 5% 吸血；单次回复较高时会在机体位置显示绿色闪光。${repeatable}`,
    "aegis-surge": `最大护盾 +34，立刻回盾 34，最大生命 +24，减伤 +8%。${repeatable}`,
    "phoenix-protocol": `最大生命 +56，最大护盾 +40，吸血 +4%，减伤 +10%，并额外获得 1 次应急修复。${repeatable}`,
    "ghost-shell": `子弹命中后附带小范围爆炸，并额外穿透 1 个敌人。${repeatable}`,
    "bank-heist": `收益倍率 +14%，经验获取 +10%；战局 HUD 会显示未入账碎片、资源倍率与「劫运已生效」。${repeatable}`,
    "survey-array": `视野范围 +95。${repeatable}`,
    "deep-radar": `视野范围 +155。${repeatable}`,
    "vector-plate": `在瞄准朝向上展开窄屏障，拦截敌方远程弹体；不挡近身接触。${repeatable}`,
    "orbit-plate-1": `第一面屏障绕机体公转；可再叠至三面。与向矢偏转板可同时存在（向矢仍为瞄准窄条，互不替代）。${repeatable}`,
    "orbit-plate-2": `第二面屏障加入公转，覆盖更大角度。${repeatable}`,
    "orbit-plate-3": `第三面屏障，环轨三面封顶。${repeatable}`,
    "ricochet-aegis": `环轨段变赤红并反弹远程弹。段数随环轨阶位；无阶位时 1 段环绕。向矢偏转板仍保留为瞄准窄条。${repeatable}`,
    "apex-sanctuary": `射速 +100%、射程 +100%、弹体放大；移速 +6%、经验 +5%；每 10 秒循环内有 2 秒完全无敌（近身、弹体与危险区均不扣血）。${repeatable}`,
    "salvo-duel": `我方弹体与敌方远程弹体相撞时双方同时湮灭。${repeatable}`
  };

  return descriptions[upgradeId];
}

function renderRunSkillTree(summary: NonNullable<SimulationState["meta"]["lastRunSummary"]>): string {
  if (!summary.upgradeSequence || summary.upgradeSequence.length === 0) {
    return `
      <div class="panel skill-tree-panel">
        <div class="section-header">
          <span class="label">构筑树</span>
          <strong>本轮未形成明显分支</strong>
        </div>
        <p class="body-copy">这局主要依靠基础火力推进，还没有点出明确的流派链路。</p>
      </div>
    `;
  }

  const branchOrder: UpgradeBranch[] = ["core", "barrage", "precision", "survival", "mobility", "economy", "scout"];
  const grouped = branchOrder
    .map((branch) => ({
      branch,
      upgrades: summary.upgradeSequence.filter((upgradeId) => upgradeTreeMeta[upgradeId]?.branch === branch)
    }))
    .filter((entry) => entry.upgrades.length > 0);

  return `
    <div class="panel skill-tree-panel">
      <div class="section-header">
        <span class="label">构筑树</span>
        <strong>本轮升级路线</strong>
      </div>
      <div class="skill-tree-grid">
        ${grouped
          .map(
            ({ branch, upgrades }) => `
              <article class="skill-tree-branch">
                <h3>${upgradeBranchLabels[branch]}</h3>
                <div class="skill-node-list">
                  ${upgrades
                    .map((upgradeId, index) => {
                      const upgrade = upgradeDefinitions[upgradeId];
                      const meta = upgradeTreeMeta[upgradeId];
                      return `<div class="skill-node tier-${meta.tier}">
                        <span class="skill-node-order">${index + 1}</span>
                        <div>
                          <strong>${upgrade.title}</strong>
                          <span>T${meta.tier} · ${upgrade.archetype}</span>
                        </div>
                      </div>`;
                    })
                    .join("")}
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderSkillCodex(state: SimulationState, pendingSkillFeedback: ReadonlySet<UpgradeId>): string {
  const discovered = new Set(state.meta.discoveredUpgradeIds);
  const allSkills = Object.keys(upgradeDefinitions) as Array<keyof typeof upgradeDefinitions>;
  const discoveredCount = allSkills.filter((upgradeId) => discovered.has(upgradeId)).length;

  return `
    <div class="panel menu-section">
      <details class="leaderboard-fold">
        <summary class="leaderboard-fold-summary">
          <div class="section-header">
            <span class="label">技能图鉴</span>
            <strong>已收录 ${discoveredCount} / ${allSkills.length}</strong>
          </div>
        </summary>
        <div class="skill-codex-grid">
          ${allSkills
            .map((upgradeId) => {
              const unlocked = discovered.has(upgradeId);
              const upgrade = upgradeDefinitions[upgradeId];
              const meta = upgradeTreeMeta[upgradeId];
              return `
                <article class="meta-card codex-card rarity-${upgrade.rarity} ${unlocked ? "discovered" : "locked"}">
                  <div class="choice-meta">
                    <span class="rarity-pill">${rarityMap[upgrade.rarity]}</span>
                    <span class="rarity-type">${upgradeBranchLabels[meta.branch]}</span>
                    <span class="rarity-type">T${meta.tier}</span>
                  </div>
                  <h3>${unlocked ? upgrade.title : "未发现技能"}</h3>
                  <p>${unlocked ? meta.codexSummary : "首次在战斗中拿到这个技能后，会永久收录进图鉴。"}</p>
                  ${renderSkillFeedbackControls(state, upgradeId, pendingSkillFeedback.has(upgradeId), "codex", !unlocked)}
                  <footer>${unlocked ? upgrade.archetype : "等待解锁"}</footer>
                </article>
              `;
            })
            .join("")}
        </div>
      </details>
    </div>
  `;
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
                <span>${weapon.name} · ${translateResult(entry.result)}</span>
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

function isDeathTransitionActive(state: SimulationState): boolean {
  return state.run.status === "run-over" && state.run.runSummary?.result === "dead" && state.run.runOverDelay > 0;
}

function translateResult(result: RunSummary["result"]): string {
  if (result === "extracted") {
    return "成功撤离";
  }
  if (result === "cleared") {
    return "战役通关";
  }
  return "战败";
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
      <button type="button" class="touch-button" data-touch="dash" data-touch-button="dash"><span class="touch-button-fill"></span><span class="touch-button-text">冲刺</span></button>
      <button type="button" class="touch-button" data-touch="interact" data-touch-button="interact"><span class="touch-button-fill"></span><span class="touch-button-text">撤离</span></button>
      <button type="button" class="touch-button" data-touch="pause" data-touch-button="pause"><span class="touch-button-fill"></span><span class="touch-button-text">暂停</span></button>
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
    } else if (action === "fullscreen") {
      void toggleFullscreen(container);
    } else if (action === "pause") {
      queueVirtualPause();
    }
  });

  container.addEventListener("pointerdown", (event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-touch-button]");
    target?.classList.add("pressed");
  });
  const clearPressed = (event: Event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-touch-button]");
    target?.classList.remove("pressed");
  };
  container.addEventListener("pointerup", clearPressed);
  container.addEventListener("pointercancel", clearPressed);

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

async function toggleFullscreen(container: HTMLElement): Promise<void> {
  const fullscreenTarget = container.closest(".game-stage") as HTMLElement | null;
  if (!fullscreenTarget) {
    return;
  }

  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (fullscreenTarget.requestFullscreen) {
      await fullscreenTarget.requestFullscreen();
    }
  } catch {
    return;
  }
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

function renderTouchFeedback(container: HTMLElement, state: SimulationState): void {
  if (state.run.status !== "running" || !shouldUseTouchUi()) {
    for (const button of container.querySelectorAll<HTMLElement>("[data-touch-button]")) {
      button.style.setProperty("--cooldown-fill", "1");
      button.classList.remove("ready", "pressed");
    }
    return;
  }

  const dashButton = container.querySelector<HTMLElement>("[data-touch-button='dash']");
  const interactButton = container.querySelector<HTMLElement>("[data-touch-button='interact']");
  const fullscreenButton = container.querySelector<HTMLElement>("[data-touch-button='fullscreen']");
  const pauseButton = container.querySelector<HTMLElement>("[data-touch-button='pause']");
  const dashRatio =
    state.run.player.dashTimer <= 0 ? 1 : Math.max(0, 1 - state.run.player.dashTimer / Math.max(0.001, state.run.player.dashCooldown));

  dashButton?.style.setProperty("--cooldown-fill", `${dashRatio}`);
  dashButton?.classList.toggle("ready", dashRatio >= 0.995);
  interactButton?.style.setProperty("--cooldown-fill", state.run.extraction.unlocked ? "1" : "0.22");
  interactButton?.classList.toggle("ready", state.run.extraction.unlocked);
  fullscreenButton?.style.setProperty("--cooldown-fill", "1");
  fullscreenButton?.classList.add("ready");
  pauseButton?.style.setProperty("--cooldown-fill", "1");
}

function renderSkillFeedbackControls(
  state: SimulationState,
  upgradeId: UpgradeId,
  pending: boolean,
  layout: "compact" | "codex",
  disabled = false
): string {
  const entry = state.meta.skillFeedback[upgradeId];
  const totalUp = entry?.totalUp ?? 0;
  const totalDown = entry?.totalDown ?? 0;
  const dailyUp = entry?.dailyUp ?? 0;
  const dailyDown = entry?.dailyDown ?? 0;
  const userVote = entry?.userVote ?? null;
  const userVotedToday = entry?.userVotedToday ?? false;
  const classes = `skill-feedback skill-feedback-${layout}`;
  const disabledAttr = pending || disabled || userVotedToday ? "disabled" : "";

  return `
    <div class="${classes}">
      <div class="vote-button-row">
        <button type="button" class="vote-button ${userVote === "up" ? "active" : ""}" data-skill-id="${upgradeId}" data-skill-vote="up" ${disabledAttr}>
          <span class="vote-icon">👍</span>
          <span class="vote-count">${totalUp}</span>
        </button>
        <button type="button" class="vote-button down ${userVote === "down" ? "active" : ""}" data-skill-id="${upgradeId}" data-skill-vote="down" ${disabledAttr}>
          <span class="vote-icon">👎</span>
          <span class="vote-count">${totalDown}</span>
        </button>
      </div>
      <span class="vote-daily">${disabled ? "未解锁前不可反馈" : userVotedToday ? "今日已反馈" : `今日 👍 ${dailyUp} / 👎 ${dailyDown}`}</span>
    </div>
  `;
}

function isMobileLandscapeHud(): boolean {
  return shouldUseTouchUi() && window.matchMedia("(orientation: landscape)").matches;
}

function updateOrientationOverlay(container: HTMLElement, isRunning: boolean): void {
  const shouldShow = isRunning && shouldUseTouchUi() && window.matchMedia("(orientation: portrait)").matches;
  container.classList.toggle("hidden", !shouldShow);
}

function shouldUseTouchUi(): boolean {
  return window.matchMedia("(pointer: coarse)").matches && window.matchMedia("(hover: none)").matches;
}
