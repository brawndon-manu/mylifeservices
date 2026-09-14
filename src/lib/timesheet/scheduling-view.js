import { attendanceOf, complianceFor, COMPLIANCE_KINDS } from "./compliance.js";

// Presentation data only. Keep the same source rules and units as Repeat patterns.
export function schedulingView(batch, names = {}) {
  const rows = [];
  for (const sheet of batch.timesheets || []) {
    const who = names[sheet.id] || sheet.sourceName;
    complianceFor(sheet.data, attendanceOf(batch, sheet.sourceName)).forEach((finding, index) => {
      rows.push({
        ...finding,
        id: `${sheet.id}|${index}`,
        timesheetId: sheet.id,
        dayKey: `${sheet.id}|${finding.date}`,
        who,
        description: COMPLIANCE_KINDS[finding.kind].describe(finding),
      });
    });
  }
  const kinds = Object.keys(COMPLIANCE_KINDS);
  rows.sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind)
    || b.minutes - a.minutes || a.who.localeCompare(b.who) || String(a.date).localeCompare(String(b.date)));
  const groups = kinds.map((key) => ({
    key,
    label: COMPLIANCE_KINDS[key].label,
    hint: COMPLIANCE_KINDS[key].action,
    count: rows.filter((row) => row.kind === key).length,
  }));
  return { rows, groups };
}
