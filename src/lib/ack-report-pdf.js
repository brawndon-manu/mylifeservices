// acknowledgment records as documents - who acknowledged an announcement, in
// portal or by email link, and when, with the post's own text on the page so
// the reader sees exactly what was acknowledged. two shapes: one announcement
// (`renderAckReport`) and every ack-required announcement in one file
// (`renderAcksOverviewReport`). same rows as the acknowledgment pages and
// their CSVs. drawing engine shared with the forms reports (report-pdf.js).
import {
  L, R, BRAND, MUTED,
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
  drawTable(st, hasForm ? COLS_FORM : COLS_PLAIN, rows, {
    contTitle: `${title} · acknowledgment record (continued)`,
    muted: (r) => !r.acked,
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
  if (p.content) {
    drawBody(st, p.content, {
      maxLines: 45,
      contTitle: `${p.title} (continued)`,
    });
  }
  drawTiles(st, ackTiles(p.stats));

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
