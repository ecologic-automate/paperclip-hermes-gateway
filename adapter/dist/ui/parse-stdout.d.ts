/**
 * Parse Hermes Agent stdout into TranscriptEntry objects for the Paperclip UI.
 *
 * Hermes CLI quiet-mode output patterns:
 *   Assistant:  "  ┊ 💬 {text}"
 *   Tool (TTY): "  ┊ {emoji} {verb:9} {detail}  {duration}"
 *   Tool (pipe): "  [done] ┊ {emoji} {verb:9} {detail}  {duration} ({total})"
 *   System:     "[hermes] ..."
 *
 * We emit structured tool_call/tool_result pairs so Paperclip renders proper
 * tool cards (with status icons, expand/collapse) instead of raw stdout blocks.
 */
import type { TranscriptEntry } from "@paperclipai/adapter-utils";
/**
 * Parse a single line of Hermes stdout into transcript entries.
 *
 * Emits structured tool_call/tool_result pairs (with synthetic IDs) so
 * Paperclip renders proper tool cards with status icons and expand/collapse.
 *
 * @param line  Raw stdout line from Hermes CLI
 * @param ts    ISO timestamp for the entry
 * @returns     Array of TranscriptEntry objects (may be empty)
 */
export declare function parseHermesStdoutLine(line: string, ts: string): TranscriptEntry[];
//# sourceMappingURL=parse-stdout.d.ts.map