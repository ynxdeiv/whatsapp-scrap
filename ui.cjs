#!/usr/bin/env node
const { spawn } = require("child_process");
const config = require("./src/config.cjs");
const { criarSessao } = require("./src/sessao.cjs");
const { criarServidor } = require("./src/servidor.cjs");

const sessao = criarSessao();
const { servidor, publicarEstado, encerrar } = criarServidor(sessao);

sessao.aoMudar(publicarEstado);

function abrirNoSistema(endereco) {
  const comando =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";

  const filho = spawn(comando, [endereco], {
    stdio: "ignore",
    detached: true,
    shell: process.platform === "win32",
  });
  filho.on("error", () => {});
  filho.unref();
}

servidor.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(
      `A porta ${config.PORTA} está ocupada. Tente outra: PORTA=${config.PORTA + 1} npm run ui`
    );
  } else {
    console.error("FALHOU:", (e && e.stack) || e);
  }
  process.exitCode = 1;
});

servidor.listen(config.PORTA, "127.0.0.1", () => {
  const endereco = `http://127.0.0.1:${config.PORTA}`;
  console.log(`whatsapp-scrap: ${endereco}`);
  console.log("Clique em Conectar na tela e escaneie o QR. Ctrl+C encerra e solta o perfil do Chrome.");
  if (config.ABRIR_NAVEGADOR) abrirNoSistema(endereco);
});

let saindo = false;

async function sair() {
  if (saindo) return;
  saindo = true;
  console.log("\nfechando o Chrome e soltando o perfil...");
  await sessao.desconectar();
  encerrar();
  process.exit(0);
}

process.on("SIGINT", sair);
process.on("SIGTERM", sair);
