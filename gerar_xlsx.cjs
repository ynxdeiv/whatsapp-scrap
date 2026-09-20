#!/usr/bin/env node
const fs = require("fs");
const config = require("./src/config.cjs");
const { gerarXlsx } = require("./src/planilha.cjs");

async function executar() {
  if (!fs.existsSync(config.ARQ_JSON)) {
    console.error(`Não achei ${config.ARQ_JSON}. Rode antes: node ler_grupo.cjs`);
    process.exitCode = 1;
    return;
  }

  const dados = JSON.parse(fs.readFileSync(config.ARQ_JSON, "utf8"));
  const { destino, linhas } = await gerarXlsx(dados, config.ARQ_XLSX);
  console.log(`Planilha escrita em ${destino} (${linhas} participantes)`);
}

executar().catch((e) => {
  console.error("FALHOU:", (e && e.stack) || e);
  process.exitCode = 1;
});
