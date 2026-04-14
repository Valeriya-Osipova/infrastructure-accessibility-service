import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import GeoJSON from 'ol/format/GeoJSON';
import { fromLonLat } from 'ol/proj';
import { Style, Fill, Stroke, Circle, RegularShape } from 'ol/style';
import { Feature } from 'ol';
import { Point } from 'ol/geom';
import type { GeoJSONFeatureCollection, GeoJSONFeature, SelectedBuilding } from '../../types';
import 'ol/ol.css';
import './MapView.css';

export interface MapViewHandle {
  showIsochrones: (features: GeoJSONFeature[]) => void;
  showSuggestions: (sites: [number, number][], fallback: GeoJSONFeature) => void;
  clearOverlays: () => void;
  setLayerVisible: (layer: 'buildings' | 'infrastructure' | 'isochrones' | 'suggestions', visible: boolean) => void;
}

interface MapViewProps {
  buildings: GeoJSONFeatureCollection | null;
  infrastructure: GeoJSONFeatureCollection | null;
  onBuildingSelect: (building: SelectedBuilding) => void;
}

const INFRA_COLORS: Record<string, string> = {
  kindergarten: '#f59e0b',
  school: '#3b82f6',
  hospital: '#ef4444',
  clinic: '#ef4444',
};

const ISO_COLORS: Record<number, string> = {
  0: 'rgba(59, 130, 246, 0.15)',
  1: 'rgba(16, 185, 129, 0.15)',
  2: 'rgba(245, 158, 11, 0.15)',
  3: 'rgba(239, 68, 68, 0.15)',
};

const ISO_STROKE_COLORS: Record<number, string> = {
  0: 'rgba(59, 130, 246, 0.7)',
  1: 'rgba(16, 185, 129, 0.7)',
  2: 'rgba(245, 158, 11, 0.7)',
  3: 'rgba(239, 68, 68, 0.7)',
};

const MapView = forwardRef<MapViewHandle, MapViewProps>(
  ({ buildings, infrastructure, onBuildingSelect }, ref) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<Map | null>(null);

    const buildingsSource = useRef(new VectorSource());
    const infraSource = useRef(new VectorSource());
    const isochroneSource = useRef(new VectorSource());
    const suggestionsSource = useRef(new VectorSource());
    const selectedSource = useRef(new VectorSource());

    const buildingsLayer = useRef<VectorLayer | null>(null);
    const infraLayer = useRef<VectorLayer | null>(null);
    const isochroneLayer = useRef<VectorLayer | null>(null);
    const suggestionsLayer = useRef<VectorLayer | null>(null);

    useImperativeHandle(ref, () => ({
      showIsochrones(features: GeoJSONFeature[]) {
        isochroneSource.current.clear();
        const format = new GeoJSON();
        features.forEach((feat, i) => {
          const olFeatures = format.readFeatures(feat, {
            featureProjection: 'EPSG:3857',
          });
          olFeatures.forEach((f) => {
            f.setStyle(
              new Style({
                fill: new Fill({ color: ISO_COLORS[i % 4] }),
                stroke: new Stroke({ color: ISO_STROKE_COLORS[i % 4], width: 2 }),
              }),
            );
            isochroneSource.current.addFeature(f);
          });
        });
        isochroneLayer.current?.setVisible(true);
      },

      showSuggestions(sites: [number, number][], fallback: GeoJSONFeature) {
        suggestionsSource.current.clear();

        // fallback zone
        const format = new GeoJSON();
        const fallbackFeatures = format.readFeatures(fallback, {
          featureProjection: 'EPSG:3857',
        });
        fallbackFeatures.forEach((f) => {
          f.setStyle(
            new Style({
              fill: new Fill({ color: 'rgba(168, 85, 247, 0.12)' }),
              stroke: new Stroke({ color: 'rgba(168, 85, 247, 0.8)', width: 2, lineDash: [6, 4] }),
            }),
          );
          suggestionsSource.current.addFeature(f);
        });

        // recommended points
        sites.forEach(([lon, lat]) => {
          const feat = new Feature({
            geometry: new Point(fromLonLat([lon, lat])),
          });
          feat.setStyle(
            new Style({
              image: new RegularShape({
                fill: new Fill({ color: '#a855f7' }),
                stroke: new Stroke({ color: '#fff', width: 2 }),
                points: 4,
                radius: 8,
                angle: Math.PI / 4,
              }),
            }),
          );
          suggestionsSource.current.addFeature(feat);
        });

        suggestionsLayer.current?.setVisible(true);
      },

      clearOverlays() {
        isochroneSource.current.clear();
        suggestionsSource.current.clear();
        selectedSource.current.clear();
      },

      setLayerVisible(
        layer: 'buildings' | 'infrastructure' | 'isochrones' | 'suggestions',
        visible: boolean,
      ) {
        const map: Record<string, VectorLayer | null> = {
          buildings: buildingsLayer.current,
          infrastructure: infraLayer.current,
          isochrones: isochroneLayer.current,
          suggestions: suggestionsLayer.current,
        };
        map[layer]?.setVisible(visible);
      },
    }));

    // Init map once
    useEffect(() => {
      if (!mapRef.current || mapInstance.current) return;

      buildingsLayer.current = new VectorLayer({
        source: buildingsSource.current,
        style: new Style({
          image: new Circle({
            radius: 5,
            fill: new Fill({ color: '#64748b' }),
            stroke: new Stroke({ color: '#fff', width: 1 }),
          }),
        }),
      });

      infraLayer.current = new VectorLayer({
        source: infraSource.current,
        style: (feature) => {
          const amenity = feature.get('amenity') as string;
          const color = INFRA_COLORS[amenity] ?? '#94a3b8';
          return new Style({
            image: new Circle({
              radius: 7,
              fill: new Fill({ color }),
              stroke: new Stroke({ color: '#fff', width: 1.5 }),
            }),
          });
        },
      });

      isochroneLayer.current = new VectorLayer({
        source: isochroneSource.current,
        zIndex: 5,
      });

      suggestionsLayer.current = new VectorLayer({
        source: suggestionsSource.current,
        zIndex: 10,
      });

      const selectedLayer = new VectorLayer({
        source: selectedSource.current,
        zIndex: 20,
        style: new Style({
          image: new Circle({
            radius: 9,
            fill: new Fill({ color: '#f97316' }),
            stroke: new Stroke({ color: '#fff', width: 2 }),
          }),
        }),
      });

      mapInstance.current = new Map({
        target: mapRef.current,
        layers: [
          new TileLayer({ source: new OSM() }),
          isochroneLayer.current,
          buildingsLayer.current,
          infraLayer.current,
          suggestionsLayer.current,
          selectedLayer,
        ],
        view: new View({
          center: fromLonLat([37.6, 55.75]),
          zoom: 12,
        }),
      });

      // Click handler
      mapInstance.current.on('click', (event) => {
        const features = mapInstance.current!.getFeaturesAtPixel(event.pixel, {
          layerFilter: (l) => l === buildingsLayer.current,
          hitTolerance: 6,
        });

        if (features.length === 0) return;

        const feature = features[0];
        const geom = feature.getGeometry();
        if (!geom) return;

        const coords = (geom as Point).getCoordinates();
        const [lon, lat] = (
          new GeoJSON().writeGeometryObject(
            (geom as Point).clone().transform('EPSG:3857', 'EPSG:4326'),
          ) as { coordinates: [number, number] }
        ).coordinates;

        selectedSource.current.clear();
        const sel = new Feature({ geometry: new Point(coords) });
        selectedSource.current.addFeature(sel);

        onBuildingSelect({
          lon,
          lat,
          feature: {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [lon, lat] },
            properties: feature.getProperties(),
          },
        });
      });
    }, []);

    // Load buildings
    useEffect(() => {
      if (!buildings) return;
      const format = new GeoJSON();
      const features = format.readFeatures(buildings, { featureProjection: 'EPSG:3857' });
      buildingsSource.current.clear();
      buildingsSource.current.addFeatures(features);

      // Auto-zoom to data extent
      const extent = buildingsSource.current.getExtent();
      if (extent[0] !== Infinity) {
        mapInstance.current?.getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: 15 });
      }
    }, [buildings]);

    // Load infrastructure
    useEffect(() => {
      if (!infrastructure) return;
      const format = new GeoJSON();
      const features = format.readFeatures(infrastructure, { featureProjection: 'EPSG:3857' });
      infraSource.current.clear();
      infraSource.current.addFeatures(features);
    }, [infrastructure]);

    return <div ref={mapRef} className="map-container" />;
  },
);

MapView.displayName = 'MapView';
export default MapView;
