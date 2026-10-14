'use client';
// Historico do aluno: tudo o que ele ja entregou, na tela ou no papel.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/cliente';
import { useAluno } from '@/lib/useAluno';
import { NOME_CURTO_AREA, codigoCurto, type Area, type EntregaResumo } from '@/lib/tipos';
import { Cabecalho, Carregando, Erro } from './Basicos';
import { CadastroAluno } from './CadastroAluno';

const dataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function TelaHistorico() {
  const aluno = useAluno();
  const [historico, setHistorico] = useState<EntregaResumo[] | null>(null);
  const [erro, setErro] = useState('');

  // O email e a chave: o servidor devolve o historico de qualquer aparelho.
  useEffect(() => {
    if (!aluno) return;
    let vivo = true;
    api.aluno(aluno.email, aluno.nome)
      .then(a => vivo && setHistorico(a.historico ?? []))
      .catch(e => vivo && setErro((e as Error).message));
    return () => { vivo = false; };
  }, [aluno]);

  if (aluno === undefined) return <><Cabecalho /><Carregando /></>;

  return (
    <>
      <Cabecalho />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-bold">Meu histórico</h1>
        {!aluno ? (
          <div className="max-w-lg">
            <CadastroAluno titulo="Quem é você?" texto="Use o mesmo email dos simulados que você já fez." />
          </div>
        ) : erro ? (
          <Erro>{erro}</Erro>
        ) : !historico ? (
          <Carregando texto="Buscando seus simulados…" />
        ) : !historico.length ? (
          <p className="text-texto">Nenhum simulado entregue ainda. <Link href="/">Monte o primeiro</Link>.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {historico.map(h => {
              const pct = h.total ? Math.round((h.acertos / h.total) * 100) : 0;
              return (
                <li key={h.entrega_id} className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-linha px-5 py-4">
                  <div className="flex min-w-40 flex-col">
                    <span className="font-semibold">{h.tipo === 'oficial' ? 'Oficial' : 'Personalizado'}</span>
                    <span className="text-sm text-suave">
                      {dataHora.format(new Date(h.entregue_em))} · {h.origem === 'pdf' ? 'no papel' : 'na tela'} · <span className="font-mono">{codigoCurto(h.simulado_id)}</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-texto">
                    {Object.entries(h.por_area ?? {}).map(([a, p]) => (
                      <span key={a}>{NOME_CURTO_AREA[a as Area] ?? a} <b className="font-mono tabular-nums">{p.acertos}/{p.total}</b></span>
                    ))}
                  </div>
                  <span className="ml-auto text-right">
                    <b className="text-xl tabular-nums">{h.acertos}/{h.total}</b>
                    <span className="block text-sm text-suave">{pct}%</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
