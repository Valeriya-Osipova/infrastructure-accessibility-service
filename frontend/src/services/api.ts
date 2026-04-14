import type {
  AnalyzeResponse,
  GeoJSONFeatureCollection,
  OptimizeResponse,
  ObjectType,
} from '../types';

const BASE_URL = 'http://localhost:8000';

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
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

  getInfrastructure(): Promise<GeoJSONFeatureCollection> {
    return request('/infrastructure');
  },

  analyze(lat: number, lon: number): Promise<AnalyzeResponse> {
    return request('/analyze', {
      method: 'POST',
      body: JSON.stringify({ lat, lon }),
    });
  },

  optimize(
    lat: number,
    lon: number,
    failedTypes?: ObjectType[],
  ): Promise<OptimizeResponse> {
    return request('/optimize', {
      method: 'POST',
      body: JSON.stringify({ lat, lon, failed_types: failedTypes ?? null }),
    });
  },
};
