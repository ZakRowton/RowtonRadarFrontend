import type { Feature, FeatureCollection, GeoJsonProperties, Geometry, MultiPolygon, Polygon } from "geojson";
import bboxPolygon from "@turf/bbox-polygon";
import booleanIntersects from "@turf/boolean-intersects";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";

export type MapBounds = { south: number; west: number; north: number; east: number };

export function filterFeaturesInBounds(fc: FeatureCollection, b: MapBounds): Feature<Geometry, GeoJSON.GeoJsonProperties>[] {
  if (!fc?.features?.length) return [];
  const [west, south, east, north] = [b.west, b.south, b.east, b.north];
  const viewPoly = bboxPolygon([west, south, east, north]);
  return fc.features.filter((f) => {
    if (!f.geometry) return false;
    try {
      return booleanIntersects(f as Feature<Geometry>, viewPoly);
    } catch {
      return false;
    }
  });
}

/** Warnings that intersect a single lat/lon (user home). */
export function filterFeaturesForPoint(
  fc: FeatureCollection,
  lat: number,
  lon: number
): Feature<Geometry, GeoJSON.GeoJsonProperties>[] {
  if (!fc?.features?.length) return [];
  const pt = point([lon, lat]);
  return fc.features.filter((f) => {
    if (!f.geometry) return false;
    const t = f.geometry.type;
    if (t !== "Polygon" && t !== "MultiPolygon") return false;
    try {
      return booleanPointInPolygon(pt, f as Feature<Polygon | MultiPolygon, GeoJsonProperties>);
    } catch {
      return false;
    }
  });
}
