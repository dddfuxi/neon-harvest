import { createInitialState } from "../simulation/state";
import type { SimulationState } from "../simulation/types";

const STORAGE_KEY = "neon-harvest-save-v1";

export function loadState(): SimulationState {
  const fallback = createInitialState();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as Partial<SimulationState>;
    const mergedMeta = {
      ...fallback.meta,
      ...parsed.meta
    };
    const unlockedWeapons = [...new Set(mergedMeta.unlockedWeapons)];

    if (!unlockedWeapons.includes("rift-carbine")) {
      unlockedWeapons.push("rift-carbine");
    }
    if (mergedMeta.purchases.includes("weapon-cache")) {
      if (!unlockedWeapons.includes("shard-lance")) {
        unlockedWeapons.push("shard-lance");
      }
      if (!unlockedWeapons.includes("nova-driver")) {
        unlockedWeapons.push("nova-driver");
      }
    }

    return {
      ...fallback,
      meta: {
        ...mergedMeta,
        unlockedWeapons,
        leaderboard: Array.isArray(mergedMeta.leaderboard) ? mergedMeta.leaderboard.slice(0, 10) : []
      }
    };
  } catch {
    return fallback;
  }
}

export function persistState(state: SimulationState): void {
  const saveData = {
    meta: state.meta
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saveData));
}
