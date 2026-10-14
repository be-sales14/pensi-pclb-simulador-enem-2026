'use client';
// Tela inicial: escolher o simulado e o caminho (fazer na tela ou baixar o PDF).

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, simuladoCache } from '@/lib/cliente';
import { useAluno } from '@/lib/useAluno';
import { NOME_CURTO_AREA, type Area, type Pedido } from '@/lib/tipos';
import { Botao, Erro } from './Basicos';
import { CadastroAluno } from './CadastroAluno';

type Opcao = 'completo' | 'dia1' | 'dia2' | 'personalizado';
const OPCOES: { valor: Opcao; titulo: string; detalhe: string }[] = [
  { valor: 'completo', titulo: 'Oficial completo', detalhe: '180 questões · as quatro áreas' },
  { valor: 'dia1', titulo: 'Oficial · 1º dia', detalhe: '90 questões · Linguagens e Humanas' },
  { valor: 'dia2', titulo: 'Oficial · 2º dia', detalhe: '90 questões · Natureza e Matemática' },
  { valor: 'personalizado', titulo: 'Personalizado', detalhe: 'Você escolhe as áreas e quantas questões' },
];
const AREAS: Area[] = ['LC', 'CH', 'CN', 'MT'];

export const MARCA_IMPRIMIR = 'simulado-enem:imprimir-ao-abrir';

export function FormularioSimulado() {
  const router = useRouter();
  const aluno = useAluno();
  const [opcao, setOpcao] = useState<Opcao>('completo');
  const [areas, setAreas] = useState<Area[]>(['MT']);
  const [n, setN] = useState(20);
  const [lingua, setLingua] = useState<'ingles' | 'espanhol'>('ingles');
  const [enviando, setEnviando] = useState<null | 'tela' | 'pdf'>(null);
  const [pedindoCadastro, setPedindoCadastro] = useState(false);
  const [erro, setErro] = useState('');

  const temLinguagens = opcao === 'completo' || opcao === 'dia1' || (opcao === 'personalizado' && areas.includes('LC'));

  function pedido(): Pedido | null {
    if (opcao === 'personalizado') {
      if (!areas.length) { setErro('Escolha pelo menos uma área.'); return null; }
      if (!Number.isInteger(n) || n < 1 || n > 180) { setErro('Escolha de 1 a 180 questões.'); return null; }
      return { tipo: 'personalizado', areas, n_questoes: n, lingua };
    }
    return { tipo: 'oficial', dia: opcao === 'dia1' ? 1 : opcao === 'dia2' ? 2 : null, lingua };
  }

  async function montar(caminho: 'tela' | 'pdf', aluno_id?: string) {
    setErro('');
    const p = pedido();
    if (!p) return;
    setEnviando(caminho);
    try {
      const s = await api.montar(p, aluno_id);
      simuladoCache.gravar(s);
      if (caminho === 'pdf') {
        try { sessionStorage.setItem(MARCA_IMPRIMIR, s.simulado_id); } catch { /* segue */ }
        router.push(`/simulado/${s.simulado_id}/imprimir`);
      } else {
        router.push(`/simulado/${s.simulado_id}`);
      }
    } catch (e) {
      setErro((e as Error).message);
      setEnviando(null);
    }
  }

  function fazerNaTela() {
    if (!aluno) { setPedindoCadastro(true); return; }
    montar('tela', aluno.aluno_id);
  }

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-base font-semibold">Qual simulado?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {OPCOES.map(o => (
            <label key={o.valor} className="cursor-pointer">
              <input type="radio" name="opcao" value={o.valor} checked={opcao === o.valor}
                     onChange={() => setOpcao(o.valor)} className="peer sr-only" />
              <span className="flex min-h-20 flex-col justify-center gap-1 rounded-xl border border-borda bg-white px-4 py-3 transition-colors hover:bg-superficie peer-checked:border-2 peer-checked:border-destaque peer-focus-visible:outline-3 peer-focus-visible:outline-destaque">
                <span className="font-semibold">{o.titulo}</span>
                <span className="text-sm text-suave">{o.detalhe}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {opcao === 'personalizado' && (
        <div className="flex flex-col gap-4 rounded-xl bg-superficie p-4">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Áreas</legend>
            <div className="flex flex-wrap gap-2">
              {AREAS.map(a => (
                <label key={a} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-borda bg-white px-3 text-sm">
                  <input type="checkbox" checked={areas.includes(a)} className="h-4 w-4 accent-destaque"
                         onChange={e => setAreas(e.target.checked ? [...areas, a] : areas.filter(x => x !== a))} />
                  {NOME_CURTO_AREA[a]}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Número de questões
            <input type="number" min={1} max={180} value={Number.isNaN(n) ? '' : n} onChange={e => setN(e.target.valueAsNumber)}
                   className="min-h-11 w-32 rounded-lg border border-borda bg-white px-3 text-base font-normal" />
            <span className="text-xs font-normal text-suave">Divididas entre as áreas e, dentro delas, na proporção da prova oficial.</span>
          </label>
        </div>
      )}

      {temLinguagens && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Língua estrangeira</legend>
          <div className="flex gap-2">
            {(['ingles', 'espanhol'] as const).map(l => (
              <label key={l} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-borda bg-white px-3 text-sm">
                <input type="radio" name="lingua" checked={lingua === l} onChange={() => setLingua(l)} className="h-4 w-4 accent-destaque" />
                {l === 'ingles' ? 'Inglês' : 'Espanhol'}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {erro && <Erro>{erro}</Erro>}

      {pedindoCadastro && !aluno ? (
        <CadastroAluno titulo="Antes de começar, quem é você?"
                       texto="Para fazer na tela e guardar seu resultado no histórico."
                       aoConcluir={a => { setPedindoCadastro(false); montar('tela', a.aluno_id); }} />
      ) : (
        <div className="flex flex-wrap gap-3">
          <Botao onClick={fazerNaTela} disabled={!!enviando}>
            {enviando === 'tela' ? 'Montando o simulado…' : 'Fazer na tela'}
          </Botao>
          <Botao variante="secundario" onClick={() => montar('pdf')} disabled={!!enviando}>
            {enviando === 'pdf' ? 'Montando o PDF…' : 'Baixar PDF'}
          </Botao>
        </div>
      )}
      <p className="text-sm text-suave">
        Fez no papel? Depois, em <Link href="/corrigir">Corrigir prova feita no papel</Link>, digite o código impresso no PDF.
      </p>
    </div>
  );
}
