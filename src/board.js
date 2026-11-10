// The `.board` format: a Markdown file in which every `## heading` is a column
// and every top-level list item below it is a card. It is the same idea as the
// Kanban plugin of Obsidian, so a board stays readable and editable without
// dvoix:
//
//   ## To do
//
//   - [ ] Write the offer 📅 2026-12-01 !high
//     More lines of the card are indented.
//
//   ## Done
//
//   - [x] Call the client
//
// Everything before the first column (frontmatter, a title) and lines inside a
// column that are not cards are kept as they are. Writing back produces one
// blank line around headings and none between cards; a file already in that
// shape comes back byte for byte, so only the lines that actually changed show
// up in a diff.
//
// No DOM in here, so the format can be tested with plain Node.

const HEADING = /^##[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const ITEM = /^([-*+])[ \t]+(?:\[([ xX])\][ \t]+|\[([ xX])\]$)?(.*)$/;

/**
 * @typedef {{ marker: string, checked: boolean | null, text: string, more: string[] }} Card
 *   `checked` is null for a plain list item without a checkbox. `more` are the
 *   indented lines that follow the first line, exactly as in the file.
 * @typedef {{ title: string, cards: Card[], notes: string[] }} Column
 *   `notes` are lines of the column that are not cards (kept, shown muted).
 * @typedef {{ preamble: string[], columns: Column[], eol: string }} Board
 */

/** @param {string} text @returns {Board} */
export function parseBoard(text) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === "") lines.pop();

  /** @type {Board} */
  const board = { preamble: [], columns: [], eol };
  /** @type {Column | null} */
  let column = null;
  /** @type {Card | null} */
  let card = null;
  let i = 0;

  // Frontmatter may contain lines that look like headings or list items.
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) {
      board.preamble.push(...lines.slice(0, end + 1));
      i = end + 1;
    }
  }

  let pendingBlank = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    const heading = HEADING.exec(line);
    if (heading) {
      column = { title: heading[1], cards: [], notes: [] };
      board.columns.push(column);
      card = null;
      pendingBlank = 0;
      continue;
    }
    if (!column) {
      board.preamble.push(line);
      continue;
    }
    if (line.trim() === "") {
      pendingBlank++;
      continue;
    }
    if (card && /^[ \t]/.test(line)) {
      // A blank line inside a card (e.g. between two paragraphs) is kept.
      for (; pendingBlank > 0; pendingBlank--) card.more.push("");
      card.more.push(line);
      continue;
    }
    pendingBlank = 0;
    const item = ITEM.exec(line);
    if (item) {
      const box = item[2] ?? item[3];
      card = { marker: item[1], checked: box === undefined ? null : box !== " ", text: item[4], more: [] };
      column.cards.push(card);
    } else {
      card = null;
      column.notes.push(line);
    }
  }

  // Blank lines at the end of the preamble are layout, not content.
  while (board.preamble.length && board.preamble[board.preamble.length - 1].trim() === "") board.preamble.pop();
  return board;
}

/** @param {Card} card */
export function cardLines(card) {
  const box = card.checked === null ? "" : card.checked ? "[x] " : "[ ] ";
  return [`${card.marker} ${box}${card.text}`.trimEnd(), ...card.more];
}

/** @param {Board} board @returns {string} */
export function serializeBoard(board) {
  const out = [...board.preamble];
  for (const column of board.columns) {
    if (out.length) out.push("");
    out.push(`## ${column.title}`);
    const body = [...column.notes, ...column.cards.flatMap(cardLines)];
    if (body.length) out.push("", ...body);
  }
  return out.join(board.eol) + board.eol;
}

/** A card's text for editing: first line plus its further lines, unindented. */
export function cardSource(card) {
  const indent = Math.min(
    ...card.more.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)[0].length),
  );
  return [card.text, ...card.more.map((l) => (l.trim() ? l.slice(indent) : ""))].join("\n").trimEnd();
}

/**
 * Builds a card from edited text. Returns null for empty text. A leading
 * `[ ]`/`[x]` sets the checkbox, so pasting a task line works as expected.
 * @param {string} source @param {Card} [base]
 */
export function cardFromSource(source, base) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  while (lines.length && !lines[0].trim()) lines.shift();
  if (!lines.length) return null;
  let first = lines[0].trim().replace(/^[-*+][ \t]+(?=\[[ xX]\])/, "");
  let checked = base ? base.checked : false;
  const box = /^\[([ xX])\][ \t]*/.exec(first);
  if (box) {
    checked = box[1] !== " ";
    first = first.slice(box[0].length);
  }
  return {
    marker: base?.marker ?? "-",
    checked,
    text: first,
    more: lines.slice(1).map((l) => (l.trim() ? `  ${l}` : "")),
  };
}

/** Moves the card at `from` to `to` (`to.index` counted after removing it). */
export function moveCard(board, from, to) {
  const [card] = board.columns[from.column].cards.splice(from.index, 1);
  board.columns[to.column].cards.splice(to.index, 0, card);
}

/** Moves column `from` to position `to` (counted after removing it). */
export function moveColumn(board, from, to) {
  const [column] = board.columns.splice(from, 1);
  board.columns.splice(to, 0, column);
}

const PRIORITY_WORDS = {
  high: "high", hoch: "high", urgent: "high", dringend: "high", 1: "high",
  medium: "medium", mittel: "medium", normal: "medium", 2: "medium",
  low: "low", niedrig: "low", 3: "low",
};
const PRIORITY_EMOJI = { "⏫": "high", "🔺": "high", "🔼": "medium", "🔽": "low", "⏬": "low" };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Due date and priority in the same syntax as tasks in notes (see tasks.rs in
 * the app): `📅 2026-12-01` or `due:2026-12-01`, `⏫ 🔼 🔽` or `!high`/`!medium`/
 * `!low` (`!hoch`/`!mittel`/`!niedrig` are accepted aliases). Returns the
 * text without those markers for display.
 * @param {string} text
 * @returns {{ text: string, due: string | null, priority: "high" | "medium" | "low" | null }}
 */
export function cardMeta(text) {
  const words = [];
  let due = null;
  let priority = null;
  const tokens = text.split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if ((t === "📅" || t === "🗓" || t === "🗓️") && DATE.test(tokens[i + 1] ?? "")) {
      due = tokens[++i];
    } else if (t.startsWith("📅") && DATE.test(t.slice(2))) {
      due = t.slice(2);
    } else if (t.startsWith("due:") && DATE.test(t.slice(4))) {
      due = t.slice(4);
    } else if (t in PRIORITY_EMOJI) {
      priority = PRIORITY_EMOJI[t];
    } else if (t.startsWith("!") && PRIORITY_WORDS[t.slice(1).toLowerCase()]) {
      priority = PRIORITY_WORDS[t.slice(1).toLowerCase()];
    } else {
      words.push(t);
    }
  }
  return { text: words.join(" "), due, priority };
}

/** A new board as created from the file explorer. */
export function template() {
  return "## To do\n\n## Doing\n\n## Done\n";
}
