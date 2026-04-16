# Deploy

## 1. Hermes box (this machine)

### Install runner

```bash
cd ~/code/paperclip-hermes-gateway/runner
# aiohttp is already in the hermes venv; either reuse it or use a fresh venv
~/.hermes/hermes-agent/venv/bin/python -m pip install aiohttp
```

### Generate a shared secret

```bash
RUNNER_AUTH_TOKEN=$(openssl rand -hex 32)
echo "$RUNNER_AUTH_TOKEN"   # save — paperclip needs the same value
```

### Run it

```bash
export RUNNER_AUTH_TOKEN=<the-token>
export RUNNER_HOST=100.x.x.x        # your tailnet IP (preferred over 0.0.0.0)
export RUNNER_PORT=8788
~/.hermes/hermes-agent/venv/bin/python server.py
```

Confirm:

```bash
curl http://$RUNNER_HOST:$RUNNER_PORT/health
# {"ok": true, "version": "0.1.0"}
```

### As a systemd user service (optional)

```ini
# ~/.config/systemd/user/paperclip-hermes-runner.service
[Unit]
Description=paperclip-hermes-gateway runner
After=network.target

[Service]
Environment=RUNNER_AUTH_TOKEN=<token>
Environment=RUNNER_HOST=100.x.x.x
Environment=RUNNER_PORT=8788
ExecStart=%h/.hermes/hermes-agent/venv/bin/python %h/code/paperclip-hermes-gateway/runner/server.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now paperclip-hermes-runner
journalctl --user -u paperclip-hermes-runner -f
```

## 2. Paperclip server (VPS)

### Install the forked adapter

Copy `adapter/` to the paperclip server (or publish to a private npm registry).
Then in the paperclip directory:

```bash
cd /path/to/paperclip
npm install /path/to/hermes-remote-paperclip-adapter
```

### Patch the adapter registry

Edit `dist/adapters/registry.js` (or the equivalent source file if you build
paperclip from source). Add:

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

Add `hermesRemoteAdapter` to the `adaptersByType` map:

```js
const adaptersByType = new Map([
    claudeLocalAdapter,
    // ...existing entries...
    hermesLocalAdapter,
    hermesRemoteAdapter,   // ← add this
    processAdapter,
    httpAdapter,
].map((a) => [a.type, a]));
```

### Patch the validation enum

Paperclip's API validates `adapterType` against an enum in
`@paperclipai/shared/dist/constants.js`. Without this patch, the API
rejects `"hermes_remote"` when you try to configure the agent.

Find the `AGENT_ADAPTER_TYPES` array and add `"hermes_remote"`:

```js
export const AGENT_ADAPTER_TYPES = [
    // ...existing entries...
    "hermes_local",
    "hermes_remote",   // ← add this
];
```

### Restart paperclip

```bash
sudo systemctl restart paperclip
# or however you restart it (`pnpm start`, etc.)
```

## 3. Reconfigure Ian

In the paperclip UI (or via API), edit Ian's agent config:

- **adapterType**: change from `openclaw_gateway` → `hermes_remote`
- **adapterConfig**:
  ```json
  {
    "remoteRunnerUrl": "http://<hermes-tailnet-ip>:8788/run",
    "runnerAuthToken": "<the same RUNNER_AUTH_TOKEN>",
    "paperclipApiUrl": "http://<paperclip-tailnet-ip>:3100/api",
    "timeoutSec": 1800,
    "persistSession": true
  }
  ```

  Do **not** include `model` or `provider` — let hermes use its own
  `~/.hermes/config.yaml` defaults.

Drop all the openclaw-specific fields (`url`, `headers["x-openclaw-token"]`,
`devicePrivateKeyPem`, etc.) — they're no longer used.

### Test

In the paperclip UI: trigger a wake / heartbeat. Watch:

- Paperclip log: `[hermes-remote] dispatching to https://.../run`
- Runner log: `run start run=<runId> args=[...] ...` then `run done ...`
- Ian's transcript in paperclip should show the hermes output, parsed as
  proper tool cards.

## Network / TLS notes

The runner talks plain HTTP. For anything beyond loopback, terminate TLS in
front of it:

- **Tailscale Serve** — easiest:
  ```bash
  tailscale serve --bg --https=443 / http://127.0.0.1:8788
  ```
  Then `remoteRunnerUrl = https://<tailnet-name>.ts.net/run`
- **Caddy / nginx** in front, with a Let's Encrypt cert
- **SSH tunnel** from the paperclip VPS

The bearer token is sufficient auth, but rotate it periodically.
