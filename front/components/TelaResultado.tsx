'use client';
// Nota, desempenho por area e disciplina e o gabarito questao a questao.
// O gabarito so existe na resposta da entrega (regra 4): fica guardado nesta aba.

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { resultadoSalvo } from '@/lib/cliente';
import { NOME_AREA, NOME_CURTO_AREA, nomeDisciplina, tituloDoPedido, type Area, type Placar, type Questao } from '@/lib/tipos';
import { Cabecalho, Carregando } from './Basicos';

const nada = () => () => {};

/** O placar por disciplina vem como "MT · Matematica". */
function nomeDaChave(k: string) {
  const [area, disc] = k.split(' · ');
  return disc ? `${NOME_CURTO_AREA[area as Area] ?? area} · ${nomeDisciplina(disc)}` : nomeDisciplina(k);
}

function Barra({ rotulo, acertos, total }: { rotulo: string; acertos: number; total: number }) {
  const pct = total ? Math.round((acertos / total) * 100) : 0;
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-tinta">{rotulo}</span>
        <span className="font-mono tabular-nums text-texto">{acertos}/{total} · {pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-superficie" aria-hidden="true">
        <div className="h-full rounded-full bg-destaque" style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

function Placares({ titulo, placar, nome }: { titulo: string; placar: Placar; nome: (k: string) => string }) {
  const chaves = Object.keys(placar);
  if (!chaves.length) return null;
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-linha p-5">
      <h2 className="text-base font-semibold">{titulo}</h2>
      <ul className="flex flex-col gap-4">
        {chaves.map(k => <Barra key={k} rotulo={nome(k)} {...placar[k]} />)}
      </ul>
    </section>
  );
}

export function TelaResultado({ id }: { id: string }) {
  // Snapshot em string para o useSyncExternalStore comparar por valor.
  const bruto = useSyncExternalStore(nada, () => JSON.stringify(resultadoSalvo.ler(id)), () => undefined);
  if (bruto === undefined) return <><Cabecalho /><Carregando /></>;
  const r = JSON.parse(bruto) as ReturnType<typeof resultadoSalvo.ler>;

  if (!r) {
    return (
      <>
        <Cabecalho />
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-12">
          <h1 className="text-2xl font-bold">Resultado indisponível nesta aba</h1>
          <p className="text-texto">
            O gabarito só aparece logo depois da entrega, na mesma aba. Sua nota continua guardada
            em <Link href="/historico">Meu histórico</Link>.
          </p>
        </main>
      </>
    );
  }

  const porNumero = new Map<number, Questao>(r.simulado.questoes.map(q => [q.numero, q]));
  const pct = r.total ? Math.round((r.acertos / r.total) * 100) : 0;
  const erradas = r.questoes.filter(q => !q.certo);

  return (
    <>
      <Cabecalho />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6">
        <section className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-suave">{tituloDoPedido(r.simulado.pedido)}</p>
            <h1 className="text-3xl font-bold sm:text-4xl">
              {r.acertos} de {r.total} acertos
            </h1>
            <p className="text-lg text-texto">{pct}% de aproveitamento</p>
          </div>
          <div className="flex gap-3">
            <Link href="/" className="inline-flex min-h-11 items-center rounded-lg bg-tinta px-5 font-semibold text-white no-underline hover:bg-texto hover:text-white">
              Novo simulado
            </Link>
            <Link href="/historico" className="inline-flex min-h-11 items-center rounded-lg border border-borda px-5 font-semibold text-tinta no-underline hover:bg-superficie hover:text-tinta">
              Meu histórico
            </Link>
          </div>
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          <Placares titulo="Por área" placar={r.por_area} nome={k => NOME_AREA[k as Area] ?? k} />
          <Placares titulo="Por disciplina" placar={r.por_disciplina} nome={nomeDaChave} />
        </div>

        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Gabarito</h2>
          <ol className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
            {r.questoes.map(q => (
              <li key={q.numero}>
                <a href={`#r${q.numero}`}
                   className={`flex min-h-11 items-center justify-between rounded-md border px-3 font-mono text-sm no-underline ${q.certo ? 'border-certo/40 bg-certo/5 text-certo' : 'border-errado/40 bg-errado/5 text-errado'}`}>
                  <span>{q.numero}</span>
                  <span>{q.marcada ?? '–'} {q.certo ? '✓' : `→ ${q.gabarito}`}</span>
                </a>
              </li>
            ))}
          </ol>
        </section>

        {erradas.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold">Questões para revisar ({erradas.length})</h2>
            {erradas.map(q => {
              const questao = porNumero.get(q.numero);
              return (
                <details key={q.numero} id={`r${q.numero}`} className="scroll-mt-6 rounded-xl border border-linha">
                  <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
                    <span className="font-semibold">Questão {q.numero}</span>
                    {questao && <span className="text-sm text-suave">{nomeDisciplina(questao.disciplina)}</span>}
                    <span className="ml-auto font-mono text-sm">
                      sua: <b className="text-errado">{q.marcada ?? 'em branco'}</b> · certa: <b className="text-certo">{q.gabarito}</b>
                    </span>
                  </summary>
                  {questao && (
                    <div className="border-t border-linha p-4">
                      {/* eslint-disable-next-line @next/next/no-img-element -- recorte oficial servido do S3 */}
                      <img src={questao.imagem_url} alt={`Questão ${q.numero}`} loading="lazy"
                           width={Math.round(questao.largura * 0.75)} height={Math.round(questao.altura * 0.75)}
                           className="block h-auto max-w-full" />
                    </div>
                  )}
                </details>
              );
            })}
          </section>
        )}
      </main>
    </>
  );
}
