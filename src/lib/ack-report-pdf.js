// acknowledgment records as documents - who acknowledged an announcement, in
// portal or by email link, and when, with the post's own text on the page so
// the reader sees exactly what was acknowledged. two shapes: one announcement
// (`renderAckReport`) and every ack-required announcement in one file
// (`renderAcksOverviewReport`). same rows as the acknowledgment pages and
// their CSVs. drawing engine shared with the forms reports (report-pdf.js).
import {
  L, R, BRAND, MUTED, INK,
  clip, makeSt, drawMasthead, drawTiles, drawTable, drawBody, finish,
} from "./report-pdf";

// [label, width, numeric] - widths sum to exactly R - L (532).
// the Signed column only exists when the post carries a fillable form, and the
// other columns give up the room for it.
const COLS_PLAIN = [
  ["#", 24, false],
  ["Employee", 128, false],
  ["Email", 152, false],
  ["How", 92, false],
  ["Acknowledged", 136, false],
];
const COLS_FORM = [
  ["#", 24, false],
  ["Employee", 108, false],
  ["Email", 122, false],
  ["How", 74, false],
  ["Acknowledged", 112, false],
  ["Signed", 92, false],
];

const NOTE_LINE =
  "† acknowledged, but no longer in the expected audience (deactivated, or the audience was edited).";

// ---------- the How icons, same shapes the on-screen roster uses ----------
// tiny stroke drawings on the row baseline (y). the key above the table names
// them, so the rows carry no words - except "logged by <name>", where the name
// is the point and words stay.

function mailIcon(st, x, y, color = INK) {
  const w = 7.5;
  const h = 5.5;
  st.page.drawRectangle({
    x, y: y - 0.25, width: w, height: h,
    borderColor: color, borderWidth: 0.7,
  });
  const top = y - 0.25 + h;
  st.page.drawLine({ start: { x, y: top }, end: { x: x + w / 2, y: top - 2.4 }, thickness: 0.7, color });
  st.page.drawLine({ start: { x: x + w / 2, y: top - 2.4 }, end: { x: x + w, y: top }, thickness: 0.7, color });
}

function monitorIcon(st, x, y, color = INK) {
  const w = 7.5;
  st.page.drawRectangle({
    x, y: y + 1.4, width: w, height: 4.6,
    borderColor: color, borderWidth: 0.7,
  });
  st.page.drawLine({ start: { x: x + w / 2, y: y + 1.4 }, end: { x: x + w / 2, y: y + 0.2 }, thickness: 0.7, color });
  st.page.drawLine({ start: { x: x + w / 2 - 1.6, y: y + 0.2 }, end: { x: x + w / 2 + 1.6, y: y + 0.2 }, thickness: 0.7, color });
}

// how the icons read, printed right above the roster
function drawKey(st) {
  let x = L;
  const label = (s) => {
    st.text(s, x, st.y, { size: 7.5, color: MUTED });
    x += st.font.widthOfTextAtSize(s, 7.5) + 16;
  };
  mailIcon(st, x, st.y, MUTED);
  x += 11;
  label("acknowledged via the email link");
  monitorIcon(st, x, st.y, MUTED);
  x += 11;
  label("acknowledged in the portal");
  st.y -= 15;
}

function ackTiles(stats) {
  return [
    { n: `${stats.acked}/${stats.expected}`, label: `acknowledged · ${stats.pct}%` },
    { n: String(stats.inPortal), label: "in portal" },
    { n: String(stats.viaEmail), label: "via email link" },
    { n: String(stats.notYet), label: "not yet", amber: true },
  ];
}

// rows: { who, email, acked, how, when, signed, signedDay, note }. not-yet
// rows print muted with "not yet" in the timestamp column - status needs no
// column of its own. returns whether any row carries the audience note.
function drawAckTable(st, title, rows, hasForm) {
  if (rows.some((r) => r.how === "email link" || r.how === "in portal")) {
    if (st.y < 90) st.addPage();
    drawKey(st);
  }
  drawTable(st, hasForm ? COLS_FORM : COLS_PLAIN, rows, {
    contTitle: `${title} · acknowledgment record (continued)`,
    muted: (r) => !r.acked,
    drawCell: (st2, r, ci, x, y) => {
      if (ci !== 3) return false;
      if (r.how === "email link") {
        mailIcon(st2, x + 5, y);
        return true;
      }
      if (r.how === "in portal") {
        monitorIcon(st2, x + 5, y);
        return true;
      }
      return false;
    },
    cells: (r, i) => {
      const cells = [
        String(i + 1),
        r.note ? `${r.who} †` : r.who,
        r.email,
        r.how,
        r.acked ? r.when : "not yet",
      ];
      if (hasForm) {
        cells.push(r.signed ? r.signedDay : r.acked ? "not signed" : "");
      }
      return cells;
    },
  });
  return rows.some((r) => r.note);
}

function drawNoteLine(st) {
  if (st.y > 46) {
    st.y -= 6;
    st.text(NOTE_LINE, L, st.y, { size: 7.5, color: MUTED });
    st.y -= 12;
  }
}

// one announcement. p: { title, tag, postedLabel, audLabel, content, hasForm,
// stats: { expected, acked, inPortal, viaEmail, notYet, pct }, rows }
export async function renderAckReport(p, opts = {}) {
  const st = await makeSt();
  st.addPage();
  drawMasthead(st, p.title);
  st.text(`Acknowledgment record · ${p.tag}`, L, st.y, { size: 11, f: st.bold });
  st.y -= 13;
  st.text(`Posted ${p.postedLabel} · audience: ${p.audLabel}`, L, st.y, {
    size: 8.5, color: MUTED,
  });
  st.y -= 16;
  // the state first, then what was posted - a long post must not push the
  // tiles off the first page
  drawTiles(st, ackTiles(p.stats));
  if (p.content) {
    drawBody(st, p.content, {
      maxLines: 45,
      contTitle: `${p.title} (continued)`,
    });
  }

  if (!p.rows.length) {
    st.text("Nobody is expected to acknowledge this.", L, st.y - 6, {
      size: 10, color: MUTED,
    });
  } else if (drawAckTable(st, p.title, p.rows, p.hasForm)) {
    drawNoteLine(st);
  }
  return finish(st, opts);
}

const SUMMARY_COLS = [
  ["Announcement", 200, false],
  ["Tag", 74, false],
  ["Posted", 84, false],
  ["Acked", 64, true],
  ["Not yet", 64, true],
  ["Done", 46, true],
];

// every ack-required announcement in one file: a cover with the totals and a
// per-announcement summary, then each announcement's record - post text, then
// the roster - on a fresh page.
export async function renderAcksOverviewReport({ posts }, opts = {}) {
  const st = await makeSt();
  st.addPage();
  drawMasthead(st, "Acknowledgment Records");

  const overall = {
    expected: posts.reduce((n, p) => n + p.stats.expected, 0),
    acked: posts.reduce((n, p) => n + p.stats.acked, 0),
    inPortal: posts.reduce((n, p) => n + p.stats.inPortal, 0),
    viaEmail: posts.reduce((n, p) => n + p.stats.viaEmail, 0),
    notYet: posts.reduce((n, p) => n + p.stats.notYet, 0),
  };
  overall.pct = overall.expected
    ? Math.round((overall.acked / overall.expected) * 100)
    : 0;
  st.text(
    `${posts.length} announcement${posts.length === 1 ? "" : "s"} require acknowledgment`,
    L, st.y, { size: 11, f: st.bold },
  );
  st.y -= 13;
  drawTiles(st, ackTiles(overall));

  drawTable(st, SUMMARY_COLS, posts, {
    contTitle: "Acknowledgment Records (continued)",
    muted: (p) => p.stats.expected > 0 && p.stats.notYet === 0,
    cells: (p) => [
      p.title,
      p.tag,
      p.postedLabel,
      `${p.stats.acked}/${p.stats.expected}`,
      String(p.stats.notYet),
      `${p.stats.pct}%`,
    ],
  });

  for (const p of posts) {
    st.addPage();
    st.text(clip(p.title, R - L, st.bold, 14), L, st.y - 4, {
      size: 14, f: st.bold, color: BRAND,
    });
    st.y -= 20;
    st.text(
      `${p.tag} · posted ${p.postedLabel} · audience: ${p.audLabel} · ${p.stats.acked} of ${p.stats.expected} acknowledged (${p.stats.inPortal} in portal, ${p.stats.viaEmail} via email) · ${p.stats.notYet} not yet`,
      L, st.y, { size: 8.5, color: MUTED },
    );
    st.y -= 16;
    if (p.content) {
      drawBody(st, p.content, {
        maxLines: 14,
        contTitle: `${p.title} (continued)`,
      });
    }
    if (drawAckTable(st, p.title, p.rows, p.hasForm)) {
      drawNoteLine(st);
    }
  }
  return finish(st, opts);
}
