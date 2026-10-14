import type { Metadata } from 'next';
import { TelaCorrigir } from '@/components/TelaCorrigir';

export const metadata: Metadata = { title: 'Corrigir prova feita no papel' };

export default function Pagina() {
  return <TelaCorrigir />;
}
