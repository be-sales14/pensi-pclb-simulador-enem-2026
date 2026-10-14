import type { Metadata } from 'next';
import { TelaHistorico } from '@/components/TelaHistorico';

export const metadata: Metadata = { title: 'Meu histórico' };

export default function Pagina() {
  return <TelaHistorico />;
}
