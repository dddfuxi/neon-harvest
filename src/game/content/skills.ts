export type CharacterSkillId = "phase-burst" | "overdrive-core";

export type CharacterSkillDefinition = {
  id: CharacterSkillId;
  name: string;
  description: string;
};

export const characterSkillDefinitions: Record<CharacterSkillId, CharacterSkillDefinition> = {
  "phase-burst": {
    id: "phase-burst",
    name: "相位震爆",
    description: "冲刺结束时释放一次震爆脉冲，对周围敌人造成伤害。"
  },
  "overdrive-core": {
    id: "overdrive-core",
    name: "过载核心",
    description: "护盾被打穿后短暂进入过载状态，提升机动和射速。"
  }
};

export const characterSkillPool = Object.keys(characterSkillDefinitions) as CharacterSkillId[];
