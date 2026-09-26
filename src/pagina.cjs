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

    let chatGetters = null;
    try {
      chatGetters = window.require("WAWebChatGetters");
    } catch (e) {}
    let frontGetters = null;
    try {
      frontGetters = window.require("WAWebFrontendChatGetters");
    } catch (e) {}

    const chamar = (modulo, funcao, chat) => {
      try {
        return modulo && typeof modulo[funcao] === "function" ? modulo[funcao](chat) : undefined;
      } catch (e) {
        return undefined;
      }
    };

    const ler = (objeto, propriedade) => {
      try {
        return objeto ? objeto[propriedade] : undefined;
      } catch (e) {
        return undefined;
      }
    };

    let colecaoMetadados = null;

    const metadadosDe = (chat) => {
      const direto = ler(chat, "groupMetadata") || chamar(frontGetters, "getGroupMetadata", chat);
      if (direto) return direto;
      try {
        return (colecaoMetadados && colecaoMetadados.get(chat.id)) || null;
      } catch (e) {
        return null;
      }
    };

    const nomeDe = (chat) =>
      ler(chat, "name") ||
      chamar(chatGetters, "getName", chat) ||
      ler(chat, "formattedTitle") ||
      chamar(frontGetters, "getFormattedTitle", chat) ||
      ler(metadadosDe(chat), "subject") ||
      "";

    const contarParticipantes = (chat) => {
      const participantes = listaDe(ler(metadadosDe(chat), "participants"));
      return participantes ? participantes.length : 0;
    };

    const comLimite = async (pedido, ms) => {
      try {
        await Promise.race([pedido, new Promise((resolve) => setTimeout(resolve, ms))]);
      } catch (e) {}
    };

    const buscarMetadados = async (chat, atualizar) => {
      if (!colecaoMetadados) return;
      try {
        const usarUpdate = atualizar || typeof colecaoMetadados.find !== "function";
        await comLimite(usarUpdate ? colecaoMetadados.update(chat.id) : colecaoMetadados.find(chat.id), 8000);
      } catch (e) {}
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
      colecaoMetadados = colecao.GroupMetadata || colecao.WAWebGroupMetadataCollection || null;

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

      if (opcoes.modo === "listar") {
        const incompletos = grupos.filter((chat) => !nomeDe(chat) || contarParticipantes(chat) === 0);
        for (let i = 0; i < incompletos.length; i += 5) {
          await Promise.all(incompletos.slice(i, i + 5).map(buscarMetadados));
        }
      }

      const infos = grupos.map((chat) => ({
        nome: nomeDe(chat) || "(sem nome)",
        id: idDe(chat),
        comunidade: !!chat.isCommunity,
        participantes: contarParticipantes(chat),
      }));

      if (opcoes.modo === "listar") return { ok: true, grupos: infos };

      const alvo = normalizar(opcoes.grupo);
      const palavras = alvo.split(" ").filter(Boolean);
      const buscaPorId = (opcoes.grupo || "").includes("@");

      if (!alvo) return { erro: "GRUPO", grupos: infos };

      let chat = null;
      if (buscaPorId) chat = grupos.find((c) => idDe(c) === opcoes.grupo);
      if (!chat) chat = grupos.find((c) => normalizar(nomeDe(c)) === alvo);
      if (!chat) {
        chat = grupos.find((c) => {
          const nome = normalizar(nomeDe(c));
          return palavras.length > 0 && palavras.every((palavra) => nome.includes(palavra));
        });
      }
      if (!chat) chat = grupos.find((c) => normalizar(nomeDe(c)).includes(alvo));
      if (!chat) return { erro: "GRUPO", grupos: infos };

      await buscarMetadados(chat, true);

      const gm = metadadosDe(chat) || {};
      const participantesRaw = listaDe(gm.participants);
      if (!participantesRaw) {
        return {
          erro: "FORMATO",
          nome: nomeDe(chat),
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
          nome: nomeDe(chat),
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
