import { lerImagemLocal } from '@/lib/demo';
import { modoDemonstracao } from '@/lib/n8n';

/** Clone novo nao tem os recortes (ficam fora do git): mostra um cartao no lugar. */
function semRecorte(id: string, largura: number, altura: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}">
<rect width="100%" height="100%" fill="#F3F5F8" stroke="#C4CBD6" stroke-dasharray="8 6"/>
<text x="50%" y="46%" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" fill="#3A414C">${id}</text>
<text x="50%" y="54%" text-anchor="middle" font-family="system-ui,sans-serif" font-size="16" fill="#59616E">recorte fora do git: rode scripts/banco/extrair_questoes.py</text>
</svg>`;
  return new Response(svg, { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' } });
}

/** So no modo demonstracao sem S3: serve o recorte de data/banco/img. */
export async function GET(req: Request) {
  if (!modoDemonstracao()) return new Response('Não encontrado', { status: 404 });
  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? '';
  const png = await lerImagemLocal(id);
  if (!png) {
    if (!/^\d{4}_D[12]_Q\d{3}(_in|_es)?$/.test(id)) return new Response('Não encontrado', { status: 404 });
    const dim = (k: string, padrao: number) => Math.min(2000, Math.max(100, Number(url.searchParams.get(k)) || padrao));
    return semRecorte(id, dim('l', 528), dim('a', 400));
  }
  return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' } });
}
