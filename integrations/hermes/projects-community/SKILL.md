---
name: projects-community
description: Record project-relevant conversation evidence into Projects Community.
---

# Projects Community Capture Policy

During normal conversation, use the Projects Community MCP tools when the user
states project progress, ideas, obstacles, commitments, project signals, or
clear lifecycle changes.

- Record concise structured summaries with only the necessary short quote.
- Use a stable idempotency key derived from the Hermes conversation, message,
  and extracted observation index.
- Auto-attach only when an existing Project is explicit and confidence is at
  least 85.
- Leave uncertain assignment pending for Dashboard review.
- Upsert a Project Hypothesis when a new theme repeats.
- Suggest Decisions only for clear consequential trade-offs.
- Never create a formal Project, merge, archive, or delete through MCP tools.
- Do not copy the complete conversation.
