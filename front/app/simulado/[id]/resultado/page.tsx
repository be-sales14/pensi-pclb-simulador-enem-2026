import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Carregando } from '@/components/Basicos';
import { TelaResultado } from '@/components/TelaResultado';

export const metadata: Metadata = { title: 'Resultado' };

export default function Pagina({ params }: PageProps<'/simulado/[id]/resultado'>) {
  return (
    <Suspense fallback={<Carregando texto="Carregando o resultado…" />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: Pick<PageProps<'/simulado/[id]/resultado'>, 'params'>) {
  const { id } = await params;
  return <TelaResultado id={id} />;
}
