"use client";

// overview map showing every resource that has coordinates as a pin, using
// Leaflet + free OpenStreetMap tiles (no API key). Leaflet itself is imported
// inside the effect so it never runs during SSR (it touches `window`).
//
// clicking a pin calls onSelect(id) so the parent can open the inline detail
// panel. hovering shows the name. the selected pin grows + pops to the front,
// and the map pans to it.
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { categoryColor } from "@/lib/contacts";

// build a colored teardrop pin as a Leaflet divIcon. `big` scales it up for
// the currently-selected resource.
function pinIcon(L, color, big) {
  const w = big ? 36 : 26;
  const h = big ? 50 : 36;
  const html =
    `<svg width="${w}" height="${h}" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 ${big ? 2 : 1}px ${big ? 4 : 1.5}px rgba(0,0,0,0.5))">` +
    `<path d="M13 0C5.8 0 0 5.8 0 13c0 9.2 13 23 13 23s13-13.8 13-23C26 5.8 20.2 0 13 0z" fill="${color}" stroke="#ffffff" stroke-width="${big ? 2 : 2.5}"/>` +
    `<circle cx="13" cy="13" r="${big ? 5 : 4.5}" fill="#ffffff"/></svg>`;
  return L.divIcon({ className: "", html, iconSize: [w, h], iconAnchor: [w / 2, h] });
}

export default function ResourceMap({ points, onSelect, selectedId }) {
  const ref = useRef(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const LRef = useRef(null);
  const prevSelRef = useRef(null);

  const colorFor = (id) =>
    categoryColor(points.find((p) => p.id === id)?.category);

  useEffect(() => {
    let map;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current) return;
      LRef.current = L;

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
        const big = p.id === selectedId;
        const m = L.marker([p.lat, p.lng], {
          icon: pinIcon(L, categoryColor(p.category), big),
        }).addTo(map);
        if (big) m.setZIndexOffset(1000);
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

  // grow + raise the selected pin, shrink the previously-selected one, pan to it.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const markers = markersRef.current;
    if (!L || !map) return;

    const prev = prevSelRef.current;
    if (prev && prev !== selectedId && markers[prev]) {
      markers[prev].setIcon(pinIcon(L, colorFor(prev), false));
      markers[prev].setZIndexOffset(0);
    }
    prevSelRef.current = selectedId;

    const m = selectedId && markers[selectedId];
    if (m) {
      m.setIcon(pinIcon(L, colorFor(selectedId), true));
      m.setZIndexOffset(1000);
      map.panTo(m.getLatLng());
      m.openTooltip();
    }
  }, [selectedId]);

  return <div ref={ref} className="h-80 w-full" />;
}
