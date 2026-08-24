// READING HR'S CLIENT ROSTER SPREADSHEET.
//
// The columns this actually uses: Client Name, Office, Case Worker, Status.
// There is an Email column in the file and it is IGNORED on purpose - client
// emails are not stored (Mánu 2026-08-24), so the import never reads the value.
//
// Pure parsing and matching - no prisma - so the tests can run the real
// spreadsheet's shapes through it.
import { readXlsxTable } from "../xlsx.js";
import { clientKey } from "./names.js";

function tokens(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

// a person's full-name keys: legal name, and the preferred combination when one
// exists. Sorted tokens, so "Gutierrez, Joseph" and "Joseph Gutierrez" land on
// the same key - the roster prints surname first, accounts print it last.
function nameKeys(user) {
  const keys = new Set();
  const legal = tokens(user.name).sort().join(" ");
  if (legal) keys.add(legal);
  const preferred = [
    ...tokens(user.preferredFirstName),
    ...tokens(user.preferredLastName || user.name?.split(/\s+/).slice(-1).join(" ")),
  ]
    .sort()
    .join(" ");
  if (preferred) keys.add(preferred);
  return keys;
}

// CASE WORKER -> PORTAL ACCOUNT, by full-name key, and only when exactly one
// account answers to it. The roster prints whole names, so unlike the schedule
// there is no initial to be ambiguous about - but two staff can still share a
// full name, and picking one of them would route a client's paperwork wrong.
export function matchRosterStaff(caseWorkerName, users) {
  const key = tokens(caseWorkerName).sort().join(" ");
  if (!key) return null;
  const hits = (users || []).filter((u) => nameKeys(u).has(key));
  return hits.length === 1 ? hits[0] : null;
}

// the spreadsheet as rows ready to store. Refuses files that are not this
// roster rather than importing garbage under a familiar name.
export function readClientRoster(bytes) {
  const { headers, rows } = readXlsxTable(bytes);
  const need = ["Client Name", "Case Worker"];
  for (const h of need) {
    if (!headers.includes(h)) {
      return { error: "columns", headers, rows: [] };
    }
  }
  const out = [];
  for (const r of rows) {
    const name = String(r["Client Name"] || "").trim();
    if (!name) continue;
    out.push({
      name,
      clientKey: clientKey(name),
      office: String(r["Office"] || "").trim() || null,
      status: String(r["Status"] || "").trim() || null,
      caseWorkerName: String(r["Case Worker"] || "").trim() || null,
    });
  }
  return { error: null, headers, rows: out };
}
