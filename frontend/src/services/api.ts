import type {
  AnalyzeResponse,
  GeoJSONFeatureCollection,
  GeoJSONFeature,
  OptimizeResponse,
  ObjectType,
  IsochroneMode,
  IsochroneLimitType,
  InfraAmenity,
  NearbyInfraObject,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail ?? `HTTP ${response.status}`);
  }
  return response.json();
}

export const api = {
  getRegions(): Promise<GeoJSONFeatureCollection> {
    return request('/regions');
  },

  getBuildings(): Promise<GeoJSONFeatureCollection> {
    return request('/buildings');
  },

  getKindergartens(): Promise<GeoJSONFeatureCollection> {
    return request('/infrastructure/kindergarten');
  },

  getSchools(): Promise<GeoJSONFeatureCollection> {
    return request('/infrastructure/school');
  },

  getHospitals(): Promise<GeoJSONFeatureCollection> {
    return request('/infrastructure/hospital');
  },

  analyze(lat: number, lon: number): Promise<AnalyzeResponse> {
    return request('/analyze', {
      method: 'POST',
      body: JSON.stringify({ lat, lon }),
    });
  },

  optimize(lat: number, lon: number, failedTypes?: ObjectType[]): Promise<OptimizeResponse> {
    return request('/optimize', {
      method: 'POST',
      body: JSON.stringify({ lat, lon, failed_types: failedTypes ?? null }),
    });
  },

  checkCoverage(lat: number, lon: number): Promise<{ covered: boolean }> {
    return request(`/coverage/check?lat=${lat}&lon=${lon}`);
  },

  startCoverageFetch(lat: number, lon: number): Promise<{ job_id: string; status: string }> {
    return request('/coverage/fetch', {
      method: 'POST',
      body: JSON.stringify({ lat, lon }),
    });
  },

  getCoverageStatus(jobId: string): Promise<{
    status: 'running' | 'done' | 'error';
    result?: Record<string, unknown>;
    error?: string;
  }> {
    return request(`/coverage/status/${jobId}`);
  },

  buildIsochrone(
    lat: number,
    lon: number,
    mode: IsochroneMode,
    limit: number,
    limitType: IsochroneLimitType,
  ): Promise<{ isochrone: GeoJSONFeature }> {
    return request('/isochrone', {
      method: 'POST',
      body: JSON.stringify({ lat, lon, mode, limit, limit_type: limitType }),
    });
  },

  addInfrastructure(lat: number, lon: number, amenity: InfraAmenity): Promise<{ id: number; amenity: string; lat: number; lon: number }> {
    return request('/infrastructure/add', { method: 'POST', body: JSON.stringify({ lat, lon, amenity }) });
  },

  getNearbyInfrastructure(lat: number, lon: number, radiusM = 100): Promise<{ objects: NearbyInfraObject[] }> {
    return request(`/infrastructure/nearby?lat=${lat}&lon=${lon}&radius_m=${radiusM}`);
  },

  deleteInfrastructure(ids: number[]): Promise<{ deleted: number }> {
    return request('/infrastructure/delete', { method: 'DELETE', body: JSON.stringify({ ids }) });
  },
};
