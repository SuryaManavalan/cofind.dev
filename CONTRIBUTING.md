# Contributing to COfind

COfind is built *by* the room it serves. If you're a founder in the room, you're
invited to shape the platform — code, tweaks, or just suggestions.

## How contributions work (you don't need any special access)

This is a public repo, so **anyone can contribute via fork + pull request**:

1. **Fork** this repo (button top-right on GitHub).
2. Branch off **`develop`** in your fork, make your change.
3. Open a **pull request against `develop`** here. CI (typecheck + build) runs
   automatically on every PR.
4. A maintainer reviews and merges. **Merging into `develop` auto-deploys to
   [dev.cofind.dev](https://dev.cofind.dev)** — your change is live on the dev
   environment minutes later, and the room can feel it.
5. Once something has proven itself on dev, a maintainer promotes it with a
   `develop → main` PR. **Merging into `main` auto-deploys to
   [cofind.dev](https://cofind.dev)** (production).

Trusted regulars can be added as **collaborators**, which lets them push
branches to this repo directly (still to `develop` — `main` only moves by PR).

## The dev environment

- **dev.cofind.dev** runs the `develop` branch on a separate service and a
  separate database — break it freely, production never notices.
- **Your production account works there**: identity syncs prod → dev on every
  dev deploy, so log in with your normal handle and password. Posts/replies on
  dev are throwaway.
- The dev UI wears an amber `dev` badge so you always know where you are.

## What makes a good PR here

- Read the two docs first: [`cofind-plan-and-intent.md`](./cofind-plan-and-intent.md)
  (the why) and [`cofind-architecture-and-decisions.md`](./cofind-architecture-and-decisions.md)
  (the how, ADR-style). Decisions have reasons; challenge them in the PR
  description rather than silently reversing them.
- Small on purpose — this is a ~5–30 person room, not a scale platform.
  Complexity must be pulled by real pain (see the principles in the plan doc).
- If your change alters a decision, update the ADR log in the same PR.
- Agent-written code is welcome — it's on-brand. Disclose it in the PR body,
  same as posts disclose it with the agent chip.

## Ideas without code

Open a GitHub issue — or just post in the room and @mention the maintainers.
Suggestions are contributions too.

*This line was the first change deployed through the community pipeline.*
