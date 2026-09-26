const fs = require("fs");
const path = require("path");
const http = require("http");

const exportar = require("./exportar.cjs");
const { gerarPdf } = require("./pdf.cjs");

const WWW = path.join(__dirname, "www");
const LIMITE_CORPO = 1024 * 1024;
const BATIDA_MS = 25000;

const ESTATICOS = {
  "/": { arquivo: "index.html", tipo: "text/html; charset=utf-8" },
  "/index.html": { arquivo: "index.html", tipo: "text/html; charset=utf-8" },
  "/app.js": { arquivo: "app.js", tipo: "text/javascript; charset=utf-8" },
  "/estilo.css": { arquivo: "estilo.css", tipo: "text/css; charset=utf-8" },
};

const TIPOS_ARQUIVO = {
  json: "application/json; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const HOSTS_LOCAIS = ["127.0.0.1", "localhost", "::1"];

function semBarras(host) {
  return String(host || "").replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
}

function origemPermitida(req) {
  const nome = semBarras(req.headers.host);
  if (!HOSTS_LOCAIS.includes(nome)) return false;
  const origem = req.headers.origin;
  if (!origem) return true;
  try {
    return semBarras(new URL(origem).hostname) === nome;
  } catch (e) {
    return false;
  }
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const pedacos = [];
    req.on("data", (pedaco) => {
      total += pedaco.length;
      if (total > LIMITE_CORPO) {
        reject(new Error("corpo grande demais"));
        req.destroy();
        return;
      }
      pedacos.push(pedaco);
    });
    req.on("error", reject);
    req.on("end", () => {
      const texto = Buffer.concat(pedacos).toString("utf8").trim();
      if (!texto) return resolve({});
      try {
        resolve(JSON.parse(texto));
      } catch (e) {
        reject(new Error("corpo não é JSON válido"));
      }
    });
  });
}

function criarServidor(sessao) {
  const assinantes = new Set();

  const enviarEvento = (res, evento, dados) => {
    res.write(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`);
  };

  const publicarEstado = (estado) => {
    for (const res of assinantes) enviarEvento(res, "estado", estado);
  };

  const responder = (res, codigo, tipo, corpo, extra = {}) => {
    const buffer = Buffer.isBuffer(corpo) ? corpo : Buffer.from(corpo, "utf8");
    res.writeHead(codigo, {
      "content-type": tipo,
      "content-length": buffer.length,
      "cache-control": "no-store",
      ...extra,
    });
    res.end(buffer);
  };

  const responderJson = (res, codigo, dados) =>
    responder(res, codigo, "application/json; charset=utf-8", JSON.stringify(dados));

  const servirEstatico = (res, item) => {
    try {
      responder(res, 200, item.tipo, fs.readFileSync(path.join(WWW, item.arquivo)));
    } catch (e) {
      responderJson(res, 500, { erro: `não consegui ler ${item.arquivo}` });
    }
  };

  async function tratar(req, res) {
    if (!origemPermitida(req)) {
      responderJson(res, 403, { erro: "requisição de outra origem" });
      return;
    }

    const url = new URL(req.url, "http://localhost");
    const rota = url.pathname;
    const metodo = req.method || "GET";

    if (metodo === "GET" && ESTATICOS[rota]) {
      servirEstatico(res, ESTATICOS[rota]);
      return;
    }

    if (metodo === "GET" && rota === "/api/estado") {
      responderJson(res, 200, sessao.instantaneo());
      return;
    }

    if (metodo === "GET" && rota === "/api/eventos") {
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      res.write("retry: 2000\n\n");
      enviarEvento(res, "estado", sessao.instantaneo());
      assinantes.add(res);

      const batida = setInterval(() => res.write(": ping\n\n"), BATIDA_MS);
      res.on("close", () => {
        clearInterval(batida);
        assinantes.delete(res);
      });
      return;
    }

    if (metodo === "GET" && rota === "/api/grupos") {
      responderJson(res, 200, { grupos: await sessao.listarGrupos(url.searchParams.get("atualizar") === "1") });
      return;
    }

    if (metodo === "GET" && rota === "/api/download") {
      const formato = url.searchParams.get("formato") || "";

      if (formato === "todos") {
        const { csv } = exportar.montarCsv(sessao.fontes(), exportar.lerOpcoes(new URLSearchParams()));
        responder(res, 200, TIPOS_ARQUIVO.csv, csv, {
          "content-disposition": 'attachment; filename="todos-os-grupos.csv"',
        });
        return;
      }

      const jid = url.searchParams.get("jid") || "";
      const caminho = sessao.arquivoDe(jid, formato);
      const tipo = TIPOS_ARQUIVO[formato];
      if (!caminho || !tipo) {
        responderJson(res, 404, { erro: "arquivo não disponível" });
        return;
      }

      const nome = path.basename(caminho);
      try {
        responder(res, 200, tipo, fs.readFileSync(caminho), {
          "content-disposition": `attachment; filename="${nome}"`,
        });
      } catch (e) {
        responderJson(res, 404, { erro: `não consegui ler ${nome}` });
      }
      return;
    }

    if (metodo === "GET" && rota === "/api/colunas") {
      responderJson(res, 200, {
        colunas: exportar.COLUNAS.map(({ chave, titulo }) => ({ chave, titulo })),
        papeis: exportar.PAPEIS,
      });
      return;
    }

    if (metodo === "GET" && rota === "/api/pdf") {
      const jids = (url.searchParams.get("grupos") || "").split(",").filter(Boolean);
      const fontes = sessao.fontes(jids);
      if (!fontes.length) {
        responderJson(res, 404, { erro: "nenhum grupo extraído para exportar" });
        return;
      }

      const pdf = await gerarPdf(fontes, exportar.lerOpcoes(url.searchParams));
      const nome = fontes.length === 1 ? `${fontes[0].nomeArquivo}.pdf` : "relatorio-grupos.pdf";
      responder(res, 200, TIPOS_ARQUIVO.pdf, Buffer.from(pdf), {
        "content-disposition": `attachment; filename="${nome}"`,
      });
      return;
    }

    if (metodo === "POST" && rota === "/api/apagar") {
      let corpo = {};
      try {
        corpo = await lerCorpo(req);
      } catch (e) {
        responderJson(res, 400, { erro: (e && e.message) || "corpo inválido" });
        return;
      }
      if (sessao.instantaneo().status === "extraindo") {
        responderJson(res, 409, { erro: "espere a extração terminar" });
        return;
      }
      const apagado = typeof corpo.jid === "string" && sessao.apagar(corpo.jid);
      responderJson(res, apagado ? 200 : 404, apagado ? { apagado: true } : { erro: "grupo não encontrado" });
      return;
    }

    if (metodo === "GET" && rota === "/api/exportar") {
      const jids = (url.searchParams.get("grupos") || "").split(",").filter(Boolean);
      const fontes = sessao.fontes(jids);
      if (!fontes.length) {
        responderJson(res, 404, { erro: "nenhum grupo extraído para exportar" });
        return;
      }

      const opcoes = exportar.lerOpcoes(url.searchParams);
      if (url.searchParams.get("contar") === "1") {
        responderJson(res, 200, { linhas: exportar.montarLinhas(fontes, opcoes).length });
        return;
      }

      const { csv } = exportar.montarCsv(fontes, opcoes);
      const nome = fontes.length === 1 ? `${fontes[0].nomeArquivo}-completo.csv` : "exportacao-grupos.csv";
      responder(res, 200, TIPOS_ARQUIVO.csv, csv, {
        "content-disposition": `attachment; filename="${nome}"`,
      });
      return;
    }

    if (metodo === "POST" && rota === "/api/conectar") {
      const disparo = sessao.conectar();
      responderJson(res, 200, sessao.instantaneo());
      disparo.then(publicarEstado, (e) => {
        console.error("falha ao conectar:", (e && e.message) || e);
        publicarEstado(sessao.instantaneo());
      });
      return;
    }

    if (metodo === "POST" && rota === "/api/desconectar") {
      responderJson(res, 200, await sessao.desconectar());
      return;
    }

    if (metodo === "POST" && rota === "/api/extrair") {
      let corpo = {};
      try {
        corpo = await lerCorpo(req);
      } catch (e) {
        responderJson(res, 400, { erro: (e && e.message) || "corpo inválido" });
        return;
      }

      const ids = Array.isArray(corpo.ids) ? corpo.ids.filter((id) => typeof id === "string" && id.trim()) : [];
      if (!ids.length) {
        responderJson(res, 400, { erro: "nenhum grupo selecionado" });
        return;
      }

      const estado = sessao.instantaneo();
      if (estado.status !== "pronto") {
        responderJson(res, 409, { erro: "só dá para extrair com a sessão conectada e sem extração em andamento" });
        return;
      }

      responderJson(res, 202, { aceito: true, total: ids.length });
      sessao.extrair(ids).catch((e) => {
        console.error("falha na extração:", (e && e.message) || e);
        publicarEstado(sessao.instantaneo());
      });
      return;
    }

    responderJson(res, 404, { erro: "rota desconhecida" });
  }

  const servidor = http.createServer((req, res) => {
    tratar(req, res).catch((e) => {
      responderJson(res, 500, { erro: (e && e.message) || "erro inesperado" });
    });
  });

  const encerrar = () => {
    for (const res of assinantes) res.end();
    assinantes.clear();
    servidor.close();
  };

  return { servidor, publicarEstado, encerrar };
}

module.exports = { criarServidor };
