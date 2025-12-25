export default function Home() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">GeoJSON Compare</h1>
        <p className="text-gray-600 mb-8">
          Navigate to <code className="bg-gray-200 px-2 py-1 rounded">/compare/[uuid]</code> to view geometry comparisons
        </p>
        <div className="bg-white p-6 rounded-lg shadow-md max-w-md mx-auto">
          <p className="text-sm text-gray-600 mb-2">Example:</p>
          <code className="text-blue-600">
            /compare/your-uuid-here
          </code>
        </div>
      </div>
    </div>
  );
}

