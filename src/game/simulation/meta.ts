import type { MetaProgressState, MetaUpgrade } from "./types";

export const metaUpgrades: MetaUpgrade[] = [
  {
    id: "weapon-cache",
    name: "Experimental Rack",
    description: "Unlock the Shard Lance and Nova Driver in the hangar.",
    cost: 120
  },
  {
    id: "dash-tuning",
    name: "Dash Tuning",
    description: "Unlock an alternate long-range dash frame.",
    cost: 90
  },
  {
    id: "salvage-charter",
    name: "Salvage Charter",
    description: "Add rare economy upgrades into the run pool.",
    cost: 75
  }
];

export const defaultMetaState: MetaProgressState = {
  credits: 0,
  unlockedWeapons: ["pulse-blaster", "arc-caster", "rift-carbine"],
  dashVariantUnlocked: false,
  unlockedUpgradeIds: [],
  discoveredUpgradeIds: [],
  skillFeedbackClientId: "",
  skillFeedback: {},
  purchases: [],
  lastRunSummary: null,
  leaderboard: []
};

export function buyMetaUpgrade(meta: MetaProgressState, upgradeId: string): MetaProgressState {
  if (meta.purchases.includes(upgradeId)) {
    return meta;
  }

  const upgrade = metaUpgrades.find((entry) => entry.id === upgradeId);
  if (!upgrade || meta.credits < upgrade.cost) {
    return meta;
  }

  const nextMeta: MetaProgressState = {
    ...meta,
    credits: meta.credits - upgrade.cost,
    purchases: [...meta.purchases, upgrade.id]
  };

  if (upgrade.id === "weapon-cache") {
    const unlocked = [...nextMeta.unlockedWeapons];
    if (!unlocked.includes("shard-lance")) {
      unlocked.push("shard-lance");
    }
    if (!unlocked.includes("nova-driver")) {
      unlocked.push("nova-driver");
    }
    nextMeta.unlockedWeapons = unlocked;
  }

  if (upgrade.id === "dash-tuning") {
    nextMeta.dashVariantUnlocked = true;
  }

  if (upgrade.id === "salvage-charter" && !nextMeta.unlockedUpgradeIds.includes("compound-interest")) {
    nextMeta.unlockedUpgradeIds = [...nextMeta.unlockedUpgradeIds, "compound-interest"];
  }

  return nextMeta;
}
