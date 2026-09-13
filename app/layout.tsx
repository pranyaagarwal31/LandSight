import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import { Providers } from '@/components/landsight/provider'
import { AppShell } from '@/components/landsight/app-shell'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })
export const metadata: Metadata = {
  title: { default: 'LandSight — Land Acquisition Intelligence', template: '%s | LandSight' },
  description: 'LandSight SIH26017: a synthetic-data decision-support prototype for land acquisition delay risk, explainability, impact simulation, and GIS. Smart India Hackathon 2026.',
  applicationName: 'LandSight',
  icons: { icon: '/landsight-icon.svg' },
}
export const viewport: Viewport = { colorScheme: 'light', themeColor: '#21624e', width: 'device-width', initialScale: 1 }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`light ${geist.variable}`}><body className="antialiased"><Providers><AppShell>{children}</AppShell></Providers></body></html>
}
