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

      // default marker icons break under bundlers; point them at the CDN.
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

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
        const m = L.marker([p.lat, p.lng]).addTo(map);
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
