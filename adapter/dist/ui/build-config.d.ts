/**
 * Build adapter configuration from UI form values.
 *
 * Translates Paperclip's CreateConfigValues into the adapterConfig
 * object stored in the agent record.
 *
 * NOTE: Provider resolution happens at runtime in execute.ts, not here.
 * The UI may or may not pass a provider field. If it does, we persist it
 * as the user's explicit override. If not, execute.ts will detect it from
 * ~/.hermes/config.yaml at runtime.
 */
import type { CreateConfigValues } from "@paperclipai/adapter-utils";
/**
 * Build a Hermes Agent adapter config from the Paperclip UI form values.
 */
export declare function buildHermesConfig(v: CreateConfigValues): Record<string, unknown>;
//# sourceMappingURL=build-config.d.ts.map