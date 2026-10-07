// Gera as paginas HTML do MVP: a prova (layout B: caderno corrido + cartao-resposta) e o
// gabarito (pagina separada: regra 4 do CLAUDE.md). O n8n devolve o HTML direto ao navegador;
// o botao "Salvar PDF" usa a impressao do navegador.

const NOME_AREA = { LC: 'Linguagens, Códigos e suas Tecnologias', CH: 'Ciências Humanas e suas Tecnologias',
                    CN: 'Ciências da Natureza e suas Tecnologias', MT: 'Matemática e suas Tecnologias' };

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function tituloDoPedido(p) {
  if (p.tipo === 'oficial') return p.dia ? `Simulado oficial · ${p.dia}º dia` : 'Simulado oficial completo';
  return 'Simulado personalizado';
}

const ESTILO = `
:root{--tinta:#15191F;--suave:#59616E;--linha:#DDE2EA;--fundo:#FFFFFF;--destaque:#1D4ED8}
*{box-sizing:border-box}
body{margin:0;background:var(--fundo);color:var(--tinta);font:16px/1.5 "IBM Plex Sans",system-ui,sans-serif}
a{color:var(--destaque)}
.topo{border-bottom:1px solid var(--linha);padding:16px 24px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 24px}
.topo h1{margin:0;font-size:22px}
.topo .info{color:var(--suave);font-size:14px;flex:1 1 280px}
.botao{min-height:44px;padding:0 18px;border-radius:8px;border:0;background:var(--tinta);color:#fff;font:600 15px inherit;font-family:inherit;cursor:pointer}
.grade{max-width:1240px;margin:0 auto;padding:24px;display:flex;flex-wrap:wrap;gap:32px;align-items:flex-start}
main{flex:999 1 560px;min-width:0}
.instrucoes{background:#F3F5F8;border-radius:10px;padding:14px 18px;font-size:14px;color:#3A414C;margin-bottom:28px}
h2.area{font-size:15px;letter-spacing:.04em;text-transform:uppercase;color:var(--suave);border-bottom:2px solid var(--tinta);padding-bottom:6px;margin:36px 0 20px}
.questao{border-bottom:1px solid #E3E7EE;padding-bottom:28px;margin-bottom:28px;break-inside:avoid}
.questao h3{margin:0 0 10px;font-size:16px}
.questao img{display:block;max-width:100%;height:auto}
.bolhas{display:flex;gap:10px;margin-top:14px;align-items:center}
.bolhas span{width:34px;height:34px;border:1.5px solid #6B7380;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px}
aside{flex:1 1 280px;position:sticky;top:16px;border:1px solid var(--linha);border-radius:12px;padding:18px}
aside h2{margin:0 0 4px;font-size:16px}
aside p{margin:0 0 12px;color:var(--suave);font-size:13px}
.mapa{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
.mapa a{display:flex;align-items:center;justify-content:center;min-height:34px;border:1px solid #C4CBD6;border-radius:6px;text-decoration:none;color:#3A414C;font:500 13px "IBM Plex Mono",monospace}
.cartao{display:none}
.rodape{max-width:1240px;margin:0 auto;padding:8px 24px 40px;color:var(--suave);font-size:13px}
@media (max-width:860px){aside{position:static}}
@media print{
  @page{margin:12mm}
  .topo .botao,aside,.instrucoes .tela{display:none}
  .grade{display:block;padding:0}
  /* Duas colunas, como o caderno do ENEM: o recorte ja tem a largura da coluna original.
     Questao de pagina inteira ocupa as duas. */
  main{columns:2;column-gap:22px}
  .instrucoes,h2.area,.questao.larga,.cartao{column-span:all}
  .questao img{width:100%!important}
  .bolhas span{width:26px;height:26px;font-size:12px}
  .topo{padding:0 0 10px}
  .questao{padding-bottom:16px;margin-bottom:16px}
  .cartao{display:block;break-before:page}
  .cartao h2{font-size:18px;margin:0 0 4px}
  .cartao .linhas{columns:3;column-gap:24px;margin-top:14px}
  .cartao .linha{display:flex;align-items:center;gap:6px;break-inside:avoid;margin-bottom:7px;font:500 12px "IBM Plex Mono",monospace}
  .cartao .linha b{width:26px;text-align:right}
  .cartao .linha i{width:18px;height:18px;border:1px solid #444;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-style:normal;font-size:9px}
  a{color:inherit;text-decoration:none}
}`;

function paginaProva(simulado, urlGabarito) {
  const p = simulado.pedido;
  const qs = simulado.questoes;
  const areas = [...new Set(qs.map(q => q.area))];
  const corpo = areas.map(area => {
    const daArea = qs.filter(q => q.area === area);
    return `<h2 class="area">${esc(NOME_AREA[area] ?? area)} · questões ${daArea[0].numero} a ${daArea[daArea.length - 1].numero}</h2>
${daArea.map(q => `<article class="questao${q.largura > 800 ? ' larga' : ''}" id="q${q.numero}">
  <h3>Questão ${q.numero}</h3>
  <img src="${esc(q.imagem_url)}" alt="Questão ${q.numero}" width="${Math.round(q.largura * 0.75)}" loading="eager">
  <div class="bolhas" aria-hidden="true"><span>A</span><span>B</span><span>C</span><span>D</span><span>E</span></div>
</article>`).join('\n')}`;
  }).join('\n');
  const mapa = qs.map(q => `<a href="#q${q.numero}">${q.numero}</a>`).join('');
  const cartao = qs.map(q => `<div class="linha"><b>${q.numero}</b>${'ABCDE'.split('').map(l => `<i>${l}</i>`).join('')}</div>`).join('');
  const lingua = qs.some(q => q.disciplina === 'Lingua estrangeira') ? ` · língua estrangeira: ${p.lingua === 'espanhol' ? 'espanhol' : 'inglês'}` : '';
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(tituloDoPedido(p))}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">
<style>${ESTILO}</style>
</head>
<body>
<header class="topo">
  <h1>${esc(tituloDoPedido(p))}</h1>
  <span class="info">${qs.length} questões reais do ENEM (2019 a 2025)${lingua} · código ${esc(String(simulado.simulado_id).slice(0, 8))}</span>
  <button class="botao" type="button" onclick="window.print()">Salvar PDF / Imprimir</button>
</header>
<div class="grade">
<main>
  <div class="instrucoes">Marque suas respostas no cartão-resposta${'<span class="tela"> (ao imprimir, ele vai na última página)</span>'}. O gabarito fica em um link separado, no fim da prova: confira só depois de terminar.</div>
${corpo}
  <section class="cartao">
    <h2>Cartão-resposta</h2>
    <span>Nome: ______________________________________ · código ${esc(String(simulado.simulado_id).slice(0, 8))}</span>
    <div class="linhas">${cartao}</div>
  </section>
</main>
<aside aria-label="Ir para a questão">
  <h2>Questões</h2>
  <p>Toque no número para ir até a questão.</p>
  <nav class="mapa">${mapa}</nav>
</aside>
</div>
<footer class="rodape">Gabarito deste simulado: <a href="${esc(urlGabarito)}">${esc(urlGabarito)}</a></footer>
</body>
</html>`;
}

function paginaGabarito(g) {
  const linhas = g.itens.map(i => `<tr><td>${i.numero}</td><td><b>${esc(i.gabarito)}</b></td><td>${esc(i.area)}</td><td>${esc(i.disciplina)}</td><td>ENEM ${esc(i.ano)} · Q${esc(i.numero_original)}</td></tr>`).join('\n');
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gabarito · ${esc(tituloDoPedido(g.pedido))}</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&display=swap" rel="stylesheet">
<style>
body{margin:0;font:15px/1.5 "IBM Plex Sans",system-ui,sans-serif;color:#15191F;background:#fff}
.caixa{max-width:860px;margin:0 auto;padding:24px}
h1{font-size:22px;margin:0 0 4px}
p{color:#59616E;margin:0 0 18px;font-size:14px}
.tabela{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{border-bottom:1px solid #DDE2EA;padding:7px 10px;text-align:left}
th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#59616E}
button{min-height:44px;padding:0 18px;border-radius:8px;border:0;background:#15191F;color:#fff;font:600 15px inherit;cursor:pointer;margin-bottom:16px}
@media print{button{display:none}}
</style>
</head>
<body>
<div class="caixa">
  <h1>Gabarito oficial · ${esc(tituloDoPedido(g.pedido))}</h1>
  <p>Código ${esc(String(g.simulado_id).slice(0, 8))} · ${g.itens.length} questões · respostas oficiais do INEP.</p>
  <button type="button" onclick="window.print()">Salvar PDF / Imprimir</button>
  <div class="tabela"><table>
    <thead><tr><th>Nº</th><th>Resposta</th><th>Área</th><th>Disciplina</th><th>Origem</th></tr></thead>
    <tbody>${linhas}</tbody>
  </table></div>
</div>
</body>
</html>`;
}
