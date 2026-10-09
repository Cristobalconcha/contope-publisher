# ContOpe Design WordPress — Agent Rules

Read this file before changing the repository.

## Where the architecture lives — read it first

**This repository does not contain the architecture that governs it.** The
governing document is, outside this repo:

```
Contope-Design/vault_contope-design/arquitectura-page-builder-compositivo.md
```

Read it before designing anything. `docs/` here covers formats and plans
(`package-format-v1.md`, `implementation-plan.md`, …), not the thesis.

Why this pointer exists: on 2026-10-03 a whole morning was lost designing in
circles, and twice an agent told Cristóbal that something "is not written"
when it was written there in detail. It was not a bad search — nothing in this
repo pointed anywhere. These were answered in that document and were
rediscovered the hard way:

| Question that came up | Section |
|---|---|
| Who owns the content, ContOpe or WordPress? | §6 — *"COD's absence may remove presentation and behaviour, but must not take the user's content away"* |
| How far may a user extend the system? | §9 — use / compose / extend / modify are four different things |
| Where do reusable modules and sharing go? | §7 and §8 — site, user and community libraries |
| How is CSS persisted? | §11 — three distinct representations |

Its closing section, **«Estado y próximas definiciones»**, lists eight
contracts to specify *before* implementing. Check that list before building:
two of them (the Gutenberg mapping of each primitive, and the CSS module
contract) were being touched blindly that morning.

## Product boundary

This repository builds the WordPress side of an open, bidirectional design workflow:

- `ContOpe Canvas`: a generic block-theme engine.
- `ContOpe Publisher/Tools`: import, export, identity, assets, editor extensions, synchronization, and a future MCP surface.
- generated project child themes such as Santa Luisa de Palpi.

WordPress must remain fully usable without AI or ContOpe Design Desktop. Imports must create native, editable WordPress entities rather than an iframe or opaque HTML blob. Export must support a faithful, editable reconstruction in another WordPress installation and must also be readable by ContOpe Design Desktop as an existing project.

## Safety and ownership

- Work only in the branch/worktree assigned in the task file.
- Modify only the explicit allowlist in that task. Stop and report if another path is required.
- Preserve user changes and unrelated work.
- Never read, print, copy, or edit `.env.local`.
- Never deploy, activate themes/plugins, call production APIs, push, or alter Git history. The Codex integrator owns those actions.
- Commits and versioning are not reserved to Codex. An agent the owner has authorized to work directly in this repository may commit (and bump the plugin version following the repository convention) on its own task branch, push that branch and open a draft pull request; merging into `main`, deploying and activating stay with the owner. Owner, 2026-10-09: «No tiene por qué ser para codex. No tengo reglas para eso».
- Never declare a stage complete. Report changed files, exact command results, limitations, and remaining work.
- Any failed required check means `NOT COMPLETE`.
- Do not add runtime dependencies without documenting license, size, and need.
- Do not add secrets, users, absolute machine paths, generated ZIP files, `node_modules`, or deployment output.

## Engineering rules

- PHP must target WordPress APIs and PHP 8.0+.
- Prefer core Gutenberg blocks and standard WordPress entities.
- Treat stable ContOpe Design IDs as immutable external identity; never use slugs as identity.
- Reject unknown or lossy package data explicitly instead of silently dropping it.
- Portable paths must be relative, normalized, and protected against traversal.
- The site must function without MCP, external AI, or network fonts.
- Use `npm` in this repository; it has `package-lock.json` and is independent from the desktop monorepo.
- Run `npm run check` and `git diff --check` when applicable, plus the focused checks required by the task.

## Multi-agent protocol

- One owner per file at a time.
- Claude Code and OpenCode implement in separate worktrees.
- Cline is not on the critical path and may receive only small mechanical tasks with a closed file allowlist.
- Codex owns architecture, shared contracts, integration, final verification, deployment, and the Obsidian bitácora. Commits are not exclusive to Codex (see «Safety and ownership», 2026-10-09).
- Handoffs must include base commit, files changed, tests with exit status, risks, and a concise diff summary.

### Review loop

Non-trivial tasks use a bounded implementation loop instead of accepting a one-shot report:

1. one agent implements in its allowlisted worktree;
2. Codex runs independent checks and records concrete findings;
3. a second agent reviews the diff without editing it;
4. validated findings return to the same implementer session;
5. Codex integrates only after the final gates pass.

Use at most three correction iterations per task. Stop earlier when the diff satisfies acceptance. Stop and escalate if the same failure repeats, the error count does not decrease, scope must expand, or checks expose an architectural conflict. Agent prose never overrides a failing command or an unverified runtime result.
