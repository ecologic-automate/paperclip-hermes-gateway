/**
 * Dispatch a hermes invocation to a remote runner over HTTP/SSE.
 *
 * Mirrors the runChildProcess signature from @paperclipai/adapter-utils so the
 * rest of the adapter stays unchanged. The remote runner is paperclip-hermes-
 * gateway's "runner" service, listening on the hermes box.
 */

const SSE_EVENT_RE = /^event:\s*(.+)$/;
const SSE_DATA_RE = /^data:\s*(.*)$/;

function parseEvents(buffer) {
    const events = [];
    let remainder = buffer;
    while (true) {
        const idx = remainder.indexOf("\n\n");
        if (idx === -1) break;
        const block = remainder.slice(0, idx);
        remainder = remainder.slice(idx + 2);
        let eventName = null;
        const dataLines = [];
        for (const line of block.split("\n")) {
            const e = SSE_EVENT_RE.exec(line);
            if (e) {
                eventName = e[1].trim();
                continue;
            }
            const d = SSE_DATA_RE.exec(line);
            if (d) {
                dataLines.push(d[1]);
            }
        }
        if (!eventName) continue;
        let data = null;
        try {
            data = JSON.parse(dataLines.join("\n"));
        } catch {
            data = null;
        }
        events.push({ event: eventName, data });
    }
    return { events, remainder };
}

export async function dispatchRemote(runId, command, args, opts, remote) {
    const { onLog, env, cwd, timeoutSec, graceSec, stdin, onSpawn } = opts;
    const { url, token } = remote;

    if (!url) {
        throw new Error("hermes-remote: remoteRunnerUrl missing");
    }
    if (!token) {
        throw new Error("hermes-remote: runnerAuthToken missing");
    }

    const body = {
        runId,
        args: [command, ...args].slice(1),
        env,
        cwd,
        timeoutSec,
        graceSec,
        ...(stdin ? { stdin } : {}),
    };

    let response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${token}`,
                accept: "text/event-stream",
            },
            body: JSON.stringify(body),
        });
    } catch (err) {
        throw new Error(`hermes-remote: connect failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`hermes-remote: HTTP ${response.status}: ${text.slice(0, 200)}`);
    }

    if (!response.body) {
        throw new Error("hermes-remote: missing response body");
    }

    let stdoutAcc = "";
    let stderrAcc = "";
    let exitCode = null;
    let signal = null;
    let timedOut = false;
    let pid = null;
    let startedAt = null;
    let buffer = "";
    let exitSeen = false;

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const { events, remainder } = parseEvents(buffer);
            buffer = remainder;
            for (const evt of events) {
                if (!evt.data) continue;
                if (evt.event === "spawn") {
                    pid = typeof evt.data.pid === "number" ? evt.data.pid : null;
                    startedAt = typeof evt.data.startedAt === "string" ? evt.data.startedAt : null;
                    if (onSpawn && pid !== null && startedAt) {
                        try {
                            await onSpawn({ pid, startedAt });
                        } catch {
                            // swallow — onSpawn shouldn't break the run
                        }
                    }
                } else if (evt.event === "stdout") {
                    const chunk = typeof evt.data.chunk === "string" ? evt.data.chunk : "";
                    if (chunk) {
                        stdoutAcc += chunk;
                        try {
                            await onLog("stdout", chunk);
                        } catch {
                            // ignore; keep streaming
                        }
                    }
                } else if (evt.event === "stderr") {
                    const chunk = typeof evt.data.chunk === "string" ? evt.data.chunk : "";
                    if (chunk) {
                        stderrAcc += chunk;
                        try {
                            await onLog("stderr", chunk);
                        } catch {
                            // ignore
                        }
                    }
                } else if (evt.event === "exit") {
                    exitSeen = true;
                    exitCode = typeof evt.data.code === "number" ? evt.data.code : null;
                    signal = typeof evt.data.signal === "string" ? evt.data.signal : null;
                    timedOut = evt.data.timedOut === true;
                }
            }
        }
    } finally {
        try { reader.releaseLock(); } catch { /* noop */ }
    }

    if (!exitSeen) {
        throw new Error("hermes-remote: stream ended before exit event");
    }

    return {
        exitCode,
        signal,
        timedOut,
        stdout: stdoutAcc,
        stderr: stderrAcc,
        pid,
        startedAt,
    };
}
