import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp, ROLE_LABELS } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { companyDate } from "@/lib/company-time";
import { shortDay } from "@/lib/document-dates";
import { lineLabel } from "@/lib/access-labels";
import BackLink from "@/components/BackLink";
import FilterBar from "./FilterBar";
import {
  KINDS, PAGE_SIZE, RANGES, RESULTS,
  companyMidnight, deviceOf, filterQuery, howOf, logWhere, readFilters,
} from "./query";

export const metadata = {
  title: "Access log",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const NAME = { id: true, name: true, preferredFirstName: true, preferredLastName: true, email: true };
// who an attestation link was cut for, when no account could be put to it
const LINK_AUDIENCE = { "supervisor-link": "Supervisor", "staff-link": "Staff" };

// WHO OPENED WHICH RECORD, AND WHEN. every line the file gate, the download
// routes and the emailed links write to the AccessLog table, newest first.
// Admin, IT and Super only. read-only on purpose: nothing here edits or
// deletes a line, and nothing anywhere else does either.
export default async function AccessLogPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");

  const f = readFilters(await searchParams);
  const now = new Date();

  // a search can be a person's name, which lives on their account, not the line
  const people = f.q
    ? await prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: f.q, mode: "insensitive" } },
            { preferredFirstName: { contains: f.q, mode: "insensitive" } },
            { preferredLastName: { contains: f.q, mode: "insensitive" } },
          ],
        },
        select: { id: true },
        take: 50,
      })
    : [];
  const where = logWhere(f, now, people.map((p) => p.id));

  const today = companyMidnight(now);
  const [rows, total, first, openedToday, refusedWeek, peopleMonth] = await Promise.all([
    prisma.accessLog.findMany({ where, orderBy: { at: "desc" }, skip: f.page * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.accessLog.count({ where }),
    prisma.accessLog.findFirst({ orderBy: { at: "asc" }, select: { at: true } }),
    prisma.accessLog.count({ where: { action: "open", at: { gte: today } } }),
    prisma.accessLog.count({ where: { action: "denied", at: { gte: new Date(now.getTime() - 7 * 86400000) } } }),
    prisma.accessLog.findMany({
      where: { action: "open", userId: { not: null }, at: { gte: companyMidnight(now, { monthStart: true }) } },
      distinct: ["userId"],
      select: { userId: true },
    }),
  ]);

  const ids = [...new Set(rows.map((r) => r.userId).filter(Boolean))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: NAME }) : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  const lines = rows.map((r) => line(r, byId, now));

  const from = total ? f.page * PAGE_SIZE + 1 : 0;
  const to = Math.min(total, (f.page + 1) * PAGE_SIZE);

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <BackLink href="/portal/admin">Back to Admin</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">Company records</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Access log</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        <span className="hidden sm:inline">
          Every time a record is opened in the portal or from an emailed link: timesheets, client
          attestations, addenda, forms, certificates, applications and the reports built from them.
          Refused attempts are listed too.
        </span>
        <span className="sm:hidden">
          Every time a record is opened in the portal or from an emailed link. Refused attempts are listed too.
        </span>
      </p>

      <div className="mt-6 grid max-w-3xl grid-cols-3 gap-2 sm:gap-3">
        <Tile label="Opened today" value={openedToday} />
        <Tile label="Refused, last 7 days" short="Refused, 7 days" value={refusedWeek} warn={refusedWeek > 0} />
        <Tile label="People this month" short="People, month" value={peopleMonth.length} />
      </div>

      <FilterBar
        q={f.q}
        kind={f.kind.key}
        result={f.result.key}
        range={f.range.key}
        kinds={KINDS.map(({ key, label }) => ({ key, label }))}
        results={RESULTS}
        ranges={RANGES.map(({ key, label }) => ({ key, label }))}
        csvHref={`/portal/admin/access-log/csv${filterQuery(f)}`}
      />

      {lines.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border-strong bg-surface-2 p-10 text-center text-sm text-muted">
          Nothing was opened or refused {f.range.phrase} that matches.
        </div>
      ) : (
        <>
          {/* the table, from a tablet up */}
          <div className="mt-4 hidden overflow-hidden rounded-xl border border-border bg-surface sm:block">
            <div className="grid grid-cols-[7.5rem_13rem_minmax(0,1fr)_7rem_5.5rem] gap-3.5 border-b border-border bg-surface-2 px-4 py-3 text-[11.5px] font-bold uppercase tracking-wider text-faint">
              <span>When</span>
              <span>Who</span>
              <span>Record</span>
              <span>How</span>
              <span>Result</span>
            </div>
            {lines.map((l) => (
              <div
                key={l.id}
                className={`grid grid-cols-[7.5rem_13rem_minmax(0,1fr)_7rem_5.5rem] items-center gap-x-3.5 gap-y-1 border-b border-sep px-4 py-3 text-[13.5px] last:border-0 ${
                  l.refused ? "bg-rose-500/5" : ""
                }`}
              >
                <span className="tabular-nums text-muted">
                  {l.time}
                  <small className="block text-xs text-faint">{l.day}</small>
                </span>
                <Who l={l} />
                <span className="min-w-0">
                  <b className="block font-semibold text-foreground">{l.label}</b>
                  <span className="block truncate font-mono text-xs text-faint">{l.target}</span>
                </span>
                <span className="text-[13px] text-muted">{l.how}</span>
                <Result refused={l.refused} />
                {l.refused && l.device && (
                  <span className="col-start-2 col-end-6 -mt-1 text-xs text-faint">
                    {l.device}
                    {l.ip && (
                      <>
                        {" · "}
                        <code className="font-mono text-muted">{l.ip}</code>
                      </>
                    )}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* a card each, on a phone */}
          <ul className="mt-3 grid gap-2 sm:hidden">
            {lines.map((l) => (
              <li
                key={l.id}
                className={`rounded-xl border bg-surface px-3.5 py-3 ${l.refused ? "border-rose-400/40" : "border-border"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12.5px] tabular-nums text-muted">
                    {l.day} {l.time}
                  </span>
                  <Result refused={l.refused} />
                </div>
                <p className="mt-2 text-sm font-semibold text-foreground">{l.label}</p>
                <p className="mt-1 text-[12.5px] text-muted">
                  {/* "... emailed link" already says how */}
                  {[l.who, l.chip, !/emailed link$/i.test(l.who) && l.how].filter(Boolean).join(" · ")}
                </p>
              </li>
            ))}
          </ul>

          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-faint">
            <span>
              Showing {from} – {to} of {total} {f.range.phrase}
            </span>
            <span className="flex gap-2">
              <Pager href={f.page > 0 ? `/portal/admin/access-log${filterQuery(f, { page: f.page - 1 })}` : null}>
                Newer
              </Pager>
              <Pager href={to < total ? `/portal/admin/access-log${filterQuery(f, { page: f.page + 1 })}` : null}>
                Older
              </Pager>
            </span>
          </div>
        </>
      )}

      <p className="mt-6 max-w-2xl text-[12.5px] leading-relaxed text-faint">
        Nothing on this page can be edited or deleted.
        {first && ` Lines start on ${companyDate(first.at)}, when the log began.`} The device and address show
        under a refused line; the CSV carries them for every line.
      </p>
    </section>
  );
}

// one line as the page shows it
function line(r, byId, now) {
  const today = companyDate(now);
  const day = companyDate(r.at) === today ? "Today" : shortDay(r.at, now);
  const time = companyDate(r.at, { hour: "numeric", minute: "2-digit" });
  const label = lineLabel(r);
  let who;
  let chip;
  let mark;
  if (r.via === "client-link") {
    // the person served's own link has no account behind it; the label carries
    // their initials, second after the kind
    const initials = label.split(" · ")[1] || "";
    who = initials ? `${initials}'s emailed link` : "Emailed link";
    chip = "Person served";
    mark = initials || "?";
  } else if (r.userId || r.userEmail) {
    const u = byId.get(r.userId);
    who = (u && preferredName(u)) || r.userEmail;
    chip = ROLE_LABELS[r.role] || null;
    mark = monogram(who);
  } else {
    // a link cut for a supervisor or staff member nobody was matched to
    who = "Emailed link";
    chip = LINK_AUDIENCE[r.via] || null;
    mark = "?";
  }
  return {
    id: r.id,
    day,
    time,
    who,
    chip,
    mark,
    link: r.via !== "session",
    superRole: r.role === "SUPER",
    label,
    target: r.target,
    how: howOf(r.via),
    refused: r.action === "denied",
    device: deviceOf(r.userAgent),
    ip: r.ip,
  };
}

function monogram(name) {
  const words = String(name || "").replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((words[0]?.[0] || "") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase() || "?";
}

function Tile({ label, short, value, warn }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2.5 sm:px-4 sm:py-3.5">
      <span className="block text-[11px] text-faint sm:text-xs">
        {short ? (
          <>
            <span className="sm:hidden">{short}</span>
            <span className="hidden sm:inline">{label}</span>
          </>
        ) : (
          label
        )}
      </span>
      <b
        className={`mt-1 block text-xl font-semibold tabular-nums sm:text-2xl ${
          warn ? "text-rose-600 dark:text-rose-400" : "text-foreground"
        }`}
      >
        {value}
      </b>
    </div>
  );
}

function Who({ l }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden="true"
        className={`grid h-7 w-7 flex-none place-items-center rounded-full border bg-surface-3 text-[11px] font-bold text-muted ${
          l.link ? "border-dashed border-border-strong" : "border-border-strong"
        }`}
      >
        {l.mark}
      </span>
      <span className="min-w-0">
        <b className="block truncate text-[13.5px] font-semibold text-foreground">{l.who}</b>
        {l.chip && (
          <span
            className={`mt-0.5 inline-block rounded-full px-1.5 text-[10.5px] font-semibold ${
              l.superRole ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" : "bg-sky-100 text-brand dark:bg-sky-500/15 dark:text-sky-300"
            }`}
          >
            {l.chip}
          </span>
        )}
      </span>
    </span>
  );
}

function Result({ refused }) {
  return refused ? (
    <span className="justify-self-start rounded-full bg-rose-500/15 px-2.5 py-0.5 text-[11.5px] font-semibold text-rose-700 dark:text-rose-300">
      Refused
    </span>
  ) : (
    <span className="justify-self-start rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11.5px] font-semibold text-emerald-700 dark:text-emerald-300">
      Opened
    </span>
  );
}

function Pager({ href, children }) {
  const cls = "rounded-lg border border-border-strong px-2.5 py-1.5 text-[12.5px]";
  return href ? (
    <Link href={href} className={`${cls} text-muted transition hover:bg-surface-2 hover:text-foreground`}>
      {children}
    </Link>
  ) : (
    <span aria-disabled="true" className={`${cls} text-faint opacity-50`}>
      {children}
    </span>
  );
}
