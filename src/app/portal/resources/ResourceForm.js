"use client";

// shared add/edit form for a community resource. the question set adapts to
// the chosen category: "detailed" categories (food banks for now) get the
// food-specific visit + eligibility block and a subtype dropdown; everything
// else gets the lean shared set. schedule is a dynamic list of rows that gets
// serialized into a hidden field for the server action.
import { useMemo, useState } from "react";
import PhoneInput from "@/components/PhoneInput";
import {
  RESOURCE_CATEGORIES,
  RESOURCE_NAME_MAX,
  RESOURCE_NOTES_MAX,
  RESOURCE_ADDRESS_MAX,
  RESOURCE_CITY_MAX,
  RESOURCE_HOURS_MAX,
  WHO_IT_SERVES_OPTIONS,
  DAY_OPTIONS,
  DAY_ABBR,
  DAY_PRESETS,
  FREQUENCY_OPTIONS,
  DISTRIBUTION_METHODS,
  FOOD_SELECTION_OPTIONS,
  SPECIAL_INSTRUCTIONS_OPTIONS,
  OP_STATUSES,
  OP_STATUS_LABELS,
  subtypesFor,
  isDetailedCategory,
  categoryDescription,
} from "@/lib/contacts";

const INPUT =
  "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const LABEL = "block text-sm font-medium text-slate-700";

export default function ResourceForm({ action, mode = "create", defaults = {}, submitLabel, existing = [] }) {
  const d = defaults;
  const det = d.details || {};
  const [category, setCategory] = useState(d.category || "");
  const [nameVal, setNameVal] = useState(d.name || "");
  const [cityVal, setCityVal] = useState(d.city || "");
  // whether the category tile picker is open. open by default until a
  // category is chosen; "Change" reopens it.
  const [picking, setPicking] = useState(false);
  const [rows, setRows] = useState(
    Array.isArray(d.schedule) && d.schedule.length
      ? d.schedule.map((r) => ({
          // tolerate legacy single-day rows
          days: Array.isArray(r.days) ? r.days : r.day ? [r.day] : [],
          frequency: r.frequency || "Weekly",
          start: r.start || "",
          end: r.end || "",
        }))
      : [{ days: [], frequency: "Weekly", start: "", end: "" }],
  );

  const detailed = isDetailedCategory(category);
  const subtypes = useMemo(() => subtypesFor(category), [category]);

  // non-blocking duplicate warning: flag existing resources with the same
  // name (only when adding, not editing).
  const dupes = useMemo(() => {
    const n = nameVal.trim().toLowerCase();
    if (!n || mode !== "create") return [];
    return existing.filter((e) => (e.name || "").trim().toLowerCase() === n);
  }, [existing, nameVal, mode]);

  function setRow(i, key, value) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  }
  function toggleDay(i, day) {
    setRows((rs) =>
      rs.map((r, j) =>
        j === i
          ? {
              ...r,
              days: r.days.includes(day)
                ? r.days.filter((x) => x !== day)
                : [...r.days, day],
            }
          : r,
      ),
    );
  }
  function setDays(i, days) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, days } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { days: [], frequency: "Weekly", start: "", end: "" }]);
  }
  function removeRow(i) {
    setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));
  }

  return (
    <form action={action} className="space-y-10">
      {/* serialized schedule for the server action */}
      <input type="hidden" name="scheduleJson" value={JSON.stringify(rows)} />

      {/* 1. Resource details */}
      <Section title="Resource details">
        <div>
          <Field id="name" label="Name" required value={nameVal} onChange={setNameVal} maxLength={RESOURCE_NAME_MAX} placeholder="e.g. Anaheim Community Food Pantry" />
          {dupes.length > 0 && (
            <p className="mt-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              A resource named &ldquo;{nameVal.trim()}&rdquo; already exists
              {dupes.some((e) => e.city)
                ? ` (${[...new Set(dupes.map((e) => e.city).filter(Boolean))].join(", ")})`
                : ""}
              . You can still add this if it's a different location.
            </p>
          )}
        </div>
        <div>
          <label className={LABEL}>
            Category <span className="text-rose-600">*</span>
          </label>
          {/* the value the server action reads; set by the tile buttons */}
          <input type="hidden" name="category" value={category} />
          {category && !picking ? (
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-sky-100 px-3 py-1 text-sm font-semibold text-brand">
                {category}
              </span>
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="text-sm font-medium text-slate-500 transition hover:text-brand hover:underline"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {RESOURCE_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setCategory(c);
                      setPicking(false);
                    }}
                    className={`rounded-lg border p-3 text-left transition ${
                      category === c
                        ? "border-brand bg-sky-50 ring-1 ring-brand"
                        : "border-slate-200 hover:border-brand-light hover:bg-slate-50"
                    }`}
                  >
                    <span className="block text-sm font-semibold text-slate-900">{c}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {categoryDescription(c)}
                    </span>
                  </button>
                ))}
              </div>
              {!category && (
                <p className="mt-2 text-xs text-slate-500">
                  Pick what kind of resource this is. The rest of the form
                  tailors itself to your choice.
                </p>
              )}
            </>
          )}
        </div>
        {category && (
          <>
            {subtypes.length > 0 && (
              <div>
                <label htmlFor="subtype" className={LABEL}>
                  Resource type <span className="text-slate-400">(optional)</span>
                </label>
                <select id="subtype" name="subtype" defaultValue={d.subtype || ""} className={INPUT}>
                  <option value="">Not specified</option>
                  {subtypes.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}
            <Field id="orgName" label="Organization name" optional defaultValue={d.orgName} maxLength={120} placeholder="If different from the name above" />
            <TextArea id="notes" label="Short description" defaultValue={d.notes} rows={3} maxLength={RESOURCE_NOTES_MAX} placeholder="What they do, who to ask for, anything helpful." />
          </>
        )}
      </Section>

      {category && (
        <>

      {/* 2. Location & contact */}
      <Section title="Location and contact">
        <Field id="address" label="Street address" optional defaultValue={d.address} maxLength={RESOURCE_ADDRESS_MAX} placeholder="123 Main St" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="city" label="City" optional value={cityVal} onChange={setCityVal} maxLength={RESOURCE_CITY_MAX} placeholder="Anaheim" />
          <Field id="state" label="State" optional defaultValue={d.state || "CA"} maxLength={20} placeholder="CA" />
          <Field id="zip" label="ZIP" optional defaultValue={d.zip} maxLength={12} placeholder="92801" />
        </div>
        <Field id="serviceArea" label="Service area" optional defaultValue={d.serviceArea} maxLength={120} placeholder="e.g. Anaheim residents only" />
        <Field id="phone" label="Phone" optional type="tel" defaultValue={d.phone} placeholder="(714) 555-0123" />
        <Field id="email" label="Email" optional type="email" defaultValue={d.email} placeholder="contact@example.org" />
        <Field id="website" label="Website" optional defaultValue={d.website} placeholder="example.org" />
        <Field id="appointmentLink" label="Appointment link" optional defaultValue={d.appointmentLink} placeholder="Online booking URL, if any" />
        <Field id="contactInstructions" label="Contact instructions" optional defaultValue={d.contactInstructions} maxLength={300} placeholder='e.g. "Call before visiting" or "Text to schedule"' />
      </Section>

      {/* 3. Schedule */}
      <Section title="Schedule" hint="Pick the days that share the same hours, set the times once. Add another block for days with different hours (e.g. a 2nd & 4th Saturday).">
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-3">
              {/* day chips + quick presets */}
              <div className="flex flex-wrap items-center gap-1.5">
                {DAY_OPTIONS.map((dy) => (
                  <button
                    key={dy}
                    type="button"
                    onClick={() => toggleDay(i, dy)}
                    aria-pressed={row.days.includes(dy)}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                      row.days.includes(dy)
                        ? "bg-brand text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {DAY_ABBR[dy]}
                  </button>
                ))}
                <span className="mx-1 text-slate-300">|</span>
                {DAY_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setDays(i, p.days)}
                    className="rounded-full px-2 py-1 text-xs font-medium text-brand transition hover:bg-sky-50"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* frequency + times */}
              <div className="mt-3 grid gap-2 sm:grid-cols-[1.6fr_1fr_1fr_40px] sm:items-end sm:gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500">Frequency</label>
                  <select value={row.frequency} onChange={(e) => setRow(i, "frequency", e.target.value)} className={INPUT}>
                    {FREQUENCY_OPTIONS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500">Opens</label>
                  <input type="time" value={row.start} onChange={(e) => setRow(i, "start", e.target.value)} className={INPUT} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500">Closes</label>
                  <input type="time" value={row.end} onChange={(e) => setRow(i, "end", e.target.value)} className={INPUT} />
                </div>
                {rows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="flex h-9 w-9 items-center justify-center justify-self-start rounded-md text-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    aria-label="Remove this block"
                    title="Remove this block"
                  >
                    ×
                  </button>
                ) : (
                  <span className="hidden sm:block" />
                )}
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={addRow} className="text-sm font-semibold text-brand transition hover:text-brand-dark">
          + Add hours for other days
        </button>
        <TextArea id="hours" label="Other schedule notes" defaultValue={d.hours} rows={2} maxLength={RESOURCE_HOURS_MAX} placeholder="Holidays, seasonal changes, or anything the rows above don't capture." />
      </Section>

      {/* 4. Eligibility & visit */}
      <Section title="Eligibility and visit instructions">
        <CheckGroup legend="Who it serves" name="whoItServes" options={WHO_IT_SERVES_OPTIONS} selected={d.whoItServes || []} />
        <div>
          <p className={LABEL}>Requirements to get help</p>
          <p className="text-xs text-slate-500">What a client needs before they can use it. Check all that apply.</p>
          <div className="mt-2 space-y-2">
            <Toggle name="appointmentRequired" label="Appointment required" checked={d.appointmentRequired} />
            <Toggle name="referralRequired" label="Referral required" checked={det.referralRequired} />
            <Toggle name="idRequired" label="Identification required" checked={det.idRequired} />
            <Toggle name="proofOfIncomeRequired" label="Proof of income required" checked={det.proofOfIncomeRequired} />
          </div>
        </div>
        <Field id="otherEligibility" label="Other eligibility requirements" optional defaultValue={det.otherEligibility} maxLength={500} />

        {detailed && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select id="distributionMethod" label="Distribution method" options={DISTRIBUTION_METHODS} defaultValue={det.distributionMethod} />
              <Select id="foodSelection" label="Food selection" options={FOOD_SELECTION_OPTIONS} defaultValue={det.foodSelection} />
            </div>
            <Field id="whatToBring" label="What to bring" optional defaultValue={det.whatToBring} maxLength={300} placeholder="e.g. ID, proof of address, reusable bags" />
            <CheckGroup legend="Special instructions" name="specialInstructions" options={SPECIAL_INSTRUCTIONS_OPTIONS} selected={det.specialInstructions || []} />
          </>
        )}
      </Section>

      {/* 5. Verification & internal */}
      <Section title="Verification and internal notes">
        <Select
          id="operationalStatus"
          label="Status"
          options={OP_STATUSES}
          labels={OP_STATUS_LABELS}
          defaultValue={d.operationalStatus || "ACTIVE"}
          includeBlank={false}
          help={
            <ul className="space-y-1.5">
              <li><b>Active:</b> running normally.</li>
              <li><b>Temporarily unavailable:</b> real but paused (holiday, between funding cycles, etc.).</li>
              <li><b>Needs verification:</b> we're not sure it's still accurate, someone should call and confirm.</li>
              <li><b>Closed:</b> shut down for good.</li>
            </ul>
          }
        />
        {mode === "edit" && (
          <Toggle name="markVerified" label="Mark as verified today" checked={false} />
        )}
        <TextArea id="internalNotes" label="Internal staff notes" defaultValue={d.internalNotes} rows={3} maxLength={2000} placeholder="Additional details or context for the team." />
        <Field id="source" label="Source" optional defaultValue={d.source} maxLength={300} placeholder="Where this info came from (flyer, site, person)" />
      </Section>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-6">
            <button type="submit" className="rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand">
              {submitLabel || "Save resource"}
            </button>
          </div>
        </>
      )}
    </form>
  );
}

function Section({ title, hint, children }) {
  return (
    <div>
      <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      <div className="mt-4 space-y-5">{children}</div>
    </div>
  );
}

function Field({ id, label, optional, required, type = "text", maxLength, placeholder, defaultValue, value, onChange }) {
  // controlled when value/onChange are passed (used for the dup-check name +
  // city fields), otherwise a plain uncontrolled input.
  const controlled = onChange != null;
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label} {required && <span className="text-rose-600">*</span>}
        {optional && <span className="text-slate-400">(optional)</span>}
      </label>
      {type === "tel" ? (
        <PhoneInput id={id} name={id} defaultValue={defaultValue || ""} maxLength={maxLength} placeholder={placeholder} autoComplete="off" className={INPUT} />
      ) : (
        <input
          id={id}
          name={id}
          type={type}
          required={required}
          maxLength={maxLength}
          placeholder={placeholder}
          autoComplete="off"
          className={INPUT}
          {...(controlled
            ? { value, onChange: (e) => onChange(e.target.value) }
            : { defaultValue: defaultValue || "" })}
        />
      )}
    </div>
  );
}

function TextArea({ id, label, rows = 3, maxLength, placeholder, defaultValue }) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label} <span className="text-slate-400">(optional)</span>
      </label>
      <textarea id={id} name={id} rows={rows} defaultValue={defaultValue || ""} maxLength={maxLength} placeholder={placeholder} className={INPUT} />
    </div>
  );
}

function Select({ id, label, options, labels, defaultValue, includeBlank = true, help }) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className={LABEL}>
          {label} {includeBlank && <span className="text-slate-400">(optional)</span>}
        </label>
        {help && <Help label={`About ${label}`}>{help}</Help>}
      </div>
      <select id={id} name={id} defaultValue={defaultValue || (includeBlank ? "" : options[0])} className={INPUT}>
        {includeBlank && <option value="">Not specified</option>}
        {options.map((o) => (
          <option key={o} value={o}>{labels ? labels[o] : o}</option>
        ))}
      </select>
    </div>
  );
}

function CheckGroup({ legend, name, options, selected }) {
  return (
    <fieldset>
      <legend className={LABEL}>{legend}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label key={o} className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name={name} value={o} defaultChecked={selected.includes(o)} className="rounded border-slate-300 text-brand focus:ring-brand" />
            {o}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle({ name, label, checked }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" name={name} defaultChecked={!!checked} className="rounded border-slate-300 text-brand focus:ring-brand" />
      {label}
    </label>
  );
}

// little "?" bubble that explains a field's options. opens on hover (desktop)
// and on tap/click (touch). hover handlers sit on the wrapper so moving onto
// the popover keeps it open.
function Help({ label, children }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label || "More info"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600 transition hover:bg-slate-300"
      >
        ?
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute left-0 top-6 z-20 w-64 rounded-md border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-600 shadow-lg"
        >
          {children}
        </div>
      )}
    </span>
  );
}
