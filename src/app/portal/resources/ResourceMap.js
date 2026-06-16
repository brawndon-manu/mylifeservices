"use client";

// overview map showing every resource that has coordinates as a pin, using
// Leaflet + free OpenStreetMap tiles (no API key). Leaflet itself is imported
// inside the effect so it never runs during SSR (it touches `window`).
//
// clicking a pin opens a popup with the place name (a highlighted link) and
// its location below. clicking the name calls onSelect(id) so the parent can
// scroll to + highlight that resource's card.
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export default function ResourceMap({ points, onSelect }) {
  const ref = useRef(null);
  // keep the latest onSelect in a ref so popups always call the current one
  // without forcing the map to rebuild when the callback identity changes.
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    let map;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current) return;

      // default marker icons break under bundlers; point them at the CDN.
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      map = L.map(ref.current, { scrollWheelZoom: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      const markers = [];
      for (const p of points) {
        if (typeof p.lat !== "number" || typeof p.lng !== "number") continue;
        const m = L.marker([p.lat, p.lng]).addTo(map);

        // build the popup as a real DOM node so we can wire a click handler
        // straight onto the name link.
        const el = document.createElement("div");
        el.className = "rmap-popup";
        const loc = p.address || p.city || "";
        el.innerHTML =
          (p.category
            ? `<span class="rmap-chip">${escapeHtml(p.category)}</span>`
            : "") +
          `<button type="button" class="rmap-name">${escapeHtml(p.name)}</button>` +
          (loc ? `<div class="rmap-loc">${escapeHtml(loc)}</div>` : "");
        el.querySelector(".rmap-name").addEventListener("click", () => {
          selectRef.current?.(p.id);
        });
        m.bindPopup(el);
        markers.push(m);
      }

      if (markers.length) {
        map.fitBounds(L.featureGroup(markers).getBounds().pad(0.2));
      } else {
        map.setView([33.7, -117.83], 9); // Orange County fallback
      }
    })();

    return () => {
      cancelled = true;
      if (map) map.remove();
    };
  }, [points]);

  return <div ref={ref} className="h-80 w-full" />;
}
