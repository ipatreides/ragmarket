---
description: Bump version, write changelog, verify README, commit, push, and trigger the GitHub release workflow
argument-hint: [vX.Y.Z]
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, AskUserQuestion
---

Drive a full release of ragmarket end-to-end. Target version: $1 (if provided in `vX.Y.Z` form). Otherwise, propose one based on the changes since the last release tag.

## Where the version lives (4 source-of-truth files + CHANGELOG)

- `package.json` — `"version": "..."` line near the top
- `src-tauri/Cargo.toml` — `version = "..."` under `[package]`
- `src-tauri/tauri.conf.json` — `"version": "..."` at the root
- `README.md` — download link and filename: `ragmarket-vX.Y.Z-setup.exe`
- `CHANGELOG.md` — section headers + the link footer

All five must move together. The release workflow (`.github/workflows/release.yml`) fails the build if `package.json` and `Cargo.toml` disagree with the requested tag, so don't miss any.

## Steps

### 1. Read state
- Current version: read from `package.json`.
- Last release tag: `git describe --tags --abbrev=0`.
- Commits since tag: `git log <tag>..HEAD --oneline`.
- Uncommitted work: `git status -s` and `git diff HEAD --stat`.

### 2. Decide the new version
- If $1 is a valid `vX.Y.Z` (or `vX.Y.Z-rcN` for prereleases), use it.
- Otherwise scan commit subjects + the uncommitted diff and propose patch / minor / major. Confirm with `AskUserQuestion`:
  - **Patch (`vX.Y.Z+1`)** — bug fixes only
  - **Minor (`vX.Y+1.0`)** — backward-compatible features
  - **Major (`vX+1.0.0`)** — breaking changes
  - User can override with a specific version via the "Other" option.
- Refuse if the new version is not strictly greater than the current.

### 3. Build the changelog entry
- Open `CHANGELOG.md`. Style is Keep a Changelog (pt-BR).
- Read commits since the last tag + uncommitted diff. Group entries into these sections, in this order, omitting empty ones:
  - **Adicionado** (new features)
  - **Alterado** (behavior changes)
  - **Corrigido** (bug fixes)
  - **Performance** (speed / memory)
  - **Robustez** (defensive fixes not user-visible)
  - **Segurança**
- Write entries in **pt-BR**, matching the prose of prior 0.1.0 / 0.2.0 sections — specific, references files/components when relevant, no marketing tone, no emoji unless already in the section.
- Insert a new `## [X.Y.Z] - YYYY-MM-DD` block right under `## [Unreleased]`. Today's date.
- Keep `## [Unreleased]` as an empty placeholder above the new block.
- Update the link footer:
  - `[Unreleased]` compare URL now starts from `vX.Y.Z...HEAD`
  - Add a new `[X.Y.Z]: …/compare/v<prev>...vX.Y.Z` line above the existing ones.

### 4. Bump versions in source files
- `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`: edit the one version line each.
- `README.md`: replace **both** the link text and the URL filename so they point to the new `ragmarket-vX.Y.Z-setup.exe`.

### 5. Verify the README
- Re-read `README.md`.
- Diff what the **Adicionado**/**Alterado** sections of the new changelog say against what the README claims the app does (features list, FAQ, screenshots references).
- If something material is missing or stale (e.g. new tabs / features mentioned in the changelog but absent from the README intro or FAQ), surface specific edits with `AskUserQuestion`. Apply only what the user approves.
- If the README is fine, state that explicitly and move on.

### 6. Local verification
- Run `npm test`. If failing → STOP and report.
- Run `npm run build`. If failing → STOP and report.

### 7. Stage + commit
- Determine which files to stage. Default: everything modified in steps 3–5 + any pre-existing uncommitted feature work that belongs in this release.
- **Do NOT stage files that look accidental.** Use `AskUserQuestion` for any untracked file you're unsure about — there is currently a stray `stop` file in the repo root for example; ask the user whether to include / ignore / delete it before staging.
- Propose a commit subject + body via `AskUserQuestion`:
  - Subject pattern: `feat: <one-line summary> (vX.Y.Z)` for feature releases, `fix: …` for patch releases.
  - Body: 3–5 bullet highlights pulled from the changelog.
- Commit using HEREDOC for the message; include the `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` footer.

### 8. Push
- Confirm before pushing. Show: current branch, remote URL (`git remote get-url origin`), commit count ahead.
- `git push origin <current-branch>`.

### 9. Trigger the release workflow
- Confirm before triggering.
- Run `gh workflow run release.yml -f version=vX.Y.Z`. Add `-f prerelease=true` only for prerelease versions.
- Surface the workflow run URL: `gh run list --workflow=release.yml --limit 1 --json url,headBranch,displayTitle` and print the `url`.

### 10. Summary
Print:
- New version
- Changelog highlights
- Workflow run URL
- Reminder: when CI finishes, the new `ragmarket-vX.Y.Z-setup.exe` will be on the GitHub release page; check that the SHA256SUMS.txt is also attached.

## Safety

- Never push to `main` or trigger the workflow without explicit confirmation in this session.
- Never amend or force-push.
- Stop on any test or build failure — the version bump is uncommitted at that point so nothing is broken; fix and resume.
- If the current branch is not `main`, warn the user before pushing.
