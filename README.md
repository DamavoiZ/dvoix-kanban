# dvoix Kanban

Kanban boards for [dvoix](https://github.com/dvoi-dev/dvoix). Official store plugin: install it in dvoix under **Settings → Plugin store**.

## What it does

- New file type `.kboard`. Create one in the file explorer with **Create Kanban board**; it starts with the columns *To do*, *Doing* and *Done*.
- Add, edit, tick off and delete cards. Drag cards within a column or to another one.
- Add, rename (double-click the name), delete and reorder columns (drag the column header).
- Cards show due dates and priorities written in the same syntax as tasks in notes. Overdue cards are marked.
- The plugin asks for no permissions: it only reads and changes the `.kboard` file that is open.

| Action | How |
| --- | --- |
| Edit a card | double-click it; Enter saves, Shift+Enter adds a line, Esc cancels. Empty text deletes the card |
| Add several cards | **+ Add card**, then Enter after each one |
| Delete a card or column | the × button, then click it a second time to confirm |
| Cancel a drag | Esc |

## The file format

A board is plain Markdown, so it stays readable and editable without dvoix (the same idea as the Kanban plugin of Obsidian):

```markdown
## To do

- [ ] Write the offer 📅 2026-12-01 !high
  More lines of a card are indented.
- [ ] Call the client

## Doing

## Done

- [x] Set up the project
```

- Every `## heading` is a column, every top-level list item below it a card. `- [ ]` / `- [x]` give the card a checkbox, a plain `- ` item has none.
- Due date: `📅 2026-12-01` or `due:2026-12-01`. Priority: `⏫` / `🔼` / `🔽` or `!high` / `!medium` / `!low`.
- Anything before the first column (frontmatter, a `# title`) and lines inside a column that are not cards are kept as they are and shown muted.
- When the board is saved, there is one blank line around each heading and none between cards. Everything else stays untouched.

## Development

Needs the current Node.js (see `.nvmrc`).

```sh
npm install
npm test         # tests of the format
npm run build    # dist/ with manifest.json, main.js, styles.css
```

To try a build without a release, copy the three files from `dist/` into `<vault>/.dvoix/plugins/kanban/`, reopen the vault, turn on "Allow community plugins" (copied plugins count as community plugins) and switch the plugin on under **Plugin store → Installed**.

Releases are made by the CI: raise `version` in `manifest.json` and `package.json`, merge to `main`, and `.github/workflows/release.yml` publishes the release with the three files. The rules for working in this repo are in [AGENTS.md](AGENTS.md).

## License

Available under the [MIT License](LICENSE-MIT) or the [Apache License 2.0](LICENSE-APACHE), at your choice, like dvoix.
