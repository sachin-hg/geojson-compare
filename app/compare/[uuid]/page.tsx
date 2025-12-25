'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';

// Dynamically import the map component to avoid SSR issues with Leaflet
const MapComponent = dynamic(() => import('@/components/MapComponent'), {
  ssr: false,
});

interface GeometryData {
  uuid: string;
  oldGeojson: any;
  newGeojson: any;
}

export default function ComparePage() {
  const params = useParams();
  const uuid = params.uuid as string;
  const [data, setData] = useState<GeometryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchGeometries() {
      try {
        const response = await fetch(`/api/get-geometries/${uuid}`);
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch geometries');
        }
        
        const geometryData = await response.json();
        setData(geometryData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }

    if (uuid) {
      fetchGeometries();
    }
  }, [uuid]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading geometries...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-2">Error</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600">No data found for UUID: {uuid}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col">
      <div className="bg-white shadow-sm border-b px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">GeoJSON Comparison</h1>
        <p className="text-sm text-gray-600 mt-1">UUID: {uuid}</p>
      </div>
      <div className="flex-1 relative">
        <MapComponent oldGeojson={data.oldGeojson} newGeojson={data.newGeojson} />
      </div>
    </div>
  );
}

