'use client';
// Pecas pequenas usadas em varias telas.

import Link from 'next/link';
import type { ReactNode } from 'react';
import { sairAluno, useAluno } from '@/lib/useAluno';

export function Cabecalho({ direita }: { direita?: ReactNode }) {
  const aluno = useAluno();
  return (
    <header className="nao-imprimir border-b border-linha bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="text-lg font-bold text-tinta no-underline hover:text-tinta">Simulado ENEM</Link>
        <nav aria-label="Principal" className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <Link href="/corrigir">Corrigir prova feita no papel</Link>
          <Link href="/historico">Meu histórico</Link>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm text-suave">
          {direita}
          {aluno && (
            <span className="flex items-center gap-2">
              <span>{aluno.nome}</span>
              <button type="button" onClick={sairAluno}
                      className="min-h-11 rounded-md px-2 text-destaque underline hover:text-destaque-escuro">
                Sair
              </button>
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div role="status" className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-16 text-suave">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-borda border-t-destaque" aria-hidden="true" />
      {texto}
    </div>
  );
}

export function Erro({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-errado/30 bg-errado/5 px-4 py-3 text-sm text-errado">
      {children}
    </div>
  );
}

export function Botao({ children, variante = 'primario', className = '', ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: 'primario' | 'secundario' }) {
  const estilo = variante === 'primario'
    ? 'bg-tinta text-white hover:bg-texto disabled:bg-suave'
    : 'border border-borda bg-white text-tinta hover:bg-superficie disabled:text-suave';
  return (
    <button type="button" {...props}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 font-semibold transition-colors disabled:cursor-wait ${estilo} ${className}`}>
      {children}
    </button>
  );
}
