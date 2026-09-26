const path = require("path");

const RAIZ = path.join(__dirname, "..");

require("dotenv").config({ path: path.join(RAIZ, ".env"), quiet: true });

const naRaiz = (valor) => (path.isAbsolute(valor) ? valor : path.resolve(RAIZ, valor));

const DIR_SAIDA = naRaiz(process.env.SAIDA || "saida");

module.exports = {
  RAIZ,
  DIR_SAIDA,
  DIR_GRUPOS: path.join(DIR_SAIDA, "grupos"),
  PERFIL: naRaiz(process.env.PERFIL || path.join(".wwebjs_auth", "session")),
  CHROME_PATH: process.env.CHROME_PATH || null,
  GRUPO: process.env.GRUPO || "Meu Grupo",
  ARQ_JSON: naRaiz(process.env.JSON || path.join(DIR_SAIDA, "membros_ic.json")),
  ARQ_CSV: naRaiz(process.env.CSV || path.join(DIR_SAIDA, "membros_ic.csv")),
  ARQ_XLSX: naRaiz(process.env.XLSX || path.join(DIR_SAIDA, "membros_ic.xlsx")),
  HEADLESS: process.env.HEADLESS === "shell" ? "shell" : process.env.HEADLESS !== "0",
  PORTA: Number(process.env.PORTA || 4173),
  ABRIR_NAVEGADOR: process.env.ABRIR_NAVEGADOR !== "0",
  LISTAR: process.env.LISTAR === "1",
  DIAG: process.env.DIAG === "1",
  SEM_XLSX: process.env.SEM_XLSX === "1",
  ARGS_EXTRA: (process.env.CHROME_ARGS || "").split(/\s+/).filter(Boolean),
  ESPERA_LOGIN_MS: 5 * 60 * 1000,
  ESPERA_SYNC_MS: 90 * 1000,
  ESPERA_DOWNLOAD_MS: 15 * 60 * 1000,
};
