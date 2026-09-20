/**
 * Tabelas de DDD/DDI e a decomposição de um número em { ddi, pais, ddd, uf }.
 *
 * A tabela DDD -> UF é fixa e serve para dar contexto geográfico ao número. Com portabilidade
 * numérica o DDD indica a região onde o número foi emitido, não onde a pessoa está hoje.
 */
const DDD_UF = {
  11: "SP", 12: "SP", 13: "SP", 14: "SP", 15: "SP", 16: "SP", 17: "SP", 18: "SP", 19: "SP",
  21: "RJ", 22: "RJ", 24: "RJ",
  27: "ES", 28: "ES",
  31: "MG", 32: "MG", 33: "MG", 34: "MG", 35: "MG", 36: "MG", 37: "MG", 38: "MG",
  41: "PR", 42: "PR", 43: "PR", 44: "PR", 45: "PR", 46: "PR",
  47: "SC", 48: "SC", 49: "SC",
  51: "RS", 53: "RS", 54: "RS", 55: "RS",
  61: "DF",
  62: "GO", 64: "GO",
  63: "TO",
  65: "MT", 66: "MT",
  67: "MS",
  68: "AC",
  69: "RO",
  71: "BA", 73: "BA", 74: "BA", 75: "BA", 77: "BA",
  79: "SE",
  81: "PE", 87: "PE",
  82: "AL",
  83: "PB",
  84: "RN",
  85: "CE", 88: "CE",
  86: "PI", 89: "PI",
  91: "PA", 93: "PA", 94: "PA",
  92: "AM", 97: "AM",
  95: "RR",
  96: "AP",
  98: "MA", 99: "MA",
};

const DDI_PAIS = {
  1: "EUA/Canadá", 7: "Rússia/Cazaquistão", 20: "Egito", 27: "África do Sul",
  31: "Países Baixos", 32: "Bélgica", 33: "França", 34: "Espanha", 36: "Hungria",
  39: "Itália", 40: "Romênia", 41: "Suíça", 43: "Áustria", 44: "Reino Unido",
  45: "Dinamarca", 46: "Suécia", 47: "Noruega", 48: "Polônia", 49: "Alemanha",
  51: "Peru", 52: "México", 54: "Argentina", 55: "Brasil", 56: "Chile",
  57: "Colômbia", 58: "Venezuela", 60: "Malásia", 61: "Austrália", 62: "Indonésia",
  63: "Filipinas", 64: "Nova Zelândia", 65: "Singapura", 66: "Tailândia",
  81: "Japão", 82: "Coreia do Sul", 84: "Vietnã", 86: "China", 91: "Índia",
  92: "Paquistão", 234: "Nigéria", 244: "Angola", 258: "Moçambique",
  351: "Portugal", 352: "Luxemburgo", 353: "Irlanda", 354: "Islândia",
  358: "Finlândia", 380: "Ucrânia", 591: "Bolívia", 593: "Equador",
  595: "Paraguai", 598: "Uruguai",
};

/** Número no formato internacional sem símbolos -> { ddi, pais, ddd, uf }. */
function decomporNumero(numero) {
  const digitos = String(numero || "").replace(/\D/g, "");
  if (!digitos) return { ddi: "", pais: "", ddd: "", uf: "" };

  // Brasil: 55 + DDD(2) + 8 ou 9 dígitos = 12 ou 13 dígitos no total
  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) {
    const ddd = digitos.slice(2, 4);
    return { ddi: "55", pais: "Brasil", ddd, uf: DDD_UF[Number(ddd)] || "(?)" };
  }

  // fora do Brasil: tenta DDI de 3, 2 e 1 dígito, nessa ordem
  for (const tamanho of [3, 2, 1]) {
    const ddi = digitos.slice(0, tamanho);
    if (DDI_PAIS[Number(ddi)]) return { ddi, pais: DDI_PAIS[Number(ddi)], ddd: "", uf: "" };
  }
  return { ddi: digitos.slice(0, 3), pais: "(?)", ddd: "", uf: "" };
}

module.exports = { DDD_UF, DDI_PAIS, decomporNumero };
