import type { Feature, FeatureCollection, Geometry } from "geojson";
import bboxPolygon from "@turf/bbox-polygon";
import booleanIntersects from "@turf/boolean-intersects";

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
