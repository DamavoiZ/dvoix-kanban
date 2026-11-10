// The board view for `.kboard` files: columns side by side, cards that can be
// added, edited, ticked off, deleted and dragged between columns, and columns
// that can be added, renamed, deleted and reordered.
//
// Plain DOM, because store plugins get an element to draw into, not Svelte.
// The view never writes the file itself: every change goes to `onchange`, the
// app saves it. Dragging uses pointer events instead of HTML drag and drop,
// which the webview on Windows can swallow for its own file drops.
import {
  cardFromSource,
  cardMeta,
  cardSource,
  moveCard,
  moveColumn,
  parseBoard,
  serializeBoard,
} from "./board.js";

const DRAG_THRESHOLD = 4;
const SCROLL_EDGE = 48;

/** Small helper so the rendering below stays readable. */
function h(tag, className, props = {}, ...children) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "text") el.textContent = v;
    else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? "" : String(v));
  }
  el.append(...children.filter(Boolean));
  return el;
}

const ICON_PLUS =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>';
const ICON_X =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
const ICON_CALENDAR =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>';

function iconButton(svg, label, onclick, extra = "") {
  const b = h("button", `kb-icon ${extra}`.trim(), { type: "button", title: label, "aria-label": label, onclick });
  b.innerHTML = svg;
  return b;
}

/** A delete button that asks for a second click instead of a dialog. */
function deleteButton(label, onconfirm) {
  let armed = null;
  const b = iconButton(ICON_X, label, (e) => {
    e.stopPropagation();
    if (armed) {
      clearTimeout(armed);
      onconfirm();
      return;
    }
    b.classList.add("kb-armed");
    b.title = `${label}? Click again`;
    armed = setTimeout(() => {
      armed = null;
      b.classList.remove("kb-armed");
      b.title = label;
    }, 2500);
  });
  return b;
}

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Textarea that grows with its content. */
function autosize(ta) {
  ta.style.height = "auto";
  ta.style.height = `${ta.scrollHeight}px`;
}

/**
 * @param {HTMLElement} el
 * @param {{ path: string, content: string, onchange: (text: string) => void }} initial
 */
export function mountBoard(el, initial) {
  let props = initial;
  let lastText = props.content;
  let board = parseBoard(props.content);
  /** What is being edited: a card, a new card, a column title or a new column. */
  let editing = null;
  /** Content that changed on disk while the user was editing or dragging. */
  let pending = null;
  let drag = null;
  /** True while the DOM is rebuilt: an input removed then must not save. */
  let rendering = false;

  const root = h("div", "kb-board");
  el.append(root);

  function commit() {
    const text = serializeBoard(board);
    if (text !== lastText) {
      lastText = text;
      props.onchange(text);
    }
    render();
  }

  /** Takes over a newer file from disk, if one came in while busy. */
  function applyPending() {
    if (pending === null) return;
    lastText = pending;
    board = parseBoard(pending);
    pending = null;
  }

  function stopEditing() {
    editing = null;
    applyPending();
  }

  // ---- editing ---------------------------------------------------------

  function editor(value, { placeholder, multiline, onsave, oncancel, keepOpen }) {
    const ta = h(multiline ? "textarea" : "input", "kb-input", { placeholder, rows: multiline ? 1 : undefined });
    ta.value = value;
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      if (save) onsave(ta.value);
      else oncancel();
    };
    ta.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      } else if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        if (keepOpen && ta.value.trim()) {
          onsave(ta.value, true);
        } else {
          finish(true);
        }
      }
    });
    ta.addEventListener("blur", () => {
      if (!rendering) finish(true);
    });
    if (multiline) ta.addEventListener("input", () => autosize(ta));
    return ta;
  }

  /** Puts a card edited in an older version of the board into the current one. */
  function placeEditedCard(original, columnIndex, columnTitle, card) {
    // The board may have changed on disk meanwhile: look for the card by its
    // old text, so an edit never lands on a different card.
    for (const col of board.columns) {
      const i = original ? col.cards.findIndex((c) => c.text === original.text) : -1;
      if (i >= 0) {
        if (card) col.cards[i] = card;
        else col.cards.splice(i, 1);
        return;
      }
    }
    if (!card) return;
    const col =
      board.columns.find((c) => c.title === columnTitle) ?? board.columns[columnIndex] ?? board.columns[0];
    if (col) col.cards.push(card);
  }

  // ---- rendering -------------------------------------------------------

  function render() {
    const scroll = root.scrollLeft;
    const cardScroll = [...root.querySelectorAll(".kb-cards")].map((c) => c.scrollTop);
    rendering = true;
    try {
      root.replaceChildren();
    } finally {
      rendering = false;
    }

    board.columns.forEach((column, ci) => root.append(renderColumn(column, ci)));
    root.append(renderNewColumn());

    root.scrollLeft = scroll;
    root.querySelectorAll(".kb-cards").forEach((c, i) => (c.scrollTop = cardScroll[i] ?? 0));
    const input = root.querySelector(".kb-input");
    if (input) {
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
      if (input.tagName === "TEXTAREA") autosize(input);
    }
  }

  function renderColumn(column, ci) {
    const header = h("div", "kb-column-header");
    if (editing?.kind === "title" && editing.column === ci) {
      header.append(
        editor(column.title, {
          placeholder: "Column name",
          onsave: (v) => {
            const title = v.trim().replace(/\s+/g, " ");
            const old = column.title;
            stopEditing();
            const col = board.columns.find((c) => c.title === old);
            if (title && col) col.title = title;
            commit();
          },
          oncancel: () => {
            stopEditing();
            render();
          },
        }),
      );
    } else {
      const title = h("span", "kb-column-title", {
        text: column.title || "Untitled",
        title: "Double-click to rename, drag to move",
      });
      title.addEventListener("dblclick", () => {
        editing = { kind: "title", column: ci };
        render();
      });
      header.append(
        title,
        h("span", "kb-count", { text: String(column.cards.length) }),
        iconButton(ICON_PLUS, "Add card", () => {
          editing = { kind: "new", column: ci };
          render();
        }),
        deleteButton(column.cards.length ? `Delete column and its ${column.cards.length} cards` : "Delete column", () => {
          board.columns.splice(ci, 1);
          commit();
        }),
      );
      header.addEventListener("pointerdown", (e) => startDrag(e, { kind: "column", column: ci }, columnEl));
    }

    const cards = h("div", "kb-cards", { "data-column": ci });
    for (const note of column.notes) cards.append(h("p", "kb-note", { text: note }));
    column.cards.forEach((card, i) => cards.append(renderCard(card, ci, i)));

    let footer;
    if (editing?.kind === "new" && editing.column === ci) {
      footer = editor("", {
        placeholder: "Card text, Enter to add, Shift+Enter for a new line",
        multiline: true,
        keepOpen: true,
        onsave: (v, again) => {
          const card = cardFromSource(v);
          const title = column.title;
          stopEditing();
          if (card) placeEditedCard(null, ci, title, card);
          if (again) editing = { kind: "new", column: board.columns.findIndex((c) => c.title === title) };
          if (editing && editing.column < 0) editing = null;
          commit();
        },
        oncancel: () => {
          stopEditing();
          render();
        },
      });
    } else {
      footer = h("button", "kb-add", {
        type: "button",
        text: "+ Add card",
        onclick: () => {
          editing = { kind: "new", column: ci };
          render();
        },
      });
    }

    const columnEl = h("section", "kb-column", { "data-column": ci }, header, cards, footer);
    return columnEl;
  }

  function renderCard(card, ci, i) {
    if (editing?.kind === "card" && editing.column === ci && editing.index === i) {
      const original = card;
      const title = board.columns[ci].title;
      return h(
        "div",
        "kb-card kb-card-editing",
        {},
        editor(cardSource(card), {
          multiline: true,
          placeholder: "Card text (empty deletes the card)",
          onsave: (v) => {
            stopEditing();
            placeEditedCard(original, ci, title, cardFromSource(v, original));
            commit();
          },
          oncancel: () => {
            stopEditing();
            render();
          },
        }),
      );
    }

    const meta = cardMeta(card.text);
    const body = h("div", "kb-card-body", {}, h("div", "kb-card-text", { text: meta.text || card.text }));
    const more = card.more.map((l) => l.trim()).filter(Boolean);
    if (more.length) body.append(h("div", "kb-card-more", { text: more.join("\n") }));

    if (meta.due || meta.priority) {
      const badges = h("div", "kb-badges");
      if (meta.due) {
        const now = today();
        const state = card.checked ? "" : meta.due < now ? "kb-overdue" : meta.due === now ? "kb-today" : "";
        const due = h("span", `kb-badge ${state}`.trim(), { title: "Due date" });
        due.innerHTML = ICON_CALENDAR;
        due.append(meta.due);
        badges.append(due);
      }
      if (meta.priority) {
        badges.append(h("span", `kb-badge kb-prio-${meta.priority}`, { text: meta.priority, title: "Priority" }));
      }
      body.append(badges);
    }

    const el = h("div", `kb-card${card.checked ? " kb-done" : ""}`, {
      "data-column": ci,
      "data-index": i,
      title: "Double-click to edit, drag to move",
    });
    if (card.checked !== null) {
      const box = h("input", "kb-check", { type: "checkbox", "aria-label": "Done" });
      box.checked = card.checked;
      box.addEventListener("change", () => {
        card.checked = box.checked;
        commit();
      });
      el.append(box);
    }
    el.append(
      body,
      deleteButton("Delete card", () => {
        board.columns[ci].cards.splice(i, 1);
        commit();
      }),
    );
    el.addEventListener("dblclick", (e) => {
      if (e.target.closest("button, input")) return;
      editing = { kind: "card", column: ci, index: i };
      render();
    });
    el.addEventListener("pointerdown", (e) => startDrag(e, { kind: "card", column: ci, index: i }, el));
    return el;
  }

  function renderNewColumn() {
    if (editing?.kind === "column") {
      return h(
        "div",
        "kb-column kb-column-new",
        {},
        editor("", {
          placeholder: "Column name",
          onsave: (v) => {
            const title = v.trim().replace(/\s+/g, " ");
            stopEditing();
            if (title) board.columns.push({ title, cards: [], notes: [] });
            commit();
          },
          oncancel: () => {
            stopEditing();
            render();
          },
        }),
      );
    }
    return h("button", "kb-add kb-add-column", {
      type: "button",
      text: "+ Add column",
      onclick: () => {
        editing = { kind: "column" };
        render();
      },
    });
  }

  // ---- dragging --------------------------------------------------------

  function startDrag(e, what, source) {
    if (e.button !== 0 || editing || drag) return;
    if (e.target.closest("button, input, textarea, a")) return;
    drag = { what, source, startX: e.clientX, startY: e.clientY, active: false, ghost: null, marker: null, to: null };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", cancelDrag);
    window.addEventListener("keydown", onDragKey, true);
  }

  function begin(d, e) {
    d.active = true;
    const rect = d.source.getBoundingClientRect();
    d.offsetX = d.startX - rect.left;
    d.offsetY = d.startY - rect.top;
    d.ghost = d.source.cloneNode(true);
    d.ghost.classList.add("kb-ghost");
    d.ghost.style.width = `${rect.width}px`;
    if (d.what.kind === "column") d.ghost.style.height = `${Math.min(rect.height, 320)}px`;
    document.body.append(d.ghost);
    d.source.classList.add("kb-dragging");
    d.marker = h("div", d.what.kind === "card" ? "kb-drop" : "kb-drop-column");
    root.classList.add("kb-is-dragging");
    moveGhost(d, e);
  }

  function moveGhost(d, e) {
    d.ghost.style.transform = `translate(${e.clientX - d.offsetX}px, ${e.clientY - d.offsetY}px)`;
  }

  function onMove(e) {
    const d = drag;
    if (!d) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
      begin(d, e);
    }
    e.preventDefault();
    moveGhost(d, e);
    autoScroll(e);

    const columns = [...root.querySelectorAll(":scope > .kb-column[data-column]")];
    if (d.what.kind === "card") {
      // The column under the pointer, or the nearest one beside it.
      let target = columns[0];
      let best = Infinity;
      for (const c of columns) {
        const r = c.getBoundingClientRect();
        const dist = e.clientX < r.left ? r.left - e.clientX : e.clientX > r.right ? e.clientX - r.right : 0;
        if (dist < best) {
          best = dist;
          target = c;
        }
      }
      if (!target) return;
      const list = target.querySelector(".kb-cards");
      const cards = [...list.querySelectorAll(":scope > .kb-card")].filter((c) => c !== d.source);
      let index = cards.findIndex((c) => {
        const r = c.getBoundingClientRect();
        return e.clientY < r.top + r.height / 2;
      });
      if (index < 0) index = cards.length;
      list.insertBefore(d.marker, cards[index] ?? null);
      d.to = { column: Number(target.dataset.column), index };
      scrollIntoList(list, e);
    } else {
      const others = columns.filter((c) => c !== d.source);
      let index = others.findIndex((c) => {
        const r = c.getBoundingClientRect();
        return e.clientX < r.left + r.width / 2;
      });
      if (index < 0) index = others.length;
      root.insertBefore(d.marker, others[index] ?? root.querySelector(":scope > .kb-add-column, :scope > .kb-column-new"));
      d.to = index;
    }
  }

  function autoScroll(e) {
    const r = root.getBoundingClientRect();
    if (e.clientX < r.left + SCROLL_EDGE) root.scrollLeft -= 16;
    else if (e.clientX > r.right - SCROLL_EDGE) root.scrollLeft += 16;
  }

  function scrollIntoList(list, e) {
    const r = list.getBoundingClientRect();
    if (e.clientY < r.top + SCROLL_EDGE) list.scrollTop -= 12;
    else if (e.clientY > r.bottom - SCROLL_EDGE) list.scrollTop += 12;
  }

  function endDrag() {
    const d = drag;
    drag = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", cancelDrag);
    window.removeEventListener("keydown", onDragKey, true);
    if (!d?.active) return null;
    d.ghost.remove();
    d.marker.remove();
    d.source.classList.remove("kb-dragging");
    root.classList.remove("kb-is-dragging");
    return d;
  }

  function onUp() {
    const d = endDrag();
    if (!d || d.to === null) return;
    if (pending !== null) {
      // The file changed on disk during the drag; positions may no longer
      // match, so take over the new file and drop the move.
      applyPending();
      render();
      return;
    }
    if (d.what.kind === "card") {
      const { column, index } = d.what;
      if (column === d.to.column && index === d.to.index) return;
      moveCard(board, { column, index }, d.to);
    } else {
      if (d.what.column === d.to) return;
      moveColumn(board, d.what.column, d.to);
    }
    commit();
  }

  function cancelDrag() {
    if (endDrag()) {
      applyPending();
      render();
    }
  }

  function onDragKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancelDrag();
    }
  }

  render();

  return {
    update(next) {
      props = next;
      if (next.content === lastText) return;
      if (editing || drag) {
        pending = next.content;
        return;
      }
      lastText = next.content;
      board = parseBoard(next.content);
      render();
    },
    destroy() {
      endDrag();
      // Removing a focused input fires blur; saving then could reach a file
      // that is no longer open.
      rendering = true;
      root.remove();
    },
  };
}
