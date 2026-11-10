// Tests for the `.kboard` format (src/board.js). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cardFromSource,
  cardMeta,
  cardSource,
  moveCard,
  moveColumn,
  parseBoard,
  serializeBoard,
  template,
} from "../src/board.js";

const CANONICAL = `---
kanban: board
---

# Launch

## To do

- [ ] Write the offer 📅 2026-12-01 !high
  Ask Anna for the prices.

  Second paragraph.
- [ ] Plain card

## Doing

## Done

- [x] Call the client
- no checkbox
`;

test("a canonical file comes back byte for byte", () => {
  assert.equal(serializeBoard(parseBoard(CANONICAL)), CANONICAL);
  assert.equal(serializeBoard(parseBoard(template())), template());
});

test("columns, cards and preamble are read", () => {
  const b = parseBoard(CANONICAL);
  assert.deepEqual(b.preamble, ["---", "kanban: board", "---", "", "# Launch"]);
  assert.deepEqual(
    b.columns.map((c) => [c.title, c.cards.length]),
    [["To do", 2], ["Doing", 0], ["Done", 2]],
  );
  const first = b.columns[0].cards[0];
  assert.equal(first.checked, false);
  assert.equal(first.text, "Write the offer 📅 2026-12-01 !high");
  assert.deepEqual(first.more, ["  Ask Anna for the prices.", "", "  Second paragraph."]);
  assert.equal(b.columns[2].cards[0].checked, true);
  assert.equal(b.columns[2].cards[1].checked, null);
});

test("frontmatter that looks like a column stays in the preamble", () => {
  const b = parseBoard("---\nnote: |\n  ## not a column\n---\n## Real\n");
  assert.equal(b.columns.length, 1);
  assert.equal(b.columns[0].title, "Real");
});

test("other lines of a column are kept as notes", () => {
  const text = "## A\n\nSome text\n- [ ] card\n### Sub\n";
  const b = parseBoard(text);
  assert.deepEqual(b.columns[0].notes, ["Some text", "### Sub"]);
  assert.match(serializeBoard(b), /Some text/);
  assert.match(serializeBoard(b), /### Sub/);
});

test("closing hashes are dropped, a # inside the title is not", () => {
  const b = parseBoard("## C# work ##\n");
  assert.equal(b.columns[0].title, "C# work");
});

test("Windows line endings are kept", () => {
  const text = "## A\r\n\r\n- [ ] one\r\n";
  assert.equal(serializeBoard(parseBoard(text)), text);
});

test("moving a card or a column changes only those lines", () => {
  const b = parseBoard(CANONICAL);
  moveCard(b, { column: 0, index: 1 }, { column: 1, index: 0 });
  const after = serializeBoard(b);
  assert.match(after, /## Doing\n\n- \[ \] Plain card\n/);
  assert.doesNotMatch(after.split("## Doing")[0], /Plain card/);

  moveColumn(b, 2, 0);
  assert.deepEqual(
    b.columns.map((c) => c.title),
    ["Done", "To do", "Doing"],
  );
});

test("editing a card round-trips its text", () => {
  const card = parseBoard(CANONICAL).columns[0].cards[0];
  const source = cardSource(card);
  assert.equal(source, "Write the offer 📅 2026-12-01 !high\nAsk Anna for the prices.\n\nSecond paragraph.");
  assert.deepEqual(cardFromSource(source, card), card);
});

test("new cards get a checkbox, pasted task lines keep theirs", () => {
  assert.deepEqual(cardFromSource("  hello  "), { marker: "-", checked: false, text: "hello", more: [] });
  assert.equal(cardFromSource("- [x] done")?.checked, true);
  assert.equal(cardFromSource("[ ] open")?.text, "open");
  assert.equal(cardFromSource(" \n "), null);
});

test("due dates and priorities use the task syntax of the app", () => {
  assert.deepEqual(cardMeta("Offer 📅 2026-12-01 ⏫"), { text: "Offer", due: "2026-12-01", priority: "high" });
  assert.deepEqual(cardMeta("Offer due:2026-12-01 !low"), { text: "Offer", due: "2026-12-01", priority: "low" });
  assert.equal(cardMeta("Offer !hoch").priority, "high");
  assert.equal(cardMeta("Offer 🔼").priority, "medium");
  assert.deepEqual(cardMeta("Nothing here 📅 soon"), { text: "Nothing here 📅 soon", due: null, priority: null });
});
