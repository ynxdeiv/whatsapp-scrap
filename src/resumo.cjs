function montarResumo(dados) {
  const participantes = dados.participantes || [];
  const contar = (filtro) => participantes.filter(filtro).length;
  const temNome = (p) => !!(p.nomeAgenda || p.notifyName || p.pushname || p.nomeParticipante);

  return {
    total: participantes.length,
    comNumero: contar((p) => !!p.numero),
    semNumero: contar((p) => !p.numero),
    numerosUnicos: new Set(participantes.map((p) => p.numero).filter(Boolean)).size,
    superadmins: contar((p) => p.papel === "superadmin"),
    admins: contar((p) => p.papel === "admin"),
    membros: contar((p) => p.papel === "membro"),
    contatosSalvos: contar((p) => p.contatoSalvo),
    comNome: contar(temNome),
    soNumero: contar((p) => !temNome(p)),
    comNomeAgenda: contar((p) => !!p.nomeAgenda),
    comNomePerfil: contar((p) => !!(p.notifyName || p.pushname)),
    business: contar((p) => p.business),
    enterprise: contar((p) => p.enterprise),
    bloqueados: contar((p) => p.bloqueado),
    silenciados: contar((p) => p.silenciado),
  };
}

function problemaNaLeitura(grupo) {
  if (!grupo.totalParticipantes) return "vieram 0 participantes — você ainda está nesse grupo? (se estiver, tente de novo em instantes)";
  if (grupo.semNumero === grupo.totalParticipantes) return "todos os participantes vieram sem número";
  return null;
}

module.exports = { montarResumo, problemaNaLeitura };
