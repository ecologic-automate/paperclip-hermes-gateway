# paperclip-hermes-gateway

Run [Hermes Agent](https://github.com/NousResearch/hermes-agent) on one machine
while [Paperclip](https://paperclip.ing) orchestrates from another.

## The problem

Paperclip ships a first-class `hermes_local` adapter
([hermes-paperclip-adapter](https://github.com/NousResearch/hermes-paperclip-adapter))
that spawns hermes as a child process of the paperclip server. Great when
everything is on one box. But if your paperclip runs on a VPS and your hermes
runs on a local workstation (or behind a Tailnet), the child-process model
breaks — hermes isn't on the same machine.

Paperclip's only published remote-agent path is `openclaw_gateway` — a
WebSocket protocol designed for OpenClaw, not Hermes. It has
[documented](https://github.com/paperclipai/paperclip/issues/880)
[friction](https://github.com/paperclipai/paperclip/issues/2293):
undocumented device-pairing requirements, auth quirks, false process-lost
states, and ~600 tokens of wake-text bloat per heartbeat.

This package solves the split-machine problem cleanly for Hermes.

## How it works

```
┌──────────────────────────────┐         ┌──────────────────────────────┐
│  Paperclip server (VPS)      │         │  Hermes box (local/Tailnet)  │
│                              │         │                              │
│  ┌────────────────────────┐  │  HTTP   │  ┌────────────────────────┐  │
│  │ hermes-remote-         │  │ + auth  │  │ runner (Python/aiohttp)│  │
│  │ paperclip-adapter      │──┼────────▶│  │                        │  │
│  │                        │  │         │  │  POST /run              │  │
│  │ (fork of hermes-       │  │◀────────┼──│  → spawn hermes chat -q│  │
│  │  paperclip-adapter)    │  │   SSE   │  │  → stream stdout back  │  │
│  └────────────────────────┘  │         │  └────────────────────────┘  │
│                              │         │                              │
│  Paperclip server            │         │  hermes (unchanged)          │
└──────────────────────────────┘         └──────────────────────────────┘
```

Two pieces, one substitution:

| Piece | Lives on | What it is |
|---|---|---|
| **`runner/`** | hermes box | Python aiohttp HTTP server (~150 lines). Accepts `POST /run`, spawns hermes locally, streams stdout/stderr/exit back as Server-Sent Events. |
| **`adapter/`** | paperclip server | Fork of `hermes-paperclip-adapter` (~30-line diff). Replaces `runChildProcess(...)` with `dispatchRemote(...)` — an HTTP/SSE client that calls the runner. |

Everything above the spawn call is inherited unchanged from the upstream
Nous adapter:

- Structured transcript parsing (raw hermes stdout → typed tool cards in paperclip UI)
- Session codec (resume across heartbeats via `--resume`)
- Skill scanning (paperclip UI sees both managed + native hermes skills)
- ASCII → markdown post-processing (banners, setext headings, table borders)
- Cost / usage / token parsing
- Model auto-detection from `~/.hermes/config.yaml`
- Benign stderr reclassification (MCP init noise)

## Token efficiency

Compared to running through `openclaw_gateway`:

- **No openclaw wake-text bloat** — the openclaw adapter prepends ~600 tokens
  of "do not guess endpoints / here are HTTP rules" instructions to every wake.
  This adapter uses hermes-paperclip-adapter's minimal prompt template directly.
- **Session resume inherited** — `sessionCodec` from upstream just works,
  saving 5–10k tokens per wake that would otherwise re-feed issue history.
- **Prompt cache stability inherited** — byte-stable system prompt across
  wakes means Anthropic prompt-cache hits work the same as `hermes_local`.

## Quick start

### 1. Runner (hermes box)

```bash
cd runner/
pip install aiohttp   # or use hermes's existing venv

export RUNNER_AUTH_TOKEN=$(openssl rand -hex 32)
export RUNNER_HOST=100.x.x.x   # your Tailnet IP or 127.0.0.1
export RUNNER_PORT=8788
python server.py
```

Verify: `curl http://$RUNNER_HOST:$RUNNER_PORT/health`

### 2. Adapter (paperclip server)

```bash
cd /path/to/paperclip
npm install /path/to/hermes-remote-paperclip-adapter-0.1.1.tgz
```

Patch **two** files. Both are required — the registry for runtime, the
constants for API validation.

#### a. `dist/adapters/registry.js`

Add the imports and register the adapter:

```js
// Imports (add near top, alongside other adapter imports)
import {
    execute as hermesRemoteExecute,
    testEnvironment as hermesRemoteTestEnvironment,
    sessionCodec as hermesRemoteSessionCodec,
    listSkills as hermesRemoteListSkills,
    syncSkills as hermesRemoteSyncSkills,
    detectModel as detectModelFromHermesRemote,
} from "hermes-remote-paperclip-adapter/server";
import {
    agentConfigurationDoc as hermesRemoteAgentConfigurationDoc,
    models as hermesRemoteModels,
} from "hermes-remote-paperclip-adapter";

// Adapter object (add next to hermesLocalAdapter)
const hermesRemoteAdapter = {
    type: "hermes_remote",
    execute: hermesRemoteExecute,
    testEnvironment: hermesRemoteTestEnvironment,
    sessionCodec: hermesRemoteSessionCodec,
    listSkills: hermesRemoteListSkills,
    syncSkills: hermesRemoteSyncSkills,
    models: hermesRemoteModels,
    supportsLocalAgentJwt: true,
    agentConfigurationDoc: hermesRemoteAgentConfigurationDoc,
    detectModel: () => detectModelFromHermesRemote(),
};

// Add hermesRemoteAdapter to the adaptersByType Map
```

#### b. `@paperclipai/shared/dist/constants.js` (API validation enum)

Paperclip's API validates `adapterType` against an enum in
`@paperclipai/shared`. Without this patch, the PATCH endpoint rejects
`"hermes_remote"` with a validation error — even though the adapter
loads fine at runtime.

Find the `AGENT_ADAPTER_TYPES` array and add `"hermes_remote"`:

```js
export const AGENT_ADAPTER_TYPES = [
    "process",
    "http",
    // ...existing entries...
    "hermes_local",
    "hermes_remote",   // ← add this
];
```

Back up both files before editing.

Restart paperclip.

### 3. Configure your agent

In the paperclip UI or via API, set the agent's adapter config:

```json
{
  "adapterType": "hermes_remote",
  "adapterConfig": {
    "remoteRunnerUrl": "http://100.x.x.x:8788/run",
    "runnerAuthToken": "<same token as RUNNER_AUTH_TOKEN>",
    "paperclipApiUrl": "http://100.x.x.x:3100/api",
    "timeoutSec": 1800,
    "persistSession": true
  }
}
```

Key fields:
- **`remoteRunnerUrl`** — where the runner listens (Tailnet IP recommended)
- **`runnerAuthToken`** — shared bearer secret
- **`paperclipApiUrl`** — how hermes reaches paperclip's API from the hermes
  box (use the Tailnet IP of the paperclip server, not `localhost`)
- **`model`** / **`provider`** — omit to let hermes use its own
  `~/.hermes/config.yaml` defaults. **Note:** the adapter's `execute.js`
  has a `DEFAULT_MODEL` fallback in `shared/constants.js` — if you omit
  `model` in adapterConfig, you must also patch the adapter's
  `dist/server/execute.js` to change `cfgString(config.model) || DEFAULT_MODEL`
  to `cfgString(config.model) || undefined`, otherwise it will always pass
  `-m` and `--provider` flags to hermes

## Runner reference

### Endpoint

```
POST /run
Authorization: Bearer $RUNNER_AUTH_TOKEN
Content-Type: application/json

{
  "runId": "...",
  "args": ["chat", "-q", "..."],
  "env": {"PAPERCLIP_RUN_ID": "..."},
  "cwd": ".",
  "timeoutSec": 300,
  "graceSec": 10
}
```

Response: `text/event-stream`

```
event: spawn
data: {"pid": 12345, "startedAt": "2026-04-16T..."}

event: stdout
data: {"chunk": "..."}

event: stderr
data: {"chunk": "..."}

event: exit
data: {"code": 0, "signal": null, "timedOut": false}
```

### Environment variables

| Var | Default | Purpose |
|---|---|---|
| `RUNNER_AUTH_TOKEN` | *(required)* | Bearer token for auth |
| `RUNNER_HOST` | `127.0.0.1` | Bind address |
| `RUNNER_PORT` | `8788` | Bind port |
| `HERMES_CMD` | `hermes` | Path to hermes binary |
| `LOG_LEVEL` | `INFO` | Python logging level |

### Security

The runner preserves critical system vars (`PATH`, `HOME`, `PYTHONPATH`, etc.)
when merging env overrides from the adapter — preventing the VPS's `PATH` from
clobbering the runner's.

For production, terminate TLS in front of the runner:

```bash
# Tailscale Serve (easiest)
tailscale serve --bg --https=443 / http://127.0.0.1:8788

# Then use: remoteRunnerUrl = https://<tailnet-name>.ts.net/run
```

## How this was built

### Background

We run a Hermes agent orchestrated by Paperclip. Paperclip lives on a
VPS. Hermes lives on a local workstation connected via
Tailscale.

Previously Ian ran on OpenClaw, which has its own gateway protocol that
Paperclip speaks via the `openclaw_gateway` adapter. We migrated fully to
Hermes and uninstalled OpenClaw — but Paperclip was still trying to dial the
old openclaw WebSocket endpoint, getting 403s.

### Investigation

1. **Diagnosed the 403**: port 9119 was the hermes *dashboard*, not an
   openclaw gateway. The old openclaw used port 18789.

2. **Audited paperclip's adapter registry** (`npm pack @paperclipai/server`):
   found 10 adapter types including `hermes_local`, `openclaw_gateway`,
   `http`, `process`. Discovered `hermes_local` already existed — maintained
   by Nous Research as `hermes-paperclip-adapter`.

3. **Read hermes-paperclip-adapter source** (`npm pack hermes-paperclip-adapter`):
   confirmed it uses `runChildProcess()` — spawns hermes as a child of
   paperclip's Node process. Co-location only.

4. **Evaluated options**:
   - **Co-locate** (move paperclip to hermes box): doesn't fit our pipeline
   - **Build an openclaw_gateway shim**: throwaway protocol work, 600-token
     wake bloat, drift risk on an undocumented protocol
   - **Use paperclip's `http` adapter**: loses all the Nous adapter polish
   - **Fork hermes-paperclip-adapter for remote dispatch** ← chosen

### Build

The fork is minimal:

- **`dispatch-remote.js`** (~130 lines): SSE client that mimics
  `runChildProcess()` over HTTP. Sends `POST /run`, reads SSE stream,
  accumulates stdout/stderr, calls `onLog` for each chunk, returns
  `RunProcessResult`.

- **`execute.js` patch** (~15 lines): replaces the `runChildProcess` call
  with `dispatchRemote`, adds `remoteRunnerUrl` / `runnerAuthToken` config
  reads.

- **`constants.js`**: `ADAPTER_TYPE` → `hermes_remote`

- **`test.js`**: replaced local hermes/python checks with runner-reachability
  check (GET `/health`).

- **`index.js`**: updated `agentConfigurationDoc` with remote fields.

- **`runner/server.py`** (~160 lines): aiohttp SSE server. One endpoint.

### Issues hit during deployment

| Issue | Cause | Fix |
|---|---|---|
| 403 on WebSocket | Paperclip was dialling the hermes dashboard (port 9119), not an openclaw gateway | Abandoned openclaw path entirely |
| API rejects `hermes_remote` | `AGENT_ADAPTER_TYPES` enum in `@paperclipai/shared/dist/constants.js` doesn't include the new type | Patch the constants array to add `"hermes_remote"` |
| Exit code 127 (command not found) | Adapter sends VPS's full `process.env`, VPS's `PATH` overwrote runner's `PATH` | Runner preserves critical system vars (`PATH`, `HOME`, etc.) |
| Exit code 1 (model not found) | Adapter hardcoded `DEFAULT_MODEL = "anthropic/claude-sonnet-4"` | Changed fallback to `undefined` — hermes uses its own config |
| hermes can't reach paperclip API | Prompt template used `localhost:3100` (co-located assumption) | Set `paperclipApiUrl: "http://<paperclip-tailnet-ip>:3100/api"` in adapterConfig |

## Optional: Paperclip skill for hermes

`skills/paperclip/` contains a Hermes skill that teaches hermes how to
call the Paperclip API (list/create/comment on issues, wake the agent,
etc.). Useful for controlling your Paperclip company from WhatsApp /
Telegram / CLI via hermes.

Install:

```bash
cp -r skills/paperclip ~/.hermes/skills/
```

Then send hermes a message like *"check paperclip"* or *"what's the
agent working on?"* — it'll load the skill and call the API directly.

## Updating

When Nous releases a new `hermes-paperclip-adapter`:

```bash
npm pack hermes-paperclip-adapter   # get the new version
# Re-apply the ~30-line diff to execute.js, constants.js, test.js, index.js
# Bump version in package.json, repack, reinstall on paperclip server
```

The diff is small enough to re-apply by hand in a few minutes.

## License

MIT. Adapter is a fork of
[hermes-paperclip-adapter](https://github.com/NousResearch/hermes-paperclip-adapter)
(MIT, Nous Research). Runner is original work.
