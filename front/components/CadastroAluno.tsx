'use client';
// Cadastro minimo antes de fazer na tela: email (a chave do historico) e nome.

import { useState } from 'react';
import { api } from '@/lib/cliente';
import { salvarAluno } from '@/lib/useAluno';
import type { Aluno } from '@/lib/tipos';
import { Botao, Erro } from './Basicos';

export function CadastroAluno({ titulo, texto, aoConcluir }:
  { titulo: string; texto: string; aoConcluir?: (a: Aluno) => void }) {
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const a = await api.aluno(email, nome);
      salvarAluno(a);
      aoConcluir?.(a);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4 rounded-xl border border-linha bg-white p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{titulo}</h2>
        <p className="text-sm text-suave">{texto}</p>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Email
        <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
               className="min-h-11 rounded-lg border border-borda px-3 text-base font-normal" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nome
        <input type="text" required maxLength={120} autoComplete="name" value={nome} onChange={e => setNome(e.target.value)}
               className="min-h-11 rounded-lg border border-borda px-3 text-base font-normal" />
      </label>
      <p className="text-xs text-suave">
        Usamos o email só para guardar seu histórico de simulados. Mesmo email em outro aparelho, mesmo histórico.
      </p>
      {erro && <Erro>{erro}</Erro>}
      <Botao type="submit" disabled={enviando}>{enviando ? 'Salvando…' : 'Continuar'}</Botao>
    </form>
  );
}
