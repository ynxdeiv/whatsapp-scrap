const puppeteer = require("puppeteer-core");
const { acharChrome } = require("./navegador.cjs");
const { montarResumo } = require("./resumo.cjs");
const { decomporNumero } = require("./ddd.cjs");
const { montarLinhas, mascararNumero } = require("./exportar.cjs");

const esc = (valor) =>
  String(valor === undefined || valor === null ? "" : valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const numero = (valor) => Number(valor || 0).toLocaleString("pt-BR");

const dataBR = (iso) => {
  if (!iso) return "";
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "" : data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

const ESTILO = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1f2328; font-size: 11px; margin: 0; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 18px 0 8px; color: #1f3b4d; text-transform: uppercase; letter-spacing: .04em; }
  .sub { color: #656d76; margin: 0 0 14px; }
  .grupo { page-break-after: always; }
  .grupo:last-of-type { page-break-after: auto; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .card { border: 1px solid #d0d7de; border-radius: 8px; padding: 8px 10px; }
  .card b { display: block; font-size: 17px; font-variant-numeric: tabular-nums; }
  .card span { color: #656d76; font-size: 10px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #e5e8eb; }
  th { background: #1f3b4d; color: #fff; font-size: 9.5px; text-transform: uppercase; letter-spacing: .03em; }
  tr:nth-child(even) td { background: #f5f8fa; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .barra { background: #e5e8eb; border-radius: 3px; height: 8px; width: 100%; }
  .barra i { display: block; height: 8px; border-radius: 3px; background: #25a55f; }
  .aviso { margin-top: 16px; color: #656d76; font-size: 9px; border-top: 1px solid #d0d7de; padding-top: 6px; }
`;

function distribuicaoUF(participantes) {
  const contagem = new Map();
  let comNumero = 0;
  for (const p of participantes) {
    if (!p.numero) continue;
    comNumero++;
    const { uf, pais } = decomporNumero(p.numero);
    const chave = uf || pais || "(?)";
    contagem.set(chave, (contagem.get(chave) || 0) + 1);
  }
  return [...contagem.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([nome, quantidade]) => ({ nome, quantidade, parte: comNumero ? quantidade / comNumero : 0 }));
}

function secaoGrupo(fonte, opcoes) {
  const participantes = fonte.participantes || [];
  const grupo = fonte.grupo || {};
  const r = montarResumo({ participantes });
  const mostrarNumero = (valor) => (opcoes.mascarar ? mascararNumero(valor) : valor) || "(sem número)";

  const cards = [
    ["Participantes", r.total],
    ["Admins", r.admins + r.superadmins],
    ["Com nome", r.comNome],
    ["Contatos salvos", r.contatosSalvos],
    ["Números únicos", r.numerosUnicos],
    ["Sem número", r.semNumero],
    ["Business", r.business],
    ["Membros", r.membros],
  ]
    .map(([rotulo, valor]) => `<div class="card"><b>${numero(valor)}</b><span>${esc(rotulo)}</span></div>`)
    .join("");

  const ufs = distribuicaoUF(participantes)
    .map(
      (item) => `<tr><td>${esc(item.nome)}</td><td class="num">${numero(item.quantidade)}</td>
        <td class="num">${(item.parte * 100).toFixed(1).replace(".", ",")}%</td>
        <td style="width:45%"><div class="barra"><i style="width:${(item.parte * 100).toFixed(1)}%"></i></div></td></tr>`
    )
    .join("");

  const admins = participantes
    .filter((p) => p.papel === "admin" || p.papel === "superadmin")
    .map(
      (p) => `<tr><td>${esc(p.nomeAgenda || p.notifyName || p.pushname || p.nomeParticipante || "—")}</td>
        <td>${esc(mostrarNumero(p.numero))}</td><td>${esc(p.papel)}</td></tr>`
    )
    .join("");

  return `<section class="grupo">
    <h1>${esc(grupo.nome || "(sem nome)")}</h1>
    <p class="sub">${grupo.comunidade ? "comunidade · " : ""}extraído em ${esc(dataBR(fonte.geradoEm))}${
      grupo.criacaoISO ? ` · grupo criado em ${esc(dataBR(grupo.criacaoISO))}` : ""
    }</p>
    <div class="cards">${cards}</div>
    <h2>Distribuição por UF / país</h2>
    ${ufs ? `<table><thead><tr><th>UF / país</th><th class="num">Pessoas</th><th class="num">%</th><th></th></tr></thead><tbody>${ufs}</tbody></table>` : '<p class="sub">sem números para agrupar</p>'}
    <h2>Administradores</h2>
    ${admins ? `<table><thead><tr><th>Nome</th><th>Número</th><th>Papel</th></tr></thead><tbody>${admins}</tbody></table>` : '<p class="sub">nenhum admin identificado</p>'}
  </section>`;
}

function secaoParticipantes(fontes, opcoes) {
  const linhas = montarLinhas(fontes, opcoes);
  const cabecalho = opcoes.colunas.map((coluna) => `<th>${esc(coluna.titulo)}</th>`).join("");
  const corpo = linhas.map((linha) => `<tr>${linha.map((valor) => `<td>${esc(valor)}</td>`).join("")}</tr>`).join("");
  return `<section>
    <h1>Participantes</h1>
    <p class="sub">${numero(linhas.length)} ${linhas.length === 1 ? "linha" : "linhas"} com os filtros escolhidos${
      opcoes.mascarar ? " · números mascarados" : ""
    }</p>
    <table><thead><tr>${cabecalho}</tr></thead><tbody>${corpo}</tbody></table>
  </section>`;
}

function montarHtml(fontes, opcoes) {
  const grupos = fontes.map((fonte) => secaoGrupo(fonte, opcoes)).join("");
  const participantes = opcoes.participantes ? secaoParticipantes(fontes, opcoes) : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${ESTILO}</style></head>
    <body>${grupos}${participantes ? `<div style="page-break-before:always">${participantes}</div>` : ""}
    <p class="aviso">Gerado pelo whatsapp-scrap em ${esc(dataBR(new Date().toISOString()))}. Contém dados pessoais de terceiros — compartilhe só com quem precisa.</p>
    </body></html>`;
}

async function gerarPdf(fontes, opcoes) {
  const executavel = acharChrome();
  if (!executavel) throw new Error("Não achei Chrome, Edge, Brave nem Chromium para gerar o PDF.");

  const browser = await puppeteer.launch({ executablePath: executavel, headless: true, args: ["--no-first-run"] });
  try {
    const page = await browser.newPage();
    await page.setContent(montarHtml(fontes, opcoes), { waitUntil: "load" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate:
        '<div style="font-size:8px;color:#888;width:100%;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
  } finally {
    await browser.close();
  }
}

module.exports = { gerarPdf, montarHtml };
