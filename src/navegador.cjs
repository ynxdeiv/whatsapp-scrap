const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const puppeteer = require("puppeteer-core");
const qrcode = require("qrcode-terminal");
const config = require("./config.cjs");

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const INTERVALO_ESTADO_MS = 2000;
const INTERVALO_SYNC_MS = 3000;

const normalizarUA = (ua) => ua.replace("HeadlessChrome", "Chrome");

const CANDIDATOS = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ],
  win32: [
    ["PROGRAMFILES", "Google\\Chrome\\Application\\chrome.exe"],
    ["PROGRAMFILES(X86)", "Google\\Chrome\\Application\\chrome.exe"],
    ["LOCALAPPDATA", "Google\\Chrome\\Application\\chrome.exe"],
    ["PROGRAMFILES(X86)", "Microsoft\\Edge\\Application\\msedge.exe"],
    ["PROGRAMFILES", "Microsoft\\Edge\\Application\\msedge.exe"],
    ["PROGRAMFILES", "BraveSoftware\\Brave-Browser\\Application\\brave.exe"],
  ],
  linux: ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "brave-browser"],
};

function noPath(comando) {
  try {
    return execFileSync("which", [comando], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch (e) {
    return null;
  }
}

function acharChrome() {
  if (config.CHROME_PATH) return config.CHROME_PATH;

  if (process.platform === "darwin") {
    const home = process.env.HOME || "";
    const lista = CANDIDATOS.darwin.flatMap((caminho) => [caminho, path.join(home, caminho)]);
    return lista.find((caminho) => fs.existsSync(caminho)) || null;
  }

  if (process.platform === "win32") {
    return (
      CANDIDATOS.win32
        .map(([variavel, resto]) => process.env[variavel] && path.join(process.env[variavel], resto))
        .find((caminho) => caminho && fs.existsSync(caminho)) || null
    );
  }

  for (const comando of CANDIDATOS.linux) {
    const achado = noPath(comando);
    if (achado) return achado;
  }
  return null;
}

function processoVivo(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

function soltarTravaVelha(perfil) {
  const trava = path.join(perfil, "SingletonLock");
  let destino;
  try {
    destino = fs.readlinkSync(trava);
  } catch (e) {
    return;
  }

  const pid = Number(String(destino).split("-").pop());
  if (pid && processoVivo(pid)) return;

  for (const nome of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
    try {
      fs.unlinkSync(path.join(perfil, nome));
    } catch (e) {}
  }
}

async function abrirNavegador() {
  const executavel = acharChrome();
  if (!executavel) {
    throw new Error(
      "Não achei Chrome, Edge, Brave nem Chromium instalado. Instale o Google Chrome (google.com/chrome) ou aponte CHROME_PATH no .env."
    );
  }

  soltarTravaVelha(config.PERFIL);

  const browser = await puppeteer.launch({
    userDataDir: config.PERFIL,
    headless: config.HEADLESS,
    executablePath: executavel,
    args: ["--disable-blink-features=AutomationControlled", ...config.ARGS_EXTRA],
  });

  const page = (await browser.pages())[0] || (await browser.newPage());
  await page.setUserAgent(normalizarUA(await browser.userAgent()));

  try {
    await page.goto("https://web.whatsapp.com", { waitUntil: "domcontentloaded", timeout: 60000 });
  } catch (e) {
    console.log("aviso no goto:", e.message);
  }

  return { browser, page };
}

async function estadoDaPagina(page) {
  try {
    return await page.evaluate(() => {
      const texto = (document.body && document.body.innerText) || "";
      let conversas = null;
      let grupos = null;
      let gruposComNome = null;

      try {
        const colecao = window.require("WAWebCollections");
        const chats = colecao.Chat.getModelsArray
          ? colecao.Chat.getModelsArray()
          : colecao.Chat.getModels();
        conversas = chats ? chats.length : null;

        let getters = null;
        try {
          getters = window.require("WAWebFrontendChatGetters");
        } catch (e) {}
        const doGrupo = (chats || []).filter((c) => ((c.id && c.id._serialized) || "").endsWith("@g.us"));
        grupos = doGrupo.length;
        gruposComNome = doGrupo.filter((c) => {
          try {
            return !!(c.name || c.formattedTitle || (getters && getters.getFormattedTitle(c)));
          } catch (e) {
            return false;
          }
        }).length;
      } catch (e) {}

      const elementoQR = document.querySelector("[data-ref]");
      const qr = elementoQR ? elementoQR.getAttribute("data-ref") : null;
      const telaPrincipal = !!document.querySelector("#pane-side, #side");
      const baixando = texto.match(/(?:Carregando conversas|Loading (?:your )?chats)\s*\[?(\d{1,3})\s*%/i);
      const carregando =
        !!baixando || /mensagens estão sendo baixadas|messages are (?:being )?download/i.test(texto);

      return {
        conversas,
        grupos,
        gruposComNome,
        logado: !qr && (telaPrincipal || carregando || conversas > 0),
        carregando,
        percentual: baixando ? Number(baixando[1]) : null,
        telaPrincipal,
        versao: (window.Debug && window.Debug.VERSION) || null,
        qr,
        bloqueio:
          /atualize o Chrome|update Chrome|não é possível conectar dispositivos/i.test(texto)
            ? texto.replace(/\s+/g, " ").slice(0, 200)
            : null,
      };
    });
  } catch (e) {
    return { erro: (e && e.message) || String(e) };
  }
}

function imprimirQR(ref) {
  console.log("\n=== ESCANEIE (WhatsApp > Dispositivos conectados > Conectar dispositivo) ===");
  qrcode.generate(ref, { small: true });
  console.log("=== fim do QR — ele se renova sozinho aqui se expirar ===\n");
}

const vazio = () => {};

async function esperarLogin(page, opcoes = {}) {
  const aoMudarQR = opcoes.aoMudarQR || imprimirQR;
  const aoEstado = opcoes.aoEstado || vazio;
  const deveParar = opcoes.deveParar || (() => false);
  const limiteMs = opcoes.limiteMs === undefined ? config.ESPERA_LOGIN_MS : opcoes.limiteMs;

  let ultimoQR = null;
  const inicio = Date.now();

  while (Date.now() - inicio < limiteMs) {
    await dormir(INTERVALO_ESTADO_MS);
    if (deveParar()) return { logado: false, cancelado: true };

    const estado = await estadoDaPagina(page);
    aoEstado(estado);

    if (estado.bloqueio) return { logado: false, motivo: estado.bloqueio };
    if (estado.qr && estado.qr !== ultimoQR) {
      ultimoQR = estado.qr;
      aoMudarQR(estado.qr);
    }
    if (estado.logado) {
      return { logado: true, versao: estado.versao, conversas: estado.conversas };
    }
  }

  return { logado: false, motivo: "tempo esgotado esperando login" };
}

async function esperarSincronizacao(page, opcoes = {}) {
  const aoProgresso =
    opcoes.aoProgresso ||
    ((quantidade, percentual) =>
      console.log(`  ... ${quantidade} conversas${percentual === null ? "" : ` (baixando ${percentual}%)`}`));
  const deveParar = opcoes.deveParar || (() => false);

  let anterior = null;
  let estaveis = 0;
  let conversas = -1;
  const inicio = Date.now();
  let prontoDesde = null;

  while (Date.now() - inicio < config.ESPERA_DOWNLOAD_MS) {
    await dormir(INTERVALO_SYNC_MS);
    if (deveParar()) return conversas;

    const estado = await estadoDaPagina(page);
    if (typeof estado.conversas !== "number") continue;

    if (estado.carregando || !estado.telaPrincipal) {
      prontoDesde = null;
      estaveis = 0;
      conversas = estado.conversas;
      aoProgresso(estado.conversas, estado.percentual);
      continue;
    }
    if (prontoDesde === null) prontoDesde = Date.now();
    if (Date.now() - prontoDesde > config.ESPERA_SYNC_MS) break;

    const assinatura = `${estado.conversas}|${estado.grupos}|${estado.gruposComNome}`;
    estaveis = assinatura === anterior ? estaveis + 1 : 0;
    anterior = assinatura;
    conversas = estado.conversas;
    aoProgresso(estado.conversas, null);

    const nomesProntos = !estado.grupos || estado.gruposComNome === estado.grupos;
    if (estado.conversas > 0 && ((estaveis >= 3 && nomesProntos) || estaveis >= 6)) break;
  }

  return conversas;
}

module.exports = { acharChrome, abrirNavegador, estadoDaPagina, esperarLogin, esperarSincronizacao, normalizarUA };
