const fs = require("fs");
const path = require("path");

function garantirPasta(arquivo) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
}

function gravarJson(dados, arquivo) {
  garantirPasta(arquivo);
  fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2));
}

function gravarCsv(participantes, arquivo) {
  garantirPasta(arquivo);
  const numeros = [...new Set(participantes.map((p) => p.numero).filter(Boolean))];
  fs.writeFileSync(arquivo, numeros.join("\n"));
  return numeros;
}

module.exports = { gravarJson, gravarCsv, garantirPasta };
