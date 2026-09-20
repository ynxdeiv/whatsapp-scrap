async function lerNaPagina(page, { modo, grupo }) {
  return page.evaluate(async (opcoes) => {
    const textoDeId = (valor) => {
      if (!valor) return "";
      if (typeof valor === "string") return valor;
      if (typeof valor._serialized === "string") return valor._serialized;
      if (valor.user && valor.server) return valor.user + "@" + valor.server;
      try {
        return String(valor);
      } catch (e) {
        return "";
      }
    };

    const listaDe = (colecao) => {
      if (!colecao) return null;
      if (Array.isArray(colecao)) return colecao;
      if (typeof colecao.getModelsArray === "function") return colecao.getModelsArray();
      if (typeof colecao.getModels === "function") return colecao.getModels();
      if (typeof colecao.length === "number") return Array.from(colecao);
      if (typeof colecao[Symbol.iterator] === "function") return [...colecao];
      return null;
    };

    const contarParticipantes = (chat) => {
      const participantes = listaDe(chat.groupMetadata && chat.groupMetadata.participants);
      return participantes ? participantes.length : 0;
    };

    const normalizar = (texto) =>
      (texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

    const idDe = (chat) => (chat.id && chat.id._serialized) || "";

    try {
      const colecao = window.require("WAWebCollections");
      const fabricaWid = window.require("WAWebWidFactory");

      let toPn = null;
      try {
        toPn = window.require("WAWebLidMigrationUtils").toPn;
      } catch (e) {}
      let getters = null;
      try {
        getters = window.require("WAWebContactGetters");
      } catch (e) {}

      const chats = colecao.Chat.getModelsArray
        ? colecao.Chat.getModelsArray()
        : colecao.Chat.getModels();

      const grupos = (chats || []).filter(
        (chat) => chat.isGroup || chat.isCommunity || idDe(chat).endsWith("@g.us")
      );

      const infos = grupos.map((chat) => ({
        nome: chat.name || chat.formattedTitle || "(sem nome)",
        id: idDe(chat),
        comunidade: !!chat.isCommunity,
        participantes: contarParticipantes(chat),
      }));

      if (opcoes.modo === "listar") return { ok: true, grupos: infos };

      const alvo = normalizar(opcoes.grupo);
      const palavras = alvo.split(" ").filter(Boolean);
      const buscaPorId = (opcoes.grupo || "").includes("@");

      let chat = null;
      if (buscaPorId) chat = grupos.find((c) => idDe(c).startsWith(opcoes.grupo.split("@")[0]));
      if (!chat) chat = grupos.find((c) => normalizar(c.name) === alvo || normalizar(c.formattedTitle) === alvo);
      if (!chat) {
        chat = grupos.find((c) => {
          const nome = normalizar(c.name) + " " + normalizar(c.formattedTitle);
          return palavras.length > 0 && palavras.every((palavra) => nome.includes(palavra));
        });
      }
      if (!chat) {
        chat = grupos.find((c) => normalizar(c.name).includes(alvo) || normalizar(c.formattedTitle).includes(alvo));
      }
      if (!chat) return { erro: "GRUPO", grupos: infos };

      try {
        const metadados = colecao.GroupMetadata || colecao.WAWebGroupMetadataCollection;
        await metadados.update(fabricaWid.createWid(chat.id._serialized));
      } catch (e) {}

      const gm = chat.groupMetadata || {};
      const participantesRaw = listaDe(gm.participants);
      if (!participantesRaw) {
        return {
          erro: "FORMATO",
          nome: chat.name || chat.formattedTitle,
          detalhe: {
            tipo: Object.prototype.toString.call(gm.participants),
            chaves: gm.participants ? Object.keys(gm.participants).slice(0, 25) : null,
          },
        };
      }

      const pegar = (objeto, getter, propriedade) => {
        if (!objeto) return "";
        try {
          if (getters && typeof getters[getter] === "function") {
            const valor = getters[getter](objeto);
            if (valor !== undefined && valor !== null) return valor;
          }
        } catch (e) {}
        try {
          const valor = objeto[propriedade];
          return valor === undefined || valor === null ? "" : valor;
        } catch (e) {
          return "";
        }
      };

      let contatos = [];
      try {
        contatos = colecao.Contact && colecao.Contact.getModelsArray ? colecao.Contact.getModelsArray() : [];
      } catch (e) {}

      const porId = new Map();
      for (const contato of contatos) {
        const chaves = [textoDeId(contato.id)];
        try {
          if (contato.phoneNumber) chaves.push(textoDeId(contato.phoneNumber));
        } catch (e) {}
        try {
          if (contato.lid) chaves.push(textoDeId(contato.lid));
        } catch (e) {}
        for (const chave of chaves) {
          if (chave && !porId.has(chave)) porId.set(chave, contato);
        }
      }

      const participantes = [];
      const amostraSemNome = [];
      let semNumero = 0;

      for (const bruto of participantesRaw) {
        const idOriginal = textoDeId(bruto && bruto.id);
        let idResolvido = (bruto && bruto.phoneNumber) || (bruto && bruto.id);
        if (textoDeId(idResolvido).endsWith("@lid") && toPn && bruto && bruto.id) {
          try {
            const convertido = toPn(bruto.id);
            if (convertido) idResolvido = convertido;
          } catch (e) {}
        }

        const textoResolvido = textoDeId(idResolvido);
        const ficouLid = textoResolvido.endsWith("@lid");
        const numero = ficouLid
          ? ""
          : String((idResolvido && idResolvido.user) || textoResolvido.split("@")[0]).replace(/\D/g, "");
        if (!numero) semNumero++;

        const contato = porId.get(textoResolvido) || porId.get(idOriginal) || null;
        const linha = {
          numero,
          lid: idOriginal.endsWith("@lid")
            ? idOriginal.split("@")[0]
            : contato && contato.lid
            ? textoDeId(contato.lid).split("@")[0]
            : "",
          nomeAgenda: String(pegar(contato, "getName", "name") || ""),
          pushname: String(pegar(contato, "getPushname", "pushname") || ""),
          notifyName: String(pegar(contato, "getNotifyName", "notify") || (bruto && bruto.notify) || ""),
          nomeParticipante: String((bruto && (bruto.name || bruto.notify || bruto.pushname)) || ""),
          shortName: String(pegar(contato, "getShortName", "shortName") || ""),
          verifiedName: String(pegar(contato, "getVerifiedName", "verifiedName") || ""),
          contatoSalvo: contato
            ? !!(
                pegar(contato, "getIsMyContact", "isMyContact") ||
                contato.isAddressBookContact ||
                contato.isSaved
              )
            : false,
          business: !!pegar(contato, "getIsBusiness", "isBusiness"),
          enterprise: !!pegar(contato, "getIsEnterprise", "isEnterprise"),
          bloqueado: contato
            ? contato.isContactBlocked === undefined
              ? !!pegar(contato, "getIsBlocked", "isBlocked")
              : !!contato.isContactBlocked
            : false,
          silenciado: !!pegar(contato, "getStatusMute", "statusMute"),
          papel: bruto && bruto.isSuperAdmin ? "superadmin" : bruto && bruto.isAdmin ? "admin" : "membro",
        };
        participantes.push(linha);

        const semNomeAlgum =
          !linha.nomeAgenda && !linha.notifyName && !linha.pushname && !linha.nomeParticipante;
        if (amostraSemNome.length < 3 && semNomeAlgum) {
          const valores = {};
          try {
            for (const campo of ["name", "notify", "pushname", "shortName", "verifiedName", "displayName", "searchName", "phoneNumber"]) {
              const valor = bruto ? bruto[campo] : undefined;
              valores[campo] = typeof valor === "string" ? valor : valor === undefined || valor === null ? "(vazio)" : String(valor);
            }
          } catch (e) {}
          amostraSemNome.push({
            id: idOriginal,
            chaves: bruto ? Object.keys(bruto).join(",") || "(nenhuma enumerável)" : "(sem objeto)",
            valores,
          });
        }
      }

      return {
        ok: true,
        grupo: {
          nome: chat.name || chat.formattedTitle,
          jid: idDe(chat),
          comunidade: !!chat.isCommunity,
          criador: gm.owner ? textoDeId(gm.owner) : "",
          criacaoISO: gm.creation ? new Date(gm.creation * 1000).toISOString() : "",
          descricao: gm.desc || "",
          somenteAdminsFalam: !!gm.announce,
          somenteAdminsEditam: !!gm.restrict,
          totalParticipantes: participantes.length,
          semNumero,
        },
        diagnostico: {
          temToPn: !!toPn,
          temGetters: !!getters,
          contatosIndexados: porId.size,
          conversas: (chats || []).length,
          exemploSemNome: amostraSemNome,
        },
        participantes,
      };
    } catch (e) {
      return { erro: "EXCECAO", mensagem: (e && (e.message || e.stack)) || String(e) };
    }
  }, { modo, grupo });
}

module.exports = { lerNaPagina };
