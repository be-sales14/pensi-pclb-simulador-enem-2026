'use client';
// Versao para o papel: caderno em duas colunas + cartao-resposta em branco com o codigo.
// Nao pede cadastro: quem faz no papel se identifica so na hora de corrigir.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { carregarSimulado } from '@/lib/cliente';
import { codigoCurto, tituloDoPedido, type Simulado } from '@/lib/tipos';
import { Botao, Cabecalho, Carregando, Erro } from './Basicos';
import { MARCA_IMPRIMIR } from './FormularioSimulado';
import { BlocoQuestao, Caderno, CartaoImpresso } from './Prova';

/** Espera todas as imagens da pagina carregarem (ou falharem) antes de imprimir. */
function imagensProntas() {
  const pendentes = [...document.images].filter(i => !i.complete);
  return Promise.all(pendentes.map(i => new Promise(ok => {
    i.addEventListener('load', ok, { once: true });
    i.addEventListener('error', ok, { once: true });
  })));
}

export function TelaImpressao({ id }: { id: string }) {
  const [simulado, setSimulado] = useState<Simulado | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    carregarSimulado(id).then(s => vivo && setSimulado(s)).catch(e => vivo && setErro((e as Error).message));
    return () => { vivo = false; };
  }, [id]);

  // Veio do botao "Baixar PDF": abre a janela de impressao sozinho, uma vez.
  useEffect(() => {
    if (!simulado) return;
    let marca: string | null = null;
    try { marca = sessionStorage.getItem(MARCA_IMPRIMIR); } catch { /* segue */ }
    if (marca !== simulado.simulado_id) return;
    try { sessionStorage.removeItem(MARCA_IMPRIMIR); } catch { /* segue */ }
    let vivo = true;
    imagensProntas().then(() => vivo && window.print());
    return () => { vivo = false; };
  }, [simulado]);

  if (erro) return <><Cabecalho /><main className="mx-auto w-full max-w-3xl px-4 py-10"><Erro>{erro}</Erro></main></>;
  if (!simulado) return <><Cabecalho /><Carregando texto="Preparando o PDF…" /></>;

  const codigo = codigoCurto(simulado.simulado_id);
  return (
    <>
      <Cabecalho />
      <div className="nao-imprimir border-b border-linha bg-superficie">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-4 px-4 py-4 sm:px-6">
          <p className="min-w-0 flex-[1_1_320px] text-sm text-texto">
            Na janela de impressão, escolha <b>Salvar como PDF</b>. O cartão-resposta sai na última página.
            Depois de fazer, corrija em <Link href="/corrigir">Corrigir prova feita no papel</Link> com o código <b className="font-mono">{codigo}</b>.
          </p>
          <Botao onClick={() => window.print()}>Salvar PDF / Imprimir</Botao>
        </div>
      </div>

      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <header className="mb-6 flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-tinta pb-3">
          <h1 className="text-xl font-bold">{tituloDoPedido(simulado.pedido)}</h1>
          <span className="text-sm text-texto">{simulado.questoes.length} questões · código <b className="font-mono">{codigo}</b></span>
        </header>
        <Caderno questoes={simulado.questoes} render={q => <BlocoQuestao key={q.numero} q={q} />} />
        <CartaoImpresso questoes={simulado.questoes} codigo={codigo} />
      </main>
    </>
  );
}
