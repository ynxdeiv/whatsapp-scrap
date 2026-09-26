const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const config = require("./config.cjs");
const navegador = require("./navegador.cjs");
const saida = require("./saida.cjs");
const { lerNaPagina } = require("./pagina.cjs");
const { montarResumo, problemaNaLeitura } = require("./resumo.cjs");

const PASTA_GRUPOS = config.DIR_GRUPOS;
const TENTATIVAS_POR_GRUPO = 3;
const VIGIA_MS = 10000;
const FALHAS_ATE_CAIR = 3;

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const semAcento = (texto) =>
  String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const apelido = (grupo) => {
  const base = semAcento(grupo.nome)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const sufixo = String(grupo.jid || "").split("@")[0].slice(-6);
  return `${base || "grupo"}-${sufixo || "000000"}`;
};

function explicar(erro) {
  const texto = (erro && erro.message) || String(erro);
  if (/already running for/i.test(texto)) {
    return "Já existe um Chrome usando esse perfil (.wwebjs_auth/session). Feche o CLI ou a outra aba e tente de novo.";
  }
  if (/Failed to launch the browser process/i.test(texto)) {
    return "O Chrome não abriu. Se ele já estiver aberto com esse perfil, feche e tente de novo; senão aponte outro navegador em CHROME_PATH no .env.";
  }
  return texto;
}

async function gravarArquivos(dados, nome) {
  const arquivos = [];
  const avisos = [];

  const json = path.join(PASTA_GRUPOS, `${nome}.json`);
  const csv = path.join(PASTA_GRUPOS, `${nome}.csv`);
  saida.gravarJson(dados, json);
  saida.gravarCsv(dados.participantes, csv);
  arquivos.push({ formato: "json", caminho: json }, { formato: "csv", caminho: csv });

  const xlsx = path.join(PASTA_GRUPOS, `${nome}.xlsx`);
  try {
    const { gerarXlsx } = require("./planilha.cjs");
    await gerarXlsx(dados, xlsx);
    arquivos.push({ formato: "xlsx", caminho: xlsx });
  } catch (e) {
    avisos.push(`sem planilha (exceljs instalado?): ${(e && e.message) || e}`);
  }

  return { arquivos, avisos };
}

function criarSessao() {
  const ouvintes = new Set();
  const resultados = new Map();

  let browser = null;
  let page = null;
  let geracao = 0;
  let vigia = null;
  let filaAbertura = Promise.resolve();
  let status = "fechado";
  let motivo = null;
  let qr = null;
  let conversas = null;
  let versao = null;
  let grupos = [];
  let progresso = null;
  let baixando = null;

  function carregarDoDisco() {
    let nomes = [];
    try {
      nomes = fs.readdirSync(PASTA_GRUPOS).filter((nome) => nome.endsWith(".json"));
    } catch (e) {
      return;
    }

    for (const nome of nomes) {
      try {
        const nomeArquivo = nome.slice(0, -5);
        const dados = JSON.parse(fs.readFileSync(path.join(PASTA_GRUPOS, nome), "utf8"));
        const grupo = dados.grupo || {};
        if (!grupo.jid) continue;

        const arquivos = ["json", "csv", "xlsx"]
          .map((formato) => ({ formato, caminho: path.join(PASTA_GRUPOS, `${nomeArquivo}.${formato}`) }))
          .filter((arquivo) => fs.existsSync(arquivo.caminho));

        resultados.set(grupo.jid, {
          jid: grupo.jid,
          nomeArquivo,
          nome: grupo.nome,
          comunidade: grupo.comunidade,
          totalParticipantes: grupo.totalParticipantes,
          semNumero: grupo.semNumero,
          resumo: montarResumo(dados),
          arquivos,
          avisos: [],
        });
      } catch (e) {}
    }
  }

  carregarDoDisco();

  const instantaneo = () => ({
    status,
    motivo,
    qr,
    conversas,
    baixando,
    versao,
    logado: status === "pronto" || status === "extraindo",
    totalGrupos: grupos.length,
    progresso,
    resultados: [...resultados.values()].map((r) => ({
      jid: r.jid,
      nome: r.nome,
      comunidade: r.comunidade,
      totalParticipantes: r.totalParticipantes,
      semNumero: r.semNumero,
      resumo: r.resumo,
      formatos: r.arquivos.map((a) => a.formato),
      avisos: r.avisos,
    })),
  });

  const publicar = () => {
    const estado = instantaneo();
    for (const ouvinte of ouvintes) ouvinte(estado);
  };

  function aoMudar(ouvinte) {
    ouvintes.add(ouvinte);
    return () => ouvintes.delete(ouvinte);
  }

  function pararVigia() {
    if (vigia) clearInterval(vigia);
    vigia = null;
  }

  async function fecharNavegador() {
    pararVigia();
    const aberto = browser;
    browser = null;
    page = null;
    if (aberto) {
      try {
        await aberto.close();
      } catch (e) {}
    }
  }

  function limparEstado() {
    qr = null;
    conversas = null;
    versao = null;
    baixando = null;
    grupos = [];
  }

  async function desconectar() {
    geracao++;
    await fecharNavegador();
    limparEstado();
    motivo = null;
    status = "fechado";
    publicar();
    return instantaneo();
  }

  async function cair(minha, explicacao) {
    if (minha !== geracao) return;
    geracao++;
    await fecharNavegador();
    limparEstado();
    status = "erro";
    motivo = explicacao;
    publicar();
  }

  function vigiar(minha) {
    const aberto = browser;
    aberto.on("disconnected", () => {
      cair(minha, "O Chrome fechou. Clique em Conectar para abrir de novo.");
    });

    let falhas = 0;
    let checando = false;
    vigia = setInterval(async () => {
      if (checando || minha !== geracao || !page) return;
      checando = true;
      try {
        const estado = await navegador.estadoDaPagina(page);
        if (minha !== geracao) return;
        if (estado.erro) {
          falhas++;
          if (falhas >= FALHAS_ATE_CAIR) cair(minha, "A página do WhatsApp parou de responder. Clique em Conectar de novo.");
          return;
        }
        falhas = 0;
        if (estado.qr && (status === "pronto" || status === "extraindo")) {
          cair(minha, "O WhatsApp desconectou este aparelho. Clique em Conectar e escaneie o QR de novo.");
        }
      } finally {
        checando = false;
      }
    }, VIGIA_MS);
  }

  async function conectar() {
    if (status !== "fechado" && status !== "erro") return instantaneo();

    const minha = ++geracao;
    const parou = () => minha !== geracao;
    motivo = null;
    limparEstado();
    status = "abrindo";
    publicar();

    const anterior = filaAbertura;
    let liberar;
    filaAbertura = new Promise((resolve) => (liberar = resolve));

    let aberto;
    try {
      await anterior;
      if (parou()) return instantaneo();
      aberto = await navegador.abrirNavegador();
      if (parou()) {
        try {
          await aberto.browser.close();
        } catch (e) {}
        return instantaneo();
      }
      browser = aberto.browser;
      page = aberto.page;
      vigiar(minha);
    } catch (e) {
      if (parou()) return instantaneo();
      status = "erro";
      motivo = explicar(e);
      publicar();
      return instantaneo();
    } finally {
      liberar();
    }

    try {
      status = "aguardando-login";
      publicar();

      const login = await navegador.esperarLogin(page, {
        deveParar: parou,
        aoEstado: (estado) => {
          versao = estado.versao || versao;
          if (typeof estado.conversas === "number") conversas = estado.conversas;
          if (estado.bloqueio && !motivo) motivo = estado.bloqueio;
        },
        aoMudarQR: (ref) => {
          QRCode.toString(ref, { type: "svg", small: true, margin: 1 })
            .then((svg) => {
              if (parou() || status !== "aguardando-login") return;
              qr = svg;
              publicar();
            })
            .catch(() => {});
        },
      });

      if (parou()) return instantaneo();
      if (!login.logado) {
        await cair(minha, login.motivo);
        return instantaneo();
      }

      versao = login.versao;
      conversas = login.conversas;
      qr = null;
      status = "sincronizando";
      publicar();

      await navegador.esperarSincronizacao(page, {
        deveParar: parou,
        aoProgresso: (quantidade, percentual) => {
          conversas = quantidade;
          baixando = percentual;
          publicar();
        },
      });

      if (parou()) return instantaneo();
      baixando = null;

      const listagem = await lerNaPagina(page, { modo: "listar" });
      if (parou()) return instantaneo();
      grupos = ordenar(listagem.grupos);
      status = "pronto";
      publicar();
      return instantaneo();
    } catch (e) {
      await cair(minha, explicar(e));
      return instantaneo();
    }
  }

  async function lerComRetry(jid, parou) {
    let ultimoErro = null;
    for (let tentativa = 1; tentativa <= TENTATIVAS_POR_GRUPO; tentativa++) {
      if (parou()) break;
      if (tentativa > 1) await dormir(3000 * (tentativa - 1));
      try {
        const leitura = await lerNaPagina(page, { modo: "extrair", grupo: jid });
        if (leitura.erro === "FORMATO") throw Object.assign(new Error("formato inesperado na lista de participantes"), { definitivo: true });
        if (leitura.erro === "GRUPO") throw new Error("não achei mais esse grupo (saí dele?)");
        if (leitura.erro) throw new Error(leitura.mensagem || "erro ao ler o grupo");
        const problema = problemaNaLeitura(leitura.grupo);
        if (problema) throw new Error(problema);
        return leitura;
      } catch (e) {
        ultimoErro = e;
        if (e.definitivo) break;
      }
    }
    throw ultimoErro || new Error("extração cancelada");
  }

  function nomeDeArquivo(jid, grupo) {
    const anterior = resultados.get(jid);
    if (anterior) return anterior.nomeArquivo;

    const base = apelido(grupo);
    const usados = new Set([...resultados.values()].map((r) => r.nomeArquivo));
    if (!usados.has(base)) return base;

    let sufixo = 2;
    while (usados.has(`${base}-${sufixo}`)) sufixo += 1;
    return `${base}-${sufixo}`;
  }

  async function extrair(jids) {
    if (!page) throw new Error("a sessão não está conectada");
    if (status !== "pronto") throw new Error("já existe uma extração em andamento");
    if (!Array.isArray(jids) || jids.length === 0) throw new Error("nenhum grupo selecionado");

    const minha = geracao;
    const parou = () => minha !== geracao;
    status = "extraindo";
    progresso = { total: jids.length, feitos: 0, atual: null, erros: [] };
    publicar();

    const porJid = new Map(grupos.map((grupo) => [grupo.id, grupo]));

    try {
      for (const jid of jids) {
        if (parou()) break;
        const conhecido = porJid.get(jid) || { id: jid, nome: jid };
        progresso.atual = conhecido.nome;
        publicar();

        try {
          const leitura = await lerComRetry(jid, parou);
          const nome = nomeDeArquivo(jid, leitura.grupo);
          const dados = {
            geradoEm: new Date().toISOString(),
            whatsappWeb: versao,
            grupo: leitura.grupo,
            participantes: leitura.participantes,
          };

          const { arquivos, avisos } = await gravarArquivos(dados, nome);
          resultados.set(jid, {
            jid,
            nomeArquivo: nome,
            nome: leitura.grupo.nome,
            comunidade: leitura.grupo.comunidade,
            totalParticipantes: leitura.grupo.totalParticipantes,
            semNumero: leitura.grupo.semNumero,
            resumo: montarResumo(dados),
            arquivos,
            avisos,
          });
        } catch (e) {
          if (parou()) break;
          progresso.erros.push({
            jid,
            nome: conhecido.nome,
            mensagem: (e && e.message) || String(e),
          });
        }

        progresso.feitos++;
        publicar();
      }
    } finally {
      if (progresso) progresso.atual = null;
      if (!parou()) status = "pronto";
      publicar();
    }

    return instantaneo();
  }

  const ordenar = (lista) => [...(lista || [])].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  async function listarGrupos(atualizar) {
    if (atualizar && page && status === "pronto") {
      const minha = geracao;
      const listagem = await lerNaPagina(page, { modo: "listar" });
      if (minha === geracao && listagem.grupos) {
        grupos = ordenar(listagem.grupos);
        publicar();
      }
    }
    return grupos;
  }

  function arquivoDe(jid, formato) {
    const resultado = resultados.get(jid);
    if (!resultado) return null;
    const achado = resultado.arquivos.find((arquivo) => arquivo.formato === formato);
    return achado ? achado.caminho : null;
  }

  function fontes(jids) {
    const escolhidos = jids && jids.length ? jids : [...resultados.keys()];
    const lidas = [];
    for (const jid of escolhidos) {
      const json = arquivoDe(jid, "json");
      if (!json) continue;
      try {
        const dados = JSON.parse(fs.readFileSync(json, "utf8"));
        lidas.push({ jid, nomeArquivo: resultados.get(jid).nomeArquivo, geradoEm: dados.geradoEm, grupo: dados.grupo || {}, participantes: dados.participantes || [] });
      } catch (e) {}
    }
    return lidas;
  }

  function apagar(jid) {
    const resultado = resultados.get(jid);
    if (!resultado) return false;
    for (const arquivo of resultado.arquivos) {
      try {
        fs.unlinkSync(arquivo.caminho);
      } catch (e) {}
    }
    resultados.delete(jid);
    publicar();
    return true;
  }

  return {
    aoMudar,
    apagar,
    instantaneo,
    listarGrupos,
    arquivoDe,
    fontes,
    conectar,
    desconectar,
    extrair,
  };
}

module.exports = { criarSessao };
