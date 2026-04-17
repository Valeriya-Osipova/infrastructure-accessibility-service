import type {
  AnalyzeResponse,
  GeoJSONFeatureCollection,
  OptimizeResponse,
  ObjectType,
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

  fetchCoverage(lat: number, lon: number): Promise<{ status: string; message: string }> {
    return request('/coverage/fetch', {
      method: 'POST',
      body: JSON.stringify({ lat, lon }),
    });
  },
};
