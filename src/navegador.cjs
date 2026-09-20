const puppeteer = require("puppeteer");
const qrcode = require("qrcode-terminal");
const config = require("./config.cjs");

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizarUA = (ua) => ua.replace("HeadlessChrome", "Chrome");

async function abrirNavegador() {
  const browser = await puppeteer.launch({
    userDataDir: config.PERFIL,
    headless: config.HEADLESS,
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
      try {
        const colecao = window.require("WAWebCollections");
        const chats = colecao.Chat.getModelsArray
          ? colecao.Chat.getModelsArray()
          : colecao.Chat.getModels();
        conversas = chats ? chats.length : null;
      } catch (e) {}

      const elementoQR = document.querySelector("[data-ref]");
      return {
        conversas,
        versao: (window.Debug && window.Debug.VERSION) || null,
        qr: elementoQR ? elementoQR.getAttribute("data-ref") : null,
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

async function esperarLogin(page) {
  let ultimoQR = null;
  const inicio = Date.now();

  while (Date.now() - inicio < config.ESPERA_LOGIN_MS) {
    await dormir(2000);
    const estado = await estadoDaPagina(page);

    if (estado.bloqueio) return { logado: false, motivo: estado.bloqueio };
    if (estado.qr && estado.qr !== ultimoQR) {
      ultimoQR = estado.qr;
      imprimirQR(estado.qr);
    }
    if (estado.conversas > 0) {
      return { logado: true, versao: estado.versao, conversas: estado.conversas };
    }
  }

  return { logado: false, motivo: "tempo esgotado esperando login" };
}

async function esperarSincronizacao(page) {
  let anterior = -1;
  let estaveis = 0;
  const inicio = Date.now();

  while (Date.now() - inicio < config.ESPERA_SYNC_MS) {
    await dormir(3000);
    const estado = await estadoDaPagina(page);
    if (typeof estado.conversas !== "number") continue;

    estaveis = estado.conversas === anterior ? estaveis + 1 : 0;
    anterior = estado.conversas;
    console.log(`  ... ${estado.conversas} conversas`);
    if (estaveis >= 3 && estado.conversas > 0) break;
  }

  return anterior;
}

module.exports = { abrirNavegador, estadoDaPagina, esperarLogin, esperarSincronizacao, normalizarUA };
