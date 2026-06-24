"use client";

// the interactive guts of the Resources page: filter bar (city / label / who
// it serves / staff picks), the overview pin map, a featured "Staff picks"
// row, and the category cards / resource cards. clicking a pin or a card name
// opens an inline detail panel between the map and the cards (no page
// redirect); "View full details" goes to the resource's own page.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ConfirmButton from "@/components/ConfirmButton";
import {
  RESOURCE_CATEGORIES,
  WHO_IT_SERVES_OPTIONS,
  OP_STATUS_LABELS,
  categoryDescription,
  categoryColor,
  pinnedCategories,
  formatUSPhone,
  formatScheduleRow,
} from "@/lib/contacts";
import { deleteResource, toggleStaffPick, markVerified } from "../contacts/actions";
import ResourceMap from "./ResourceMap";
import CategoryInfo from "./CategoryInfo";

const SELECT_CLASS =
  "rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

// per-resource Google embed (free Embed API), built from the address. no key
// or no address -> no embed, just the directions link.
const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
function mapSrc(address) {
  if (!MAPS_KEY || !address) return null;
  return `https://www.google.com/maps/embed/v1/place?key=${MAPS_KEY}&q=${encodeURIComponent(address)}`;
}

const OP_CHIP = {
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  TEMPORARILY_UNAVAILABLE: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  NEEDS_VERIFICATION: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  CLOSED: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
};

export default function ResourceBrowser({ resources, canManage, canPick, initialCategory = "" }) {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const [serves, setServes] = useState("");
  const [status, setStatus] = useState("");
  const [picksOnly, setPicksOnly] = useState(false);
  const [picksOpen, setPicksOpen] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  // distinct filter options pulled from the data we actually have, in a
  // sensible order (predefined lists first, then any extras).
  const cities = useMemo(
    () =>
      [...new Set(resources.map((r) => r.city).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [resources],
  );
  const categories = useMemo(() => {
    const present = new Set(resources.map((r) => r.category).filter(Boolean));
    return [
      ...RESOURCE_CATEGORIES.filter((c) => present.has(c)),
      ...[...present].filter((c) => !RESOURCE_CATEGORIES.includes(c)),
    ];
  }, [resources]);
  const servesOptions = useMemo(() => {
    const present = new Set(resources.flatMap((r) => r.whoItServes || []));
    return WHO_IT_SERVES_OPTIONS.filter((o) => present.has(o));
  }, [resources]);
  const statuses = useMemo(() => {
    const present = new Set(resources.map((r) => r.operationalStatus).filter(Boolean));
    return Object.keys(OP_STATUS_LABELS).filter((s) => present.has(s));
  }, [resources]);
  // count needing verification, for the management quick-filter chip.
  const needsVerifying = useMemo(
    () => resources.filter((r) => r.operationalStatus === "NEEDS_VERIFICATION").length,
    [resources],
  );

  const filtered = useMemo(
    () =>
      resources.filter((r) => {
        if (city && r.city !== city) return false;
        if (category && r.category !== category) return false;
        if (serves && !(r.whoItServes || []).includes(serves)) return false;
        if (status && r.operationalStatus !== status) return false;
        if (picksOnly && !r.staffPick) return false;
        if (query.trim()) {
          const q = query.trim().toLowerCase();
          const hay = [r.name, r.orgName, r.address, r.city]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    [resources, city, category, serves, status, picksOnly, query],
  );

  const picks = useMemo(() => filtered.filter((r) => r.staffPick), [filtered]);

  // group the filtered list by category, predefined order first.
  const grouped = useMemo(() => {
    const byCategory = new Map();
    for (const r of filtered) {
      const c = r.category || "Other";
      if (!byCategory.has(c)) byCategory.set(c, []);
      byCategory.get(c).push(r);
    }
    const ordered = [
      ...RESOURCE_CATEGORIES.filter((c) => byCategory.has(c)),
      ...[...byCategory.keys()].filter((c) => !RESOURCE_CATEGORIES.includes(c)),
    ];
    return ordered.map((c) => [c, byCategory.get(c)]);
  }, [filtered]);

  // landing cards: categories present in the data, plus any pinned category
  // (e.g. Homeless shelters) so it shows even before it has resources.
  const cardCategories = useMemo(() => {
    const counts = new Map(grouped.map(([c, items]) => [c, items.length]));
    for (const c of pinnedCategories()) if (!counts.has(c)) counts.set(c, 0);
    const ordered = [
      ...RESOURCE_CATEGORIES.filter((c) => counts.has(c)),
      ...[...counts.keys()].filter((c) => !RESOURCE_CATEGORIES.includes(c)),
    ];
    return ordered.map((c) => [c, counts.get(c)]);
  }, [grouped]);

  const mapPoints = useMemo(
    () =>
      filtered
        .filter((r) => typeof r.lat === "number" && typeof r.lng === "number")
        .map((r) => ({
          id: r.id,
          name: r.name,
          address: r.address,
          city: r.city,
          category: r.category,
          lat: r.lat,
          lng: r.lng,
        })),
    [filtered],
  );

  // categories actually shown on the map, for the color legend.
  const mapLegend = useMemo(() => {
    const present = new Set(mapPoints.map((p) => p.category).filter(Boolean));
    return RESOURCE_CATEGORIES.filter((c) => present.has(c));
  }, [mapPoints]);

  // clicking a pin or a card name opens the inline detail panel (no redirect).
  const selected = useMemo(
    () => resources.find((r) => r.id === selectedId) || null,
    [resources, selectedId],
  );
  // bring the panel into view when something is selected.
  const panelRef = useRef(null);
  useEffect(() => {
    if (selected && panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selected]);

  const hasFilters = city || category || serves || status || picksOnly || query.trim();
  // landing on the category cards when nothing has been chosen or searched.
  const browsing = !category && !query.trim();

  function clearAll() {
    setQuery("");
    setCity("");
    setCategory("");
    setServes("");
    setStatus("");
    setPicksOnly(false);
  }

  return (
    <>
      {/* search */}
      <div className="mt-8">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, organization, or address"
          aria-label="Search resources"
          className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      {/* filters */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canManage && needsVerifying > 0 && (
          <button
            type="button"
            onClick={() =>
              setStatus((s) => (s === "NEEDS_VERIFICATION" ? "" : "NEEDS_VERIFICATION"))
            }
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              status === "NEEDS_VERIFICATION"
                ? "bg-amber-400 text-amber-950"
                : "bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/50"
            }`}
          >
            {needsVerifying} need verifying
          </button>
        )}
        {cities.length > 0 && (
          <select aria-label="Filter by city" value={city} onChange={(e) => setCity(e.target.value)} className={SELECT_CLASS}>
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        <select aria-label="Filter by label" value={category} onChange={(e) => setCategory(e.target.value)} className={SELECT_CLASS}>
          <option value="">All labels</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {servesOptions.length > 0 && (
          <select aria-label="Filter by who it serves" value={serves} onChange={(e) => setServes(e.target.value)} className={SELECT_CLASS}>
            <option value="">Anyone served</option>
            {servesOptions.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        )}
        {statuses.length > 1 && (
          <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className={SELECT_CLASS}>
            <option value="">Any status</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{OP_STATUS_LABELS[s]}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => setPicksOnly((v) => !v)}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
            picksOnly ? "bg-amber-400 text-amber-950" : "bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/50"
          }`}
        >
          ★ Staff picks
        </button>
        {hasFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="text-sm font-medium text-muted underline-offset-2 hover:text-foreground hover:underline"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-sm text-faint">
          {filtered.length} {filtered.length === 1 ? "resource" : "resources"}
        </span>
      </div>

      {mapPoints.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-border shadow-sm">
          <ResourceMap points={mapPoints} onSelect={setSelectedId} selectedId={selectedId} />
          {mapLegend.length > 1 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border bg-surface px-4 py-2.5">
              {mapLegend.map((c) => (
                <span key={c} className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: categoryColor(c) }} />
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* inline detail panel for the selected pin / card */}
      {selected && (
        <div ref={panelRef} className="mt-6">
          <ResourcePanel
            r={selected}
            canManage={canManage}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}

      {/* featured staff picks (collapsible) */}
      {picks.length > 0 && !picksOnly && (
        <div className="mt-10 rounded-2xl border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-900/50 dark:bg-amber-950/25">
          <button
            type="button"
            onClick={() => setPicksOpen((v) => !v)}
            aria-expanded={picksOpen}
            className="flex w-full items-center justify-between gap-2 text-lg font-semibold tracking-tight text-amber-900 dark:text-amber-300"
          >
            <span className="flex items-center gap-2">
              <span aria-hidden>★</span> Staff picks
              <span className="text-sm font-normal text-amber-700/80 dark:text-amber-300/70">({picks.length})</span>
            </span>
            <svg
              className={`h-5 w-5 transition-transform ${picksOpen ? "rotate-180" : ""}`}
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 8l4 4 4-4" />
            </svg>
          </button>
          {picksOpen && (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {picks.map((r) => (
                <ResourceCard key={r.id} r={r} canManage={canManage} canPick={canPick} selectedId={selectedId} onOpen={setSelectedId} />
              ))}
            </ul>
          )}
        </div>
      )}

      {browsing ? (
        /* category cards landing: pick a label to drill in */
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {cardCategories.map(([cat, count]) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-5 text-left shadow-sm transition hover:border-brand-light hover:shadow"
            >
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(cat) }} />
                <div>
                  <p className="font-semibold text-foreground">{cat}</p>
                  {categoryDescription(cat) && (
                    <p className="mt-0.5 text-sm text-muted">{categoryDescription(cat)}</p>
                  )}
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-sky-100 px-2.5 py-1 text-sm font-semibold text-brand dark:bg-sky-950/50 dark:text-sky-300">
                {count}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <>
          {category && (
            <button
              type="button"
              onClick={() => setCategory("")}
              className="mt-8 text-sm font-medium text-brand transition hover:text-brand-dark"
            >
              ← All categories
            </button>
          )}
          {category && <CategoryInfo category={category} />}
          {filtered.length === 0 ? (
            <p className="mt-6 text-sm text-muted">No resources match these filters.</p>
          ) : (
            <div className="mt-6 space-y-12">
              {grouped.map(([cat, items]) => (
                <div key={cat}>
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">
                    {cat} <span className="ml-1 text-sm font-normal text-faint">({items.length})</span>
                  </h2>
                  <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                    {items.map((r) => (
                      <ResourceCard key={r.id} r={r} canManage={canManage} canPick={canPick} selectedId={selectedId} onOpen={setSelectedId} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

function ResourceCard({ r, canManage, canPick, selectedId, onOpen }) {
  const phone = formatUSPhone(r.phone);
  const active = selectedId === r.id;
  const det = r.details || {};
  const schedule = Array.isArray(r.schedule) ? r.schedule : [];
  const scheduleLines = schedule.map(formatScheduleRow).filter(Boolean);
  const verified = r.lastVerifiedAt
    ? new Date(r.lastVerifiedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  // access barriers, shown as flags so staff see them at a glance.
  const requirements = [
    r.appointmentRequired && "Appointment",
    det.referralRequired && "Referral",
    det.idRequired && "ID required",
    det.proofOfIncomeRequired && "Proof of income",
  ].filter(Boolean);

  // who it serves, trimmed so the card stays scannable.
  const serves = r.whoItServes || [];
  const servesLabel =
    serves.length > 2 ? `${serves.slice(0, 2).join(", ")}, +${serves.length - 2}` : serves.join(", ");

  // city/state/zip line, so resources that used the separate fields (not a
  // single crammed address) still show their location.
  const cityLine =
    [r.city, r.state].filter(Boolean).join(", ") + (r.zip ? ` ${r.zip}` : "");
  const fullAddress = [r.address, cityLine.trim()].filter(Boolean).join(", ");

  return (
    <li
      id={`resource-${r.id}`}
      className={`flex flex-col overflow-hidden rounded-xl border bg-surface shadow-sm transition ${
        active ? "border-brand ring-2 ring-brand" : "border-border"
      }`}
    >
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {r.category && (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-brand dark:bg-sky-950/50 dark:text-sky-300">{r.category}</span>
          )}
          {r.operationalStatus && r.operationalStatus !== "ACTIVE" && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${OP_CHIP[r.operationalStatus] || "bg-surface-3 text-muted"}`}>
              {OP_STATUS_LABELS[r.operationalStatus] || r.operationalStatus}
            </span>
          )}
          {r.staffPick && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">★ Staff pick</span>
          )}
        </div>

        <button
          type="button"
          onClick={() => onOpen(r.id)}
          className="mt-1.5 block text-left font-semibold text-foreground transition hover:text-brand"
        >
          {r.name}
        </button>
        {r.subtype && <p className="text-xs text-muted">{r.subtype}</p>}
        {r.notes && <p className="mt-1 text-sm leading-relaxed text-muted">{r.notes}</p>}

        {(scheduleLines.length > 0 || r.hours) && (
          <div className="mt-2 rounded-md bg-surface-2 px-2.5 py-1.5 text-xs leading-relaxed text-muted">
            {scheduleLines.length > 0
              ? scheduleLines.map((line, i) => <p key={i}>{line}</p>)
              : <p className="whitespace-pre-line">{r.hours}</p>}
          </div>
        )}

        {(requirements.length > 0 || det.distributionMethod) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {requirements.map((req) => (
              <span key={req} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                {req}
              </span>
            ))}
            {det.distributionMethod && (
              <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-muted">
                {det.distributionMethod}
              </span>
            )}
          </div>
        )}

        {(servesLabel || r.serviceArea) && (
          <div className="mt-2 text-sm text-muted">
            {servesLabel && (
              <p><span className="text-faint">Serves:</span> {servesLabel}</p>
            )}
            {r.serviceArea && (
              <p><span className="text-faint">Area:</span> {r.serviceArea}</p>
            )}
          </div>
        )}

        <div className="mt-2 space-y-0.5 text-sm">
          {det.addressVaries ? (
            <p className="italic text-muted">Location varies</p>
          ) : (
            (r.address || cityLine.trim()) && (
              <div className="flex items-start gap-1.5">
                <div className="text-muted">
                  {r.address && <p>{r.address}</p>}
                  {cityLine.trim() && <p>{cityLine}</p>}
                </div>
                <CopyButton text={fullAddress} label="Copy address" />
              </div>
            )
          )}
          {phone && (
            <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="block text-muted underline-offset-2 hover:underline">
              {phone}
            </a>
          )}
          {r.website && (
            <a href={r.website} target="_blank" rel="noopener noreferrer" className="block truncate text-brand underline-offset-2 hover:underline">
              {r.website.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onOpen(r.id)}
            className="text-sm font-semibold text-brand transition hover:text-brand-dark"
          >
            View details →
          </button>
          {verified && <span className="text-[11px] text-faint">Verified {verified}</span>}
        </div>
      </div>

      {(canPick || canManage) && (
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-border px-4 py-2">
          {canPick ? (
            <form action={toggleStaffPick.bind(null, r.id)}>
              <button type="submit" className="text-[11px] font-medium text-amber-700 transition hover:text-amber-800">
                {r.staffPick ? "★ Remove staff pick" : "☆ Mark staff pick"}
              </button>
            </form>
          ) : (
            <span />
          )}
          {canManage && (
            <form action={deleteResource.bind(null, r.id)}>
              <ConfirmButton message="Remove this resource?" className="text-[11px] font-medium text-rose-600 transition hover:text-rose-700">
                Remove
              </ConfirmButton>
            </form>
          )}
        </div>
      )}
    </li>
  );
}

// inline detail panel shown between the map and the cards when a pin or card
// name is clicked. a concise, pretty summary; "View full details" goes to the
// resource's own page for the deep stuff (internal notes, embedded map, etc.).
// small copy-to-clipboard button. shows "Copied" briefly, then reverts.
function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      title={label}
      className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded text-faint transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      {copied ? (
        <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Copied</span>
      ) : (
        <CopyIcon className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function CopyIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

// share menu by the resource title: copies / opens the PUBLIC unlisted link
// (/r/<id>) so it can be texted to someone without a portal login.
function ShareMenu({ id }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);
  const path = `/r/${id}`;

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.origin + path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <span ref={ref} className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Share"
        aria-expanded={open}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-brand transition hover:bg-sky-200 dark:bg-sky-950/50 dark:text-sky-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <ShareIcon className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-30 w-48 rounded-xl border border-border bg-surface p-1.5 shadow-lg">
          <p className="px-2 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-faint">Share</p>
          <button
            type="button"
            onClick={copy}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-foreground transition hover:bg-surface-2"
          >
            <CopyIcon className="h-4 w-4 text-faint" />
            {copied ? (
              <span className="font-medium text-emerald-600 dark:text-emerald-400">Copied</span>
            ) : (
              "Copy link"
            )}
          </button>
          <a
            href={path}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-foreground transition hover:bg-surface-2"
          >
            <ExternalIcon className="h-4 w-4 text-faint" />
            Open in new tab
          </a>
        </div>
      )}
    </span>
  );
}

function ShareIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12 19" />
    </svg>
  );
}

function ExternalIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" />
    </svg>
  );
}

// the inline detail panel: the single full view of a resource (the standalone
// page is kept only for editing + direct links). shows everything the form
// captured.
function ResourcePanel({ r, canManage, onClose }) {
  const phone = formatUSPhone(r.phone);
  const det = r.details || {};
  const subtitle = [r.subtype, (r.whoItServes || []).join(", ")].filter(Boolean).join(" • ");
  const scheduleLines = (Array.isArray(r.schedule) ? r.schedule : [])
    .map(formatScheduleRow)
    .filter(Boolean);
  const requirements = [
    r.appointmentRequired && "Appointment required",
    det.referralRequired && "Referral required",
    det.idRequired && "ID required",
    det.proofOfIncomeRequired && "Proof of income required",
  ].filter(Boolean);
  const cityLine = [r.city, r.state].filter(Boolean).join(", ") + (r.zip ? ` ${r.zip}` : "");
  const fullAddress = [r.address, cityLine.trim()].filter(Boolean).join(", ");
  const directions = r.address
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(r.address)}`
    : null;
  const src = !det.addressVaries ? mapSrc(r.address) : null;
  const verifiedOn = r.lastVerifiedAt
    ? new Date(r.lastVerifiedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : null;
  const hasVisitDetails =
    det.distributionMethod || det.foodSelection || det.whatToBring || (det.specialInstructions || []).length > 0;

  return (
    <div className="relative rounded-2xl border border-brand-light bg-surface p-5 shadow-md ring-1 ring-brand-light/40 sm:p-6">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-faint transition hover:bg-surface-3 hover:text-muted"
      >
        ×
      </button>

      <div className="flex flex-wrap items-center gap-1.5 pr-8">
        {r.category && (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-brand dark:bg-sky-950/50 dark:text-sky-300">{r.category}</span>
        )}
        {r.operationalStatus && r.operationalStatus !== "ACTIVE" && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${OP_CHIP[r.operationalStatus] || "bg-surface-3 text-muted"}`}>
            {OP_STATUS_LABELS[r.operationalStatus] || r.operationalStatus}
          </span>
        )}
        {r.staffPick && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">★ Staff pick</span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2 pr-8">
        <h3 className="text-xl font-semibold tracking-tight text-foreground">{r.name}</h3>
        <ShareMenu id={r.id} />
      </div>
      {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      {r.orgName && <p className="text-xs text-faint">{r.orgName}</p>}
      {r.notes && <p className="mt-3 text-sm leading-relaxed text-muted">{r.notes}</p>}

      {/* actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {directions && (
          <a href={directions} target="_blank" rel="noopener noreferrer" className="rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand">
            Get directions
          </a>
        )}
        {phone && (
          <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="rounded-md border border-border-strong px-4 py-2 text-sm font-semibold text-muted transition hover:bg-surface-2">
            Call {phone}
          </a>
        )}
        {r.appointmentLink && (
          <a href={r.appointmentLink} target="_blank" rel="noopener noreferrer" className="rounded-md border border-border-strong px-4 py-2 text-sm font-semibold text-muted transition hover:bg-surface-2">
            Book appointment
          </a>
        )}
        {canManage && (
          <Link href={`/portal/resources/${r.id}/edit`} className="rounded-md border border-border-strong px-4 py-2 text-sm font-semibold text-muted transition hover:bg-surface-2">
            Edit
          </Link>
        )}
      </div>

      <div className="mt-5 space-y-5">
        {(scheduleLines.length > 0 || r.hours) && (
          <PanelBlock title="Hours">
            {scheduleLines.length > 0 && (
              <ul className="space-y-0.5 text-sm text-muted">
                {scheduleLines.map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            )}
            {r.hours && <p className="mt-1 whitespace-pre-line text-sm text-muted">{r.hours}</p>}
          </PanelBlock>
        )}

        <PanelBlock title="Location">
          {det.addressVaries ? (
            <p className="text-sm italic text-muted">Location varies</p>
          ) : (
            <div className="flex items-start gap-1.5 text-sm text-muted">
              <div>
                {r.address && <p>{r.address}</p>}
                {cityLine.trim() && <p>{cityLine}</p>}
              </div>
              <CopyButton text={fullAddress} label="Copy address" />
            </div>
          )}
          {r.serviceArea && <p className="mt-1 text-sm text-faint">Serves: {r.serviceArea}</p>}
          {src && (
            <div className="mt-3 overflow-hidden rounded-lg border border-border">
              <iframe title={`Map of ${r.name}`} src={src} className="block aspect-[16/9] w-full" style={{ border: 0 }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            </div>
          )}
        </PanelBlock>

        {(phone || r.email || r.website || r.contactInstructions) && (
          <PanelBlock title="Contact">
            <div className="space-y-0.5 text-sm">
              {phone && <p className="text-muted">{phone}</p>}
              {r.email && <a href={`mailto:${r.email}`} className="block text-brand hover:underline">{r.email}</a>}
              {r.website && (
                <a href={r.website} target="_blank" rel="noopener noreferrer" className="block truncate text-brand hover:underline">
                  {r.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              {r.contactInstructions && <p className="text-muted">{r.contactInstructions}</p>}
            </div>
          </PanelBlock>
        )}

        {((r.whoItServes || []).length > 0 || requirements.length > 0 || det.otherEligibility) && (
          <PanelBlock title="Who it serves">
            {(r.whoItServes || []).length > 0 && <p className="text-sm text-muted">{r.whoItServes.join(", ")}</p>}
            {requirements.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {requirements.map((x) => (
                  <span key={x} className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-muted">{x}</span>
                ))}
              </div>
            )}
            {det.otherEligibility && <p className="mt-1.5 text-sm text-muted">{det.otherEligibility}</p>}
          </PanelBlock>
        )}

        {hasVisitDetails && (
          <PanelBlock title="Visit details">
            <dl className="space-y-0.5 text-sm">
              {det.distributionMethod && <PanelRow k="Distribution" v={det.distributionMethod} />}
              {det.foodSelection && <PanelRow k="Food selection" v={det.foodSelection} />}
              {det.whatToBring && <PanelRow k="What to bring" v={det.whatToBring} />}
            </dl>
            {(det.specialInstructions || []).length > 0 && (
              <ul className="mt-1.5 list-disc pl-5 text-sm text-muted">
                {det.specialInstructions.map((s) => <li key={s}>{s}</li>)}
              </ul>
            )}
          </PanelBlock>
        )}

        <PanelBlock title="Verification">
          <p className="text-sm text-muted">
            {verifiedOn
              ? `Last verified ${verifiedOn}${r.verifiedBy?.name ? ` by ${r.verifiedBy.name}` : ""}.`
              : "Not yet verified."}
          </p>
          {canManage && (
            <form action={markVerified.bind(null, r.id)} className="mt-1.5">
              <button type="submit" className="text-sm font-semibold text-brand transition hover:text-brand-dark">
                Mark verified today
              </button>
            </form>
          )}
          {canManage && r.source && <p className="mt-2 text-xs text-faint">Source: {r.source}</p>}
          {canManage && r.internalNotes && (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Internal staff notes</p>
              <p className="mt-1 whitespace-pre-line">{r.internalNotes}</p>
            </div>
          )}
        </PanelBlock>
      </div>
    </div>
  );
}

function PanelRow({ k, v }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-faint">{k}</dt>
      <dd className="text-muted">{v}</dd>
    </div>
  );
}

function PanelBlock({ title, children }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">{title}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}
