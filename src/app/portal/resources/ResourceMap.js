"use client";

// overview map showing every resource that has coordinates as a pin, using
// Leaflet + free OpenStreetMap tiles (no API key). Leaflet itself is imported
// inside the effect so it never runs during SSR (it touches `window`).
//
// clicking a pin calls onSelect(id) so the parent can open the inline detail
// panel. hovering a pin shows its name. when selectedId changes the map pans
// to that pin and opens its tooltip.
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { categoryColor } from "@/lib/contacts";

export default function ResourceMap({ points, onSelect, selectedId }) {
  const ref = useRef(null);
  // keep the latest onSelect in a ref so markers always call the current one
  // without rebuilding the map when the callback identity changes.
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const mapRef = useRef(null);
  const markersRef = useRef({});

  useEffect(() => {
    let map;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current) return;

      map = L.map(ref.current, { scrollWheelZoom: false });
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      const markers = [];
      markersRef.current = {};
      for (const p of points) {
        if (typeof p.lat !== "number" || typeof p.lng !== "number") continue;
        // colored teardrop pin (SVG divIcon), one color per category label.
        // white outline + drop shadow so it stays visible over any tiles.
        const color = categoryColor(p.category);
        const html =
          `<svg width="26" height="36" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 1px 1.5px rgba(0,0,0,0.45))">` +
          `<path d="M13 0C5.8 0 0 5.8 0 13c0 9.2 13 23 13 23s13-13.8 13-23C26 5.8 20.2 0 13 0z" fill="${color}" stroke="#ffffff" stroke-width="2.5"/>` +
          `<circle cx="13" cy="13" r="4.5" fill="#ffffff"/></svg>`;
        const m = L.marker([p.lat, p.lng], {
          icon: L.divIcon({ className: "", html, iconSize: [26, 36], iconAnchor: [13, 36] }),
        }).addTo(map);
        m.bindTooltip(p.name);
        m.on("click", () => selectRef.current?.(p.id));
        markersRef.current[p.id] = m;
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
      mapRef.current = null;
      markersRef.current = {};
    };
  }, [points]);

  // pan to + flag the selected pin when the selection changes.
  useEffect(() => {
    const map = mapRef.current;
    const m = selectedId && markersRef.current[selectedId];
    if (map && m) {
      map.panTo(m.getLatLng());
      m.openTooltip();
    }
  }, [selectedId]);

  return <div ref={ref} className="h-80 w-full" />;
}
