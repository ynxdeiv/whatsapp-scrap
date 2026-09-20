/**
 * Configuração central: variáveis de ambiente, caminhos e tempos.
 * Nenhum outro módulo lê `process.env` diretamente.
 */
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const DIR_SAIDA = process.env.SAIDA || path.join(RAIZ, "saida");

const envOu = (nome, padrao) => (process.env[nome] ? process.env[nome] : padrao);

module.exports = {
  RAIZ,
  DIR_SAIDA,

  /** Perfil do Chrome com a sessão do WhatsApp (contém credenciais: nunca vai pro git). */
  PERFIL: path.join(RAIZ, ".wwebjs_auth", "session"),

  /** Grupo alvo; aceita nome aproximado ou id `123@g.us`. */
  GRUPO: process.env.GRUPO || "Meu Grupo",

  ARQ_JSON: envOu("JSON", path.join(DIR_SAIDA, "membros_ic.json")),
  ARQ_CSV: envOu("CSV", path.join(DIR_SAIDA, "membros_ic.csv")),
  ARQ_XLSX: envOu("XLSX", path.join(DIR_SAIDA, "membros_ic.xlsx")),

  /** HEADLESS=0 abre janela (útil para escanear o QR na tela). */
  HEADLESS: process.env.HEADLESS !== "0",
  /** LISTAR=1 só lista os grupos e sai. */
  LISTAR: process.env.LISTAR === "1",
  /** DIAG=1 imprime diagnóstico da página (nomes, ids, formatos). */
  DIAG: process.env.DIAG === "1",
  /** SEM_XLSX=1 gera só JSON e CSV. */
  SEM_XLSX: process.env.SEM_XLSX === "1",
  /** CHROME_ARGS="--no-sandbox ..." repassa flags extras ao Chrome (sandbox/container). */
  ARGS_EXTRA: (process.env.CHROME_ARGS || "").split(/\s+/).filter(Boolean),

  ESPERA_LOGIN_MS: 5 * 60 * 1000,
  ESPERA_SYNC_MS: 90 * 1000,
};
