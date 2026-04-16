/**
 * Detect the current model and provider from the user's Hermes config.
 *
 * Reads ~/.hermes/config.yaml and extracts the default model,
 * provider, base_url, and api_mode settings.
 *
 * Also provides provider resolution logic that merges explicit config,
 * Hermes config detection, and model-name prefix inference.
 */
export interface DetectedModel {
    /** Model name from config (e.g. "gpt-5.4", "anthropic/claude-sonnet-4") */
    model: string;
    /** Provider name from config (e.g. "copilot", "zai"). May be empty. */
    provider: string;
    /** Base URL override from config (e.g. "https://api.githubcopilot.com"). May be empty. */
    baseUrl: string;
    /** API mode from config (e.g. "chat_completions", "codex_responses"). May be empty. */
    apiMode: string;
    /** Where the detection came from */
    source: "config";
}
/**
 * Read the Hermes config file and extract the default model config.
 */
export declare function detectModel(configPath?: string): Promise<DetectedModel | null>;
/**
 * Parse model.default, model.provider, model.base_url, and model.api_mode
 * from raw YAML content. Uses simple regex parsing to avoid a YAML dependency.
 */
export declare function parseModelFromConfig(content: string): DetectedModel | null;
/**
 * Infer a provider from the model name using prefix-based hints.
 *
 * For example:
 *   "gpt-5.4"       → "copilot"
 *   "claude-sonnet-4" → "anthropic"
 *   "glm-5-turbo"   → "zai"
 *
 * Returns undefined if no hint matches (caller should fall back to "auto").
 */
export declare function inferProviderFromModel(model: string): string | undefined;
/**
 * Resolve the correct provider for a model, using a priority chain:
 *
 *   1. Explicit provider from adapterConfig (highest priority — user override)
 *   2. Provider from Hermes config file — ONLY if the config model matches
 *      the requested model (otherwise the config provider is for a different model)
 *   3. Provider inferred from model name prefix
 *   4. "auto" (let Hermes figure it out — lowest priority)
 *
 * Always returns a valid provider string.
 * The `resolvedFrom` field indicates which source was used, useful for logging.
 */
export declare function resolveProvider(options: {
    /** Explicit provider from adapterConfig (user override) */
    explicitProvider?: string | null;
    /** Provider detected from Hermes config file */
    detectedProvider?: string;
    /** Model name from Hermes config file (to check consistency) */
    detectedModel?: string;
    /** Model name to infer from if no explicit/detected provider */
    model?: string;
}): {
    provider: string;
    resolvedFrom: string;
};
//# sourceMappingURL=detect-model.d.ts.map