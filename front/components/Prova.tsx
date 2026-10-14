'use client';
// Pecas do layout B: questao (recorte oficial + bolhas), cartao-resposta lateral e cronometro.

import { useEffect, useState } from 'react';
import { NOME_AREA, type Area, type Questao } from '@/lib/tipos';

const LETRAS = ['A', 'B', 'C', 'D', 'E'] as const;

/** A questao como no caderno: o recorte da pagina oficial, sem reescrever nada (regra 1). */
export function BlocoQuestao({ q, marcada, revisar, aoMarcar, aoRevisar }: {
  q: Questao;
  marcada?: string | null;
  revisar?: boolean;
  aoMarcar?: (letra: string | null) => void;
  aoRevisar?: () => void;
}) {
  const larga = q.largura > 800;
  return (
    <article id={`q${q.numero}`} className={`questao scroll-mt-24 border-b border-linha pb-8 ${larga ? 'questao-larga' : ''}`}>
      <h3 className="mb-3 text-base font-semibold">Questão {q.numero}</h3>
      {/* eslint-disable-next-line @next/next/no-img-element -- recorte em PNG ja otimizado, servido do S3 */}
      <img src={q.imagem_url} alt={`Questão ${q.numero}: enunciado, textos e alternativas`}
           width={Math.round(q.largura * 0.75)} height={Math.round(q.altura * 0.75)}
           className="block h-auto max-w-full" loading="eager" />

      {aoMarcar ? (
        <fieldset className="nao-imprimir mt-4 flex flex-wrap items-center gap-2">
          <legend className="sr-only">Sua resposta para a questão {q.numero}</legend>
          {LETRAS.map(l => (
            <label key={l} className="cursor-pointer">
              <input type="radio" name={`q${q.numero}`} value={l} checked={marcada === l}
                     onChange={() => aoMarcar(l)} className="peer sr-only" />
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-borda bg-white text-base font-semibold text-tinta transition-colors hover:bg-superficie peer-checked:border-destaque peer-checked:bg-destaque peer-checked:text-white peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-destaque">
                {l}
              </span>
            </label>
          ))}
          {marcada && (
            <button type="button" onClick={() => aoMarcar(null)}
                    className="min-h-11 rounded-md px-2 text-sm text-suave underline hover:text-tinta">
              Limpar
            </button>
          )}
          {aoRevisar && (
            <button type="button" onClick={aoRevisar} aria-pressed={!!revisar}
                    className={`ml-auto min-h-11 rounded-lg border px-3 text-sm font-medium ${revisar ? 'border-revisar bg-revisar text-white' : 'border-linha bg-white text-revisar hover:bg-superficie'}`}>
              {revisar ? 'Marcada para revisar' : 'Revisar depois'}
            </button>
          )}
        </fieldset>
      ) : (
        <div className="mt-3 flex gap-2" aria-hidden="true">
          {LETRAS.map(l => (
            <span key={l} className="flex h-7 w-7 items-center justify-center rounded-full border border-suave text-xs font-semibold">{l}</span>
          ))}
        </div>
      )}
    </article>
  );
}

/** Questoes agrupadas por area, com o titulo da area como no caderno. */
export function Caderno({ questoes, render }: { questoes: Questao[]; render: (q: Questao) => React.ReactNode }) {
  const areas = [...new Set(questoes.map(q => q.area))] as Area[];
  return (
    <div className="caderno flex flex-col gap-8">
      {areas.map(area => {
        const qs = questoes.filter(q => q.area === area);
        return (
          <section key={area} aria-labelledby={`area-${area}`} className="flex flex-col gap-8">
            <h2 id={`area-${area}`} className="titulo-area border-b-2 border-tinta pb-2 text-sm font-semibold uppercase tracking-wide text-suave">
              {NOME_AREA[area]} · questões {qs[0].numero} a {qs[qs.length - 1].numero}
            </h2>
            {qs.map(render)}
          </section>
        );
      })}
    </div>
  );
}

/** Cartao-resposta lateral: navega ate a questao e mostra o que falta. */
export function CartaoResposta({ questoes, respostas, revisar, children }: {
  questoes: Questao[];
  respostas: Record<string, string | null>;
  revisar: number[];
  children?: React.ReactNode;
}) {
  const respondidas = questoes.filter(q => respostas[q.numero]).length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Cartão-resposta</h2>
        <span className="text-sm text-suave">{respondidas} de {questoes.length}</span>
      </div>
      <nav aria-label="Ir para a questão" className="grid grid-cols-5 gap-1.5">
        {questoes.map(q => {
          const r = respostas[q.numero];
          const rev = revisar.includes(q.numero);
          const estado = rev ? 'para revisar' : r ? `respondida ${r}` : 'em branco';
          const cor = rev ? 'border-revisar bg-revisar text-white'
            : r ? 'border-destaque bg-destaque text-white' : 'border-borda bg-white text-texto';
          return (
            <a key={q.numero} href={`#q${q.numero}`} aria-label={`Questão ${q.numero}, ${estado}`}
               className={`flex min-h-9 items-center justify-center rounded-md border font-mono text-xs no-underline hover:opacity-80 ${cor}`}>
              {r ? `${q.numero}${r}` : q.numero}
            </a>
          );
        })}
      </nav>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-texto">
        <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-sm bg-destaque" />respondida</span>
        <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-sm bg-revisar" />revisar</span>
        <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-sm border border-borda" />em branco</span>
      </div>
      {children}
    </div>
  );
}

function formatar(seg: number) {
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
  const dd = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${dd(m)}:${dd(s)}` : `${dd(m)}:${dd(s)}`;
}

/** Tempo desde o inicio (o aluno ve quanto ja gastou; o ENEM da 5h30 por dia). */
export function Cronometro({ desde }: { desde: string }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const seg = Math.max(0, Math.floor((agora - new Date(desde).getTime()) / 1000));
  return (
    <span className="font-mono text-base tabular-nums text-tinta" aria-label={`Tempo de prova: ${formatar(seg)}`}>
      {formatar(seg)}
    </span>
  );
}

/** Cartao-resposta para imprimir: a ultima pagina do PDF, com o codigo do simulado. */
export function CartaoImpresso({ questoes, codigo }: { questoes: Questao[]; codigo: string }) {
  return (
    <section className="cartao-impresso so-impressao">
      <h2 className="text-lg font-semibold">Cartão-resposta</h2>
      <p className="mt-1 text-sm">Nome: ______________________________________ · Código do simulado: <b className="font-mono">{codigo}</b></p>
      <p className="text-xs text-suave">Para corrigir: abra o site, “Corrigir prova feita no papel”, e digite o código.</p>
      <div className="mt-4" style={{ columns: 3, columnGap: 24 }}>
        {questoes.map(q => (
          <div key={q.numero} className="mb-1.5 flex items-center gap-1.5 font-mono text-xs" style={{ breakInside: 'avoid' }}>
            <b className="w-7 text-right">{q.numero}</b>
            {LETRAS.map(l => <i key={l} className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-texto text-[9px] not-italic">{l}</i>)}
          </div>
        ))}
      </div>
    </section>
  );
}
