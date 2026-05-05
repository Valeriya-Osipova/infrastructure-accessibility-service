import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import GeoJSON from 'ol/format/GeoJSON';
import { fromLonLat, toLonLat } from 'ol/proj';
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
  selectCoordinate: (lon: number, lat: number) => void;
  showToolIsochrone: (feature: GeoJSONFeature, mode: 'walk' | 'drive') => void;
  clearToolIsochrone: () => void;
  showIsoStart: (lon: number, lat: number) => void;
  clearIsoStart: () => void;
  setRegions: (data: GeoJSONFeatureCollection) => void;
}

interface MapViewProps {
  buildings: GeoJSONFeatureCollection | null;
  kindergartens: GeoJSONFeatureCollection | null;
  schools: GeoJSONFeatureCollection | null;
  hospitals: GeoJSONFeatureCollection | null;
  onBuildingSelect: (building: SelectedBuilding) => void;
  /** Если передан — любой клик по карте вызывает этот колбэк вместо выбора здания */
  onCoordinatePick?: ((lat: number, lon: number) => void) | null;
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
  ({ buildings, kindergartens, schools, hospitals, onBuildingSelect, onCoordinatePick }, ref) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<Map | null>(null);
    const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number } | null>(null);

    // Refs чтобы клик-хэндлер (создаётся один раз) всегда читал актуальные колбэки
    const onCoordinatePickRef = useRef<((lat: number, lon: number) => void) | null>(null);
    const onBuildingSelectRef = useRef(onBuildingSelect);

    useEffect(() => {
      onBuildingSelectRef.current = onBuildingSelect;
    }, [onBuildingSelect]);

    useEffect(() => {
      onCoordinatePickRef.current = onCoordinatePick ?? null;
      // Меняем курсор карты в режиме выбора точки
      if (mapInstance.current) {
        mapInstance.current.getViewport().style.cursor = onCoordinatePick ? 'crosshair' : '';
      }
    }, [onCoordinatePick]);

    const regionSource = useRef(new VectorSource());
    const buildingsSource = useRef(new VectorSource());
    const kindergartenSource = useRef(new VectorSource());
    const schoolSource = useRef(new VectorSource());
    const hospitalSource = useRef(new VectorSource());
    const isochroneSource = useRef(new VectorSource());
    const suggestionsSource = useRef(new VectorSource());
    const selectedSource = useRef(new VectorSource());
    const toolIsochroneSource = useRef(new VectorSource());
    const isoStartSource = useRef(new VectorSource());

    const initialFitDone = useRef(false);
    const regionLayer = useRef<VectorLayer | null>(null);
    const buildingsLayer = useRef<VectorLayer | null>(null);
    const kindergartenLayer = useRef<VectorLayer | null>(null);
    const schoolLayer = useRef<VectorLayer | null>(null);
    const hospitalLayer = useRef<VectorLayer | null>(null);
    const isochroneLayer = useRef<VectorLayer | null>(null);
    const suggestionsLayer = useRef<VectorLayer | null>(null);
    const toolIsochroneLayer = useRef<VectorLayer | null>(null);
    const isoStartLayer = useRef<VectorLayer | null>(null);

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
          region: regionLayer.current,
          buildings: buildingsLayer.current,
          kindergarten: kindergartenLayer.current,
          school: schoolLayer.current,
          hospital: hospitalLayer.current,
          isochrones: isochroneLayer.current,
          suggestions: suggestionsLayer.current,
          toolIsochrone: toolIsochroneLayer.current,
        };
        map[layer]?.setVisible(visible);
      },

      setRegions(data: GeoJSONFeatureCollection) {
        regionSource.current.clear();
        const features = new GeoJSON().readFeatures(data, { featureProjection: 'EPSG:3857' });
        regionSource.current.addFeatures(features);
        regionLayer.current?.setVisible(true);
      },

      showToolIsochrone(feature: GeoJSONFeature, mode: 'walk' | 'drive') {
        toolIsochroneSource.current.clear();
        const format = new GeoJSON();
        const olFeatures = format.readFeatures(feature, { featureProjection: 'EPSG:3857' });
        olFeatures.forEach((f) => {
          f.setStyle(new Style({
            fill: new Fill({ color: 'rgba(20, 184, 166, 0.15)' }),
            stroke: new Stroke({
              color: 'rgba(20, 184, 166, 0.9)',
              width: 2.5,
              lineDash: mode === 'drive' ? [8, 5] : undefined,
            }),
          }));
          toolIsochroneSource.current.addFeature(f);
        });
        toolIsochroneLayer.current?.setVisible(true);
      },

      clearToolIsochrone() {
        toolIsochroneSource.current.clear();
        toolIsochroneLayer.current?.setVisible(false);
        isoStartSource.current.clear();
      },

      showIsoStart(lon: number, lat: number) {
        isoStartSource.current.clear();
        const feat = new Feature({ geometry: new Point(fromLonLat([lon, lat])) });
        isoStartSource.current.addFeature(feat);
        isoStartLayer.current?.setVisible(true);
      },

      clearIsoStart() {
        isoStartSource.current.clear();
        isoStartLayer.current?.setVisible(false);
      },

      selectCoordinate(lon: number, lat: number) {
        selectedSource.current.clear();
        const feat = new Feature({ geometry: new Point(fromLonLat([lon, lat])) });
        selectedSource.current.addFeature(feat);
        mapInstance.current?.getView().animate({ center: fromLonLat([lon, lat]), zoom: 14, duration: 400 });
      },
    }));

    // Init map once
    useEffect(() => {
      if (!mapRef.current || mapInstance.current) return;

      regionLayer.current = new VectorLayer({
        source: regionSource.current,
        zIndex: 1,
        visible: true,
        style: new Style({
          fill: new Fill({ color: 'rgba(99, 102, 241, 0.06)' }),
          stroke: new Stroke({ color: 'rgba(99, 102, 241, 0.7)', width: 2 }),
        }),
      });

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
        visible: false,
      });

      toolIsochroneLayer.current = new VectorLayer({
        source: toolIsochroneSource.current,
        zIndex: 6,
        visible: false,
      });

      suggestionsLayer.current = new VectorLayer({
        source: suggestionsSource.current,
        zIndex: 10,
        visible: false, // показываем только после оптимизации
      });

      // Маркер выбранного здания / точки анализа — оранжевый halo + кружок
      const selectedLayer = new VectorLayer({
        source: selectedSource.current,
        zIndex: 20,
        style: [
          new Style({
            image: new Circle({
              radius: 18,
              fill: new Fill({ color: 'rgba(249, 115, 22, 0.18)' }),
              stroke: new Stroke({ color: 'rgba(249, 115, 22, 0.5)', width: 1.5 }),
            }),
          }),
          new Style({
            image: new Circle({
              radius: 7,
              fill: new Fill({ color: '#f97316' }),
              stroke: new Stroke({ color: '#fff', width: 2.5 }),
            }),
          }),
        ],
      });

      // Маркер начальной точки инструмента изохрон — teal halo + кружок
      isoStartLayer.current = new VectorLayer({
        source: isoStartSource.current,
        zIndex: 21,
        visible: false,
        style: [
          new Style({
            image: new Circle({
              radius: 18,
              fill: new Fill({ color: 'rgba(20, 184, 166, 0.18)' }),
              stroke: new Stroke({ color: 'rgba(20, 184, 166, 0.5)', width: 1.5 }),
            }),
          }),
          new Style({
            image: new Circle({
              radius: 7,
              fill: new Fill({ color: '#14b8a6' }),
              stroke: new Stroke({ color: '#fff', width: 2.5 }),
            }),
          }),
        ],
      });

      mapInstance.current = new Map({
        target: mapRef.current,
        layers: [
          new TileLayer({ source: new OSM() }),
          regionLayer.current,
          isochroneLayer.current,
          toolIsochroneLayer.current,
          buildingsLayer.current,
          kindergartenLayer.current,
          schoolLayer.current,
          hospitalLayer.current,
          suggestionsLayer.current,
          selectedLayer,
          isoStartLayer.current,
        ],
        view: new View({
          center: fromLonLat([37.6, 55.75]),
          zoom: 12,
        }),
      });

      // Отслеживаем движение курсора для отображения координат
      mapInstance.current.on('pointermove', (event) => {
        const coords = mapInstance.current!.getCoordinateFromPixel(event.pixel);
        if (coords) {
          const [lon, lat] = toLonLat(coords);
          setCursorCoords({
            lat: Number(lat.toFixed(6)),
            lon: Number(lon.toFixed(6))
          });
        }
      });

      // Убираем координаты при выходе курсора с карты
      mapInstance.current.getTargetElement().addEventListener('mouseleave', () => {
        setCursorCoords(null);
      });

      mapInstance.current.on('click', (event) => {
        // Режим выбора произвольной точки — перехватываем любой клик
        if (onCoordinatePickRef.current) {
          const coord = mapInstance.current!.getCoordinateFromPixel(event.pixel);
          if (coord) {
            const [lon, lat] = toLonLat(coord);
            onCoordinatePickRef.current(lat, lon);
          }
          return;
        }

        // Обычный режим — только клик по зданию
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

        onBuildingSelectRef.current({
          lon,
          lat,
          snapped: true,
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
      if (!initialFitDone.current) {
        const extent = buildingsSource.current.getExtent();
        if (extent && extent[0] !== Infinity) {
          mapInstance.current?.getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: 15 });
          initialFitDone.current = true;
        }
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

    return (
      <>
        <div ref={mapRef} className="map-container" />
        {cursorCoords && (
          <div className="map-cursor-coords">
            📍 {cursorCoords.lat.toFixed(6)}°, {cursorCoords.lon.toFixed(6)}°
          </div>
        )}
      </>
    );
  },
);

MapView.displayName = 'MapView';
export default MapView;