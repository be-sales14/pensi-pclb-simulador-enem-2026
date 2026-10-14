import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Carregando } from '@/components/Basicos';
import { TelaProva } from '@/components/TelaProva';

export const metadata: Metadata = { title: 'Simulado' };

// O id vem da URL: fica atras de Suspense (Cache Components) e a tela carrega no browser.
export default function Pagina({ params }: PageProps<'/simulado/[id]'>) {
  return (
    <Suspense fallback={<Carregando texto="Abrindo o simulado…" />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: Pick<PageProps<'/simulado/[id]'>, 'params'>) {
  const { id } = await params;
  return <TelaProva id={id} />;
}
