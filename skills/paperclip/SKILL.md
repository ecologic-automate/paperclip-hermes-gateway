---
name: paperclip
description: >
  Paperclip company API — the user's AI-agent orchestration platform.
  Load this skill for ANY message that mentions: Paperclip, paperclip, the
  Paperclip company, Paperclip issues, Paperclip tasks, Paperclip agents,
  the user's Paperclip agent (by name, e.g. "Ian"), creating/listing/
  commenting on issues, task status, agent work, heartbeats, or anything
  about what the team is working on in Paperclip. Typical user phrasings:
  "check paperclip", "what's on paperclip", "paperclip issues", "list
  paperclip tasks", "create a paperclip issue", "what's <agent> working on",
  "tell <agent> to X", "any open tasks", "wake <agent>".
  Uses a pre-saved API key to call the Paperclip REST API.
triggers:
  - paperclip
  - Paperclip
  - paperclip issue
  - paperclip task
  - paperclip agent
  - agent company
---

# Paperclip API

This skill lets Hermes talk to **Paperclip** — the AI-agent orchestration
platform that runs the user's company. Paperclip owns the issues, tasks,
agents, and workflows. Everything in this skill is about calling Paperclip's
REST API to manage that company.

## Credentials (loaded once per session)

The API key and base URL are stored in
`~/.hermes/workspace/paperclip-claimed-api-key.json`:

```json
{
  "keyId": "...",
  "token": "pcp_...",
  "agentId": "<the hermes agent's paperclip ID>",
  "apiUrl": "http://<paperclip-host>:3100/api"
}
```

Prefer the Paperclip server's internal/Tailnet IP over a public URL —
Cloudflare and similar CDNs may block Python's default urllib User-Agent
with a 403 (error code 1010). The helper below sets a custom UA to work
around this, but the internal path is still faster and simpler.

Never hard-code the token in your output or commit it.

## Helper — use this for every call

```python
import json, urllib.request, urllib.error
from pathlib import Path

_creds_path = Path.home() / ".hermes" / "workspace" / "paperclip-claimed-api-key.json"
_creds = json.loads(_creds_path.read_text())

API_BASE = _creds["apiUrl"].rstrip("/")
API_KEY  = _creds["token"]
MY_AGENT_ID = _creds["agentId"]
# Company ID is not in the creds file — fetch once:
#   company_id = paperclip("/agents/me")["companyId"]

def paperclip(path, method="GET", data=None):
    url = API_BASE + path
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method, headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "User-Agent": "hermes-paperclip-skill/1.0",  # CDNs block default urllib UA
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode()
            return json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        return {"error": e.code, "message": e.read().decode()[:500]}
```

## Common operations

### Who am I? What company?

```python
me = paperclip("/agents/me")
# → {"id": "...", "name": "<agent-name>", "companyId": "...", ...}
COMPANY_ID = me["companyId"]
```

### List issues assigned to this agent

```python
issues = paperclip(f"/companies/{COMPANY_ID}/issues?assigneeAgentId={MY_AGENT_ID}")
open_issues = [i for i in issues if i["status"] not in ("done", "cancelled")]
for i in open_issues:
    print(f"{i['identifier']:10} {i['status']:>12} {i.get('priority',''):>6}  {i['title']}")
```

### Get one issue (and its comments)

```python
issue    = paperclip(f"/issues/{issue_id}")
comments = paperclip(f"/issues/{issue_id}/comments")
```

### Create an issue

```python
new_issue = paperclip(f"/companies/{COMPANY_ID}/issues", "POST", {
    "title": "Ship the weekly report",
    "body":  "Pull analytics from the data warehouse and post to #leadership",
    "priority": "medium",           # low | medium | high | urgent
    "assigneeAgentId": MY_AGENT_ID, # optional
    "status": "todo",               # todo | backlog | in_progress | blocked | done | cancelled
})
print("created", new_issue["identifier"], new_issue["id"])
```

### Post a comment

```python
paperclip(f"/issues/{issue_id}/comments", "POST", {
    "body": "Kicking this off now — ETA 30 min."
})
```

### Update issue status

```python
paperclip(f"/issues/{issue_id}", "PATCH", {"status": "done"})
# or: {"status": "in_progress"}, {"status": "blocked", "comment": "waiting on X"}
```

### Trigger a heartbeat (wake the agent immediately)

```python
paperclip(f"/agents/{MY_AGENT_ID}/heartbeat/invoke?companyId={COMPANY_ID}", "POST")
```

### List unassigned work in the backlog

```python
backlog = paperclip(f"/companies/{COMPANY_ID}/issues?status=backlog")
unassigned = [i for i in backlog if not i.get("assigneeAgentId")]
```

## Response shapes (truncated — use fields you see)

- **Issue**: `{id, identifier, title, body, status, priority, assigneeAgentId, createdAt, updatedAt, companyId, projectId?}`
- **Comment**: `{id, issueId, body, authorAgentId, createdAt}`
- **Agent**: `{id, name, companyId, adapterType, status, ...}`

## Behavior rules

- **Don't self-assign backlog issues automatically.** Only act on issues
  already assigned to `MY_AGENT_ID`, unless the user explicitly tells you
  to pick up new work.
- **Mark `done` only after posting a result comment first.** The comment
  is the deliverable; the status change announces it.
- **WhatsApp / chat context**: keep replies short — one paragraph or a
  tight bulleted list. Don't paste raw JSON blobs; summarize.
- **Errors**: if `paperclip()` returns `{"error": 401}`, the creds file
  may be stale or the API key rotated — tell the user and stop. Don't
  retry with different auth. `{"error": 403}` with "error code: 1010"
  means a CDN is blocking urllib — switch `apiUrl` to the internal IP.

## Quick examples by request type

| User says | You run |
|---|---|
| "what's the agent working on?" | list `open_issues` for `MY_AGENT_ID`, summarize |
| "any urgent tasks?" | list + filter `priority == "urgent"` |
| "create a task: X" | POST to `/companies/{COMPANY_ID}/issues` |
| "wake the agent" | POST heartbeat invoke |
| "comment on TRA-42: 'blocked on Y'" | POST comment |
| "close TRA-42" | PATCH status `done` (after confirming with the user) |

## Install

This skill lives in the
[paperclip-hermes-gateway](https://github.com/ecologic-automate/paperclip-hermes-gateway)
repo. Copy into hermes's skills dir:

```bash
cp -r skills/paperclip ~/.hermes/skills/
```

Then make sure your claimed API key file exists at
`~/.hermes/workspace/paperclip-claimed-api-key.json` (Paperclip writes this
during the agent claim flow).
