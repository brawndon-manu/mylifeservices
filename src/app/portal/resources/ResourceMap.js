"use client";

// overview map showing every resource that has coordinates as a pin, on the
// Google Maps JS API (same base map as the per-resource embeds + directions).
// loads the script once, client-side only.
//
// clicking a pin calls onSelect(id) so the parent can open the inline detail
// panel. hovering shows the name. the selected pin grows + pops to the front,
// and the map pans to it.
import { useEffect, useRef } from "react";
import { categoryColor } from "@/lib/contacts";

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;

// load the maps script a single time and hand everyone the same promise.
let mapsPromise = null;
function loadGoogleMaps() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    const cb = "__gmapsInit";
    window[cb] = () => resolve(window.google.maps);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&callback=${cb}&loading=async`;
    s.async = true;
    s.onerror = () => reject(new Error("maps failed to load"));
    document.head.appendChild(s);
  });
  return mapsPromise;
}

// colored teardrop pin as a data-uri svg, matching the old Leaflet one. `big`
// scales it up for the currently-selected resource.
function pinIcon(maps, color, big) {
  const w = big ? 36 : 26;
  const h = big ? 50 : 36;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 26 36'>` +
    `<path d='M13 0C5.8 0 0 5.8 0 13c0 9.2 13 23 13 23s13-13.8 13-23C26 5.8 20.2 0 13 0z' fill='${color}' stroke='#ffffff' stroke-width='${big ? 2 : 2.5}'/>` +
    `<circle cx='13' cy='13' r='${big ? 5 : 4.5}' fill='#ffffff'/></svg>`;
  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    scaledSize: new maps.Size(w, h),
    anchor: new maps.Point(w / 2, h),
  };
}

export default function ResourceMap({ points, onSelect, selectedId }) {
  const ref = useRef(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const mapsRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const prevSelRef = useRef(null);

  const colorFor = (id) =>
    categoryColor(points.find((p) => p.id === id)?.category);

  // (re)build the map + markers whenever the visible points change.
  useEffect(() => {
    if (!KEY) return;
    let cancelled = false;

    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !ref.current) return;
        mapsRef.current = maps;
        if (!mapRef.current) {
          mapRef.current = new maps.Map(ref.current, {
            scrollwheel: false,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            zoom: 9,
            center: { lat: 33.7, lng: -117.83 }, // Orange County
          });
        }
        const map = mapRef.current;

        // clear any existing markers before redrawing.
        for (const id in markersRef.current) markersRef.current[id].setMap(null);
        markersRef.current = {};

        const bounds = new maps.LatLngBounds();
        let count = 0;
        for (const p of points) {
          if (typeof p.lat !== "number" || typeof p.lng !== "number") continue;
          const big = p.id === selectedId;
          const pos = { lat: p.lat, lng: p.lng };
          const m = new maps.Marker({
            position: pos,
            map,
            title: p.name,
            icon: pinIcon(maps, categoryColor(p.category), big),
            zIndex: big ? 1000 : 1,
          });
          m.addListener("click", () => selectRef.current?.(p.id));
          markersRef.current[p.id] = m;
          bounds.extend(pos);
          count++;
        }
        if (count) map.fitBounds(bounds, 40);
        else {
          map.setCenter({ lat: 33.7, lng: -117.83 });
          map.setZoom(9);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [points]);

  // grow + raise the selected pin, shrink the previously-selected one, pan to it.
  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    const markers = markersRef.current;
    if (!maps || !map) return;

    const prev = prevSelRef.current;
    if (prev && prev !== selectedId && markers[prev]) {
      markers[prev].setIcon(pinIcon(maps, colorFor(prev), false));
      markers[prev].setZIndex(1);
    }
    prevSelRef.current = selectedId;

    const m = selectedId && markers[selectedId];
    if (m) {
      m.setIcon(pinIcon(maps, colorFor(selectedId), true));
      m.setZIndex(1000);
      map.panTo(m.getPosition());
    }
  }, [selectedId]);

  if (!KEY) {
    return (
      <div className="flex h-80 w-full items-center justify-center rounded bg-surface text-sm text-muted">
        Map unavailable
      </div>
    );
  }
  return <div ref={ref} className="h-80 w-full" />;
}
