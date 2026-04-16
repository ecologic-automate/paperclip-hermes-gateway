/**
 * Server-side adapter module exports.
 */
export { execute } from "./execute.js";
export { testEnvironment } from "./test.js";
export { detectModel, parseModelFromConfig, resolveProvider, inferProviderFromModel } from "./detect-model.js";
export { listHermesSkills as listSkills, syncHermesSkills as syncSkills, resolveHermesDesiredSkillNames as resolveDesiredSkillNames, } from "./skills.js";
import type { AdapterSessionCodec } from "@paperclipai/adapter-utils";
/**
 * Session codec for structured validation and migration of session parameters.
 *
 * Hermes Agent uses a single `sessionId` for cross-heartbeat session continuity
 * via the `--resume` CLI flag. The codec validates and normalizes this field.
 */
export declare const sessionCodec: AdapterSessionCodec;
//# sourceMappingURL=index.d.ts.map