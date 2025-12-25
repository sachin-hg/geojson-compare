import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GeoJSON Compare',
  description: 'Compare old and new GeoJSON geometries',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

