import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const plex = IBM_Plex_Sans({ variable: '--font-plex', subsets: ['latin'], weight: ['400', '500', '600', '700'] });
const plexMono = IBM_Plex_Mono({ variable: '--font-plex-mono', subsets: ['latin'], weight: ['500'] });

export const metadata: Metadata = {
  title: { default: 'Simulado ENEM', template: '%s · Simulado ENEM' },
  description: 'Simulados com questões reais do ENEM (2019 a 2025), na proporção da prova oficial.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR" className={`${plex.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
