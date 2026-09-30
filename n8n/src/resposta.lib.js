// Monta a resposta do 02-orquestrador para o chat. SEM gabarito, justificativa ou
// resolucao: regra 4 do CLAUDE.md. O gabarito fica em questao_versoes.
// Fonte do no Code "Montar resposta" do 02-orquestrador.

function montarResposta({ jobId, spec, fidelidade, resultados }) {
  const ok = resultados.filter(r => r.ok);
  const falhas = resultados.filter(r => !r.ok);
  const linhas = [];
  linhas.push(`Simulado gerado: ${ok.length} de ${resultados.length} questoes passaram na conferencia de contrato.`);
  linhas.push(`Job: ${jobId}`);
  if (spec.assumido?.length) linhas.push(`Assumido por omissao: ${spec.assumido.join('; ')}.`);
  const desvios = (fidelidade?.desvios ?? []).filter(d => d.nivel === 'assunto');
  if (desvios.length) {
    linhas.push(`Fidelidade ${fidelidade.score}. Desvios por restricao de texto:`);
    for (const d of desvios) linhas.push(`- ${d.assunto}: alvo ${d.alvo}, entregue ${d.entregue}`);
  }
  linhas.push('Estas questoes ainda NAO passaram pelos auditores (Fase 1). Nao entregar a aluno.');
  linhas.push('');

  let n = 0;
  for (const r of ok) {
    n += 1;
    const q = r.questao;
    linhas.push(`### Questao ${n} · ${r.slot.assunto} · ${r.slot.nivel}`);
    if (q.suporte.texto) linhas.push('', q.suporte.texto);
    if (q.suporte.tabela_md) linhas.push('', q.suporte.tabela_md);
    linhas.push('', `#FONTE: ${q.suporte.fonte}`, '', q.enunciado, '');
    for (const a of q.alternativas) linhas.push(`${a.letra}) ${a.texto}`);
    linhas.push('');
  }
  if (falhas.length) {
    linhas.push('### Slots que nao fecharam');
    for (const r of falhas) linhas.push(`- ${r.slot.slot_id} (${r.slot.assunto}): ${r.problemas.join('; ')}`);
    linhas.push('');
  }
  linhas.push(`Gabarito e resolucao ficam fora do chat, em questao_versoes (job ${jobId}).`);
  return linhas.join('\n');
}
