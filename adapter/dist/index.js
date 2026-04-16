/**
 * Hermes Agent adapter for Paperclip.
 *
 * Runs Hermes Agent (https://github.com/NousResearch/hermes-agent)
 * as a managed employee in a Paperclip company. Hermes Agent is a
 * full-featured AI agent with 30+ native tools, persistent memory,
 * skills, session persistence, and MCP support.
 *
 * @packageDocumentation
 */
import { ADAPTER_TYPE, ADAPTER_LABEL } from "./shared/constants.js";
export const type = ADAPTER_TYPE;
export const label = ADAPTER_LABEL;
/**
 * Models available through Hermes Agent.
 *
 * Hermes supports any model via any provider. The Paperclip UI should
 * prefer detectModel() plus manual entry over curated placeholder models,
 * since Hermes availability depends on the user's local configuration.
 */
export const models = [];
/**
 * Documentation shown in the Paperclip UI when configuring a Hermes agent.
 */
export const agentConfigurationDoc = `# Hermes Agent (remote) Configuration

Runs Hermes Agent on a different machine than this paperclip server, via the
paperclip-hermes-gateway runner. Hermes is a full-featured AI agent by Nous
Research with 30+ native tools, persistent memory, sessions, skills, and MCP.

## Prerequisites

- Hermes Agent installed on the **runner** box (not on this paperclip server)
- paperclip-hermes-gateway runner running on that box (\`python server.py\`)
- Network path from this paperclip server to the runner (Tailscale, VPN, or proxy)

## Required (remote dispatch)

| Field | Type | Description |
|-------|------|-------------|
| remoteRunnerUrl | string | URL of the runner's /run endpoint, e.g. \`http://100.x.x.x:8788/run\` |
| runnerAuthToken | string | Bearer token; must match the runner's RUNNER_AUTH_TOKEN env var |
| paperclipApiUrl | string | How hermes reaches Paperclip's API from the runner box, e.g. \`http://100.x.x.x:3100/api\`. Required when hermes runs on a different machine. |

> **Auth**: Paperclip automatically provisions a short-lived JWT for each run when \`supportsLocalAgentJwt\` is enabled (default). The adapter injects it into the prompt template as \`{{paperclipApiKey}}\` — no manual API key management needed.

## Core Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| model | string | (hermes default) | Optional explicit model. Leave blank to use Hermes's \`~/.hermes/config.yaml\` default. |
| provider | string | (auto) | API provider: auto, openrouter, nous, openai-codex, zai, kimi-coding, minimax, minimax-cn. Usually not needed — Hermes auto-detects from model name. |
| timeoutSec | number | 300 | Execution timeout in seconds |
| graceSec | number | 10 | Grace period after SIGTERM before SIGKILL |

## Tool Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| toolsets | string | (all) | Comma-separated toolsets to enable (e.g. "terminal,file,web") |

## Session & Workspace

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| persistSession | boolean | true | Resume sessions across heartbeats |
| worktreeMode | boolean | false | Use git worktree for isolated changes |
| checkpoints | boolean | false | Enable filesystem checkpoints |

## Advanced

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| hermesCommand | string | hermes | Path to hermes CLI binary |
| verbose | boolean | false | Enable verbose output |
| extraArgs | string[] | [] | Additional CLI arguments |
| env | object | {} | Extra environment variables |
| promptTemplate | string | (default) | Custom prompt template with {{variable}} placeholders |

## Available Template Variables

- \`{{agentId}}\` — Paperclip agent ID
- \`{{agentName}}\` — Agent display name
- \`{{companyId}}\` — Paperclip company ID
- \`{{companyName}}\` — Company display name
- \`{{runId}}\` — Current heartbeat run ID
- \`{{taskId}}\` — Current task/issue ID (if assigned)
- \`{{taskTitle}}\` — Task title (if assigned)
- \`{{taskBody}}\` — Task description (if assigned)
- \`{{projectName}}\` — Project name (if scoped to a project)
- \`{{paperclipApiKey}}\` — Short-lived JWT for authenticating to the Paperclip API (auto-provisioned per run)
`;
//# sourceMappingURL=index.js.map