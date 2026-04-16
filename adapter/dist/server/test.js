/**
 * Environment test for the hermes-remote adapter.
 *
 * Unlike the local Hermes adapter, hermes is NOT on the paperclip server here.
 * We can only verify what's reachable from this side: the runner's HTTP
 * endpoint, plus paperclip-side config sanity (URL, token, model, env).
 */
import { ADAPTER_TYPE } from "../shared/constants.js";

function asString(v) {
    return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

async function checkRunnerReachable(url, token) {
    let healthUrl;
    try {
        const u = new URL(url);
        u.pathname = u.pathname.replace(/\/run\/?$/, "/health");
        if (!u.pathname.endsWith("/health")) {
            u.pathname = (u.pathname.replace(/\/$/, "") || "") + "/health";
        }
        healthUrl = u.toString();
    } catch {
        return {
            level: "error",
            message: `Invalid remoteRunnerUrl: ${url}`,
            code: "hermes_remote_url_invalid",
        };
    }

    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5_000);
        const res = await fetch(healthUrl, {
            method: "GET",
            headers: token ? { authorization: `Bearer ${token}` } : {},
            signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (!res.ok) {
            return {
                level: "error",
                message: `Runner /health returned HTTP ${res.status}`,
                hint: `Confirm the runner is running and reachable at ${healthUrl}`,
                code: "hermes_remote_health_bad",
            };
        }
        const body = await res.json().catch(() => ({}));
        const version = typeof body.version === "string" ? body.version : "unknown";
        return {
            level: "info",
            message: `Runner reachable (version ${version})`,
            code: "hermes_remote_runner_ok",
        };
    } catch (err) {
        return {
            level: "error",
            message: `Runner unreachable: ${err instanceof Error ? err.message : String(err)}`,
            hint: `Check that the runner is running on the hermes box and that ${healthUrl} is routable from paperclip`,
            code: "hermes_remote_unreachable",
        };
    }
}

function checkConfig(config) {
    const checks = [];
    if (!asString(config.remoteRunnerUrl)) {
        checks.push({
            level: "error",
            message: "adapterConfig.remoteRunnerUrl is required",
            hint: "Set the URL of the paperclip-hermes-gateway runner, e.g. https://hermes-box.tailnet.ts.net/run",
            code: "hermes_remote_url_missing",
        });
    }
    if (!asString(config.runnerAuthToken)) {
        checks.push({
            level: "error",
            message: "adapterConfig.runnerAuthToken is required",
            hint: "Set the same bearer token configured as RUNNER_AUTH_TOKEN on the runner",
            code: "hermes_remote_token_missing",
        });
    }
    const model = asString(config.model);
    if (model) {
        checks.push({
            level: "info",
            message: `Model: ${model}`,
            code: "hermes_model_configured",
        });
    } else {
        checks.push({
            level: "info",
            message: "No model specified — the runner box's hermes will use its configured default",
            code: "hermes_configured_default_model",
        });
    }
    return checks;
}

export async function testEnvironment(ctx) {
    const config = (ctx.config ?? {});
    const checks = checkConfig(config);
    const url = asString(config.remoteRunnerUrl);
    const token = asString(config.runnerAuthToken);
    if (url && token) {
        const reach = await checkRunnerReachable(url, token);
        checks.push(reach);
    }
    const hasErrors = checks.some((c) => c.level === "error");
    const hasWarnings = checks.some((c) => c.level === "warn");
    return {
        adapterType: ADAPTER_TYPE,
        status: hasErrors ? "fail" : hasWarnings ? "warn" : "pass",
        checks,
        testedAt: new Date().toISOString(),
    };
}
