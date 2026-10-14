'use client';
// O aluno salvo neste navegador, lido sem descompasso entre servidor e browser.
// undefined = ainda nao leu (render do servidor); null = ninguem cadastrado.

import { useSyncExternalStore } from 'react';
import { alunoSalvo } from './cliente';
import type { Aluno } from './tipos';

const EVENTO = 'simulado-enem:aluno';

function assinar(avisar: () => void) {
  window.addEventListener('storage', avisar);
  window.addEventListener(EVENTO, avisar);
  return () => {
    window.removeEventListener('storage', avisar);
    window.removeEventListener(EVENTO, avisar);
  };
}

let ultimo: string | null = null;
let cache: Omit<Aluno, 'historico'> | null = null;
function ler() {
  const a = alunoSalvo.ler();
  const chave = a ? JSON.stringify(a) : null;
  if (chave !== ultimo) { ultimo = chave; cache = a; }
  return cache;
}

export function useAluno() {
  return useSyncExternalStore(assinar, ler, () => undefined);
}

export function salvarAluno(a: Aluno) {
  alunoSalvo.gravar(a);
  window.dispatchEvent(new Event(EVENTO));
}

export function sairAluno() {
  alunoSalvo.sair();
  window.dispatchEvent(new Event(EVENTO));
}
