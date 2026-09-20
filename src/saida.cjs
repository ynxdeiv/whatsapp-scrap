/**
 * Escrita dos arquivos de saída (JSON e CSV). Não conhece nada de WhatsApp.
 */
const fs = require("fs");
const path = require("path");

function garantirPasta(arquivoOuPasta) {
  fs.mkdirSync(path.dirname(arquivoOuPasta), { recursive: true });
}

function gravarJson(dados, arquivo) {
  garantirPasta(arquivo);
  fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2));
}

/** Um número por linha, sem repetir (o mesmo formato desde o primeiro script). */
function gravarCsv(participantes, arquivo) {
  garantirPasta(arquivo);
  const numeros = [...new Set(participantes.map((p) => p.numero).filter(Boolean))];
  fs.writeFileSync(arquivo, numeros.join("\n"));
  return numeros;
}

module.exports = { gravarJson, gravarCsv, garantirPasta };
