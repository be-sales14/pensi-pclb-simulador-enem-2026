'use client';
// Layout B: caderno corrido com bolhas + cartao-resposta lateral. Respostas salvas no
// navegador a cada clique; a correcao (e o gabarito) so vem na entrega.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, carregarSimulado, rascunho, resultadoSalvo, type Rascunho } from '@/lib/cliente';
import { useAluno } from '@/lib/useAluno';
import { codigoCurto, tituloDoPedido, type Simulado } from '@/lib/tipos';
import { Botao, Cabecalho, Carregando, Erro } from './Basicos';
import { CadastroAluno } from './CadastroAluno';
import { BlocoQuestao, Caderno, CartaoImpresso, CartaoResposta, Cronometro } from './Prova';

export function TelaProva({ id }: { id: string }) {
  const router = useRouter();
  const aluno = useAluno();
  const [simulado, setSimulado] = useState<Simulado | null>(null);
  const [estado, setEstado] = useState<Rascunho | null>(null);
  const [erro, setErro] = useState('');
  const [entregando, setEntregando] = useState(false);
  const [erroEntrega, setErroEntrega] = useState('');
  const dialogo = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let vivo = true;
    carregarSimulado(id)
      .then(s => {
        if (!vivo) return;
        setSimulado(s);
        setEstado(rascunho.ler(s.simulado_id) ?? { respostas: {}, revisar: [], iniciado_em: new Date().toISOString() });
      })
      .catch(e => vivo && setErro((e as Error).message));
    return () => { vivo = false; };
  }, [id]);

  function atualizar(mudar: (r: Rascunho) => Rascunho) {
    setEstado(atual => {
      if (!atual || !simulado) return atual;
      const novo = mudar(atual);
      rascunho.gravar(simulado.simulado_id, novo);
      return novo;
    });
  }

  async function entregar() {
    if (!simulado || !estado || !aluno) return;
    setErroEntrega('');
    setEntregando(true);
    try {
      const respostas = Object.fromEntries(simulado.questoes.map(q => [q.numero, estado.respostas[q.numero] ?? null]));
      const r = await api.entregar({ simulado_id: simulado.simulado_id, aluno_id: aluno.aluno_id, respostas,
                                     origem: 'pagina', iniciado_em: estado.iniciado_em });
      resultadoSalvo.gravar(simulado.simulado_id, r, simulado);
      rascunho.apagar(simulado.simulado_id);
      router.push(`/simulado/${simulado.simulado_id}/resultado`);
    } catch (e) {
      setErroEntrega((e as Error).message);
      setEntregando(false);
    }
  }

  if (erro) return <><Cabecalho /><main className="mx-auto w-full max-w-3xl px-4 py-10"><Erro>{erro}</Erro></main></>;
  if (!simulado || !estado || aluno === undefined) return <><Cabecalho /><Carregando texto="Abrindo o simulado…" /></>;

  if (!aluno) {
    return (
      <>
        <Cabecalho />
        <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-10">
          <CadastroAluno titulo="Para fazer na tela, diga quem você é"
                         texto="Seu resultado fica guardado no seu histórico." />
          <p className="text-sm text-suave">
            Prefere papel? <Link href={`/simulado/${simulado.simulado_id}/imprimir`}>Baixe o PDF deste simulado</Link>.
          </p>
        </main>
      </>
    );
  }

  const qs = simulado.questoes;
  const emBranco = qs.filter(q => !estado.respostas[q.numero]).length;
  const codigo = codigoCurto(simulado.simulado_id);

  return (
    <>
      <Cabecalho />
      <div className="nao-imprimir sticky top-0 z-10 border-b border-linha bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold">{tituloDoPedido(simulado.pedido)}</h1>
            <span className="text-sm text-suave">{qs.length} questões reais do ENEM · código {codigo}</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Cronometro desde={estado.iniciado_em} />
            <Link href={`/simulado/${simulado.simulado_id}/imprimir`}
                  className="inline-flex min-h-11 items-center rounded-lg border border-borda px-4 font-semibold text-tinta no-underline hover:bg-superficie hover:text-tinta">
              Exportar PDF
            </Link>
            <Botao onClick={() => dialogo.current?.showModal()}>Entregar</Botao>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-start gap-8 px-4 py-6 sm:px-6">
        <main className="min-w-0 flex-[999_1_560px]">
          {simulado.avisos?.length ? (
            <div className="nao-imprimir mb-6"><Erro>{simulado.avisos.join(' ')}</Erro></div>
          ) : null}
          <p className="nao-imprimir mb-8 rounded-lg bg-superficie px-4 py-3 text-sm text-texto">
            Marque a alternativa embaixo de cada questão. Suas respostas ficam salvas neste navegador: pode fechar e voltar depois.
            O gabarito aparece quando você entrega.
          </p>
          <Caderno questoes={qs} render={q => (
            <BlocoQuestao key={q.numero} q={q} marcada={estado.respostas[q.numero]} revisar={estado.revisar.includes(q.numero)}
                          aoMarcar={l => atualizar(r => ({ ...r, respostas: { ...r.respostas, [q.numero]: l } }))}
                          aoRevisar={() => atualizar(r => ({ ...r, revisar: r.revisar.includes(q.numero)
                            ? r.revisar.filter(x => x !== q.numero) : [...r.revisar, q.numero] }))} />
          )} />
          <CartaoImpresso questoes={qs} codigo={codigo} />
        </main>

        <aside className="nao-imprimir flex-[1_1_280px] rounded-xl border border-linha p-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
          <CartaoResposta questoes={qs} respostas={estado.respostas} revisar={estado.revisar}>
            <Botao onClick={() => dialogo.current?.showModal()}>Entregar simulado</Botao>
          </CartaoResposta>
        </aside>
      </div>

      <dialog ref={dialogo} aria-labelledby="titulo-entrega"
              className="m-auto w-[min(92vw,440px)] rounded-2xl p-6 backdrop:bg-tinta/40">
        <div className="flex flex-col gap-4">
          <h2 id="titulo-entrega" className="text-lg font-semibold">Entregar o simulado?</h2>
          <p className="text-texto">
            {emBranco
              ? `${emBranco} ${emBranco === 1 ? 'questão está' : 'questões estão'} em branco e ${emBranco === 1 ? 'conta' : 'contam'} como erro.`
              : 'Todas as questões estão respondidas.'}{' '}
            Depois de entregar não dá para mudar as respostas.
          </p>
          {erroEntrega && <Erro>{erroEntrega}</Erro>}
          <div className="flex flex-wrap justify-end gap-3">
            <Botao variante="secundario" onClick={() => dialogo.current?.close()} disabled={entregando}>Voltar à prova</Botao>
            <Botao onClick={entregar} disabled={entregando}>{entregando ? 'Corrigindo…' : 'Entregar e ver a nota'}</Botao>
          </div>
        </div>
      </dialog>
    </>
  );
}
