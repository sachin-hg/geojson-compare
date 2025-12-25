import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const { uuid } = await params;
    
    // Path to the CSV file
    const csvPath = path.join(process.cwd(), 'data.csv');
    
    // Check if file exists
    if (!fs.existsSync(csvPath)) {
      return NextResponse.json(
        { error: 'Data file not found' },
        { status: 404 }
      );
    }
    
    // Read and parse CSV
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n');
    
    // Skip header line
    const header = lines[0];
    if (!header.includes('uuid') || !header.includes('old_geojson') || !header.includes('new_geojson')) {
      return NextResponse.json(
        { error: 'Invalid CSV format. Expected: uuid,old_geojson,new_geojson' },
        { status: 400 }
      );
    }
    
    // Find the row with matching UUID
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Parse CSV line (handling quoted values)
      const columns = parseCSVLine(line);
      
      if (columns.length >= 3 && columns[0] === uuid) {
        const oldGeojson = columns[1] || null;
        const newGeojson = columns[2] || null;
        
        return NextResponse.json({
          uuid,
          oldGeojson: oldGeojson ? JSON.parse(oldGeojson) : null,
          newGeojson: newGeojson ? JSON.parse(newGeojson) : null,
        });
      }
    }
    
    return NextResponse.json(
      { error: 'UUID not found' },
      { status: 404 }
    );
  } catch (error) {
    console.error('Error reading geometries:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to parse CSV line handling quoted values
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of column
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add last column
  result.push(current);
  
  return result;
}

