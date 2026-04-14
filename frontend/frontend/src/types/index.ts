export interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: string;
    coordinates: number[] | number[][] | number[][][];
  };
  properties: Record<string, unknown>;
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

// --- Результаты анализа ---

export interface KindergartenResult {
  ok: boolean;
  norm: string;
  isochrone: GeoJSONFeature;
}

export interface SchoolResult {
  ok: boolean;
  norm: string;
  norm_met: string | null;
  iso_walk: GeoJSONFeature;
  iso_drive: GeoJSONFeature | null;
}

export interface HospitalResult {
  ok: boolean;
  norm: string;
  norm_met: string | null;
  iso_walk: GeoJSONFeature;
  iso_drive: GeoJSONFeature | null;
}

export interface AnalyzeResponse {
  kindergarten: KindergartenResult;
  school: SchoolResult;
  hospital: HospitalResult;
}

// --- Рекомендации по размещению ---

export interface PlacementResult {
  recommended_sites: [number, number][];
  fallback_zone: GeoJSONFeature;
  criteria_used: string[];
}

export interface OptimizeResponse {
  recommendations: Partial<Record<'kindergarten' | 'school' | 'hospital', PlacementResult>>;
}

// --- Общее состояние приложения ---

export type ObjectType = 'kindergarten' | 'school' | 'hospital';

export type LayerVisibility = {
  buildings: boolean;
  infrastructure: boolean;
  isochrones: boolean;
  suggestions: boolean;
};

export interface SelectedBuilding {
  lon: number;
  lat: number;
  feature: GeoJSONFeature;
}

export type AppStatus =
  | 'idle'
  | 'loading_layers'
  | 'building_selected'
  | 'analyzing'
  | 'analyzed'
  | 'optimizing'
  | 'optimized'
  | 'error';
