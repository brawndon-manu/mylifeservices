// signature records as documents - who signed which form and when, with the
// counts up top. two shapes: one form (`renderFormSignatureReport`) and the
// whole library in one file (`renderFormsOverviewReport`: a cover with totals
// and a per-form summary table, then a section per form that has signatures).
// same rows as the form record pages and their CSVs; these exist because a
// report you can attach to an email or drop in a folder is what actually gets
// used. drawing engine shared with the acknowledgment reports (report-pdf.js).
import {
  L, R, BRAND, MUTED,
  clip, makeSt, drawMasthead, drawTiles, drawTable, finish,
} from "./report-pdf";

// [label, width, numeric] - widths sum to exactly R - L (532)
const SIGNER_COLS = [
  ["#", 26, false],
  ["Employee", 150, false],
  ["Email", 168, false],
  ["Attribution", 76, false],
  ["Signed", 112, false],
];
const SUMMARY_COLS = [
  ["Form", 220, false],
  ["Category", 116, false],
  ["Signed", 50, true],
  ["To assign", 58, true],
  ["Last signed", 88, true],
];

const TYPED_NOTE =
  "* name and email as typed at submission - not yet matched to a portal account.";

// one form's signer table; returns whether any row was typed-only
function drawSignerTable(st, formTitle, rows) {
  drawTable(st, SIGNER_COLS, rows, {
    contTitle: `${formTitle} · signature record (continued)`,
    muted: (r) => r.asTyped,
    cells: (r, i) => [
      String(i + 1),
      r.asTyped ? `${r.who} *` : r.who,
      r.email,
      r.how,
      r.when,
    ],
  });
  return rows.some((r) => r.asTyped);
}

function drawTypedNote(st) {
  if (st.y > 46) {
    st.y -= 6;
    st.text(TYPED_NOTE, L, st.y, { size: 7.5, color: MUTED });
    st.y -= 12;
  }
}

function statTiles(stats) {
  return [
    { n: String(stats.total), label: "signed" },
    { n: String(stats.attributed), label: "attributed to a person" },
    { n: String(stats.unassigned), label: "need assignment", amber: true },
    { n: stats.lastLabel || "—", label: "last signed", small: true },
  ];
}

// rows: { who, email, how, when, asTyped } newest first, matching the screen.
// stats: { total, attributed, unassigned, lastLabel }. filterLabel names any
// active filters so a filtered file can't pass as the full record.
export async function renderFormSignatureReport(
  { formTitle, category, filterLabel, stats, rows },
  opts = {},
) {
  const st = await makeSt();
  st.addPage();
  drawMasthead(st, formTitle);
  st.text(`Signature record · ${category}`, L, st.y, { size: 11, f: st.bold });
  st.y -= 13;
  if (filterLabel) {
    st.text(`Filtered: ${filterLabel}`, L, st.y, { size: 8.5, color: MUTED });
    st.y -= 12;
  }
  drawTiles(st, statTiles(stats));

  if (!rows.length) {
    st.text("No submissions match.", L, st.y - 6, { size: 10, color: MUTED });
  } else if (drawSignerTable(st, formTitle, rows)) {
    drawTypedNote(st);
  }
  return finish(st, opts);
}

// the whole library in one file. forms: [{ formTitle, category, stats, rows }]
// in library order - every form lands in the cover summary, and each one with
// signatures gets its own section on a fresh page.
export async function renderFormsOverviewReport({ forms, filterLabel }, opts = {}) {
  const st = await makeSt();
  st.addPage();
  drawMasthead(st, "Form Signature Records");

  const overall = {
    total: forms.reduce((n, f) => n + f.stats.total, 0),
    attributed: forms.reduce((n, f) => n + f.stats.attributed, 0),
    unassigned: forms.reduce((n, f) => n + f.stats.unassigned, 0),
    lastLabel: forms
      .filter((f) => f.stats.lastLabel)
      .map((f) => f.stats)
      .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt))[0]?.lastLabel,
  };
  st.text(
    `${forms.length} form${forms.length === 1 ? "" : "s"} in the library`,
    L, st.y, { size: 11, f: st.bold },
  );
  st.y -= 13;
  if (filterLabel) {
    st.text(`Filtered: ${filterLabel}`, L, st.y, { size: 8.5, color: MUTED });
    st.y -= 12;
  }
  drawTiles(st, statTiles(overall));

  drawTable(st, SUMMARY_COLS, forms, {
    contTitle: "Form Signature Records (continued)",
    muted: (f) => f.stats.total === 0,
    cells: (f) => [
      f.formTitle,
      f.category,
      String(f.stats.total),
      String(f.stats.unassigned),
      f.stats.lastLabel || "—",
    ],
  });

  for (const f of forms) {
    if (!f.rows.length) continue;
    st.addPage();
    st.text(clip(f.formTitle, R - L, st.bold, 14), L, st.y - 4, {
      size: 14, f: st.bold, color: BRAND,
    });
    st.y -= 20;
    const s = f.stats;
    st.text(
      `Signature record · ${f.category} · ${s.total} signed · ${s.attributed} attributed · ${s.unassigned} need assignment`,
      L, st.y, { size: 8.5, color: MUTED },
    );
    st.y -= 16;
    if (drawSignerTable(st, f.formTitle, f.rows)) {
      drawTypedNote(st);
    }
  }
  return finish(st, opts);
}
