"""paperclip-hermes-gateway runner.

Exposes a single HTTP endpoint that paperclip's forked hermes-remote adapter
calls into. Spawns hermes locally, streams stdout/stderr/exit back via SSE.

Auth: bearer token (env: RUNNER_AUTH_TOKEN). Bind: env RUNNER_HOST/RUNNER_PORT.
"""

from __future__ import annotations

import asyncio
import contextlib
import hmac
import json
import logging
import os
import sys
from datetime import datetime, timezone

from aiohttp import web

HERMES_CMD = os.environ.get("HERMES_CMD", "hermes")
AUTH_TOKEN = os.environ.get("RUNNER_AUTH_TOKEN", "")
HOST = os.environ.get("RUNNER_HOST", "127.0.0.1")
PORT = int(os.environ.get("RUNNER_PORT", "8788"))
VERSION = "0.1.0"

log = logging.getLogger("runner")


def _check_auth(request: web.Request) -> bool:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return False
    return hmac.compare_digest(header[len("Bearer "):], AUTH_TOKEN)


async def health(_: web.Request) -> web.Response:
    return web.json_response({"ok": True, "version": VERSION})


async def run(request: web.Request) -> web.StreamResponse:
    if not _check_auth(request):
        return web.json_response({"error": "unauthorized"}, status=401)

    try:
        body = await request.json()
    except json.JSONDecodeError:
        return web.json_response({"error": "invalid json"}, status=400)

    args = body.get("args") or []
    if not isinstance(args, list) or not all(isinstance(a, str) for a in args):
        return web.json_response({"error": "args must be array of strings"}, status=400)

    env_overrides = body.get("env") or {}
    if not isinstance(env_overrides, dict):
        return web.json_response({"error": "env must be object"}, status=400)

    stdin_text = body.get("stdin")
    cwd = body.get("cwd")
    timeout_sec = float(body.get("timeoutSec", 300))
    grace_sec = float(body.get("graceSec", 10))
    run_id = str(body.get("runId") or "unknown")

    response = web.StreamResponse(
        status=200,
        headers={
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
    await response.prepare(request)

    async def send(event: str, data: dict) -> bool:
        try:
            await response.write(
                f"event: {event}\ndata: {json.dumps(data)}\n\n".encode("utf-8")
            )
            return True
        except (ConnectionResetError, asyncio.CancelledError):
            return False

    # Merge overrides but preserve system-critical vars from this machine.
    # The adapter sends the remote VPS's full process.env — without this guard,
    # the VPS's PATH would clobber ours and hermes becomes unfindable.
    _PRESERVE = {"PATH", "HOME", "USER", "SHELL", "LANG", "LC_ALL", "TMPDIR",
                 "PYTHONPATH", "VIRTUAL_ENV", "LD_LIBRARY_PATH"}
    env = {**os.environ}
    for k, v in env_overrides.items():
        key = str(k)
        if key not in _PRESERVE:
            env[key] = str(v)
    started_at = datetime.now(timezone.utc).isoformat()
    log.info("run start run=%s args=%s cwd=%s", run_id, args, cwd)

    try:
        proc = await asyncio.create_subprocess_exec(
            HERMES_CMD,
            *args,
            stdin=asyncio.subprocess.PIPE if stdin_text else asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
            cwd=cwd,
        )
    except FileNotFoundError:
        await send("exit", {
            "code": 127, "signal": None, "timedOut": False,
            "error": f"hermes binary not found: {HERMES_CMD}",
        })
        return response
    except Exception as exc:
        await send("exit", {
            "code": 1, "signal": None, "timedOut": False,
            "error": f"spawn failed: {exc}",
        })
        return response

    await send("spawn", {"pid": proc.pid, "startedAt": started_at})

    if stdin_text and proc.stdin is not None:
        try:
            proc.stdin.write(stdin_text.encode("utf-8"))
            await proc.stdin.drain()
        finally:
            proc.stdin.close()

    async def pump(stream: asyncio.StreamReader, name: str) -> None:
        while True:
            chunk = await stream.read(4096)
            if not chunk:
                return
            ok = await send(name, {"chunk": chunk.decode("utf-8", errors="replace")})
            if not ok:
                return

    stdout_task = asyncio.create_task(pump(proc.stdout, "stdout"))
    stderr_task = asyncio.create_task(pump(proc.stderr, "stderr"))

    timed_out = False
    try:
        await asyncio.wait_for(proc.wait(), timeout=timeout_sec)
    except asyncio.TimeoutError:
        timed_out = True
        proc.terminate()
        try:
            await asyncio.wait_for(proc.wait(), timeout=grace_sec)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
    except asyncio.CancelledError:
        with contextlib.suppress(ProcessLookupError):
            proc.kill()
            await proc.wait()
        raise
    finally:
        for task in (stdout_task, stderr_task):
            with contextlib.suppress(asyncio.CancelledError):
                await task

    signal_name = None
    if proc.returncode is not None and proc.returncode < 0:
        signal_name = f"SIG{-proc.returncode}"

    await send("exit", {
        "code": proc.returncode,
        "signal": signal_name,
        "timedOut": timed_out,
    })
    log.info(
        "run done run=%s exit=%s signal=%s timedOut=%s",
        run_id, proc.returncode, signal_name, timed_out,
    )
    return response


def main() -> None:
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    if not AUTH_TOKEN:
        print("ERROR: RUNNER_AUTH_TOKEN must be set", file=sys.stderr)
        sys.exit(1)

    app = web.Application(client_max_size=8 * 1024 * 1024)
    app.router.add_get("/health", health)
    app.router.add_post("/run", run)

    log.info("paperclip-hermes-gateway runner v%s listening on %s:%d", VERSION, HOST, PORT)
    log.info("hermes binary: %s", HERMES_CMD)
    web.run_app(app, host=HOST, port=PORT, print=lambda *_: None)


if __name__ == "__main__":
    main()
