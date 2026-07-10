---
name: prepare-release
description: Prepare an AntanI release PR. Bumps the version in tauri.conf.json, Cargo.toml, and package.json in sync, branches from main, commits, pushes, and opens a PR titled "Release vX.Y.Z" via gh. Use when the user asks to prepare/cut/ship a release, or says something like "prepare the release PR" or "release vX.Y.Z".
---

# Prepare an AntanI release

Merging a PR titled `Release vX.Y.Z` into `main` is what triggers
`.github/workflows/release.yml` (build + draft GitHub Release), which in turn
triggers `.github/workflows/bump-tap.yml` on publish (updates the
`skixmix/homebrew-antani` tap). This skill only prepares and opens that PR —
it never merges, publishes a release, or touches the tap directly.

## Steps

1. **Preconditions**: `gh auth status` must succeed (if not, tell the user to
   run `gh auth login` themselves — never attempt to log them in). Working
   tree must be clean; if not, stop and ask rather than stashing/discarding.
   Checkout and pull `main`.

2. **Current version**: read `.version` from `src-tauri/tauri.conf.json` —
   this is the single source of truth for "current version."

3. **Target version**: if the user gave an explicit version (e.g. "release
   v0.2.0"), use it. Otherwise inspect commits since the last `vX.Y.Z` tag
   (`git log <last-tag>..main --oneline`) and suggest a bump using
   conventional-commit-ish signal: a `!` after the type or a `BREAKING
   CHANGE` footer -> major; any `feat:` -> minor; otherwise -> patch. Always
   confirm the suggested version with the user via AskUserQuestion before
   proceeding — never assume.

4. **Bump in sync**, exact same version string in all three:
   - `src-tauri/tauri.conf.json` (`"version"` field)
   - `src-tauri/Cargo.toml` (`version = "..."` under `[package]`)
   - `package.json` (`"version"` field)

5. **Branch**: `git checkout -b release/vX.Y.Z` from `main`.

6. **Commit**: `git commit -am "Release vX.Y.Z"` — only the three version
   files, nothing else. If other unrelated changes are staged/dirty, stop
   and ask first.

7. **Push**: `git push -u origin release/vX.Y.Z`.

8. **Open the PR** — title must start with exactly `Release ` (this is what
   `release.yml` matches on the squash-merge commit message):
   ```
   gh pr create --title "Release vX.Y.Z" --base main --head release/vX.Y.Z \
     --body "Version bump only. Merging triggers the build + draft release; publish it manually to update the Homebrew tap."
   ```

9. **Report** the PR URL back to the user, and remind them of the two manual
   gates still ahead: merging this PR (once CI + review pass) and clicking
   **Publish** on the resulting draft GitHub Release.
