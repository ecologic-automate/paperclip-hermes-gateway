# Prompt for Claude Code on the paperclip server

> Paste this whole file into a Claude Code session running on the paperclip
> VPS. It's self-contained — the remote Claude doesn't need to see anything
> else.

---

## Context

We run paperclip on this VPS and hermes on a separate Tailnet box. Today
the target agent (get the `agentId` from the user) is configured with
`adapterType: openclaw_gateway` pointing at a WebSocket endpoint that no
longer exists. That's broken (403, openclaw is uninstalled) and we're not
going back to openclaw.

We're switching Ian to a **new adapter type** called `hermes_remote`, which
ships in a private fork: `hermes-remote-paperclip-adapter`. It's a
near-byte-identical copy of `hermes-paperclip-adapter` with one substitution:
instead of spawning hermes as a child process locally, it makes an
HTTP/SSE call to a runner service on the hermes box.

A runner has already been deployed on the hermes box and is reachable from
this VPS at the URL provided below. Your job is the paperclip-side wiring.

## Inputs the user will give you

The user will hand you:

1. **`hermes-remote-paperclip-adapter-0.1.0.tgz`** — the npm tarball, scp'd
   somewhere on this server (probably `~/` or `/tmp/`). Ask if you don't
   know where it is.
2. **`RUNNER_URL`** — e.g. `http://<hermes-tailnet-ip>:8788/run` (the
   hermes-box runner's URL).
3. **`RUNNER_TOKEN`** — the bearer secret the runner expects.

Confirm all three are in hand before starting. Stop and ask if any are
missing.

## Your job, in order

### 1. Locate paperclip

Find where paperclip is installed and how it starts. It will typically be
one of:

- `~/paperclip/` (cloned source, `pnpm start`)
- A globally-installed `paperclipai` (started from `npx paperclipai onboard`)
- Wrapped in a systemd unit (`systemctl status paperclip` or
  `systemctl --user status paperclip`)

Find `dist/adapters/registry.js` (or the equivalent in the source tree). If
paperclip is built from source you'll edit `src/adapters/registry.ts` and
rebuild. If it's a published package you'll edit the compiled
`node_modules/@paperclipai/server/dist/adapters/registry.js` directly.

**Confirm with the user which path applies before editing.**

### 2. Back up the registry

Before any edits:

```bash
cp <path-to>/registry.js <path-to>/registry.js.bak.$(date +%s)
```

### 3. Install the adapter package

```bash
cd <paperclip-install-dir>     # the dir that contains its package.json
npm install ~/hermes-remote-paperclip-adapter-0.1.0.tgz   # adjust path
# or pnpm add file:... if paperclip uses pnpm
```

Verify it landed:

```bash
ls node_modules/hermes-remote-paperclip-adapter/dist/server/
# must include: execute.js dispatch-remote.js index.js test.js
```

### 4. Patch the registry and validation enum

You must patch **two** files:
- `dist/adapters/registry.js` — so the adapter loads at runtime
- `@paperclipai/shared/dist/constants.js` — so the API accepts
  `"hermes_remote"` as a valid `adapterType` in PATCH requests

Back up both files before editing.

#### 4a. Patch `@paperclipai/shared/dist/constants.js`

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

Without this, the PATCH request in step 6 will fail with:
`"Invalid enum value. Expected ... received 'hermes_remote'"`

#### 4b. Patch `dist/adapters/registry.js`

Edit `dist/adapters/registry.js` (path you found in step 1).

**Add these imports near the top, alongside the existing adapter imports:**

```js
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
```

**Add this adapter object next to the existing `hermesLocalAdapter` definition:**

```js
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
```

**Add `hermesRemoteAdapter` to the `adaptersByType` Map literal**, next to
`hermesLocalAdapter`:

```js
const adaptersByType = new Map([
    claudeLocalAdapter,
    codexLocalAdapter,
    openCodeLocalAdapter,
    piLocalAdapter,
    cursorLocalAdapter,
    geminiLocalAdapter,
    openclawGatewayAdapter,
    hermesLocalAdapter,
    hermesRemoteAdapter,         // ← added
    processAdapter,
    httpAdapter,
].map((a) => [a.type, a]));
```

If paperclip is built from TypeScript source, mirror the same change in
`src/adapters/registry.ts` and run paperclip's build (`pnpm build`).

### 5. Restart paperclip

```bash
sudo systemctl restart paperclip
# or whatever start command applies — confirm with user
```

Tail the log immediately:

```bash
sudo journalctl -u paperclip -f
```

Watch for startup errors. The adapter registers silently on success — no
log line should mention `hermes_remote`. Errors that mention
`hermes-remote-paperclip-adapter` mean the import failed; check
`node_modules/hermes-remote-paperclip-adapter/` exists and the patch
syntax is valid.

### 6. Reconfigure Ian

Use paperclip's API or UI to update Ian. Via API (substitute the host /
auth as appropriate for this server):

```bash
curl -X PATCH https://<paperclip-host>/api/agents/<agent-id> \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "adapterType": "hermes_remote",
    "adapterConfig": {
      "remoteRunnerUrl": "<RUNNER_URL from user>",
      "runnerAuthToken": "<RUNNER_TOKEN from user>",
      "paperclipApiUrl": "http://<paperclip-tailnet-ip>:3100/api",
      "timeoutSec": 1800,
      "persistSession": true
    }
  }'
```

**Important:** include `paperclipApiUrl` pointing to the paperclip
server's Tailnet IP. Without it, the prompt template defaults to
`localhost:3100` which won't work when hermes runs on a different machine.

Do **not** include `model` or `provider` — let hermes use its own
`~/.hermes/config.yaml` defaults.

Drop all `openclaw_gateway`-specific config (`url`, `headers`,
`devicePrivateKeyPem`, `authToken`, etc.) — they are no longer used.

If you don't know the admin token or the right PATCH endpoint shape, ask
the user to do this step in the UI and just confirm when done.

### 7. Verify end-to-end

In paperclip, trigger a wake / heartbeat for Ian (UI: "wake agent" or
assign a tiny test issue).

Watch paperclip's log — you should see:

```
[hermes-remote] dispatching to <RUNNER_URL>
[hermes] Starting Hermes Agent (model=...)
... hermes output ...
[hermes] Exit code: 0, timed out: false
```

If it works: confirm with the user, then suggest deleting
`registry.js.bak.*`.

If it fails:
- `HTTP 401` from runner → token mismatch
- `HTTP 404` → wrong path, runner expects `/run`
- `connect failed` → network path from VPS to runner is blocked
- `errorCode: hermes_remote_url_missing` / `_token_missing` → adapterConfig
  fields didn't save; re-PATCH and check
- import errors at startup → registry.js patch is malformed; restore from
  the backup and retry

## Rollback

If anything goes wrong:

```bash
cp <path-to>/registry.js.bak.<timestamp> <path-to>/registry.js
sudo systemctl restart paperclip
```

Then PATCH Ian back to whatever `adapterType` was working before (likely
`openclaw_gateway` with the old config — but note that path is also broken
right now).

## Constraints

- Don't restart paperclip without backing up `registry.js` first.
- Don't edit any other adapter's config; only add the new entry.
- Don't push these changes upstream to the official paperclip repo without
  asking — this is a local fork.
- If the user's paperclip runs in Docker, the install paths above are
  inside the container; ask before assuming.
