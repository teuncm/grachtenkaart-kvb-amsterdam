import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-polylinedecorator";

const WATERWAY_ONEWAY_COLOR = "orange";
const WATERWAY_ONEWAY_OUTLINE_COLOR = "white";
const WATERWAY_FORBIDDEN_COLOR = "red";
const WATERWAY_COLOR = "blue";
const OBJECT_OPACITY = 1;
const ONEWAY_ARROWS_MIN_ZOOM = 16;
const ONEWAY_WATERWAYS = new Set(["Singelgracht", "Prinsengracht", "Grimburgwal", "Raamgracht"]);
const FORBIDDEN_WATERWAYS = new Set([
  "Van Noordtgracht",
  "Le Mairegracht",
  "Beulingsloot",
  "Oudezijds Achterburgwal",
  "Groenburgwal",
]);

let canalsData = null;
const DOCK_ICON = L.divIcon({
  html: `
    <div
      style="
        width: 100%;
        height: 100%;
        background: orange;
        border-radius: 50%;
        border: 2px solid white;
      "
    ></div>
  `,
  className: "",
  iconSize: [10, 10],
});

const HEADING_INDICATOR_ICON = DOCK_ICON;

// Create the forbidden icon inline so we can control outline/stroke from JS.
// Use the existing public/forbidden.svg and add a CSS outline for the marker.
export const FORBIDDEN_ICON = L.icon({
  iconUrl: "/forbidden.svg",
  iconSize: [30, 20],
  className: "forbidden-icon",
});

export async function loadCanals() {
  if (canalsData) return canalsData;

  const res = await fetch("/export.geojson");

  if (!res.ok) {
    throw new Error("Failed to load export.geojson");
  }

  canalsData = await res.json();

  return canalsData;
}

export function createMap(el) {
  const map = L.map(el, {
    minZoom: 13,
    maxZoom: 18,
    doubleClickZoom: false,
  }).setView([52.3695, 4.899], 14.5);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    className: "base-map-layer",
  }).addTo(map);

  // Demo forbidden marker for fun — placed at initial center
  L.marker(map.getCenter(), { icon: FORBIDDEN_ICON })
    .addTo(map)
    .bindPopup("Forbidden marker (demo)");

  return map;
}

export function showUserLocation(map) {
  let marker = null;

  map.locate({
    watch: true,
    enableHighAccuracy: true,
  });

  map.on("locationfound", (e) => {
    if (!marker) {
      marker = L.marker(e.latlng).addTo(map);
    } else {
      marker.setLatLng(e.latlng);
    }
  });

  map.on("locationerror", (e) => {
    console.error(e.message);
  });
}

export async function addCanals(map, canalsData) {
  const layer = L.geoJSON(canalsData, {
    style: (feature) => {
      const props = feature?.properties || {};
      return {
        color: isForbiddenWaterway(feature)
          ? WATERWAY_FORBIDDEN_COLOR
          : isOnewayWaterway(props)
            ? WATERWAY_ONEWAY_COLOR
            : WATERWAY_COLOR,
        weight: 5,
        opacity: OBJECT_OPACITY,
      };
    },
    onEachFeature: (feature, layer) => {
      const name = feature?.properties?.name || "";
      if (name) {
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${name} (gracht|kanaal|sluis) amsterdam`)}`;
        const startPoint = getFeatureSegmentMidpoint(feature);
        const mapsLinkHtml = startPoint
          ? `<div style="margin-top:6px;"><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${startPoint.lat},${startPoint.lng}`)}" target="_blank" rel="noopener noreferrer">Google Maps<span aria-hidden="true">&#x2197;</span></a></div>`
          : "";

        layer.bindPopup(
          `<div>${escapeHtml(name)}</div><div style="margin-top:6px;"><a href="${searchUrl}" target="_blank" rel="noopener noreferrer">Google Search<span aria-hidden="true">&#x2197;</span></a></div>${mapsLinkHtml}`
        );
        return;
      }

      const startPoint = getFeatureSegmentMidpoint(feature);

      if (!startPoint) {
        layer.bindPopup(`<div>(naamloos)</div>`);
        return;
      }

      const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${startPoint.lat},${startPoint.lng}`)}`;

      layer.bindPopup(
        `<div>(naamloos)</div><div style="margin-top:6px;"><a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer">Google Maps<span aria-hidden="true">&#x2197;</span></a></div>`
      );
    },
  }).addTo(map);

  map.fitBounds(layer.getBounds());
  addOnewayDirectionArrows(map, layer);

  return layer;
}

export function addDock(map, lat, lon, popupText) {
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lon}`)}`;
  const label = popupText || "";
  const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(label)}`;

  L.marker([lat, lon], {
    icon: DOCK_ICON,
  })
    .addTo(map)
    .bindPopup(
      `<div>${escapeHtml(popupText)}</div><div style="margin-top: 6px;"><a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer">Google Maps<span aria-hidden="true">&#x2197;</span></a></div><div style="margin-top:6px;">`
    );
}

export function addForbiddenMarker(map, lat, lon, popupText) {
  const text = popupText || "Forbidden area";
  const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(text)}`;

  L.marker([lat, lon], {
    icon: FORBIDDEN_ICON,
  })
    .addTo(map)
    .bindPopup(`<div>${escapeHtml(text)}</div><div style="margin-top:6px;"><a href="${googleSearchUrl}" target="_blank" rel="noopener noreferrer">Search Google for ${escapeHtml(text)}</a></div>`);
}

export function addHeadingIndicatorMarker(map, lat, lon, popupText) {
  const text = popupText || "Drivers should indicate their heading here";
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lon}`)}`;

  L.marker([lat, lon], {
    icon: HEADING_INDICATOR_ICON,
  })
    .addTo(map)
    .bindPopup(`<div>${escapeHtml(text)}</div><div style="margin-top:6px;"><a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer">Open in Google Maps<span aria-hidden="true">&#x2197;</span></a></div>`);
}

function addOnewayDirectionArrows(map, canalsLayer) {
  const onewayCanalLines = [];

  canalsLayer.eachLayer((featureLayer) => {
    if (!(featureLayer instanceof L.Polyline)) return;
    if (!isOnewayWaterway(featureLayer.feature?.properties)) return;
    if (isForbiddenWaterway(featureLayer.feature)) return;

    onewayCanalLines.push(featureLayer);
  });

  if (onewayCanalLines.length === 0) return null;

  const arrowsLayer = L.polylineDecorator(onewayCanalLines, {
    patterns: [
      {
        offset: 15,
        repeat: 25,
        symbol: L.Symbol.arrowHead({
          pixelSize: 10,
          polygon: true,
          pathOptions: {
            color: WATERWAY_ONEWAY_OUTLINE_COLOR,
            fillColor: WATERWAY_ONEWAY_COLOR,
            fillOpacity: OBJECT_OPACITY,
            opacity: OBJECT_OPACITY,
            weight: 2,
          },
        }),
      },
    ],
  });

  const updateArrowVisibility = () => {
    const shouldShowArrows = map.getZoom() >= ONEWAY_ARROWS_MIN_ZOOM;

    if (shouldShowArrows && !map.hasLayer(arrowsLayer)) {
      arrowsLayer.addTo(map);
    }

    if (!shouldShowArrows && map.hasLayer(arrowsLayer)) {
      map.removeLayer(arrowsLayer);
    }
  };

  updateArrowVisibility();
  map.on("zoomend", updateArrowVisibility);

  return arrowsLayer;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getFeatureSegmentMidpoint(feature) {
  const coordinates = feature?.geometry?.coordinates;

  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return null;
  }

  const firstLine = Array.isArray(coordinates[0]) && Array.isArray(coordinates[0][0]) ? coordinates[0] : coordinates;
  const firstSegmentStart = firstLine[0];
  const firstSegmentEnd = firstLine[1];

  if (
    Array.isArray(firstSegmentStart) &&
    Array.isArray(firstSegmentEnd) &&
    typeof firstSegmentStart[0] === "number" &&
    typeof firstSegmentStart[1] === "number" &&
    typeof firstSegmentEnd[0] === "number" &&
    typeof firstSegmentEnd[1] === "number"
  ) {
    return {
      lng: (firstSegmentStart[0] + firstSegmentEnd[0]) / 2,
      lat: (firstSegmentStart[1] + firstSegmentEnd[1]) / 2,
    };
  }

  if (Array.isArray(firstSegmentStart) && typeof firstSegmentStart[0] === "number" && typeof firstSegmentStart[1] === "number") {
    return { lng: firstSegmentStart[0], lat: firstSegmentStart[1] };
  }

  return null;
}

export function findWaterwayIntersectionPoint(canalsGeoJson, firstName, secondName) {
  const features = canalsGeoJson?.features || [];
  const firstFeatures = features.filter((feature) => feature?.properties?.name === firstName);
  const secondFeatures = features.filter((feature) => feature?.properties?.name === secondName);

  for (const firstFeature of firstFeatures) {
    for (const secondFeature of secondFeatures) {
      const firstLines = getFeatureLines(firstFeature);
      const secondLines = getFeatureLines(secondFeature);

      for (const firstLine of firstLines) {
        for (const secondLine of secondLines) {
          for (let firstIndex = 0; firstIndex < firstLine.length - 1; firstIndex++) {
            for (let secondIndex = 0; secondIndex < secondLine.length - 1; secondIndex++) {
              const intersectionPoint = getSegmentIntersection(
                firstLine[firstIndex],
                firstLine[firstIndex + 1],
                secondLine[secondIndex],
                secondLine[secondIndex + 1]
              );

              if (intersectionPoint) {
                return intersectionPoint;
              }
            }
          }
        }
      }
    }
  }

  return null;
}

function isForbiddenWaterway(feature) {
  const name = feature?.properties?.name;

  return FORBIDDEN_WATERWAYS.has(name);
}

function isOnewayWaterway(properties) {
  const name = properties?.name;

  if (name === "Singelgracht") {
    return properties?.oneway === "yes";
  }

  return ONEWAY_WATERWAYS.has(name);
}

function getFeatureLines(feature) {
  const coordinates = feature?.geometry?.coordinates;

  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return [];
  }

  return feature?.geometry?.type === "MultiLineString" ? coordinates : [coordinates];
}

function getSegmentIntersection(startA, endA, startB, endB) {
  if (!Array.isArray(startA) || !Array.isArray(endA) || !Array.isArray(startB) || !Array.isArray(endB)) {
    return null;
  }

  const [x1, y1] = startA;
  const [x2, y2] = endA;
  const [x3, y3] = startB;
  const [x4, y4] = endB;

  if ([x1, y1, x2, y2, x3, y3, x4, y4].some((value) => typeof value !== "number")) {
    return null;
  }

  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

  if (Math.abs(denominator) < 1e-12) {
    return null;
  }

  const intersectionLng =
    ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denominator;
  const intersectionLat =
    ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denominator;

  const withinBounds = (value, start, end) => value >= Math.min(start, end) - 1e-10 && value <= Math.max(start, end) + 1e-10;

  if (
    withinBounds(intersectionLng, x1, x2) &&
    withinBounds(intersectionLat, y1, y2) &&
    withinBounds(intersectionLng, x3, x4) &&
    withinBounds(intersectionLat, y3, y4)
  ) {
    return {
      lng: intersectionLng,
      lat: intersectionLat,
    };
  }

  return null;
}
