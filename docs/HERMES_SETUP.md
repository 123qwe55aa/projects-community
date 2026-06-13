# Hermes Setup

Install dependencies and initialize the database:

```sh
npm install && npm run db:seed
```

Add this server block to `~/.hermes/config.yaml`:

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
ln -s /Users/toby/Documents/Projects/projects-community/integrations/hermes/projects-community ~/.hermes/skills/projects-community
```

Restart Hermes, then ask it to record a clearly identified test Observation.
Verify that the Observation appears in SQLite and the Dashboard.
