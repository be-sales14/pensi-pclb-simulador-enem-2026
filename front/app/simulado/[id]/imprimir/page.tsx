import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Carregando } from '@/components/Basicos';
import { TelaImpressao } from '@/components/TelaImpressao';

export const metadata: Metadata = { title: 'PDF do simulado' };

export default function Pagina({ params }: PageProps<'/simulado/[id]/imprimir'>) {
  return (
    <Suspense fallback={<Carregando texto="Preparando o PDF…" />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: Pick<PageProps<'/simulado/[id]/imprimir'>, 'params'>) {
  const { id } = await params;
  return <TelaImpressao id={id} />;
}
