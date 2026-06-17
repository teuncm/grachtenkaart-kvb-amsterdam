import Fuse from "fuse.js";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-polylinedecorator";

const WATERWAY_ONEWAY_COLOR = "MediumOrchid";
const WATERWAY_ONEWAY_OUTLINE_COLOR = "white";
const WATERWAY_FORBIDDEN_COLOR = "red";
const WATERWAY_COLOR = "DodgerBlue";
const WATERWAY_SEARCH_HIGHLIGHT_COLOR = "white";
const WATERWAY_SEARCH_HIGHLIGHT_WEIGHT = 2;
const WATERWAY_OPACITY = 0.8;
const OBJECT_OPACITY = 1;
const ONEWAY_ARROWS_MIN_ZOOM = 16;
const ONEWAY_WATERWAYS = new Set(["Singelgracht", "Prinsengracht", "Grimburgwal", "Raamgracht"]);
const FORBIDDEN_WATERWAYS = new Set([
  "Beulingsloot",
  "Oudezijds Achterburgwal",
]);

let canalsData = null;
const assetBase = import.meta.env.BASE_URL || "/";
const CANAL_SEARCH_OPTIONS = {
  shouldSort: true,
  includeScore: true,
  ignoreLocation: true,
  threshold: 0.25,
  minMatchCharLength: 2,
  keys: [
    { name: "name", weight: 0.7 },
    { name: "searchTerms", weight: 0.9 },
  ],
};
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
  iconSize: [17, 17],
});

const HEADING_INDICATOR_ICON = DOCK_ICON;

// Create the forbidden icon inline so we can control outline/stroke from JS.
// Use the existing public/forbidden.svg and add a CSS outline for the marker.
export const FORBIDDEN_ICON = L.icon({
  iconUrl: `${assetBase}forbidden.svg`,
  iconSize: [30, 20],
  className: "forbidden-icon",
});

export async function loadCanals() {
  if (canalsData) return canalsData;

  const res = await fetch(`${assetBase}export.geojson`);

  if (!res.ok) {
    throw new Error("Failed to load export.geojson");
  }

  canalsData = await res.json();

  return canalsData;
}

export function createMap(el) {
  const map = L.map(el, {
    minZoom: 12,
    maxZoom: 18,
    scrollWheelZoom: true,
    touchZoom: true,
    boxZoom: true,
    keyboard: true,
    doubleClickZoom: false,
  }).setView([52.3695, 4.899], 14.5);

  const canalHighlightPane = map.createPane("canal-highlight-pane");
  canalHighlightPane.style.zIndex = "650";
  canalHighlightPane.style.pointerEvents = "none";

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    className: "base-map-layer",
  }).addTo(map);

  addCombinedScaleControl(map);
  closePopupOnZoom(map);
  invalidateMapSizeOnViewportResize(map);

  return map;
}

function addCombinedScaleControl(map) {
  const maxScalePx = 100;
  let horizontalLine = null;
  let verticalLine = null;
  let label = null;

  const control = L.control({ position: "bottomleft" });

  control.onAdd = () => {
    const container = L.DomUtil.create("div", "leaflet-control combined-scale-control");
    label = L.DomUtil.create("div", "combined-scale-control__label", container);
    horizontalLine = L.DomUtil.create("div", "combined-scale-control__horizontal", container);
    verticalLine = L.DomUtil.create("div", "combined-scale-control__vertical", container);
    container.setAttribute("aria-hidden", "true");
    return container;
  };

  control.addTo(map);

  const updateScale = () => {
    if (!horizontalLine || !verticalLine || !label) return;

    const center = map.getSize().divideBy(2);
    const leftPoint = center.subtract([maxScalePx / 2, 0]);
    const rightPoint = center.add([maxScalePx / 2, 0]);
    const topPoint = center.subtract([0, maxScalePx / 2]);
    const bottomPoint = center.add([0, maxScalePx / 2]);
    const maxHorizontalMeters = map.distance(map.containerPointToLatLng(leftPoint), map.containerPointToLatLng(rightPoint));
    const maxVerticalMeters = map.distance(map.containerPointToLatLng(topPoint), map.containerPointToLatLng(bottomPoint));
    const scaleMeters = getRoundScaleDistance(Math.min(maxHorizontalMeters, maxVerticalMeters));
    const scaleWidth = Math.max(12, Math.round((scaleMeters / maxHorizontalMeters) * maxScalePx));
    const scaleHeight = Math.max(12, Math.round((scaleMeters / maxVerticalMeters) * maxScalePx));

    label.textContent = formatScaleDistance(scaleMeters);
    horizontalLine.style.width = `${scaleWidth}px`;
    verticalLine.style.height = `${scaleHeight}px`;
  };

  map.on("move zoom resize", updateScale);
  updateScale();
}

function getRoundScaleDistance(maxMeters) {
  const distancePower = Math.pow(10, Math.floor(Math.log10(maxMeters)));
  const distanceRatio = maxMeters / distancePower;

  if (distanceRatio >= 5) return 5 * distancePower;
  if (distanceRatio >= 3) return 3 * distancePower;
  if (distanceRatio >= 2) return 2 * distancePower;

  return distancePower;
}

function formatScaleDistance(meters) {
  if (meters >= 1000) {
    return `${meters / 1000} km`;
  }

  return `${meters} m`;
}

function closePopupOnZoom(map) {
  map.on("zoomstart", () => {
    map.closePopup();
  });
}

function invalidateMapSizeOnViewportResize(map) {
  let resizeFrame = null;
  const invalidateSize = () => {
    if (resizeFrame !== null) return;

    resizeFrame = globalThis.requestAnimationFrame(() => {
      resizeFrame = null;
      map.invalidateSize();
    });
  };

  globalThis.addEventListener?.("resize", invalidateSize);
  globalThis.visualViewport?.addEventListener("resize", invalidateSize);
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
      return getCanalStyle(feature);
    },
    onEachFeature: (feature, layer) => {
      const name = feature?.properties?.name || "";
      if (name) {
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${name} (gracht|kanaal|sluis) amsterdam`)}`;
        const startPoint = getFeatureSegmentMidpoint(feature);
        const mapsLinkHtml = startPoint
          ? `<div style="margin-top:6px;"><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${startPoint.lat},${startPoint.lng}`)}" target="_blank" rel="noopener noreferrer">Google Maps<span aria-hidden="true">&#x2197;</span></a></div>`
          : "";

        setCanalPopupContent(
          layer,
          `<div>${escapeHtml(name)}</div><div style="margin-top:6px;"><a href="${searchUrl}" target="_blank" rel="noopener noreferrer">Google Search<span aria-hidden="true">&#x2197;</span></a></div>${mapsLinkHtml}`
        );
        return;
      }

      const startPoint = getFeatureSegmentMidpoint(feature);

      if (!startPoint) {
        setCanalPopupContent(layer, `<div>(naamloos)</div>`);
        return;
      }

      const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${startPoint.lat},${startPoint.lng}`)}`;

      setCanalPopupContent(
        layer,
        `<div>(naamloos)</div><div style="margin-top:6px;"><a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer">Google Maps<span aria-hidden="true">&#x2197;</span></a></div>`
      );
    },
  }).addTo(map);

  layer.featureLayerByKey = buildCanalFeatureLayerLookup(layer);
  layer.highlightOverlayByKey = new Map();
  map.fitBounds(layer.getBounds());
  addOnewayDirectionArrows(map, layer);

  return layer;
}

export function buildCanalSearchIndex(canalsGeoJson) {
  const recordsByGroupKey = new Map();

  for (const feature of canalsGeoJson?.features || []) {
    const featureKey = getCanalFeatureKey(feature);

    if (!featureKey) {
      continue;
    }

    const name = feature?.properties?.name || "";
    const normalizedName = normalizeWaterwayName(name);
    const groupKey = normalizedName ? `name:${normalizedName}` : `feature:${featureKey}`;
    const wayId = featureKey;
    const numericWayId = wayId.startsWith("way/") ? wayId.slice(4) : wayId;

    if (!recordsByGroupKey.has(groupKey)) {
      recordsByGroupKey.set(groupKey, {
        groupKey,
        name,
        featureKeys: [],
        wayIds: [],
        numericWayIds: [],
      });
    }

    const record = recordsByGroupKey.get(groupKey);

    record.featureKeys.push(featureKey);
    record.wayIds.push(wayId);
    record.numericWayIds.push(numericWayId);
    if (!record.name && name) {
      record.name = name;
    }
  }

  const records = Array.from(recordsByGroupKey.values()).map((record) => ({
    ...record,
    normalizedName: normalizeWaterwayName(record.name),
    normalizedSearchTerms: [record.name, ...record.wayIds, ...record.numericWayIds].filter(Boolean).map(normalizeSearchValue).join(" "),
  }));

  return {
    fuse: new Fuse(records, CANAL_SEARCH_OPTIONS),
    records,
  };
}

export function searchCanals(searchIndex, query) {
  if (!searchIndex) {
    return [];
  }

  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) {
    return [];
  }

  const directMatches = searchIndex.records
    .filter((record) => {
      return (
        record.normalizedName === normalizedQuery ||
        record.normalizedName.includes(normalizedQuery) ||
        record.normalizedSearchTerms.includes(normalizedQuery)
      );
    })
    .sort((firstRecord, secondRecord) => scoreDirectMatch(secondRecord, normalizedQuery) - scoreDirectMatch(firstRecord, normalizedQuery));

  const fuzzyMatches = searchIndex.fuse.search(normalizedQuery).map(({ item }) => item);
  const matchesByGroupKey = new Map();

  for (const match of [...directMatches, ...fuzzyMatches]) {
    matchesByGroupKey.set(match.groupKey, match);
  }

  return Array.from(matchesByGroupKey.values()).slice(0, 8);
}

export function listCanals(searchIndex) {
  if (!searchIndex?.records) {
    return [];
  }

  return [...searchIndex.records]
    .filter((record) => normalizeSearchValue(record.name).length > 0)
    .sort((firstRecord, secondRecord) => {
    const firstName = normalizeSearchValue(firstRecord.name);
    const secondName = normalizeSearchValue(secondRecord.name);

    if (firstName !== secondName) {
      return firstName.localeCompare(secondName);
    }

    return firstRecord.groupKey.localeCompare(secondRecord.groupKey);
    });
}

export function findCanalResultByFeature(searchIndex, feature) {
  if (!searchIndex?.records) {
    return null;
  }

  const featureKey = getCanalFeatureKey(feature);

  if (!featureKey) {
    return null;
  }

  const normalizedName = normalizeWaterwayName(feature?.properties?.name);
  const groupKey = normalizedName ? `name:${normalizedName}` : `feature:${featureKey}`;
  const groupedMatch = searchIndex.records.find((record) => record.groupKey === groupKey);

  if (groupedMatch) {
    return groupedMatch;
  }

  return searchIndex.records.find((record) => record.featureKeys.includes(featureKey)) || null;
}

export function focusCanalResult(map, canalsLayer, result) {
  const targetLayers = getCanalLayersByKeys(canalsLayer, result?.featureKeys || []);

  if (targetLayers.length === 0) {
    return false;
  }

  const bounds = L.latLngBounds([]);

  for (const targetLayer of targetLayers) {
    bounds.extend(targetLayer.getBounds());
  }

  fitBoundsThenOpenPopup(map, bounds, targetLayers[0]);

  for (const targetLayer of targetLayers) {
    if (typeof targetLayer.bringToFront === "function") {
      targetLayer.bringToFront();
    }

    applyCanalHighlightStyle(canalsLayer, targetLayer, true);
  }

  return true;
}

function fitBoundsThenOpenPopup(map, bounds, layer) {
  const padding = [40, 40];
  const maxZoom = 17;
  const targetZoom = Math.min(map.getBoundsZoom(bounds, false, padding), maxZoom);
  const targetCenter = bounds.getCenter();
  const currentCenter = map.getCenter();
  const isAlreadyInView = map.getZoom() === targetZoom && currentCenter.distanceTo(targetCenter) < 0.5;
  const openRequestId = (map._canalPopupOpenRequestId || 0) + 1;

  map._canalPopupOpenRequestId = openRequestId;

  const open = () => {
    if (map._canalPopupOpenRequestId !== openRequestId || !layer?._map) return;

    openCanalPopup(map, layer);
  };

  if (isAlreadyInView) {
    open();
    return;
  }

  map.once("moveend", open);
  map.fitBounds(bounds, {
    padding,
    maxZoom,
  });
}

function setCanalPopupContent(layer, html) {
  layer.canalPopupHtml = html;
}

function openCanalPopup(map, layer) {
  if (!map || !layer?.canalPopupHtml || typeof layer.getBounds !== "function") {
    return;
  }

  L.popup()
    .setLatLng(layer.getBounds().getCenter())
    .setContent(layer.canalPopupHtml)
    .openOn(map);
}

export function clearCanalResultHighlight(canalsLayer, result) {
  if (!canalsLayer || !result) {
    return;
  }

  for (const featureKey of result.featureKeys || []) {
    const targetLayer = getCanalLayerByKey(canalsLayer, featureKey);

    if (targetLayer) {
      applyCanalHighlightStyle(canalsLayer, targetLayer, false);
    }
  }
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

function getCanalStyle(feature) {
  const props = feature?.properties || {};
  const baseColor = isForbiddenWaterway(feature)
    ? WATERWAY_FORBIDDEN_COLOR
    : isOnewayWaterway(props)
      ? WATERWAY_ONEWAY_COLOR
      : WATERWAY_COLOR;

  return {
    color: baseColor,
    weight: 5,
    opacity: WATERWAY_OPACITY,
  };
}

function applyCanalHighlightStyle(canalsLayer, layer, highlight) {
  if (!layer || !layer._map || !canalsLayer?.highlightOverlayByKey) {
    return;
  }

  const featureKey = getCanalFeatureKey(layer.feature);

  if (!featureKey) {
    return;
  }

  const existingOverlay = canalsLayer.highlightOverlayByKey.get(featureKey);

  if (existingOverlay) {
    existingOverlay.remove();
    canalsLayer.highlightOverlayByKey.delete(featureKey);
  }

  if (!highlight || !(layer instanceof L.Polyline)) {
    return;
  }

  const overlay = L.polyline(layer.getLatLngs(), {
    color: WATERWAY_SEARCH_HIGHLIGHT_COLOR,
    weight: WATERWAY_SEARCH_HIGHLIGHT_WEIGHT,
    opacity: OBJECT_OPACITY,
    interactive: false,
    bubblingMouseEvents: false,
    pane: "canal-highlight-pane",
  }).addTo(layer._map);

  overlay.bringToFront();
  canalsLayer.highlightOverlayByKey.set(featureKey, overlay);
}

function buildCanalFeatureLayerLookup(canalsLayer) {
  const featureLayerByKey = new Map();

  canalsLayer.eachLayer((featureLayer) => {
    const featureKey = getCanalFeatureKey(featureLayer.feature);

    if (featureKey) {
      featureLayerByKey.set(featureKey, featureLayer);
    }
  });

  return featureLayerByKey;
}

function getCanalLayerByKey(canalsLayer, featureKey) {
  if (!canalsLayer || !featureKey) {
    return null;
  }

  const featureLayerByKey = canalsLayer.featureLayerByKey;

  if (featureLayerByKey?.has(featureKey)) {
    return featureLayerByKey.get(featureKey);
  }

  let foundLayer = null;

  canalsLayer.eachLayer((featureLayer) => {
    if (foundLayer) {
      return;
    }

    if (getCanalFeatureKey(featureLayer.feature) === featureKey) {
      foundLayer = featureLayer;
    }
  });

  return foundLayer;
}

function getCanalLayersByKeys(canalsLayer, featureKeys) {
  const layers = [];

  for (const featureKey of featureKeys) {
    const layer = getCanalLayerByKey(canalsLayer, featureKey);

    if (layer && !layers.includes(layer)) {
      layers.push(layer);
    }
  }

  return layers;
}

function getCanalFeatureKey(feature) {
  return feature?.id || feature?.properties?.["@id"] || feature?.properties?.id || null;
}

function normalizeWaterwayName(name) {
  return String(name || "").trim().toLowerCase();
}

function normalizeSearchValue(value) {
  return String(value || "").trim().toLowerCase();
}

function scoreDirectMatch(record, query) {
  if (record.normalizedName === query) {
    return 3;
  }

  if (record.normalizedName.startsWith(query)) {
    return 2;
  }

  if (record.normalizedName.includes(query)) {
    return 1;
  }

  if (record.normalizedSearchTerms.includes(query)) {
    return 0.5;
  }

  return 0;
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

  // return properties?.oneway === "yes";

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
