#!/usr/bin/env node
/**
 * ler_grupo.cjs — lê um grupo do WhatsApp e exporta JSON, CSV e XLSX.
 *
 * Fluxo: lê o WhatsApp UMA vez -> JSON (tudo) -> CSV (só números) e XLSX (planilha estilizada,
 * montada a partir do JSON). Para refazer a planilha sem reler o WhatsApp: `node gerar_xlsx.cjs`.
 *
 * Uso:
 *   node ler_grupo.cjs                            # headless; mostra o QR no terminal se precisar logar
 *   HEADLESS=0 node ler_grupo.cjs                 # abre janela do Chrome (escaneie o QR nela)
 *   GRUPO="Meu Grupo" node ler_grupo.cjs           # nome aproximado ou id 123@g.us
 *   LISTAR=1 node ler_grupo.cjs                   # só lista os grupos/comunidades e sai
 *   SEM_XLSX=1 node ler_grupo.cjs                 # só JSON + CSV
 *   DIAG=1 node ler_grupo.cjs                     # imprime diagnóstico da leitura
 *   CHROME_ARGS="--no-sandbox" node ler_grupo.cjs # flags extras pro Chrome (sandbox/container)
 *   SAIDA=./out JSON=./out/x.json node ler_grupo.cjs
 *
 * Sobre o whatsapp-web.js: ele NÃO é usado aqui de propósito. Na 1.34.7 (última publicada) a lib
 * está quebrada contra o WhatsApp Web atual — getChats() estoura porque o WhatsApp renomeou
 * MsgKey._serialized para $1, e a sessão sofre force-logout (execution context destroyed no
 * inject). A leitura aqui é feita direto na store da página, pelo mesmo caminho que a lib usaria.
 */
const config = require("./src/config.cjs");
const navegador = require("./src/navegador.cjs");
const { lerNaPagina } = require("./src/pagina.cjs");
const { montarResumo } = require("./src/resumo.cjs");
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

/** O sync pode não ter terminado na primeira tentativa: tenta de novo antes de desistir. */
async function lerGrupo(page, nome) {
  let resultado = await lerNaPagina(page, { modo: "extrair", grupo: nome });
  for (let tentativa = 1; resultado.erro === "GRUPO" && tentativa <= TENTATIVAS_GRUPO; tentativa++) {
    console.log(`  ainda não achei, tentando de novo em ${ESPERA_ENTRE_TENTATIVAS_MS / 1000}s (${tentativa}/${TENTATIVAS_GRUPO})...`);
    await dormir(ESPERA_ENTRE_TENTATIVAS_MS);
    resultado = await lerNaPagina(page, { modo: "extrair", grupo: nome });
  }
  return resultado;
}

/** Travas antes de gravar qualquer arquivo: nunca sobrescrever dados bons com leitura ruim. */
function problemaNaLeitura(grupo) {
  if (!grupo.totalParticipantes) return "li o grupo mas vieram 0 participantes (o groupMetadata não atualizou)";
  if (grupo.semNumero === grupo.totalParticipantes) return "todos os participantes vieram sem número";
  return null;
}

function imprimirResultado(grupo, contagens, arquivos) {
  console.log(`\nGrupo "${grupo.nome}" (${grupo.jid}${grupo.comunidade ? ", comunidade" : ""}):`);
  console.log(`  ${grupo.totalParticipantes} participantes, ${grupo.semNumero} sem número resolvível`);
  console.log(`  ${contagens.comNome} com nome (${contagens.comNomeAgenda} da agenda) · ${contagens.contatosSalvos} contatos salvos · ${contagens.admins} admins`);
  console.log(`  ${arquivos.numeros} números únicos -> ${config.ARQ_CSV}`);
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

    console.log(`Procurando o grupo: "${config.GRUPO}"`);
    const resultado = await lerGrupo(page, config.GRUPO);

    if (resultado.erro === "GRUPO") {
      console.log(`\nNão achei nenhum grupo que case com "${config.GRUPO}".`);
      imprimirGrupos(resultado.grupos, "Disponíveis");
      console.log("\nDica: use o nome exato, o id, ou LISTAR=1 para ver tudo.");
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
    imprimirResultado(resultado.grupo, montarResumo(dados), { numeros: numeros.length });

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
