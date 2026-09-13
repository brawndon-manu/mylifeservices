"use client";

// PASTE THE THREAD, SEE WHAT IT FOUND, THEN SAVE.
//
// The preview is not decoration. A backfill writes one acknowledgment per
// person against a compliance notice, and the one thing that must never happen
// is crediting somebody with reading a document they never saw - so what was
// matched, how, and what was left unassigned is on the screen before anything
// is written.
import { useState, useTransition } from "react";

const fmt = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    })
    : "-";

export default function ImportForm({ preview, save }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const [busy, start] = useTransition();

  const ERRORS = {
    nothread: "Paste the email thread first.",
    notitle: "Give the notice a name.",
    nonotice: "Attach the notice PDF that went out.",
    badnotice: "One of those files could not be read as a PDF.",
    noblob: "File storage is not configured, so nothing was saved.",
    noreplies: "No replies were found in that paste.",
  };

  function onPreview(e) {
    const fd = new FormData(e.currentTarget.form);
    e.preventDefault();
    setError("");
    start(async () => {
      const res = await preview(fd);
      if (!res?.ok) { setError(ERRORS[res?.error] || "Could not read that."); return; }
      setRows(res.rows);
    });
  }

  function onSave(e) {
    const fd = new FormData(e.currentTarget.form);
    e.preventDefault();
    setError("");
    start(async () => {
      const res = await save(fd);
      if (!res?.ok) { setError(ERRORS[res?.error] || "Could not save that."); return; }
      setDone(res);
    });
  }

  const matched = rows?.filter((r) => r.name).length ?? 0;
  const unassigned = rows?.filter((r) => !r.name).length ?? 0;
  const gone = rows?.filter((r) => r.gone).length ?? 0;

  if (done) {
    return (
      <div className="mt-8 rounded-xl border border-border bg-surface p-6">
        <p className="text-sm font-semibold text-foreground">
          {done.saved} acknowledgments recorded
          {done.unassigned > 0 ? `, ${done.unassigned} left unassigned` : ""}.
        </p>
        <p className="mt-2 text-sm text-muted">
          The per-person documents and the record are on the form&apos;s page.
        </p>
        <a
          href={`/portal/admin/forms/${done.formId}`}
          className="mt-4 inline-block rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white"
        >
          Open the record
        </a>
      </div>
    );
  }

  return (
    <form className="mt-8 space-y-6">
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-semibold text-foreground">What the notice was</span>
            <input
              name="title"
              defaultValue=""
              placeholder="SB-294 Annual Workplace Rights Notice"
              className="mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold text-foreground">Who sent it</span>
            <input
              name="senderName"
              placeholder="Britny Arevalo"
              className="mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground"
            />
            <span className="mt-1 block text-xs text-muted">
              Their own message is the notice, not an acknowledgment of it, so it is left out.
            </span>
          </label>
          <label className="block text-sm">
            <span className="font-semibold text-foreground">Year it went out</span>
            <input
              name="year"
              type="number"
              defaultValue={new Date().getFullYear()}
              className="mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground"
            />
            <span className="mt-1 block text-xs text-muted">
              Gmail leaves the year off dates inside the current one.
            </span>
          </label>
          <label className="block text-sm">
            <span className="font-semibold text-foreground">Date on the notice</span>
            <input
              name="noticeDate"
              placeholder="05/23/26"
              className="mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground"
            />
          </label>
        </div>

        <label className="mt-5 block text-sm">
          <span className="font-semibold text-foreground">The notice that went out (PDF)</span>
          <input
            name="notice"
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="mt-2 block w-full text-sm text-muted file:mr-4 file:rounded-md file:border-0 file:bg-brand-light file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
          />
          <span className="mt-1 block text-xs text-muted">
            Pick every attachment that went with it. They are stitched into one document in the order chosen.
          </span>
        </label>

        <label className="mt-5 block text-sm">
          <span className="font-semibold text-foreground">
            Gmail&apos;s print of the thread (PDF)
          </span>
          <input
            name="print"
            type="file"
            accept="application/pdf,.pdf"
            className="mt-2 block w-full text-sm text-muted file:mr-4 file:rounded-md file:border-0 file:bg-brand-light file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
          />
          <span className="mt-1 block text-xs text-muted">
            Open the thread in Gmail and print it to PDF. It carries every reply, each
            sender&apos;s address and the full date, so it reads better than a paste and
            is stored as the source. With one attached the box below is optional.
          </span>
        </label>

        <label className="mt-5 block text-sm">
          <span className="font-semibold text-foreground">What the email said</span>
          <textarea
            name="body"
            rows={6}
            placeholder={"Hi Team,\n\nPlease review the attached notice...\n\nYour email response will serve as your acknowledgment and electronic signature..."}
            className="mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground"
          />
          <span className="mt-1 block text-xs text-muted">
            The message people were replying to. It becomes the first page of the stored
            notice and is repeated on every person&apos;s document, because it is where the
            reply is said to stand as a signature.
          </span>
        </label>

        <label className="mt-5 block text-sm">
          <span className="font-semibold text-foreground">The email thread</span>
          <textarea
            name="thread"
            rows={10}
            placeholder={"Caitlan Comia\nSat, May 23, 2:53 PM\nThis is Caitlan Comia and I have received this notice..."}
            className="mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 font-mono text-xs text-foreground"
          />
          <span className="mt-1 block text-xs text-muted">
            Only needed when there is no print above. Sender, date, then the reply.
          </span>
        </label>
      </div>

      {error && <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          onClick={onPreview}
          disabled={busy}
          className="rounded-md border border-border-strong px-4 py-2 text-sm font-semibold text-foreground disabled:opacity-50"
        >
          {busy && !rows ? "Reading…" : "Read the thread"}
        </button>
        {rows && (
          <button
            type="submit"
            onClick={onSave}
            disabled={busy}
            className="rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : `Record these ${rows.length}`}
          </button>
        )}
      </div>

      {rows && (
        <div className="rounded-xl border border-border bg-surface">
          <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-border px-5 py-3 text-sm">
            <span className="font-semibold text-foreground">{rows.length} replies</span>
            <span className="text-muted">{matched} matched</span>
            {unassigned > 0 && (
              <span className="font-medium text-amber-700 dark:text-amber-400">
                {unassigned} left unassigned
              </span>
            )}
            {gone > 0 && <span className="text-muted">{gone} no longer here</span>}
          </div>
          <ul className="divide-y divide-border">
            {rows.map((r, i) => (
              <li key={i} className="px-5 py-3 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className={r.name ? "font-medium text-foreground" : "font-medium text-amber-700 dark:text-amber-400"}>
                    {r.name || `${r.asTyped} · nobody`}
                  </span>
                  {r.name && r.asTyped !== r.name && (
                    <span className="text-xs text-muted">replied as {r.asTyped}</span>
                  )}
                  {r.gone && <span className="text-xs text-muted">no longer here</span>}
                  <span className="ml-auto text-xs tabular-nums text-muted">{fmt(r.when)}</span>
                </div>
                <p className="mt-0.5 text-xs text-faint">{r.how}</p>
                {/* NOBODY IN THE PORTAL STILL GETS A RECORD. His call: no
                    account needed, just the name and an address to reach them
                    by - and the thread almost never carries one. */}
                {!r.name && (
                  <label className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted">Their email, if you know it</span>
                    <input
                      name={`email:${r.key}`}
                      type="email"
                      defaultValue={r.email || ""}
                      placeholder="name@example.com"
                      className="min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-2 py-1 text-xs text-foreground"
                    />
                  </label>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
