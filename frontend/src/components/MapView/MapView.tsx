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
import type {
  GeoJSONFeatureCollection,
  GeoJSONFeature,
  IsochroneEntry,
  LayerVisibility,
  SelectedBuilding,
} from '../../types';
import 'ol/ol.css';
import './MapView.css';

export interface MapViewHandle {
  showIsochrones: (entries: IsochroneEntry[]) => void;
  showSuggestions: (sites: [number, number][], fallback: GeoJSONFeature) => void;
  clearOverlays: () => void;
  setLayerVisible: (layer: keyof LayerVisibility, visible: boolean) => void;
}

interface MapViewProps {
  buildings: GeoJSONFeatureCollection | null;
  kindergartens: GeoJSONFeatureCollection | null;
  schools: GeoJSONFeatureCollection | null;
  hospitals: GeoJSONFeatureCollection | null;
  onBuildingSelect: (building: SelectedBuilding) => void;
}

// Цвета слоёв инфраструктуры
const INFRA_COLOR = {
  kindergarten: '#f59e0b',
  school: '#3b82f6',
  hospital: '#ef4444',
} as const;

// Цвета изохрон по типу объекта
const ISO_FILL: Record<string, string> = {
  kindergarten: 'rgba(245, 158, 11, 0.15)',
  school: 'rgba(59, 130, 246, 0.15)',
  hospital: 'rgba(239, 68, 68, 0.15)',
};
const ISO_STROKE: Record<string, string> = {
  kindergarten: 'rgba(245, 158, 11, 0.8)',
  school: 'rgba(59, 130, 246, 0.8)',
  hospital: 'rgba(239, 68, 68, 0.8)',
};

function infraStyle(color: string) {
  return new Style({
    image: new Circle({
      radius: 7,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: '#fff', width: 1.5 }),
    }),
  });
}

const MapView = forwardRef<MapViewHandle, MapViewProps>(
  ({ buildings, kindergartens, schools, hospitals, onBuildingSelect }, ref) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<Map | null>(null);

    const buildingsSource = useRef(new VectorSource());
    const kindergartenSource = useRef(new VectorSource());
    const schoolSource = useRef(new VectorSource());
    const hospitalSource = useRef(new VectorSource());
    const isochroneSource = useRef(new VectorSource());
    const suggestionsSource = useRef(new VectorSource());
    const selectedSource = useRef(new VectorSource());

    const buildingsLayer = useRef<VectorLayer | null>(null);
    const kindergartenLayer = useRef<VectorLayer | null>(null);
    const schoolLayer = useRef<VectorLayer | null>(null);
    const hospitalLayer = useRef<VectorLayer | null>(null);
    const isochroneLayer = useRef<VectorLayer | null>(null);
    const suggestionsLayer = useRef<VectorLayer | null>(null);

    useImperativeHandle(ref, () => ({
      showIsochrones(entries: IsochroneEntry[]) {
        isochroneSource.current.clear();
        const format = new GeoJSON();
        entries.forEach(({ feature, type, mode }) => {
          const olFeatures = format.readFeatures(feature, {
            featureProjection: 'EPSG:3857',
          });
          const isDrive = mode === 'drive';
          olFeatures.forEach((f) => {
            f.setStyle(
              new Style({
                fill: new Fill({ color: ISO_FILL[type] }),
                stroke: new Stroke({
                  color: ISO_STROKE[type],
                  width: isDrive ? 2 : 2.5,
                  lineDash: isDrive ? [8, 5] : undefined,
                }),
              }),
            );
            isochroneSource.current.addFeature(f);
          });
        });
      },

      showSuggestions(sites: [number, number][], fallback: GeoJSONFeature) {
        suggestionsSource.current.clear();

        const format = new GeoJSON();
        format.readFeatures(fallback, { featureProjection: 'EPSG:3857' }).forEach((f) => {
          f.setStyle(
            new Style({
              fill: new Fill({ color: 'rgba(168, 85, 247, 0.12)' }),
              stroke: new Stroke({
                color: 'rgba(168, 85, 247, 0.8)',
                width: 2,
                lineDash: [6, 4],
              }),
            }),
          );
          suggestionsSource.current.addFeature(f);
        });

        sites.forEach(([lon, lat]) => {
          const feat = new Feature({ geometry: new Point(fromLonLat([lon, lat])) });
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
      },

      clearOverlays() {
        isochroneSource.current.clear();
        suggestionsSource.current.clear();
        selectedSource.current.clear();
      },

      setLayerVisible(layer: keyof LayerVisibility, visible: boolean) {
        const map: Partial<Record<keyof LayerVisibility, VectorLayer | null>> = {
          buildings: buildingsLayer.current,
          kindergarten: kindergartenLayer.current,
          school: schoolLayer.current,
          hospital: hospitalLayer.current,
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

      kindergartenLayer.current = new VectorLayer({
        source: kindergartenSource.current,
        style: infraStyle(INFRA_COLOR.kindergarten),
      });

      schoolLayer.current = new VectorLayer({
        source: schoolSource.current,
        style: infraStyle(INFRA_COLOR.school),
      });

      hospitalLayer.current = new VectorLayer({
        source: hospitalSource.current,
        style: infraStyle(INFRA_COLOR.hospital),
      });

      isochroneLayer.current = new VectorLayer({
        source: isochroneSource.current,
        zIndex: 5,
        visible: false, // показываем только после анализа
      });

      suggestionsLayer.current = new VectorLayer({
        source: suggestionsSource.current,
        zIndex: 10,
        visible: false, // показываем только после оптимизации
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
          kindergartenLayer.current,
          schoolLayer.current,
          hospitalLayer.current,
          suggestionsLayer.current,
          selectedLayer,
        ],
        view: new View({
          center: fromLonLat([37.6, 55.75]),
          zoom: 12,
        }),
      });

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
        selectedSource.current.addFeature(new Feature({ geometry: new Point(coords) }));

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
      const features = new GeoJSON().readFeatures(buildings, { featureProjection: 'EPSG:3857' });
      buildingsSource.current.clear();
      buildingsSource.current.addFeatures(features);
      const extent = buildingsSource.current.getExtent();
      if (extent[0] !== Infinity) {
        mapInstance.current?.getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: 15 });
      }
    }, [buildings]);

    // Load per-type infrastructure
    useEffect(() => {
      if (!kindergartens) return;
      kindergartenSource.current.clear();
      kindergartenSource.current.addFeatures(
        new GeoJSON().readFeatures(kindergartens, { featureProjection: 'EPSG:3857' }),
      );
    }, [kindergartens]);

    useEffect(() => {
      if (!schools) return;
      schoolSource.current.clear();
      schoolSource.current.addFeatures(
        new GeoJSON().readFeatures(schools, { featureProjection: 'EPSG:3857' }),
      );
    }, [schools]);

    useEffect(() => {
      if (!hospitals) return;
      hospitalSource.current.clear();
      hospitalSource.current.addFeatures(
        new GeoJSON().readFeatures(hospitals, { featureProjection: 'EPSG:3857' }),
      );
    }, [hospitals]);

    return <div ref={mapRef} className="map-container" />;
  },
);

MapView.displayName = 'MapView';
export default MapView;
