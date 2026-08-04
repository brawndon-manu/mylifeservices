"use client";

// The four exports, shown while the upload runs.
//
// The file pickers are hidden once it starts - four "Browse…" buttons that can't
// be used are just noise on a screen you're waiting on. These take their place
// so you can still see what's being read, and what each one is FOR, which is the
// part nobody remembers.

const DOC = {
  pdf: { tag: "PDF", color: "#c0392b" },
  xls: { tag: "XLS", color: "#1e8449" },
};

function DocIcon({ kind }) {
  const d = DOC[kind] || DOC.pdf;
  return (
    <span
      aria-hidden="true"
      className="relative block h-7 w-[22px] flex-none rounded-[2px] bg-gradient-to-br from-white to-slate-200 shadow-sm"
    >
      {/* folded corner */}
      <span className="absolute right-0 top-0 border-[0_7px_7px_0] border-solid border-transparent border-r-slate-400" />
      {/* ruled lines */}
      <span
        className="absolute inset-x-[3px] top-[5px] h-[10px]"
        style={{
          background: "repeating-linear-gradient(#c8ccd4 0 1px, transparent 1px 3px)",
        }}
      />
      <span
        className="absolute inset-x-0 bottom-[3px] text-center text-[7px] font-extrabold leading-none"
        style={{ color: d.color }}
      >
        {d.tag}
      </span>
    </span>
  );
}

export default function SourceFiles({ files }) {
  const shown = (files || []).filter((f) => f.name);
  if (!shown.length) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {shown.map((f) => (
        <div
          key={f.role}
          className="flex min-w-0 items-start gap-2.5 rounded-lg border border-border bg-surface-2 px-3 py-2.5"
        >
          <DocIcon kind={f.kind} />
          <span className="min-w-0">
            <span className="block break-words text-[11px] leading-snug text-foreground">
              {f.name}
            </span>
            <span className="mt-0.5 block text-[9.5px] uppercase tracking-wider text-faint">
              {f.role}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
