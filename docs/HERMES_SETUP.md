# Hermes Setup

Projects Community exposes a local stdio MCP server so Hermes can record structured Observations,
Project Events, Decision suggestions, and repeated-evidence Project Hypotheses. Projects Community
stores only concise source quotes and Hermes conversation references, not full conversations.

## Initialize Projects Community

```sh
cd /Users/toby/Documents/Projects/projects-community
npm install
npm run db:seed
```

## Configure The MCP Server

Back up `~/.hermes/config.yaml`, then add this server block:

```yaml
mcp_servers:
  projects-community:
    command: node
    args:
      - /Users/toby/Documents/Projects/projects-community/node_modules/tsx/dist/cli.mjs
      - /Users/toby/Documents/Projects/projects-community/src/mcp/projects-community.ts
    env:
      PROJECTS_COMMUNITY_DB_PATH: /Users/toby/Documents/Projects/projects-community/data/projects-community.db
    enabled: true
    timeout: 120
```

Install the capture policy:

```sh
ln -s /Users/toby/Documents/Projects/projects-community/integrations/hermes/projects-community \
  ~/.hermes/skills/projects-community
```

Restart Hermes after changing its configuration.

## Capture Rules

- Every Hermes write must use a stable idempotency key derived from the source conversation,
  message, and intended record.
- Retrying the same tool call with the same key returns the original result and must not duplicate
  the record.
- Include only a necessary short source quote plus `sourceConversationRef` and `sourceMessageRef`.
- Use a proposed Project and assignment confidence only when Hermes can identify an existing
  Project.
- High-confidence assignments can attach automatically. Unassigned and low-confidence Observations
  remain in **Needs Attention** without changing a Project.
- Repeated themes may update a Project Hypothesis, but Hermes must not promote it to a formal
  Project.

## Real Smoke Test

Ask Hermes to record one clearly identified test Observation, then verify it appears exactly once
with its conversation reference:

```sh
sqlite3 data/projects-community.db \
  "select summary, source_conversation_ref from observations order by recorded_at desc limit 1;"
```

Open the Dashboard and confirm that a high-confidence assigned Observation appears on its Project,
or that an uncertain Observation appears in **Needs Attention**.

## Operations

Import existing V1 Projects into V2 event history:

```sh
npm run v2:migrate
```

Rebuild current Project snapshots from immutable history:

```sh
npm run v2:rebuild
```

Run the MCP server directly for troubleshooting:

```sh
npm run mcp
```
