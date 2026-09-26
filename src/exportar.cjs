const { decomporNumero } = require("./ddd.cjs");

const simOuVazio = (valor) => (valor ? "sim" : "");
const nomePerfil = (p) => p.notifyName || p.pushname || p.nomeParticipante || "";

const COLUNAS = [
  { chave: "grupo", titulo: "Grupo", valor: (p, grupo) => grupo.nome || "" },
  { chave: "numero", titulo: "Número", valor: (p) => p.numero || "" },
  { chave: "nomeAgenda", titulo: "Nome (agenda)", valor: (p) => p.nomeAgenda || "" },
  { chave: "nomePerfil", titulo: "Nome do perfil", valor: nomePerfil },
  { chave: "shortName", titulo: "Apelido curto", valor: (p) => p.shortName || "" },
  { chave: "papel", titulo: "Papel", valor: (p) => p.papel || "" },
  { chave: "contatoSalvo", titulo: "Contato salvo", valor: (p) => simOuVazio(p.contatoSalvo) },
  { chave: "ddd", titulo: "DDD", valor: (p) => decomporNumero(p.numero).ddd },
  { chave: "uf", titulo: "UF", valor: (p) => decomporNumero(p.numero).uf },
  { chave: "ddi", titulo: "DDI", valor: (p) => decomporNumero(p.numero).ddi },
  { chave: "pais", titulo: "País", valor: (p) => decomporNumero(p.numero).pais },
  { chave: "business", titulo: "Business", valor: (p) => simOuVazio(p.business) },
  { chave: "enterprise", titulo: "Enterprise", valor: (p) => simOuVazio(p.enterprise) },
  { chave: "bloqueado", titulo: "Bloqueado", valor: (p) => simOuVazio(p.bloqueado) },
  { chave: "silenciado", titulo: "Silenciado", valor: (p) => simOuVazio(p.silenciado) },
  { chave: "verifiedName", titulo: "Nome verificado", valor: (p) => p.verifiedName || "" },
  { chave: "lid", titulo: "LID", valor: (p) => p.lid || "" },
];

const PAPEIS = ["superadmin", "admin", "membro"];

function mascararNumero(numero) {
  const digitos = String(numero || "").replace(/\D/g, "");
  if (!digitos) return "";
  const fim = digitos.slice(-4);
  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) {
    return `+55 ${digitos.slice(2, 4)} ${digitos.slice(4, 5)}****-${fim}`;
  }
  return `+${digitos.slice(0, 3)}****${fim}`;
}

const MASCARAS = { numero: (valor) => mascararNumero(valor), lid: () => "" };

const lista = (texto) =>
  String(texto || "")
    .split(/[\s,;]+/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

function lerOpcoes(params) {
  const pedidas = lista(params.get("colunas")).map((c) => c.toLowerCase());
  const colunas = pedidas.length
    ? COLUNAS.filter((coluna) => pedidas.includes(coluna.chave.toLowerCase()))
    : COLUNAS;

  const papeis = lista(params.get("papeis")).map((p) => p.toLowerCase());

  return {
    colunas: colunas.length ? colunas : COLUNAS,
    papeis: papeis.length ? papeis.filter((p) => PAPEIS.includes(p)) : PAPEIS,
    ufs: lista(params.get("ufs")),
    ddds: lista(params.get("ddds")),
    comNome: params.get("comNome") === "1",
    salvos: params.get("salvos") === "1",
    comNumero: params.get("comNumero") === "1",
    unicos: params.get("unicos") === "1",
    separador: params.get("sep") === ";" ? ";" : ",",
    mascarar: params.get("mascarar") === "1",
    participantes: params.get("participantes") === "1",
  };
}

function montarLinhas(fontes, opcoes) {
  const vistos = new Set();
  const linhas = [];

  for (const { grupo, participantes } of fontes) {
    const ordenados = [...(participantes || [])].sort((a, b) =>
      String(a.numero || "~").localeCompare(String(b.numero || "~"))
    );

    for (const p of ordenados) {
      if (!opcoes.papeis.includes(p.papel || "membro")) continue;
      if (opcoes.comNumero && !p.numero) continue;
      if (opcoes.comNome && !(p.nomeAgenda || nomePerfil(p))) continue;
      if (opcoes.salvos && !p.contatoSalvo) continue;

      if (opcoes.ufs.length || opcoes.ddds.length) {
        const local = decomporNumero(p.numero);
        if (opcoes.ufs.length && !opcoes.ufs.includes(local.uf)) continue;
        if (opcoes.ddds.length && !opcoes.ddds.includes(local.ddd)) continue;
      }

      if (opcoes.unicos && p.numero) {
        if (vistos.has(p.numero)) continue;
        vistos.add(p.numero);
      }

      linhas.push(
        opcoes.colunas.map((coluna) => {
          const valor = coluna.valor(p, grupo || {});
          return opcoes.mascarar && MASCARAS[coluna.chave] ? MASCARAS[coluna.chave](valor) : valor;
        })
      );
    }
  }

  return linhas;
}

function celula(valor, separador) {
  const texto = valor === undefined || valor === null ? "" : String(valor);
  const perigo = texto.includes(separador) || /["\n\r]/.test(texto);
  return perigo ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function montarCsv(fontes, opcoes) {
  const linhas = montarLinhas(fontes, opcoes);
  const texto = [opcoes.colunas.map((coluna) => coluna.titulo), ...linhas]
    .map((linha) => linha.map((valor) => celula(valor, opcoes.separador)).join(opcoes.separador))
    .join("\r\n");
  return { csv: "﻿" + texto, total: linhas.length };
}

module.exports = { COLUNAS, PAPEIS, lerOpcoes, montarLinhas, montarCsv, mascararNumero };
