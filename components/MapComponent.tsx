'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MapComponentProps {
  oldGeojson: any;
  newGeojson: any;
}

export default function MapComponent({ oldGeojson, newGeojson }: MapComponentProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const oldLayerRef = useRef<L.GeoJSON | null>(null);
  const newLayerRef = useRef<L.GeoJSON | null>(null);
  const legendRef = useRef<L.Control | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize map
    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current).setView([20.5937, 78.9629], 5);

      // Add tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;

    // Remove existing layers and legend
    if (oldLayerRef.current) {
      map.removeLayer(oldLayerRef.current);
    }
    if (newLayerRef.current) {
      map.removeLayer(newLayerRef.current);
    }
    if (legendRef.current) {
      map.removeControl(legendRef.current);
    }

    // Add old geometry (red)
    if (oldGeojson) {
      oldLayerRef.current = L.geoJSON(oldGeojson, {
        style: {
          color: '#ef4444',
          weight: 3,
          opacity: 0.8,
          fillColor: '#ef4444',
          fillOpacity: 0.3,
        },
      }).addTo(map);
    }

    // Add new geometry (blue)
    if (newGeojson) {
      newLayerRef.current = L.geoJSON(newGeojson, {
        style: {
          color: '#3b82f6',
          weight: 3,
          opacity: 0.8,
          fillColor: '#3b82f6',
          fillOpacity: 0.3,
        },
      }).addTo(map);
    }

    // Fit map to show both geometries
    const layers: L.Layer[] = [];
    if (oldLayerRef.current) {
      layers.push(oldLayerRef.current);
    }
    if (newLayerRef.current) {
      layers.push(newLayerRef.current);
    }

    if (layers.length > 0) {
      const group = new L.FeatureGroup(layers);
      map.fitBounds(group.getBounds().pad(0.1));
    }

    // Add legend
    const LegendControl = L.Control.extend({
      onAdd: function () {
        const div = L.DomUtil.create('div', 'bg-white p-3 rounded shadow-lg');
        div.style.cssText = 'background: white; padding: 12px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);';
        div.innerHTML = `
          <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">Legend</div>
          <div style="display: flex; align-items: center; margin-bottom: 4px;">
            <div style="width: 16px; height: 16px; background: #ef4444; margin-right: 8px; border: 1px solid #dc2626;"></div>
            <span style="font-size: 12px;">Old Geometry</span>
          </div>
          <div style="display: flex; align-items: center;">
            <div style="width: 16px; height: 16px; background: #3b82f6; margin-right: 8px; border: 1px solid #2563eb;"></div>
            <span style="font-size: 12px;">New Geometry</span>
          </div>
        `;
        return div;
      },
    });
    
    const legend = new LegendControl({ position: 'topright' });
    legend.addTo(map);
    legendRef.current = legend;

    // Cleanup function
    return () => {
      if (map) {
        map.remove();
        mapRef.current = null;
      }
    };
  }, [oldGeojson, newGeojson]);

  return <div ref={mapContainerRef} className="w-full h-full" />;
}

