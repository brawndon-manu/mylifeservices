"use client";

// shared add/edit form for a community resource. the question set adapts to
// the chosen category: "detailed" categories (food banks for now) get the
// food-specific visit + eligibility block and a subtype dropdown; everything
// else gets the lean shared set. schedule is a dynamic list of rows that gets
// serialized into a hidden field for the server action.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PhoneInput from "@/components/PhoneInput";
import {
  RESOURCE_CATEGORIES,
  RESOURCE_NAME_MAX,
  RESOURCE_NOTES_MAX,
  RESOURCE_ADDRESS_MAX,
  RESOURCE_CITY_MAX,
  RESOURCE_HOURS_MAX,
  RESOURCE_URL_MAX,
  WHO_IT_SERVES_OPTIONS,
  DAY_OPTIONS,
  DAY_ABBR,
  DAY_PRESETS,
  FREQUENCY_OPTIONS,
  DISTRIBUTION_METHODS,
  FOOD_SELECTION_OPTIONS,
  SPECIAL_INSTRUCTIONS_OPTIONS,
  DIFFICULTY_OPTIONS,
  TERRAIN_OPTIONS,
  ACCESSIBILITY_OPTIONS,
  AMENITY_OPTIONS,
  PAYMENT_OPTIONS,
  HAZARD_OPTIONS,
  OP_STATUSES,
  OP_STATUS_LABELS,
  subtypesFor,
  isDetailedCategory,
  categoryHasBlock,
  categoryDescription,
  formConfig,
  parseUsAddress,
} from "@/lib/contacts";

const INPUT =
  "mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const LABEL = "block text-sm font-medium text-muted";

export default function ResourceForm({ action, mode = "create", defaults = {}, submitLabel, existing = [], cancelHref = "/portal/resources", categories = RESOURCE_CATEGORIES }) {
  const router = useRouter();
  const d = defaults;
  const det = d.details || {};
  const [category, setCategory] = useState(d.category || "");
  const [nameVal, setNameVal] = useState(d.name || "");
  const [cityVal, setCityVal] = useState(d.city || "");
  const [addressVal, setAddressVal] = useState(d.address || "");
  const [zipVal, setZipVal] = useState(d.zip || "");
  // mobile resources (e.g. a mobile food distribution) move around, so they
  // have no fixed address; this hides + un-requires the location fields.
  const [addressVaries, setAddressVaries] = useState(!!det.addressVaries);
  // whether the category tile picker is open. open by default until a
  // category is chosen; "Change" reopens it.
  const [picking, setPicking] = useState(false);

  // if a full address is pasted/typed into the street box, split it into the
  // street / city / zip fields so it doesn't all sit in one field.
  function splitAddress(text) {
    if (!/\d{5}/.test(text) || !text.includes(",")) return false;
    const p = parseUsAddress(text);
    setAddressVal(p.street || text);
    if (p.city) setCityVal(p.city);
    if (p.zip) setZipVal(p.zip);
    return true;
  }
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
  const outdoor = categoryHasBlock(category, "outdoor");
  const hasTrails = categoryHasBlock(category, "trails");
  // per-category form config (labels, placeholders, which fields show). defaults
  // to the original shared form so untailored categories are unchanged.
  const cfg = useMemo(() => formConfig(category), [category]);
  const rec = cfg.rec;
  // current pin, shown as a hint so editors know what they'd be overriding.
  const coordsDefault =
    d.lat != null && d.lng != null ? `${d.lat}, ${d.lng}` : "";
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
    <form
      action={action}
      className="space-y-10"
      // Enter never submits the form (only the Save button does). in the
      // street field, Enter splits a full address into the right fields.
      onKeyDown={(e) => {
        if (e.key !== "Enter" || e.target.tagName === "TEXTAREA") return;
        e.preventDefault();
        if (e.target.id === "address") splitAddress(e.target.value);
      }}
    >
      {/* serialized schedule for the server action */}
      <input type="hidden" name="scheduleJson" value={JSON.stringify(rows)} />

      {/* 1. Resource details */}
      <Section title={cfg.detailsTitle}>
        <div>
          <Field id="name" label="Name" required value={nameVal} onChange={setNameVal} maxLength={RESOURCE_NAME_MAX} placeholder={cfg.namePlaceholder} />
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
                className="text-sm font-medium text-muted transition hover:text-brand hover:underline"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {categories.map((c) => (
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
                        : "border-border hover:border-brand-light hover:bg-surface-2"
                    }`}
                  >
                    <span className="block text-sm font-semibold text-foreground">{c}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {categoryDescription(c)}
                    </span>
                  </button>
                ))}
              </div>
              {!category && (
                <p className="mt-2 text-xs text-muted">
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
                  Resource type <span className="text-faint">(optional)</span>
                </label>
                <select id="subtype" name="subtype" defaultValue={d.subtype || ""} className={INPUT}>
                  <option value="">Not specified</option>
                  {subtypes.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}
            <Field id="orgName" label={cfg.orgLabel} optional defaultValue={d.orgName} maxLength={120} placeholder={cfg.orgPlaceholder} />
            <TextArea id="notes" label={cfg.notesLabel} defaultValue={d.notes} rows={3} maxLength={RESOURCE_NOTES_MAX} placeholder={cfg.notesPlaceholder} />
          </>
        )}
      </Section>

      {category && (
        <>

      {/* 2. Location & contact (config-driven per category) */}
      <Section title={cfg.locationTitle}>
        {/* mobile / on-the-move resources: no fixed address */}
        {cfg.showAddressVaries && (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              name="addressVaries"
              checked={addressVaries}
              onChange={(e) => setAddressVaries(e.target.checked)}
              className="rounded border-border-strong text-brand focus:ring-brand"
            />
            Address varies (mobile / on the move, no fixed location)
          </label>
        )}
        {!addressVaries && (
          <>
            <Field
              id="address"
              label={cfg.addressLabel}
              required={cfg.addressRequired}
              optional={!cfg.addressRequired}
              value={addressVal}
              onChange={setAddressVal}
              onBlur={() => splitAddress(addressVal)}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (/\d{5}/.test(text) && text.includes(",")) {
                  e.preventDefault();
                  splitAddress(text);
                }
              }}
              maxLength={RESOURCE_ADDRESS_MAX}
              placeholder={cfg.addressPlaceholder}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="city" label="City" required={cfg.cityRequired} optional={!cfg.cityRequired} value={cityVal} onChange={setCityVal} maxLength={RESOURCE_CITY_MAX} />
              <Field id="zip" label="ZIP" optional value={zipVal} onChange={setZipVal} maxLength={12} />
            </div>
          </>
        )}
        {/* trailheads + remote spots often have no street address - paste the
            coordinates instead to drop an exact pin. */}
        {outdoor && (
          <div>
            <label htmlFor="coords" className={LABEL}>
              Map pin coordinates <span className="text-faint">(optional)</span>
            </label>
            <input
              id="coords"
              name="coords"
              type="text"
              defaultValue=""
              maxLength={60}
              autoComplete="off"
              placeholder="lat, lng — e.g. 33.6765, -117.5121"
              className={INPUT}
            />
            <p className="mt-1 text-xs text-muted">
              Paste coordinates (e.g. from AllTrails or Google Maps) to set the
              exact pin. Overrides the auto-locate from the address; great for
              trailheads with no street address.
              {coordsDefault && (
                <>
                  {" "}Current pin: <span className="font-mono">{coordsDefault}</span>.
                </>
              )}
            </p>
          </div>
        )}
        {cfg.showParking && (
          <div className="rounded-lg border border-border bg-surface-2 p-4">
            <p className={LABEL}>Parking &amp; fees</p>
            <p className="mt-0.5 text-xs text-muted">
              Where to park, what it costs, and how to pay.
            </p>
            <div className="mt-3 space-y-4">
              <TextArea
                id="parking"
                label="Parking notes"
                defaultValue={det.parking}
                rows={2}
                maxLength={300}
                placeholder="Where to park, e.g. Dirt lot at the trailhead"
              />
              <TextArea
                id="parkingOverflow"
                label="Overflow / alternate parking"
                defaultValue={det.parkingOverflow}
                rows={2}
                maxLength={300}
                placeholder="Where to park + how to get in if the main lot is full, e.g. Lot fills by 8am weekends; park along O'Neill Park Rd and walk in ~0.4 mi"
              />
              <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border-strong bg-surface px-3 py-2.5 text-sm font-medium text-foreground transition hover:border-brand-light">
                <input
                  type="checkbox"
                  name="adventurePass"
                  defaultChecked={!!det.adventurePass}
                  className="h-4 w-4 rounded border-border-strong text-brand focus:ring-brand"
                />
                Adventure Pass required
              </label>
              {rec.entranceFee && (
                <UnitField id="entranceFeeUsd" label="Entrance fee" prefix="$" defaultValue={det.entranceFeeUsd} placeholder="e.g. 5 (blank = free)" />
              )}
              {rec.payment && (
                <CheckGroup legend="Payment accepted" name="payment" options={PAYMENT_OPTIONS} selected={det.payment || []} />
              )}
            </div>
          </div>
        )}
        {hasTrails && (
          <div>
            <label htmlFor="allTrailsUrl" className={LABEL}>
              AllTrails link <span className="text-faint">(optional)</span>
            </label>
            <input
              id="allTrailsUrl"
              name="allTrailsUrl"
              type="text"
              defaultValue={det.allTrailsUrl || ""}
              maxLength={RESOURCE_URL_MAX}
              autoComplete="off"
              placeholder="alltrails.com/trail/..."
              className={INPUT}
            />
            <p className="mt-1 text-xs text-muted">
              Link to the trail on AllTrails for the map, distance, reviews, and
              photos. Shows as a &ldquo;View on AllTrails&rdquo; button.
            </p>
          </div>
        )}
        {cfg.showServiceArea && (
          <Field id="serviceArea" label="Service area" optional defaultValue={d.serviceArea} maxLength={120} placeholder="e.g. Anaheim residents only" />
        )}
        {cfg.showPhone && (
          <Field id="phone" label={cfg.phoneLabel} required={cfg.phoneRequired} optional={!cfg.phoneRequired} type="tel" defaultValue={d.phone} placeholder={cfg.phonePlaceholder} />
        )}
        {cfg.showEmail && (
          <Field id="email" label="Email" optional type="email" defaultValue={d.email} placeholder="contact@example.org" />
        )}
        {cfg.showWebsite && (
          <Field id="website" label="Website" optional defaultValue={d.website} placeholder="example.org" />
        )}
        {cfg.showAppointmentLink && (
          <Field id="appointmentLink" label="Appointment link" optional defaultValue={d.appointmentLink} placeholder="Online booking URL, if any" />
        )}
        {cfg.showContactInstructions && (
          <Field id="contactInstructions" label="Contact instructions" optional defaultValue={d.contactInstructions} maxLength={300} placeholder='e.g. "Call before visiting" or "Text to schedule"' />
        )}
      </Section>

      {/* 3. Schedule - full day/time editor, simple hours text, or hidden */}
      {cfg.schedule === "full" && (
      <Section title={cfg.scheduleTitle} hint="Pick the days that share the same hours, set the times once. Add another block for days with different hours (e.g. a 2nd & 4th Saturday).">
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
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
                        : "bg-surface-3 text-muted hover:bg-surface-3"
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
                  <label className="text-xs font-medium text-muted">Frequency</label>
                  <select value={row.frequency} onChange={(e) => setRow(i, "frequency", e.target.value)} className={INPUT}>
                    {FREQUENCY_OPTIONS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted">Opens</label>
                  <input type="time" value={row.start} onChange={(e) => setRow(i, "start", e.target.value)} className={INPUT} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted">Closes</label>
                  <input type="time" value={row.end} onChange={(e) => setRow(i, "end", e.target.value)} className={INPUT} />
                </div>
                {rows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="flex h-9 w-9 items-center justify-center justify-self-start rounded-md text-lg text-faint transition hover:bg-rose-50 hover:text-rose-600"
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
        <TextArea id="hours" label={cfg.hoursLabel} defaultValue={d.hours} rows={2} maxLength={RESOURCE_HOURS_MAX} placeholder={cfg.hoursPlaceholder} />
      </Section>
      )}
      {cfg.schedule === "simple" && (
        <Section title={cfg.scheduleTitle}>
          <TextArea id="hours" label={cfg.hoursLabel} defaultValue={d.hours} rows={2} maxLength={RESOURCE_HOURS_MAX} placeholder={cfg.hoursPlaceholder} />
        </Section>
      )}

      {/* 4. Eligibility & visit */}
      {cfg.showEligibility && (
      <Section title="Eligibility and visit instructions">
        <CheckGroup legend="Who it serves" name="whoItServes" options={WHO_IT_SERVES_OPTIONS} selected={d.whoItServes || []} />
        <div>
          <p className={LABEL}>Requirements to get help</p>
          <p className="text-xs text-muted">What a client needs before they can use it. Check all that apply.</p>
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
      )}

      {/* 4b. Recreation details (per-category rec config) */}
      {outdoor && (
        <Section title={rec.title} hint={rec.hint}>
          {(rec.difficulty || rec.length || rec.time || rec.elevation) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {rec.difficulty && <Select id="difficulty" label="Difficulty" options={DIFFICULTY_OPTIONS} defaultValue={det.difficulty} />}
              {rec.length && <UnitField id="lengthMiles" label="Length" unit="mi" defaultValue={det.lengthMiles} placeholder="e.g. 2.5" />}
              {rec.time && <UnitField id="timeHrs" label="Typical time" unit="hrs" defaultValue={det.timeHrs} placeholder="e.g. 1.5" />}
              {rec.elevation && <UnitField id="elevationFt" label="Elevation gain" unit="ft" defaultValue={det.elevationFt} placeholder="e.g. 800" />}
            </div>
          )}
          {/* entrance fee + payment live under Parking & fees (Location) now */}
          {rec.entryFee && <Field id="entryFee" label="Entrance / parking fee" optional defaultValue={det.entryFee} maxLength={120} placeholder="e.g. Free, or $5 parking" />}
          {rec.terrain && <CheckGroup legend="Terrain" name="terrain" options={TERRAIN_OPTIONS} selected={det.terrain || []} />}
          {rec.accessibility && <CheckGroup legend="Accessibility" name="accessibility" options={ACCESSIBILITY_OPTIONS} selected={det.accessibility || []} />}
          {rec.amenities && <CheckGroup legend="Amenities" name="amenities" options={AMENITY_OPTIONS} selected={det.amenities || []} />}
          {rec.hazards && <CheckGroup legend="Hazards / heads up" name="hazards" options={HAZARD_OPTIONS} selected={det.hazards || []} />}
        </Section>
      )}

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

          <div className="flex items-center justify-between gap-3 border-t border-border pt-6">
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Discard changes? Anything you've entered or edited here will be lost.")) {
                  router.push(cancelHref);
                }
              }}
              className="rounded-md border border-border-strong px-5 py-2.5 text-sm font-semibold text-muted transition hover:border-brand hover:text-brand"
            >
              Cancel
            </button>
            <button
              type="submit"
              onClick={(e) => {
                if (!window.confirm("Save this resource?")) e.preventDefault();
              }}
              className="rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
            >
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
      <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      <div className="mt-4 space-y-5">{children}</div>
    </div>
  );
}

function Field({ id, label, optional, required, type = "text", maxLength, placeholder, defaultValue, value, onChange, onBlur, onPaste }) {
  // controlled when value/onChange are passed (used for the dup-check name +
  // city fields), otherwise a plain uncontrolled input.
  const controlled = onChange != null;
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label} {required && <span className="text-rose-600">*</span>}
        {optional && <span className="text-faint">(optional)</span>}
      </label>
      {type === "tel" ? (
        <PhoneInput id={id} name={id} required={required} defaultValue={defaultValue || ""} maxLength={maxLength} placeholder={placeholder} autoComplete="off" className={INPUT} />
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
          onBlur={onBlur}
          onPaste={onPaste}
          {...(controlled
            ? { value, onChange: (e) => onChange(e.target.value) }
            : { defaultValue: defaultValue || "" })}
        />
      )}
    </div>
  );
}

// manual-entry field with a fixed unit baked in - a suffix (e.g. "mi", "ft",
// "hrs") or a prefix (e.g. "$"), so the user just types the number and the unit
// is locked. plain text input (no number steppers) - manual entry only.
function UnitField({ id, label, unit, prefix, defaultValue, placeholder }) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label} <span className="text-faint">(optional)</span>
      </label>
      <div className="relative mt-1">
        {prefix && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-medium text-muted">
            {prefix}
          </span>
        )}
        <input
          id={id}
          name={id}
          type="text"
          inputMode="decimal"
          defaultValue={defaultValue ?? ""}
          placeholder={placeholder}
          autoComplete="off"
          className={`${INPUT} mt-0 ${prefix ? "pl-7" : ""} ${unit ? "pr-12" : ""}`}
        />
        {unit && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-muted">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function TextArea({ id, label, rows = 3, maxLength, placeholder, defaultValue }) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label} <span className="text-faint">(optional)</span>
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
          {label} {includeBlank && <span className="text-faint">(optional)</span>}
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
          <label key={o} className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name={name} value={o} defaultChecked={selected.includes(o)} className="rounded border-border-strong text-brand focus:ring-brand" />
            {o}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle({ name, label, checked }) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      <input type="checkbox" name={name} defaultChecked={!!checked} className="rounded border-border-strong text-brand focus:ring-brand" />
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
        className="flex h-4 w-4 items-center justify-center rounded-full bg-surface-3 text-[10px] font-bold text-muted transition hover:bg-border-strong"
      >
        ?
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute left-0 top-6 z-20 w-64 rounded-md border border-border bg-surface p-3 text-xs leading-relaxed text-muted shadow-lg"
        >
          {children}
        </div>
      )}
    </span>
  );
}
