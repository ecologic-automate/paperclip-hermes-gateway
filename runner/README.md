# Runner

Listens on `RUNNER_HOST:RUNNER_PORT` (default `127.0.0.1:8788`). Single endpoint:

```
POST /run
Authorization: Bearer $RUNNER_AUTH_TOKEN
Content-Type: application/json

{
  "runId": "...",       // for log correlation
  "args": ["chat", "-q", "..."],
  "env": {"FOO": "bar"},
  "stdin": "...",       // optional
  "cwd": "...",         // optional
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

## Run

```bash
pip install aiohttp
export RUNNER_AUTH_TOKEN=$(openssl rand -hex 32)
python server.py
```

## Bind to Tailscale only (recommended)

```bash
RUNNER_HOST=100.x.x.x python server.py    # your tailnet IP
```

Or expose via `tailscale serve --bg --tcp 8788 tcp://127.0.0.1:8788` and keep the runner on loopback.

## Env

| Var | Default | Purpose |
|---|---|---|
| `RUNNER_AUTH_TOKEN` | (required) | Bearer token paperclip must present |
| `RUNNER_HOST` | `127.0.0.1` | Bind address |
| `RUNNER_PORT` | `8788` | Bind port |
| `HERMES_CMD` | `hermes` | Path/name of hermes binary |
| `LOG_LEVEL` | `INFO` | Logging level |
