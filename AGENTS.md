# AGENTS.md

Fixed rules for all AI agents (Claude, Codex, Copilot, …) working in this repo. This file is the main source; `CLAUDE.md` only points here.

## What this is

The official Kanban plugin for [dvoix](https://github.com/dvoi-dev/dvoix), installed through the plugin store in the app. It adds the file type `.kboard`: a Markdown file in which every `## heading` is a column and every top-level list item is a card. The API it uses is described in `docs/plugins/README.md` of the app repo; read it before changing anything that talks to `dvoix`.

## The dvoix repos

dvoix is spread across several repositories. This section is also in the `AGENTS.md` of every repo. Whoever changes it, changes it in all of them.

| Repo | Purpose | What belongs there |
| --- | --- | --- |
| [`dvoi-dev/dvoix`](https://github.com/dvoi-dev/dvoix) | the app | Rust core, Tauri shell, Svelte frontend, core plugins, plugin API, plugin store in the app, developer guide for store plugins (`docs/plugins/`), developer README |
| [`dvoi-dev/dvoix-website`](https://github.com/dvoi-dev/dvoix-website) | product page and docs | product page at `/`, user and plugin developer docs at `/docs`, screenshots for the page, Docker image for the server |
| [`dvoi-dev/dvoix-plugins`](https://github.com/dvoi-dev/dvoix-plugins) | list of the plugin store | only `registry.json` and its check (`scripts/validate.mjs`). No plugin code |
| `dvoi-dev/dvoix-<name>` | one official store plugin each | code, `manifest.json`, releases with `manifest.json`, `main.js`, `styles.css` |

### Where does what go?

| Task | Repo |
| --- | --- |
| Basic function almost everyone needs (explorer, search, tasks, …) | `dvoix`, as a core plugin under `src/lib/plugins/core/` |
| Extra function not everyone wants (kanban, tracking, …) | its own repo `dvoi-dev/dvoix-<name>` as a store plugin, plus an entry in `dvoix-plugins` |
| Extend the plugin API (`PluginContext`, permissions) | `dvoix`, plus `docs/plugins/README.md` there and the `plugin-api.md` page on the website |
| Explain how to use dvoix | `dvoix-website`, page in `src/content/docs/` |
| Offer or remove a plugin in the store | `dvoix-plugins`, `registry.json` |
| Bug in a store plugin | in the plugin's repo, not in the app |

### What is connected across repo boundaries

- **Format of the plugin list:** defined in `crates/dvoix-core/src/store.rs` (`parse_registry`) of the app, example in `docs/plugins/registry.example.json`, checked by `scripts/validate.mjs` in `dvoix-plugins`. If the format changes, all three places change.
- **Address of the plugin list:** the app reads `https://raw.githubusercontent.com/dvoi-dev/dvoix-plugins/main/registry.json`. Never change the repo name, the branch `main` or the file name, or no installed app finds plugins anymore.
- **Official:** `"channel": "official"` only applies to repos of `dvoi-dev`. The app and the check in `dvoix-plugins` both enforce this.
- **Plugin API:** `src/lib/plugins/store/api.ts` in the app, `docs/plugins/README.md` in the app and `src/content/docs/plugin-api.md` on the website describe the same API and must match.
- **Features of the app:** what the website docs say about the app must match the code in `dvoix`. If the app changes in a way users see, the docs are updated.

### Changes across several repos

- One PR per repo. The PRs link to each other in their descriptions.
- Merge order: first the app (`dvoix`), then `dvoix-plugins` and `dvoix-website`. A doc or plugin list must not promise anything the app does not yet support on `main`.
- For all repos the same applies: code, comments and commit messages in English, everything users see in English too; always the newest stable versions of Node.js, dependencies and GitHub Actions; never push directly to `main`.

## Basic rules

1. **The file is the only source of truth.** The view keeps no state of its own that is not in the `.kboard` file. It never writes the file itself: every change goes to `onchange`, the app saves.
2. **The format stays plain Markdown** that people can read and edit without dvoix. Lines the plugin does not understand (frontmatter, text inside a column, headings of other levels) are kept when writing back. A file in canonical shape (see `src/board.js`) must come back byte for byte; a test checks this.
3. **Changes from outside are taken over** (sync, git, another editor). While the user edits a card or drags, a newer file is held back and applied right after, without losing the edit.
4. **Task syntax like in the app.** Due dates and priorities on cards use the syntax of `crates/dvoix-core/src/tasks.rs` in the app (`📅 2026-12-01`, `due:2026-12-01`, `⏫ 🔼 🔽`, `!high`/`!medium`/`!low`, German words only as aliases). If the app changes it, this plugin follows.
5. **Only the API, no app internals.** The plugin talks to the app only through the `dvoix` object it gets in `onload`. It asks for no permissions today; add one to `manifest.json` only when a feature really needs it, because users see the list before installing.
6. **Never change the `id`** (`kanban`) **or the extension** (`.kboard`). The id is the folder name in `<vault>/.dvoix/plugins/kanban/` and the key in the plugin list; the extension is what existing boards of users are saved as.
7. **Always the newest versions** of Node.js (`.nvmrc`, `engines`), esbuild and the GitHub Actions.
8. **Everything is in English**: code, comments, commit messages, UI texts, README.

## Layout

```
manifest.json          id, name, version, permissions; becomes a release asset as is
styles.css             styles, all classes prefixed with kb-; becomes a release asset as is
src/main.js            entry point: registers the file type
src/board.js           parse and write the .kboard format, due/priority markers (no DOM)
src/view.js            the board view (plain DOM, pointer-event drag and drop)
test/board.test.js     tests for the format (node --test)
scripts/build.mjs      bundles src/ into dist/main.js and copies manifest.json and styles.css
.github/workflows/     ci.yml (test + build), release.yml (release on main)
```

## Commands

```sh
npm install      # once
npm test         # tests of the format
npm run build    # dist/ with manifest.json, main.js, styles.css
```

Both must pass before every commit, as in the CI. If a check cannot run locally, say so instead of claiming success.

## Releasing

A release is created by `release.yml` when `main` has a `version` in `manifest.json` that has no release yet. To release: raise the version in `manifest.json` **and** `package.json` (the build fails if they differ) in a PR, merge it. Tags are the version without `v`. Never move or delete a published tag; installed apps compare versions.

## Conventions

- Comments explain the why, not the what. Every file starts with a short comment on what it is for.
- `main.js` is one ES module without imports, so everything is bundled with esbuild. No runtime dependencies.
- Colors only through the app's CSS variables (`var(--color-zinc-800, #27272a)`) with the value as fallback. No new accent colors: violet is the only one.
- Small, focused changes, one topic per PR. Never push directly to `main`.
