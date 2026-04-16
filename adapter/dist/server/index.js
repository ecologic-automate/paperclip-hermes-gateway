/**
 * Server-side adapter module exports.
 */
export { execute } from "./execute.js";
export { testEnvironment } from "./test.js";
export { detectModel, parseModelFromConfig, resolveProvider, inferProviderFromModel } from "./detect-model.js";
export { listHermesSkills as listSkills, syncHermesSkills as syncSkills, resolveHermesDesiredSkillNames as resolveDesiredSkillNames, } from "./skills.js";
function readNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
/**
 * Session codec for structured validation and migration of session parameters.
 *
 * Hermes Agent uses a single `sessionId` for cross-heartbeat session continuity
 * via the `--resume` CLI flag. The codec validates and normalizes this field.
 */
export const sessionCodec = {
    deserialize(raw) {
        if (typeof raw !== "object" || raw === null || Array.isArray(raw))
            return null;
        const record = raw;
        const sessionId = readNonEmptyString(record.sessionId) ??
            readNonEmptyString(record.session_id);
        if (!sessionId)
            return null;
        return { sessionId };
    },
    serialize(params) {
        if (!params)
            return null;
        const sessionId = readNonEmptyString(params.sessionId) ??
            readNonEmptyString(params.session_id);
        if (!sessionId)
            return null;
        return { sessionId };
    },
    getDisplayId(params) {
        if (!params)
            return null;
        return readNonEmptyString(params.sessionId) ?? readNonEmptyString(params.session_id);
    },
};
//# sourceMappingURL=index.js.map