"use client";

// the preview banner + publish confirm dialog shown to the author on a DRAFT.
// the post itself renders below exactly as staff will see it; this bar sits on
// top with a "Publish" action that opens a confirm modal (recipient count +
// list + meeting reminder note), then submits the publish server action.
import { useState } from "react";
import Link from "next/link";
import AudiencePicker from "./AudiencePicker";
import DatePicker from "@/components/DatePicker";
import { zonedToInstant, deviceTimezone } from "@/lib/meeting-time";

// every half hour of the day. This started as 6am-8pm borrowed from the
// signing setup's office hours, and the first thing Manu tried was 9:30 PM -
// a send time is not an office hour, and there is no wrong time to schedule
// an email for.
const SEND_TIMES = [];
for (let h = 0; h <= 23; h++) {
  for (const m of [0, 30]) {
    SEND_TIMES.push({
      value: `${String(h).padStart(2, "0")}:${m === 0 ? "00" : "30"}`,
      label: `${h % 12 === 0 ? 12 : h % 12}:${m === 0 ? "00" : "30"} ${h < 12 ? "AM" : "PM"}`,
    });
  }
}

export default function PublishBar({ postId, publish, discard, cancelSchedule, info }) {
  const [open, setOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [doEmail, setDoEmail] = useState(false);
  // SEND LATER. A date + time in the author's own timezone, combined into the
  // instant the cron watches for. The cron passes every five minutes, so
  // "8:00 AM" lands between 8:00 and 8:05 - the dialog says so.
  const [sendLater, setSendLater] = useState(false);
  const [laterDate, setLaterDate] = useState("");
  const [laterTime, setLaterTime] = useState("08:00");
  const laterIso = sendLater && laterDate
    ? zonedToInstant(laterDate, laterTime, deviceTimezone()) || ""
    : "";
  // computed when a field changes rather than on render - the purity rule is
  // right that a render must not read the clock. The server re-checks anyway,
  // so the worst a stale value costs is one round trip to ?error=publishAt.
  const [laterInPast, setLaterInPast] = useState(false);
  const checkPast = (date, time) => {
    const iso = date ? zonedToInstant(date, time, deviceTimezone()) : null;
    setLaterInPast(!!iso && new Date(iso).getTime() <= Date.now());
  };
  // only promise an email when one will actually send: an ack/meeting post
  // defaults to emailing its audience; a plain post emails only if the author
  // ticks the box below.
  const willEmail = info.hasAudience || doEmail;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/45 bg-amber-400/10 p-3.5">
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-amber-950">
          i
        </span>
        <div className="flex-1 text-sm text-foreground">
          {info.scheduledAtIso ? (
            <>
              {/* rendered on the server in its timezone and re-rendered in the
                  viewer's - suppress the one-paint mismatch the way MeetingTime
                  does by correcting after mount */}
              <span className="font-semibold" suppressHydrationWarning>
                Scheduled - sends{" "}
                {new Date(info.scheduledAtIso).toLocaleString("en-US", {
                  weekday: "short", month: "short", day: "numeric",
                  hour: "numeric", minute: "2-digit",
                })}
                .
              </span>{" "}
              <span className="text-muted">
                It posts and emails on its own within five minutes of that time.
              </span>
            </>
          ) : (
            <>
              <span className="font-semibold">Preview - not published yet.</span>{" "}
              <span className="text-muted">
                This is how it will look when posted. Review, then publish.
              </span>
            </>
          )}
        </div>
        {info.scheduledAtIso && cancelSchedule && (
          <form action={cancelSchedule.bind(null, postId)}>
            <button
              type="submit"
              className="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-muted transition hover:text-foreground"
            >
              Cancel schedule
            </button>
          </form>
        )}
        <button
          type="button"
          onClick={() => setDiscardOpen(true)}
          className="rounded-lg border border-rose-400/50 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
        >
          Discard
        </button>
        <Link
          href={`/portal/announcements/${postId}/edit`}
          className="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-foreground transition hover:border-brand hover:text-brand"
        >
          Back to editing
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-brand-light px-4 py-2 text-sm font-bold text-white transition hover:bg-brand"
        >
          Publish
        </button>
      </div>

      {discardOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setDiscardOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border-strong bg-surface p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-foreground">Discard this draft?</h3>
            <p className="mt-1 text-sm text-muted">
              The draft will be deleted and nothing will be saved. This can&apos;t be
              undone.
            </p>
            <form action={discard.bind(null, postId)} className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDiscardOpen(false)}
                className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-muted transition hover:text-foreground"
              >
                Keep editing
              </button>
              <button
                type="submit"
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-rose-700"
              >
                Discard draft
              </button>
            </form>
          </div>
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border-strong bg-surface p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-foreground">
              Publish this announcement?
            </h3>
            <p className="mt-1 text-sm text-muted">
              It goes live in the feed right away
              {willEmail ? ", and an email goes out immediately after." : "."}
            </p>

            <form action={publish.bind(null, postId)} className="mt-4">
              {info.hasAudience ? (
                <>
                  <label className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 p-3">
                    <input
                      type="checkbox"
                      name="doEmail"
                      defaultChecked
                      className="mt-0.5 h-4 w-4 accent-brand"
                    />
                    <span className="text-sm text-foreground">
                      Email{" "}
                      <span className="font-semibold text-brand-light">
                        {info.count} {info.count === 1 ? "person" : "people"}
                      </span>{" "}
                      {info.meeting ? "invited" : "expected to acknowledge"} right
                      after publishing.
                    </span>
                  </label>
                  {info.recipients.length > 0 && (
                    <details className="mt-2 rounded-lg border border-border">
                      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-brand-light">
                        See who gets the email ({info.count})
                      </summary>
                      <div className="max-h-52 overflow-y-auto border-t border-border">
                        {info.recipients.slice(0, 60).map((r) => (
                          <div
                            key={r.id}
                            className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-sm last:border-b-0"
                          >
                            <span className="text-foreground">{r.name}</span>
                            {r.title && (
                              <span className="ml-auto text-xs text-muted">{r.title}</span>
                            )}
                          </div>
                        ))}
                        {info.count > 60 && (
                          <div className="px-3 py-1.5 text-center text-xs text-muted">
                            …and {info.count - 60} more
                          </div>
                        )}
                      </div>
                    </details>
                  )}
                </>
              ) : (
                <>
                  <label className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 p-3">
                    <input
                      type="checkbox"
                      name="doEmail"
                      checked={doEmail}
                      onChange={(e) => setDoEmail(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-brand"
                    />
                    <span className="text-sm text-foreground">
                      Also email people now{" "}
                      <span className="text-xs text-muted">
                        (leave off to just post it to the feed)
                      </span>
                    </span>
                  </label>
                  {doEmail && (
                    <div className="mt-2">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                        Send to
                      </p>
                      <AudiencePicker
                        everyoneName="emailEveryone"
                        titlesName="emailTitles"
                        userIdsName="emailUserIds"
                        staffByTitle={info.staffByTitle || {}}
                        everyoneTotal={info.everyoneTotal}
                        defaultEveryone
                        dimWhenEveryone={false}
                      />
                    </div>
                  )}
                </>
              )}

              {/* ---- send later ---- */}
              <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    name="sendLater"
                    checked={sendLater}
                    onChange={(e) => setSendLater(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-brand"
                  />
                  <span className="text-sm text-foreground">
                    Send later{" "}
                    <span className="text-xs text-muted">
                      (stays a draft until then; it posts and emails on its own)
                    </span>
                  </span>
                </label>
                {sendLater && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <input type="hidden" name="publishAtIso" value={laterIso} />
                    <div>
                      <span className="block text-xs font-medium text-muted">Day</span>
                      <DatePicker
                        id="publish-later-date"
                        value={laterDate}
                        onChange={(v) => { setLaterDate(v); checkPast(v, laterTime); }}
                        inputClassName="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 pr-10 text-sm text-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted" htmlFor="publish-later-time">
                        Time
                      </label>
                      <select
                        id="publish-later-time"
                        value={laterTime}
                        onChange={(e) => { setLaterTime(e.target.value); checkPast(laterDate, e.target.value); }}
                        className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
                      >
                        {SEND_TIMES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <p className="col-span-2 text-xs text-muted">
                      {laterInPast
                        ? "That time has already passed - pick one ahead."
                        : "Sends within five minutes of the time you pick, in your timezone."}
                    </p>
                  </div>
                )}
              </div>

              {info.meeting && (
                <div className="mt-3 flex gap-2 rounded-lg border border-brand/30 bg-brand/10 p-3 text-[13px] leading-relaxed text-foreground">
                  <span className="flex-none">🔔</span>
                  <span>
                    Because this is a meeting, everyone invited also gets a reminder{" "}
                    {info.nightBefore && (
                      <>
                        <span className="font-semibold">the night before (8pm)</span> and{" "}
                      </>
                    )}
                    <span className="font-semibold">{info.reminderLeadMin} minutes before</span>{" "}
                    each session - automatically.
                  </span>
                </div>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-muted transition hover:text-foreground"
                >
                  Keep as draft
                </button>
                <button
                  type="submit"
                  disabled={sendLater && (!laterIso || laterInPast)}
                  className="rounded-lg bg-brand-light px-4 py-2 text-sm font-bold text-white transition hover:bg-brand disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sendLater ? "Schedule it" : "Publish now"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
