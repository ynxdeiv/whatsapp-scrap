#!/usr/bin/env node
const config = require("./src/config.cjs");
const navegador = require("./src/navegador.cjs");
const { lerNaPagina } = require("./src/pagina.cjs");
const { montarResumo, problemaNaLeitura } = require("./src/resumo.cjs");
const saida = require("./src/saida.cjs");

const TENTATIVAS_GRUPO = 3;
const ESPERA_ENTRE_TENTATIVAS_MS = 15000;

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function imprimirGrupos(grupos, titulo) {
  console.log(`\n${titulo} (nome | id | tipo | participantes):`);
  for (const grupo of grupos) {
    const tipo = grupo.comunidade ? "comunidade" : "grupo";
    console.log(` - ${grupo.nome} | ${grupo.id} | ${tipo} | ${grupo.participantes}`);
  }
}

async function lerGrupo(page, nome) {
  let resultado = await lerNaPagina(page, { modo: "extrair", grupo: nome });
  const esperaSegundos = ESPERA_ENTRE_TENTATIVAS_MS / 1000;

  for (let tentativa = 1; resultado.erro === "GRUPO" && tentativa <= TENTATIVAS_GRUPO; tentativa++) {
    console.log(`  ainda não achei, tentando de novo em ${esperaSegundos}s (${tentativa}/${TENTATIVAS_GRUPO})...`);
    await dormir(ESPERA_ENTRE_TENTATIVAS_MS);
    resultado = await lerNaPagina(page, { modo: "extrair", grupo: nome });
  }

  return resultado;
}

function imprimirResultado(grupo, contagens, numeros) {
  const tipo = grupo.comunidade ? ", comunidade" : "";
  console.log(`\nGrupo "${grupo.nome}" (${grupo.jid}${tipo}):`);
  console.log(`  ${grupo.totalParticipantes} participantes, ${grupo.semNumero} sem número resolvível`);
  console.log(
    `  ${contagens.comNome} com nome (${contagens.comNomeAgenda} da agenda) · ${contagens.contatosSalvos} contatos salvos · ${contagens.admins} admins`
  );
  console.log(`  ${numeros} números únicos -> ${config.ARQ_CSV}`);
  console.log(`  dados completos -> ${config.ARQ_JSON}`);
}

function imprimirDiagnostico(resultado) {
  console.log("\n--- diagnóstico ---");
  console.log(JSON.stringify(resultado.diagnostico, null, 1));
}

async function gerarPlanilha(dados) {
  if (config.SEM_XLSX) return;

  try {
    const { gerarXlsx } = require("./src/planilha.cjs");
    await gerarXlsx(dados, config.ARQ_XLSX);
    console.log(`  planilha estilizada -> ${config.ARQ_XLSX}`);
  } catch (e) {
    console.log(`  não consegui gerar a planilha (exceljs instalado?): ${(e && e.message) || e}`);
  }
}

async function executar() {
  console.log(`Grupo: ${config.GRUPO}`);
  console.log(`Perfil: ${config.PERFIL}`);

  const { browser, page } = await navegador.abrirNavegador();

  try {
    const login = await navegador.esperarLogin(page);
    if (!login.logado) {
      console.log(`Não cheguei a um estado logado: ${login.motivo}.`);
      console.log("Se apareceu QR, escaneie e rode de novo.");
      process.exitCode = 2;
      return;
    }

    console.log(`Logado. WhatsApp Web ${login.versao}. Começando a sincronizar conversas...`);
    await navegador.esperarSincronizacao(page);

    if (config.LISTAR) {
      const { grupos } = await lerNaPagina(page, { modo: "listar" });
      imprimirGrupos(grupos, "Disponíveis");
      return;
    }

    const resultado = await lerGrupo(page, config.GRUPO);

    if (resultado.erro === "GRUPO") {
      console.log(`\nNão achei nenhum grupo que case com "${config.GRUPO}".`);
      imprimirGrupos(resultado.grupos, "Disponíveis");
      console.log("\nDica: ajuste GRUPO no .env (nome exato, aproximado ou id) ou rode com LISTAR=1.");
      process.exitCode = 3;
      return;
    }
    if (resultado.erro === "FORMATO") {
      console.log(`Achei "${resultado.nome}", mas não entendi o formato dos participantes:`);
      console.log(JSON.stringify(resultado.detalhe));
      process.exitCode = 5;
      return;
    }
    if (resultado.erro) {
      console.log("Erro ao ler o grupo:", resultado.mensagem);
      process.exitCode = 4;
      return;
    }

    const problema = problemaNaLeitura(resultado.grupo);
    if (problema) {
      console.log(`\nATENÇÃO: ${problema}.`);
      console.log("Nada foi gravado — seus arquivos anteriores continuam intactos.");
      if (config.DIAG) imprimirDiagnostico(resultado);
      process.exitCode = 7;
      return;
    }

    const dados = {
      geradoEm: new Date().toISOString(),
      whatsappWeb: login.versao,
      grupo: resultado.grupo,
      participantes: resultado.participantes,
    };

    saida.gravarJson(dados, config.ARQ_JSON);
    const numeros = saida.gravarCsv(resultado.participantes, config.ARQ_CSV);
    imprimirResultado(resultado.grupo, montarResumo(dados), numeros.length);

    await gerarPlanilha(dados);
    if (config.DIAG) imprimirDiagnostico(resultado);
  } finally {
    await browser.close();
  }
}

executar().catch((e) => {
  console.error("FALHOU:", (e && e.stack) || e);
  process.exitCode = 1;
});
