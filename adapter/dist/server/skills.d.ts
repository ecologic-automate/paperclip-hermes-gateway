import type { AdapterSkillContext, AdapterSkillSnapshot } from "@paperclipai/adapter-utils";
export declare function listHermesSkills(ctx: AdapterSkillContext): Promise<AdapterSkillSnapshot>;
export declare function syncHermesSkills(ctx: AdapterSkillContext, _desiredSkills: string[]): Promise<AdapterSkillSnapshot>;
export declare function resolveHermesDesiredSkillNames(config: Record<string, unknown>, availableEntries: Array<{
    key: string;
    required?: boolean;
}>): string[];
//# sourceMappingURL=skills.d.ts.map