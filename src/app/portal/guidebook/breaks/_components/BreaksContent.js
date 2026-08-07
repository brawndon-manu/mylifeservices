// The whole meal-and-rest-break page, minus its chrome.
//
// It renders in two places: gated at /portal/guidebook/breaks for signed-in
// staff, and publicly at /g/<slug> for anyone holding the share link. Same
// words either way - a policy page that reads differently depending on who is
// looking at it is worse than useless.
//
// `action` is the slot the share button sits in. The public copy passes
// nothing, because there is nothing left to share from there.
import { QspPunch, QspSchedule } from "./QspScreens";
import PracticeApp from "./PracticeApp";

function SectionHead({ n, title, tag, tagTone }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="grid size-8 flex-none place-items-center rounded-full bg-brand text-sm font-bold text-white dark:bg-accent dark:text-[#06232f]">
        {n}
      </span>
      <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        {title}
      </h2>
      {tag ? (
        <span
          className={`rounded-full border px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${tagTone}`}
        >
          {tag}
        </span>
      ) : null}
    </div>
  );
}

// `employeeName` is whoever is signed in, so the practice app shows their own
// name the way the real one does. The public copy has no session, so it falls
// back to a placeholder rather than putting a stranger's name on the screen.
export default function BreaksContent({ action = null, employeeName = "Your Name" }) {
  return (
    <>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Employee Guidebook
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Meal Periods &amp; Rest Breaks
        </h1>
        {action}
      </div>
      <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted">
        You get two different kinds of break, and they do not work the same way.
        One is paid, one is not. Both get recorded the same way in QSP, and that
        is where most of the mistakes happen. This page covers what you are owed,
        and how to punch it so your paycheck comes out right.
      </p>

      {/* 1. rest breaks */}
      <div className="mt-10 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <SectionHead
          n="1"
          title="The 10 minute rest period"
          tag="Paid"
          tagTone="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
        />
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
          {'A 10 minute rest period is paid time. It counts as hours worked, so'}{" "}
          punching out for one never costs you money. You are still on the clock for pay, you
          are just recording that you stepped away.
        </p>

        <h3 className="mt-6 text-base font-bold text-foreground">
          How many you get
        </h3>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr>
              <th className="border-b border-border px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-faint">
                Hours you work that day
              </th>
              <th className="border-b border-border px-3 py-2 text-right text-xs font-bold uppercase tracking-wider text-faint">
                Rest periods owed
              </th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Under 3.5 hours", "0"],
              ["3.5 up to 6 hours", "1"],
              ["Over 6 up to 10 hours", "2"],
              ["Over 10 up to 14 hours", "3"],
            ].map(([label, n]) => (
              <tr key={label}>
                <td className="border-b border-border px-3 py-2 text-foreground">
                  {label}
                </td>
                <td className="border-b border-border px-3 py-2 text-right tabular-nums text-foreground">
                  {n}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="mt-6 text-base font-bold text-foreground">
          When they need to happen in your shift
        </h3>
        <p className="mt-1 text-sm text-muted">
          On a direct service shift, schedule them against your billable work like
          this:
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground">
          <li>
            <b>
              Your first 10 minute rest period goes in the first 4 hours of
              billable work.
            </b>{" "}
            Do not save it for later in the shift.
          </li>
          <li>
            <b>
              Your second 10 minute rest period goes in the last 4 hours of
              billable work
            </b>
            , on any shift long enough to earn one.
          </li>
          <li>
            Within those windows, aim for the middle of the stretch you are
            working. The law asks for the middle of each work period wherever it
            is practical, and the first-4 and last-4 rule is how we get there on a
            service shift.
          </li>
        </ul>

        <h3 className="mt-6 text-base font-bold text-foreground">The rest of it</h3>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground">
          <li>Ten minutes, uninterrupted, free of all work duties.</li>
          <li>
            A rest period cannot be added onto your lunch. They are separate, and
            stacking them means the rest period was not really provided.
          </li>
          <li>
            A 10 minute rest period cannot be traded for coming in late or leaving
            early.
          </li>
        </ul>
      </div>

      {/* how to punch it */}
      <div className="mt-6 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          How to punch your 10 minute rest period
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          The screen gives you two boxes. The one on the left is the moment your
          break <b className="text-foreground">starts</b>. The one on the right is
          the moment you <b className="text-foreground">go back to work</b>.
        </p>

        <div className="mt-5 grid items-center gap-4 rounded-lg border border-border bg-surface-2 px-5 py-4 sm:grid-cols-[1fr_auto_1fr]">
          <div className="text-center">
            <div className="text-base font-bold text-foreground">Time Out</div>
            <div className="mt-1 text-sm leading-snug text-muted">
              On the left. The time you stopped working and your break began.
            </div>
          </div>
          <div aria-hidden="true" className="text-center text-2xl text-faint">
            →
          </div>
          <div className="text-center">
            <div className="text-base font-bold text-foreground">Time In</div>
            <div className="mt-1 text-sm leading-snug text-muted">
              On the right. The time you came back and started working again.
            </div>
          </div>
        </div>

        <p className="mt-4 font-bold text-foreground">
          Time Out is always the earlier time. Time In is always the later one.
        </p>

        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          {/* correct */}
          <div className="overflow-hidden rounded-xl border-2 border-emerald-300 dark:border-emerald-800">
            <div className="flex items-center gap-2 bg-emerald-50 px-4 py-3 font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5 flex-none"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
              Correct
            </div>
            <div className="bg-surface-2 p-4">
              <QspPunch out="9:50 AM" back="10:00 AM" />
              <p className="mt-4 text-sm leading-relaxed text-muted">
                Out at <b className="text-foreground">9:50</b>, back in at{" "}
                <b className="text-foreground">10:00</b>. Ten minutes, in the right
                order. Payroll reads this as a rest period taken.
              </p>
            </div>
          </div>

          {/* wrong */}
          <div className="overflow-hidden rounded-xl border-2 border-rose-300 dark:border-rose-900">
            <div className="flex items-center gap-2 bg-rose-50 px-4 py-3 font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5 flex-none"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
              Wrong, and this is the common one
            </div>
            <div className="bg-surface-2 p-4">
              <QspPunch out="10:00 AM" back="9:50 AM" />
              <p className="mt-4 text-sm leading-relaxed text-muted">
                The same ten minutes, entered backwards. It reads as leaving at{" "}
                <b className="text-foreground">10:00</b> and returning at{" "}
                <b className="text-foreground">9:50</b>, which is ten minutes
                before you left. Time cannot run that way, so the break does not
                count.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 dark:border-amber-900/70 dark:bg-amber-950/40">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="mt-0.5 size-5 flex-none text-amber-700 dark:text-amber-400"
          >
            <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
          <div className="text-sm leading-relaxed text-amber-900 dark:text-amber-100">
            <p>
              <b className="text-amber-800 dark:text-amber-300">
                This is the mistake we keep seeing.
              </b>{" "}
              Reversing the two times is by far the most common punch error, and
              it is the one that costs the most to untangle.
            </p>
            <p className="mt-2">
              When the times run backwards the system cannot tell that you took
              your break, so the day looks like a missed rest period. That can put a
              premium hour on the books that was never actually owed, and it makes
              the hours on your own timesheet wrong. Every one of those has to be
              chased down and corrected by hand before payroll can close.
            </p>
          </div>
        </div>
      </div>

      {/* 2. meal periods */}
      <div className="mt-6 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <SectionHead
          n="2"
          title="The lunch, or meal period"
          tag="Unpaid"
          tagTone="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
        />
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
          A lunch is different from a 10 minute rest period. You are genuinely off the clock, it is
          unpaid, and it has to be at least 30 minutes. You are free to leave, and
          no work of any kind belongs in it, including work calls and texts.
        </p>

        <h3 className="mt-6 text-base font-bold text-foreground">
          When it needs to happen in your shift
        </h3>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground">
          <li>
            If you work <b>more than 5 hours</b>, you get a 30 minute unpaid lunch.
          </li>
          <li>
            <b>
              It has to begin before the end of your fifth hour of work. That is a
              deadline, not a target.
            </b>{" "}
            Clock in at 8:00 AM and your lunch has to start by 1:00 PM at the
            latest. Starting it at 1:05 PM is a late meal period even if you took
            the full 30 minutes.
          </li>
          <li>
            <b>Aim for the middle of your shift</b>, not the edge of the deadline.
            On a standard 8 hour day that puts lunch somewhere around the fourth
            hour, which also leaves room for your second 10 minute rest period
            afterwards.
          </li>
          <li>
            Take the <b>full 30 minutes in one piece.</b> Coming back 5 minutes
            early counts as a short meal period, and it is treated the same as not
            getting one.
          </li>
          <li>
            If you work <b>more than 10 hours</b>, you get a second 30 minute
            lunch, and it has to begin before the end of your tenth hour.
          </li>
          <li>
            If your whole day is <b>6 hours or less</b>, you and the company can
            agree in writing to skip the first lunch. That agreement has to be
            signed and on file, it is not something you decide in the moment.
          </li>
        </ul>

        <div className="mt-5 flex gap-3 rounded-lg border border-border bg-surface-2 px-5 py-4">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="mt-0.5 size-5 flex-none text-brand dark:text-accent"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4m0-4h.01" />
          </svg>
          <div className="text-sm leading-relaxed text-muted">
            <p>
              <b className="text-foreground">
                The same left and right rule applies to lunch.
              </b>{" "}
              Time Out is when you stopped working and walked away. Time In is
              when you came back. Out first, in second, every time.
            </p>
            <p className="mt-2">
              Reversing a lunch does the same damage as reversing a rest period,
              except a lunch is unpaid, so the hours on your check move too. A backwards 30
              minute lunch can take half an hour off a day you actually worked, or
              add one you did not.
            </p>
          </div>
        </div>
      </div>

      {/* 3. worked example */}
      <div className="mt-6 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <SectionHead n="3" title="What a full shift looks like" />
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
          A full 8 hour direct service day as it should look on your schedule,
          8:00 AM to 4:30 PM. Two 10 minute rest periods and a meal break, each one
          landing where it belongs. Client names here are made up.
        </p>

        <div className="mt-5 overflow-x-auto">
          <QspSchedule />
        </div>

        <ul className="mt-5 list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground">
          <li>
            <b>First 10 minute rest period at 11:00 AM.</b> Three hours of
            billable work in, so it sits inside the first 4 hours, which on this
            day run 8:00 AM to 12:00 PM.
          </li>
          <li>
            <b>Meal break begins at 12:30 PM.</b> You have worked 4.5 hours by
            then, so it starts before the end of your fifth hour. The deadline was
            1:00 PM. You clock out at 12:30 and back in at 1:00.
          </li>
          <li>
            <b>Second 10 minute rest period at 3:00 PM.</b> Inside the last 4
            hours of billable work, which on this day begin at 12:00 PM.
          </li>
          <li>
            <b>Total on the clock: 8 hours.</b> Service 7.5 plus 0.5 travel. Both
            10 minute rest periods are inside that 8 because rest periods are
            paid.
            Only the 30 minute meal comes out, which is why the day runs to 4:30
            and not 4:00.
          </li>
        </ul>
      </div>

      {/* 4. missed breaks */}
      <div className="mt-6 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <SectionHead n="4" title="If a break does not happen" />
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
          California treats a missed break as owed money, not as a rule you broke.
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground">
          <li>
            For each workday you were not provided a lunch, you are owed{" "}
            <b>one extra hour of pay</b> at your regular rate.
          </li>
          <li>
            For each workday you were not provided a rest period, you are owed{" "}
            <b>one extra hour of pay</b>, counted separately from the lunch.
          </li>
          <li>
            Both can land on the same day, so a single day can carry up to two
            extra hours.
          </li>
        </ul>

        <div className="mt-5 flex gap-3 rounded-lg border border-border bg-surface-2 px-5 py-4">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="mt-0.5 size-5 flex-none text-brand dark:text-accent"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4m0-4h.01" />
          </svg>
          <div className="text-sm leading-relaxed text-muted">
            <p>
              <b className="text-foreground">Record what actually happened.</b> If
              a client ran long, or the day got away from you and the break never
              came, punch it that way and say so in the comments. That is not
              something to hide, and it is not a mark against you. The hour is
              yours.
            </p>
            <p className="mt-2">
              What we are asking for is an accurate record. A break you took and
              punched backwards, and a break you never took, look identical to
              payroll, and only one of them is true.
            </p>
          </div>
        </div>
      </div>

      {/* 5. practice */}
      <div className="mt-6 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <SectionHead n="5" title="Try it yourself" />
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
          Most people record their breaks on their phone, so this is the QSP app
          as it looks there. Work through a full 8 hour day and put in a rest
          period the way you would on a normal shift. Nothing here is real and
          nothing is saved.
        </p>
        <PracticeApp employeeName={employeeName} />
      </div>

      <p className="mt-8 border-t border-border pt-5 text-xs leading-relaxed text-faint">
        Based on California Labor Code sections 226.7 and 512, and the applicable
        IWC Wage Order. Rest period counts follow{" "}
        <i>Brinker Restaurant Corp. v. Superior Court</i> (2012). This page is a
        plain language summary for staff and is not a substitute for the Wage
        Order text or for advice from HR.
      </p>
    </>
  );
}
