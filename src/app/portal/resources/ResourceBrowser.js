"use client";

// the interactive guts of the Resources page: filter bar (city / label / who
// it serves / staff picks), the overview pin map, a featured "Staff picks"
// row, and the category-grouped resource cards. kept client-side so the map
// and the list can talk to each other (clicking a pin scrolls to + flashes
// the matching card).
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ConfirmButton from "@/components/ConfirmButton";
import {
  RESOURCE_CATEGORIES,
  WHO_IT_SERVES_OPTIONS,
  OP_STATUS_LABELS,
  formatUSPhone,
  formatScheduleRow,
} from "@/lib/contacts";
import { deleteResource, toggleStaffPick } from "../contacts/actions";
import ResourceMap from "./ResourceMap";

const SELECT_CLASS =
  "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

const OP_CHIP = {
  ACTIVE: "bg-emerald-100 text-emerald-800",
  TEMPORARILY_UNAVAILABLE: "bg-amber-100 text-amber-800",
  NEEDS_VERIFICATION: "bg-amber-100 text-amber-800",
  CLOSED: "bg-rose-100 text-rose-700",
};

export default function ResourceBrowser({ resources, elevated, canPick }) {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [serves, setServes] = useState("");
  const [status, setStatus] = useState("");
  const [picksOnly, setPicksOnly] = useState(false);
  const [activeId, setActiveId] = useState(null);

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

  // when a pin is clicked, scroll its card into view and flash a highlight.
  const clearTimer = useRef(null);
  useEffect(() => {
    if (!activeId) return;
    const el = document.getElementById(`resource-${activeId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setActiveId(null), 2500);
    return () => clearTimeout(clearTimer.current);
  }, [activeId]);

  const hasFilters = city || category || serves || status || picksOnly || query.trim();

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
          className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      {/* filters */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {elevated && needsVerifying > 0 && (
          <button
            type="button"
            onClick={() =>
              setStatus((s) => (s === "NEEDS_VERIFICATION" ? "" : "NEEDS_VERIFICATION"))
            }
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              status === "NEEDS_VERIFICATION"
                ? "bg-amber-400 text-amber-950"
                : "bg-amber-50 text-amber-800 hover:bg-amber-100"
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
            picksOnly ? "bg-amber-400 text-amber-950" : "bg-amber-50 text-amber-800 hover:bg-amber-100"
          }`}
        >
          ★ Staff picks
        </button>
        {hasFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="text-sm font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-sm text-slate-400">
          {filtered.length} {filtered.length === 1 ? "resource" : "resources"}
        </span>
      </div>

      {mapPoints.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
          <ResourceMap points={mapPoints} onSelect={setActiveId} />
        </div>
      )}

      {/* featured staff picks */}
      {picks.length > 0 && !picksOnly && (
        <div className="mt-10 rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-amber-900">
            <span aria-hidden>★</span> Staff picks
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {picks.map((r) => (
              <ResourceCard key={r.id} r={r} elevated={elevated} canPick={canPick} activeId={activeId} />
            ))}
          </ul>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="mt-10 text-sm text-slate-600">
          {resources.length === 0
            ? "No resources yet. Add the first one."
            : "No resources match these filters."}
        </p>
      ) : (
        <div className="mt-10 space-y-12">
          {grouped.map(([cat, items]) => (
            <div key={cat}>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                {cat} <span className="ml-1 text-sm font-normal text-slate-400">({items.length})</span>
              </h2>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {items.map((r) => (
                  <ResourceCard key={r.id} r={r} elevated={elevated} canPick={canPick} activeId={activeId} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ResourceCard({ r, elevated, canPick, activeId }) {
  const phone = formatUSPhone(r.phone);
  const active = activeId === r.id;
  const subtitle = [r.subtype, (r.whoItServes || []).join(", ")].filter(Boolean).join(" • ");
  const schedule = Array.isArray(r.schedule) ? r.schedule : [];
  const scheduleLines = schedule.map(formatScheduleRow).filter(Boolean);
  const verified = r.lastVerifiedAt
    ? new Date(r.lastVerifiedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <li
      id={`resource-${r.id}`}
      className={`flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition ${
        active ? "border-brand ring-2 ring-brand" : "border-slate-200"
      }`}
    >
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {r.category && (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-brand">{r.category}</span>
          )}
          {r.operationalStatus && r.operationalStatus !== "ACTIVE" && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${OP_CHIP[r.operationalStatus] || "bg-slate-100 text-slate-600"}`}>
              {OP_STATUS_LABELS[r.operationalStatus] || r.operationalStatus}
            </span>
          )}
          {r.staffPick && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">★ Staff pick</span>
          )}
        </div>

        <Link href={`/portal/resources/${r.id}`} className="mt-1.5 block font-semibold text-slate-900 hover:text-brand">
          {r.name}
        </Link>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        {r.notes && <p className="mt-1 text-sm leading-relaxed text-slate-600">{r.notes}</p>}

        {(scheduleLines.length > 0 || r.hours) && (
          <div className="mt-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs leading-relaxed text-slate-700">
            {scheduleLines.length > 0
              ? scheduleLines.map((line, i) => <p key={i}>{line}</p>)
              : <p className="whitespace-pre-line">{r.hours}</p>}
          </div>
        )}

        {r.appointmentRequired && (
          <p className="mt-2 text-xs font-medium text-amber-700">Appointment required</p>
        )}

        <div className="mt-2 space-y-0.5 text-sm">
          {r.address && <p className="text-slate-700">{r.address}</p>}
          {phone && (
            <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="block text-slate-700 underline-offset-2 hover:underline">
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
          <Link href={`/portal/resources/${r.id}`} className="text-sm font-semibold text-brand transition hover:text-brand-dark">
            View details →
          </Link>
          {verified && <span className="text-[11px] text-slate-400">Verified {verified}</span>}
        </div>
      </div>

      {(canPick || elevated) && (
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2">
          {canPick ? (
            <form action={toggleStaffPick.bind(null, r.id)}>
              <button type="submit" className="text-[11px] font-medium text-amber-700 transition hover:text-amber-800">
                {r.staffPick ? "★ Remove staff pick" : "☆ Mark staff pick"}
              </button>
            </form>
          ) : (
            <span />
          )}
          {elevated && (
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
