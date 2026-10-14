'use client';
// Quem fez no papel: digita o codigo do PDF, se identifica e passa as respostas a limpo.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, resultadoSalvo, simuladoCache } from '@/lib/cliente';
import { useAluno } from '@/lib/useAluno';
import { NOME_AREA, codigoCurto, tituloDoPedido, type Area, type Simulado } from '@/lib/tipos';
import { Botao, Cabecalho, Carregando, Erro } from './Basicos';
import { CadastroAluno } from './CadastroAluno';

const LETRAS = ['A', 'B', 'C', 'D', 'E'] as const;

export function TelaCorrigir() {
  const router = useRouter();
  const aluno = useAluno();
  const [codigo, setCodigo] = useState('');
  const [simulado, setSimulado] = useState<Simulado | null>(null);
  const [respostas, setRespostas] = useState<Record<string, string | null>>({});
  const [buscando, setBuscando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    const limpo = codigo.trim().toLowerCase();
    if (!/^[0-9a-f-]{8,36}$/.test(limpo)) { setErro('O código tem 8 letras e números, como aparece no cartão-resposta.'); return; }
    setBuscando(true);
    try {
      const s = await api.ver(limpo);
      simuladoCache.gravar(s);
      setSimulado(s);
      setRespostas({});
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setBuscando(false);
    }
  }

  async function corrigir() {
    if (!simulado || !aluno) return;
    setErro('');
    setEnviando(true);
    try {
      const todas = Object.fromEntries(simulado.questoes.map(q => [q.numero, respostas[q.numero] ?? null]));
      const r = await api.entregar({ simulado_id: simulado.simulado_id, aluno_id: aluno.aluno_id, respostas: todas, origem: 'pdf' });
      resultadoSalvo.gravar(simulado.simulado_id, r, simulado);
      router.push(`/simulado/${simulado.simulado_id}/resultado`);
    } catch (err) {
      setErro((err as Error).message);
      setEnviando(false);
    }
  }

  if (aluno === undefined) return <><Cabecalho /><Carregando /></>;

  const preenchidas = simulado ? simulado.questoes.filter(q => respostas[q.numero]).length : 0;
  const areas = simulado ? [...new Set(simulado.questoes.map(q => q.area))] as Area[] : [];

  return (
    <>
      <Cabecalho />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold">Corrigir prova feita no papel</h1>
          <p className="text-texto">Digite o código que está no cartão-resposta do PDF e passe suas marcações para cá.</p>
        </div>

        {!simulado ? (
          <form onSubmit={buscar} className="flex flex-col gap-4 rounded-xl border border-linha p-5 sm:p-6">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Código do simulado
              <input value={codigo} onChange={e => setCodigo(e.target.value)} required autoComplete="off" spellCheck={false}
                     placeholder="ex.: 3f9a1c2b" maxLength={36}
                     className="min-h-11 w-full max-w-xs rounded-lg border border-borda px-3 font-mono text-base font-normal tracking-wider" />
            </label>
            {erro && <Erro>{erro}</Erro>}
            <Botao type="submit" disabled={buscando} className="self-start">{buscando ? 'Buscando…' : 'Abrir cartão-resposta'}</Botao>
          </form>
        ) : !aluno ? (
          <CadastroAluno titulo="Quem fez esta prova?" texto="A nota vai para o seu histórico." />
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-superficie px-4 py-3">
              <span className="font-semibold">{tituloDoPedido(simulado.pedido)} · <span className="font-mono">{codigoCurto(simulado.simulado_id)}</span></span>
              <button type="button" onClick={() => { setSimulado(null); setErro(''); }}
                      className="min-h-11 text-sm text-destaque underline">Trocar código</button>
            </div>

            {areas.map(area => (
              <fieldset key={area} className="flex flex-col gap-1">
                <legend className="mb-2 w-full border-b-2 border-tinta pb-2 text-sm font-semibold uppercase tracking-wide text-suave">{NOME_AREA[area]}</legend>
                {simulado.questoes.filter(q => q.area === area).map(q => (
                  <div key={q.numero} role="radiogroup" aria-label={`Questão ${q.numero}`}
                       className="flex items-center gap-2 border-b border-linha py-1.5">
                    <span className="w-10 text-right font-mono text-sm font-semibold">{q.numero}</span>
                    {LETRAS.map(l => (
                      <label key={l} className="cursor-pointer">
                        <input type="radio" name={`c${q.numero}`} value={l} checked={respostas[q.numero] === l}
                               onChange={() => setRespostas(r => ({ ...r, [q.numero]: l }))} className="peer sr-only" />
                        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-borda text-sm font-semibold peer-checked:border-destaque peer-checked:bg-destaque peer-checked:text-white peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-destaque">
                          {l}
                        </span>
                      </label>
                    ))}
                    {respostas[q.numero] && (
                      <button type="button" onClick={() => setRespostas(r => ({ ...r, [q.numero]: null }))}
                              className="min-h-11 px-2 text-sm text-suave underline">Limpar</button>
                    )}
                  </div>
                ))}
              </fieldset>
            ))}

            <div className="sticky bottom-0 flex flex-wrap items-center gap-4 border-t border-linha bg-white py-4">
              <span className="text-sm text-texto">
                {preenchidas} de {simulado.questoes.length} preenchidas. Em branco conta como erro.
              </span>
              {erro && <div className="w-full"><Erro>{erro}</Erro></div>}
              <Botao onClick={corrigir} disabled={enviando} className="ml-auto">{enviando ? 'Corrigindo…' : 'Corrigir e ver a nota'}</Botao>
            </div>
          </>
        )}
      </main>
    </>
  );
}
