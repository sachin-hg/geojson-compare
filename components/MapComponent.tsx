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

    // Remove existing layers
    if (oldLayerRef.current) {
      map.removeLayer(oldLayerRef.current);
    }
    if (newLayerRef.current) {
      map.removeLayer(newLayerRef.current);
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
    const legend = L.control({ position: 'topright' });
    legend.onAdd = function () {
      const div = L.DomUtil.create('div', 'bg-white p-3 rounded shadow-lg');
      div.innerHTML = `
        <div class="text-sm font-semibold mb-2">Legend</div>
        <div class="flex items-center mb-1">
          <div class="w-4 h-4 bg-red-500 mr-2 border border-red-700"></div>
          <span class="text-xs">Old Geometry</span>
        </div>
        <div class="flex items-center">
          <div class="w-4 h-4 bg-blue-500 mr-2 border border-blue-700"></div>
          <span class="text-xs">New Geometry</span>
        </div>
      `;
      return div;
    };
    legend.addTo(map);

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

