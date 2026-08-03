# Open CoDesign WordPress — Agent Rules

Read this file before changing the repository.

## Product boundary

This repository builds the WordPress side of an open, bidirectional design workflow:

- `Open CoDesign Canvas`: a generic block-theme engine.
- `Open CoDesign Publisher/Tools`: import, export, identity, assets, editor extensions, synchronization, and a future MCP surface.
- generated project child themes such as Santa Luisa de Palpi.

WordPress must remain fully usable without AI or Open CoDesign Desktop. Imports must create native, editable WordPress entities rather than an iframe or opaque HTML blob. Export must support a faithful, editable reconstruction in another WordPress installation and must also be readable by Open CoDesign Desktop as an existing project.

## Safety and ownership

- Work only in the branch/worktree assigned in the task file.
- Modify only the explicit allowlist in that task. Stop and report if another path is required.
- Preserve user changes and unrelated work.
- Never read, print, copy, or edit `.env.local`.
- Never deploy, activate themes/plugins, call production APIs, commit, push, or alter Git history. The Codex integrator owns those actions.
- Never declare a stage complete. Report changed files, exact command results, limitations, and remaining work.
- Any failed required check means `NOT COMPLETE`.
- Do not add runtime dependencies without documenting license, size, and need.
- Do not add secrets, users, absolute machine paths, generated ZIP files, `node_modules`, or deployment output.

## Engineering rules

- PHP must target WordPress APIs and PHP 8.0+.
- Prefer core Gutenberg blocks and standard WordPress entities.
- Treat stable Open CoDesign IDs as immutable external identity; never use slugs as identity.
- Reject unknown or lossy package data explicitly instead of silently dropping it.
- Portable paths must be relative, normalized, and protected against traversal.
- The site must function without MCP, external AI, or network fonts.
- Use `npm` in this repository; it has `package-lock.json` and is independent from the desktop monorepo.
- Run `npm run check` and `git diff --check` when applicable, plus the focused checks required by the task.

## Multi-agent protocol

- One owner per file at a time.
- Claude Code and OpenCode implement in separate worktrees.
- Cline is not on the critical path and may receive only small mechanical tasks with a closed file allowlist.
- Codex owns architecture, shared contracts, integration, final verification, commits, deployment, and the Obsidian bitácora.
- Handoffs must include base commit, files changed, tests with exit status, risks, and a concise diff summary.

