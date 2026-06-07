# Projects Community

Your research neighborhood — a local-first, gamified research workspace with a quiet AI Realizer, Shenzhen-inspired community map, and structured decision-making.

## Tech Stack

- **Runtime:** Node.js 20+
- **Framework:** Next.js 15 (App Router, Server Actions)
- **Database:** SQLite via better-sqlite3 + Drizzle ORM
- **AI:** Vercel AI SDK (OpenAI / Anthropic)
- **Styling:** Tailwind CSS 4, dark theme
- **Map:** Canvas-based isometric renderer

## Quick Start

```bash
git clone https://github.com/123qwe55aa/projects-community.git
cd projects-community
npm install
cp .env.local.example .env.local
# Add your OPENAI_API_KEY to .env.local
npm run dev
```

Open http://localhost:3000

## Architecture

### Data Model (12 tables)

Projects, Decisions, Candidates, Conversations, Messages, Pins, Recommendations, Adoption Snapshots, Research Jobs, and more — all in a single SQLite database for zero-config local-first operation.

### Three Entry Points

1. **Community Map** — isometric Shenzhen-inspired neighborhood. Each Project is a building that grows with research activity. Click to enter.
2. **Projects** — long-term context and conversations. Each project has a background, auto-maintained summary, linked decisions, and adoption history.
3. **Decisions** — structured proposal decisions with candidate branches, independent research, AI-assisted comparison, and adoption tracking.

### AI Realizer

A quiet research companion — never an advisor, never nudging. The Realizer follows 13 strict behavioral rules:
- Waits silently, never greets or prompts
- Clarifies vague ideas, points out blind spots
- Performs evidence-based research with source links
- States uncertainty clearly
- Proposes decisions and candidates ONLY with explicit user confirmation
- Compares candidates ONLY on explicit request
- Never adopts on the user's behalf

### Decision Lifecycle

```
researching → deferred → decided → archived (→ researching)
```

Each decision can have multiple candidate branches. Candidates are isolated — their research contexts don't leak. Comparison is explicit and produces a recommendation. Adoption creates an immutable snapshot.

## How to Use

1. **Create a Project** — give it a background and building style
2. **Discuss with the Realizer** — explore ideas, clarify scope
3. **Create a Decision** — when the Realizer identifies a decision-worthy question
4. **Add Candidates** — research each independently in isolated conversations
5. **Compare** — request a comparison across dimensions and weights
6. **Adopt** — choose a candidate; creates an immutable snapshot
7. **Reopen** — continue research anytime; previous snapshots preserved

## Environment Variables

Copy `.env.local.example` and fill in:

```env
# Required
OPENAI_API_KEY=sk-...

# Optional — for Anthropic provider
ANTHROPIC_API_KEY=sk-ant-...
AI_PROVIDER=anthropic  # default: openai
OPENAI_MODEL=gpt-4o-mini
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

## License

MIT
