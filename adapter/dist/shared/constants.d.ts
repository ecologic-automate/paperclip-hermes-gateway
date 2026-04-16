/**
 * Shared constants for the Hermes Agent adapter.
 */
/** Adapter type identifier registered with Paperclip. */
export declare const ADAPTER_TYPE = "hermes_local";
/** Human-readable label shown in the Paperclip UI. */
export declare const ADAPTER_LABEL = "Hermes Agent";
/** Default CLI binary name. */
export declare const HERMES_CLI = "hermes";
/** Default timeout for a single execution run (seconds). */
export declare const DEFAULT_TIMEOUT_SEC = 1800;
/** Grace period after SIGTERM before SIGKILL (seconds). */
export declare const DEFAULT_GRACE_SEC = 10;
/** Default model to use if none specified. */
export declare const DEFAULT_MODEL = "anthropic/claude-sonnet-4";
/**
 * Valid --provider choices for the hermes CLI.
 * Must stay in sync with `hermes chat --help`.
 */
export declare const VALID_PROVIDERS: readonly ["auto", "openrouter", "nous", "openai-codex", "copilot", "copilot-acp", "anthropic", "huggingface", "zai", "kimi-coding", "minimax", "minimax-cn", "kilocode"];
/**
 * Model-name prefix → provider hint mapping.
 * Used when no explicit provider is configured and we need to infer
 * the correct provider from the model string alone.
 *
 * Keys are lowercased prefix patterns; values must be valid provider names.
 * Longer prefixes are matched first (order matters).
 */
export declare const MODEL_PREFIX_PROVIDER_HINTS: [string, string][];
/** Regex to extract session ID from Hermes CLI output. */
export declare const SESSION_ID_REGEX: RegExp;
/** Regex to extract token usage from Hermes output. */
export declare const TOKEN_USAGE_REGEX: RegExp;
/** Regex to extract cost from Hermes output. */
export declare const COST_REGEX: RegExp;
/** Prefix used by Hermes for tool output lines. */
export declare const TOOL_OUTPUT_PREFIX = "\u250A";
/** Prefix for Hermes thinking blocks. */
export declare const THINKING_PREFIX = "\uD83D\uDCAD";
//# sourceMappingURL=constants.d.ts.map