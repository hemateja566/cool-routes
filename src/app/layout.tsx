// Main App Layout with PWA support

import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'CoolRoutes - Heat-Safe Navigation',
  description: 'Find the coolest, safest walking routes using hyperlocal temperature intelligence from FortyGuard',
  keywords: ['heat safety', 'navigation', 'urban heat', 'climate adaptation', 'WBGT', 'heat risk'],
  authors: [{ name: 'CoolRoutes Team' }],
  creator: 'CoolRoutes',
  publisher: 'CoolRoutes',
  robots: 'index, follow',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://coolroutes.app',
    siteName: 'CoolRoutes',
    title: 'CoolRoutes - Heat-Safe Navigation',
    description: 'Find the coolest, safest walking routes using hyperlocal temperature intelligence',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'CoolRoutes - Heat-safe route visualization',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CoolRoutes - Heat-Safe Navigation',
    description: 'Find the coolest, safest walking routes using hyperlocal temperature intelligence',
    images: ['/og-image.png'],
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
  themeColor: '#14b8a6',
};

export const viewport: Viewport = {
  themeColor: '#14b8a6',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <head>
        <link rel="preconnect" href="https://api.fortyguard.com" />
        <link rel="preconnect" href="https://router.project-osrm.org" />
        <link rel="preconnect" href="https://demotiles.maplibre.org" />
      </head>
      <body className="min-h-screen bg-gray-50 text-gray-900">
        {children}
      </body>
    </html>
  );
}