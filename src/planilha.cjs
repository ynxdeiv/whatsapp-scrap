/**
 * Gera a planilha estilizada (exceljs) a partir do JSON de saída.
 * Três abas: Participantes, Resumo e Por DDD-UF.
 */
const { decomporNumero } = require("./ddd.cjs");
const { montarResumo } = require("./resumo.cjs");

const COR_CABECALHO = "FF1F3B4D";
const COR_ZEBRA = "FFF2F7FA";

const COLUNAS_PARTICIPANTES = [
  { header: "#", key: "indice", largura: 6 },
  { header: "Número", key: "numero", largura: 16 },
  { header: "Nome (agenda)", key: "nomeAgenda", largura: 28 },
  { header: "Nome do perfil", key: "nomePerfil", largura: 24 },
  { header: "Apelido curto", key: "shortName", largura: 16 },
  { header: "Papel no grupo", key: "papel", largura: 14 },
  { header: "É contato salvo", key: "contatoSalvo", largura: 14 },
  { header: "DDD", key: "ddd", largura: 7 },
  { header: "UF", key: "uf", largura: 6 },
  { header: "DDI", key: "ddi", largura: 6 },
  { header: "País", key: "pais", largura: 14 },
  { header: "Business", key: "business", largura: 10 },
  { header: "Enterprise", key: "enterprise", largura: 11 },
  { header: "Bloqueado", key: "bloqueado", largura: 10 },
  { header: "Silenciado", key: "silenciado", largura: 11 },
  { header: "Nome verificado", key: "verifiedName", largura: 22 },
  { header: "LID", key: "lid", largura: 18 },
];

function estilizarCabecalho(aba, colunas) {
  const cabecalho = aba.getRow(1);
  cabecalho.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  cabecalho.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_CABECALHO } };
  cabecalho.alignment = { vertical: "middle" };
  cabecalho.height = 24;
  aba.columns.forEach((coluna, indice) => {
    coluna.width = colunas[indice].largura;
  });
  aba.autoFilter = { from: "A1", to: `${colunaFinal(aba)}1` };
}

function colunaFinal(aba) {
  return String.fromCharCode("A".charCodeAt(0) + aba.columns.length - 1);
}

function pintarZebra(linha) {
  linha.eachCell((celula) => {
    celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_ZEBRA } };
  });
}

/** Números válidos vêm primeiro, em ordem numérica; quem não tem número vai para o fim. */
function ordenarPorNumero(participantes) {
  return [...participantes].sort((a, b) => {
    const valorA = a.numero ? Number(a.numero) : Number.POSITIVE_INFINITY;
    const valorB = b.numero ? Number(b.numero) : Number.POSITIVE_INFINITY;
    return valorA - valorB;
  });
}

function montarAbaParticipantes(wb, linhas) {
  const aba = wb.addWorksheet("Participantes", { views: [{ state: "frozen", ySplit: 1 }] });
  aba.columns = COLUNAS_PARTICIPANTES.map(({ header, key }) => ({ header, key }));
  estilizarCabecalho(aba, COLUNAS_PARTICIPANTES);

  ordenarPorNumero(linhas).forEach((p, indice) => {
    const linha = aba.addRow({
      indice: indice + 1,
      numero: p.numero || "(sem número)",
      nomeAgenda: p.nomeAgenda || "",
      nomePerfil: p.notifyName || p.pushname || p.nomeParticipante || "",
      shortName: p.shortName || "",
      papel: p.papel || "",
      contatoSalvo: p.contatoSalvo ? "sim" : "",
      ddd: p.ddd || "",
      uf: p.uf || "",
      ddi: p.ddi || "",
      pais: p.pais || "",
      business: p.business ? "sim" : "",
      enterprise: p.enterprise ? "sim" : "",
      bloqueado: p.bloqueado ? "sim" : "",
      silenciado: p.silenciado ? "sim" : "",
      verifiedName: p.verifiedName || "",
      lid: p.lid || "",
    });

    if (indice % 2 === 1) pintarZebra(linha);
    if (p.papel === "admin") linha.getCell("papel").font = { bold: true, color: { argb: "FFB26B00" } };
    if (p.papel === "superadmin") linha.getCell("papel").font = { bold: true, color: { argb: "FFB00020" } };
  });
  return aba;
}

function montarAbaResumo(wb, dados, contagens, estados, ddds) {
  const grupo = dados.grupo || {};
  const sim = (valor) => (valor ? "sim" : "não");

  const linhas = [
    ["Grupo", grupo.nome || ""],
    ["JID", grupo.jid || ""],
    ["É comunidade/subgrupo", sim(grupo.comunidade)],
    ["Criador", grupo.criador || ""],
    ["Criado em", grupo.criacaoISO || ""],
    ["Descrição", grupo.descricao || ""],
    ["Só admins falam", sim(grupo.somenteAdminsFalam)],
    ["Só admins editam info", sim(grupo.somenteAdminsEditam)],
    ["", ""],
    ["Participantes (linhas)", contagens.total],
    ["Superadmins", contagens.superadmins],
    ["Admins", contagens.admins],
    ["Membros", contagens.membros],
    ["Com número resolvido", contagens.comNumero],
    ["Sem número resolvível (só LID)", contagens.semNumero],
    ["Números únicos", contagens.numerosUnicos],
    ["Estão na sua agenda", contagens.contatosSalvos],
    ["Com nome (agenda ou perfil)", contagens.comNome],
    ["Só número, sem nome", contagens.soNumero],
    ["Contas business", contagens.business],
    ["Contas enterprise", contagens.enterprise],
    ["Bloqueados por você", contagens.bloqueados],
    ["Silenciados", contagens.silenciados],
    ["Estados (UF) distintos", estados],
    ["DDDs distintos", ddds],
    ["", ""],
    ["Leitura feita em", dados.geradoEm || ""],
    ["WhatsApp Web", dados.whatsappWeb || ""],
  ];

  const aba = wb.addWorksheet("Resumo", { views: [{ state: "frozen", ySplit: 1 }] });
  aba.columns = [
    { header: "Item", key: "item", width: 38 },
    { header: "Valor", key: "valor", width: 46 },
  ];
  estilizarCabecalho(aba, [{ largura: 38 }, { largura: 46 }]);

  for (const [item, valor] of linhas) {
    const linha = aba.addRow({ item, valor });
    if (item) linha.getCell("item").font = { bold: true };
  }
  return aba;
}

function montarAbaPorDdd(wb, linhas) {
  const contagem = new Map();
  for (const p of linhas) {
    const chave = `${p.ddd || "(?)"}|${p.uf || "(?)"}`;
    contagem.set(chave, (contagem.get(chave) || 0) + 1);
  }

  const aba = wb.addWorksheet("Por DDD-UF", { views: [{ state: "frozen", ySplit: 1 }] });
  aba.columns = [
    { header: "DDD", key: "ddd", width: 10 },
    { header: "UF", key: "uf", width: 10 },
    { header: "Participantes", key: "quantidade", width: 16 },
    { header: "% do grupo", key: "porcentagem", width: 14 },
  ];
  estilizarCabecalho(aba, [{ largura: 10 }, { largura: 10 }, { largura: 16 }, { largura: 14 }]);

  const total = linhas.length || 1;
  const ordenado = [...contagem.entries()].sort((a, b) => b[1] - a[1]);
  ordenado.forEach(([chave, quantidade], indice) => {
    const [ddd, uf] = chave.split("|");
    const linha = aba.addRow({ ddd, uf, quantidade, porcentagem: quantidade / total });
    linha.getCell("porcentagem").numFmt = "0.0%";
    if (indice % 2 === 1) pintarZebra(linha);
  });
  return aba;
}

async function gerarXlsx(dados, destino) {
  const ExcelJS = require("exceljs");

  const linhas = (dados.participantes || []).map((p) => ({ ...p, ...decomporNumero(p.numero) }));
  const contagens = montarResumo(dados);
  const estados = new Set(linhas.map((p) => p.uf).filter(Boolean)).size;
  const ddds = new Set(linhas.map((p) => p.ddd).filter(Boolean)).size;

  const wb = new ExcelJS.Workbook();
  wb.creator = "ler_grupo.cjs";
  wb.created = new Date();

  montarAbaParticipantes(wb, linhas);
  montarAbaResumo(wb, dados, contagens, estados, ddds);
  montarAbaPorDdd(wb, linhas);

  await wb.xlsx.writeFile(destino);
  return { destino, linhas: linhas.length };
}

module.exports = { gerarXlsx };
