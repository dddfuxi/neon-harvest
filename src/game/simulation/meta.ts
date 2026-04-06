import { weaponModDefinitions, weaponModTreeByWeapon, type WeaponId, type WeaponModId } from "../content/weapons";
import type { MetaProgressState, MetaUpgrade, PreRunSupply, PreRunSupplyId } from "./types";

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
  purchasedWeaponModIds: [],
  discoveredUpgradeIds: [],
  skillFeedbackClientId: "",
  skillFeedback: {},
  supplyInventory: {},
  purchases: [],
  lastRunSummary: null,
  leaderboard: []
};

export const preRunSupplyDefinitions: PreRunSupply[] = [
  {
    id: "weapon-oil",
    name: "火控校准包",
    description: "开局武器等级 +1，只影响这一局的起步火力。",
    cost: 28,
    maxStock: 3
  },
  {
    id: "shield-pack",
    name: "护盾应急包",
    description: "开局额外恢复一段护盾，前期更容易站稳。",
    cost: 24,
    maxStock: 3
  },
  {
    id: "field-notes",
    name: "战场记录片",
    description: "开局获得额外经验，更快进入第一次升级。",
    cost: 22,
    maxStock: 3
  },
  {
    id: "emergency-repair",
    name: "应急修复单元",
    description: "本局死亡时自动抢修 1 次，把机体强行拉回战线。",
    cost: 40,
    maxStock: 2
  },
  {
    id: "risk-protocol",
    name: "风险协议",
    description: "本局提高威胁等级，敌群和危险区更强，但结算倍率同步上调。",
    cost: 34,
    maxStock: 3
  }
];

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

export function buyPreRunSupply(meta: MetaProgressState, supplyId: PreRunSupplyId): MetaProgressState {
  const definition = preRunSupplyDefinitions.find((entry) => entry.id === supplyId);
  if (!definition || meta.credits < definition.cost) {
    return meta;
  }

  const currentStock = meta.supplyInventory[supplyId] ?? 0;
  if (currentStock >= definition.maxStock) {
    return meta;
  }

  return {
    ...meta,
    credits: meta.credits - definition.cost,
    supplyInventory: {
      ...meta.supplyInventory,
      [supplyId]: currentStock + 1
    }
  };
}

export function buyWeaponMod(meta: MetaProgressState, weaponId: WeaponId, modId: WeaponModId): MetaProgressState {
  if (meta.purchasedWeaponModIds.includes(modId)) {
    return meta;
  }

  if (!meta.unlockedWeapons.includes(weaponId)) {
    return meta;
  }

  const mod = weaponModDefinitions[modId];
  if (!mod || mod.weaponId !== weaponId || meta.credits < mod.cost) {
    return meta;
  }

  const weaponTreeIds = new Set(weaponModTreeByWeapon[weaponId].map((entry) => entry.id));
  if (!weaponTreeIds.has(modId)) {
    return meta;
  }

  if (mod.parents && !mod.parents.every((parentId) => meta.purchasedWeaponModIds.includes(parentId))) {
    return meta;
  }

  return {
    ...meta,
    credits: meta.credits - mod.cost,
    purchasedWeaponModIds: [...meta.purchasedWeaponModIds, modId]
  };
}
