const $ = (id) => document.getElementById(id);

const PILULAS = {
  fechado: ["desconectado", ""],
  abrindo: ["abrindo o Chrome…", "espera"],
  "aguardando-login": ["esperando o QR", "espera"],
  sincronizando: ["sincronizando…", "espera"],
  pronto: ["conectado", "ok"],
  extraindo: ["extraindo…", "espera"],
  erro: ["erro", "ruim"],
};

let estado = { status: "fechado", logado: false, resultados: [] };
let grupos = [];
const selecionados = new Set();
let gruposCarregados = false;
let carregandoGrupos = false;
let erroNaConexao = false;
let assinaturaLista = null;

const esc = (valor) =>
  String(valor === undefined || valor === null ? "" : valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const chave = (texto) =>
  String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const casaCom = (nome, termo) => {
  if (!termo) return true;
  const alvo = chave(nome);
  if (alvo.includes(termo)) return true;
  return alvo.replace(/ /g, "").includes(termo.replace(/ /g, ""));
};

const mostrar = (id, visivel) => $(id).classList.toggle("oculto", !visivel);

const numero = (valor) => Number(valor || 0).toLocaleString("pt-BR");

const visiveisAgora = () => {
  const termo = chave($("busca").value);
  return grupos.filter((grupo) => casaCom(grupo.nome, termo));
};

function atualizarResumoSelecao() {
  const quantos = selecionados.size;
  $("grupos-info").textContent = gruposCarregados
    ? `${numero(grupos.length)} grupos e comunidades · ${numero(quantos)} selecionados`
    : "carregando a lista de grupos…";
  $("btn-extrair").textContent = `Extrair ${numero(quantos)} ${quantos === 1 ? "grupo" : "grupos"}`;
  $("btn-extrair").disabled = quantos === 0 || estado.status !== "pronto";
}

function desenharGrupos() {
  const visiveis = visiveisAgora();
  const marca = [...selecionados].sort().join(",");
  const assinatura = `${chave($("busca").value)}|${marca}|${grupos.length}`;

  if (assinatura !== assinaturaLista) {
    assinaturaLista = assinatura;
    if (!gruposCarregados) {
      $("lista-grupos").innerHTML = '<div class="vazio">carregando…</div>';
    } else if (!grupos.length) {
      $("lista-grupos").innerHTML =
        '<div class="vazio">esta conta não tem nenhum grupo ou comunidade</div>';
    } else if (!visiveis.length) {
      $("lista-grupos").innerHTML = '<div class="vazio">nada casa com esse filtro</div>';
    } else {
      $("lista-grupos").innerHTML = visiveis
        .map((grupo) => {
          const marcado = selecionados.has(grupo.id);
          return `<label class="grupo${marcado ? " marcado" : ""}">
            <input type="checkbox" value="${esc(grupo.id)}"${marcado ? " checked" : ""} />
            <span class="nome">${esc(grupo.nome)}</span>
            ${grupo.comunidade ? '<span class="tag">comunidade</span>' : ""}
            <span class="quantos">${numero(grupo.participantes)}</span>
          </label>`;
        })
        .join("");
    }
  }

  atualizarResumoSelecao();
}

function desenharResultados() {
  const resultados = estado.resultados || [];
  mostrar("painel-resultados", resultados.length > 0);
  mostrar("aviso-offline", !estado.logado && estado.status !== "extraindo");
  mostrar("baixar-consolidado", resultados.length > 1);

  $("corpo-resultados").innerHTML = resultados
    .map((r) => {
      const resumo = r.resumo || {};
      const avisos =
        r.avisos && r.avisos.length
          ? `<div class="muted pequeno">${esc(r.avisos.join("; "))}</div>`
          : "";
      const arquivos = (r.formatos || [])
        .map(
          (formato) =>
            `<a href="/api/download?jid=${encodeURIComponent(r.jid)}&formato=${encodeURIComponent(
              formato
            )}" download>${esc(formato)}</a>`
        )
        .join("");
      const completo = `<a href="/api/exportar?grupos=${encodeURIComponent(r.jid)}" download title="CSV com todas as colunas">completo</a>
        <a href="/api/pdf?grupos=${encodeURIComponent(r.jid)}" download title="Relatório em PDF deste grupo">pdf</a>
        <button type="button" class="apagar" data-jid="${esc(r.jid)}" data-nome="${esc(r.nome)}" title="Apaga os arquivos deste grupo do computador">apagar</button>`;
      return `<tr>
        <td>${esc(r.nome)}${r.comunidade ? ' <span class="tag">comunidade</span>' : ""}${avisos}</td>
        <td class="num">${numero(r.totalParticipantes)}</td>
        <td class="num">${numero(resumo.comNome)}</td>
        <td class="num">${numero(resumo.admins)}</td>
        <td class="num">${numero(r.semNumero)}</td>
        <td><div class="arquivos">${arquivos}${completo}</div></td>
      </tr>`;
    })
    .join("");

  desenharOpcoesDeGrupo(resultados);
}

const COLUNAS_PADRAO = ["grupo", "numero", "nomeAgenda", "nomePerfil", "papel", "contatoSalvo", "ddd", "uf"];
let assinaturaExport = null;
let esperaContagem = null;

async function prepararExportacao() {
  try {
    const dados = await (await fetch("/api/colunas")).json();
    $("exp-colunas").innerHTML = dados.colunas
      .map(
        (coluna) =>
          `<label><input type="checkbox" value="${esc(coluna.chave)}"${
            COLUNAS_PADRAO.includes(coluna.chave) ? " checked" : ""
          } /> ${esc(coluna.titulo)}</label>`
      )
      .join("");
    $("exp-papeis").innerHTML = dados.papeis
      .map((papel) => `<label><input type="checkbox" value="${esc(papel)}" checked /> ${esc(papel)}</label>`)
      .join("");
  } catch (e) {}
  atualizarExportacao();
}

function desenharOpcoesDeGrupo(resultados) {
  const assinatura = resultados.map((r) => r.jid).join(",");
  if (assinatura === assinaturaExport) return;
  assinaturaExport = assinatura;

  const atual = $("exp-grupo").value;
  $("exp-grupo").innerHTML =
    (resultados.length > 1 ? '<option value="">todos os grupos extraídos (com a coluna Grupo)</option>' : "") +
    resultados.map((r) => `<option value="${esc(r.jid)}">${esc(r.nome)}</option>`).join("");
  if ([...$("exp-grupo").options].some((opcao) => opcao.value === atual)) $("exp-grupo").value = atual;
  atualizarExportacao();
}

const marcados = (id) =>
  [...$(id).querySelectorAll("input[type=checkbox]:checked")].map((caixa) => caixa.value);

function enderecoExportacao() {
  const params = new URLSearchParams();
  const grupo = $("exp-grupo").value;
  if (grupo) params.set("grupos", grupo);
  params.set("colunas", marcados("exp-colunas").join(","));
  params.set("papeis", marcados("exp-papeis").join(",") || "nenhum");
  if ($("exp-ufs").value.trim()) params.set("ufs", $("exp-ufs").value);
  if ($("exp-ddds").value.trim()) params.set("ddds", $("exp-ddds").value);
  for (const filtro of ["comNumero", "comNome", "salvos", "unicos", "mascarar"]) {
    if ($(`exp-${filtro}`).checked) params.set(filtro, "1");
  }
  params.set("sep", $("exp-sep").value);
  return `/api/exportar?${params}`;
}

function atualizarExportacao() {
  const semColunas = marcados("exp-colunas").length === 0;
  const endereco = enderecoExportacao();
  $("exp-baixar").href = endereco;
  $("exp-baixar").classList.toggle("desativado", semColunas);
  const pdf = endereco.replace("/api/exportar?", "/api/pdf?");
  $("exp-pdf").href = $("exp-participantes").checked ? `${pdf}&participantes=1` : pdf;
  $("exp-pdf").classList.toggle("desativado", semColunas && $("exp-participantes").checked);

  clearTimeout(esperaContagem);
  if (semColunas) {
    $("exp-contagem").textContent = "marque ao menos uma coluna";
    return;
  }
  esperaContagem = setTimeout(async () => {
    try {
      const resposta = await fetch(`${endereco}&contar=1`);
      const dados = await resposta.json();
      $("exp-contagem").textContent = resposta.ok
        ? `${numero(dados.linhas)} ${dados.linhas === 1 ? "linha" : "linhas"} com esses filtros`
        : dados.erro || "";
    } catch (e) {
      $("exp-contagem").textContent = "";
    }
  }, 250);
}

function desenharProgresso() {
  const progresso = estado.progresso;
  mostrar("painel-progresso", !!progresso);
  if (!progresso) return;

  const extraindo = estado.status === "extraindo";
  $("progresso-titulo").textContent = extraindo ? `Extraindo…` : "Extração concluída";
  $("barra-preenche").style.width = progresso.total
    ? `${Math.round((progresso.feitos / progresso.total) * 100)}%`
    : "0%";
  $("progresso-texto").textContent = extraindo
    ? `${numero(progresso.feitos)} de ${numero(progresso.total)} — lendo ${progresso.atual || "…"}`
    : `${numero(progresso.feitos)} de ${numero(progresso.total)} grupos processados`;
  $("progresso-erros").innerHTML = (progresso.erros || [])
    .map((erro) => `<li>${esc(erro.nome)}: ${esc(erro.mensagem)}</li>`)
    .join("");
}

function desenharConexao() {
  const logado = !!estado.logado;
  const preparando = estado.status === "fechado" || estado.status === "abrindo";
  const esperandoQR = estado.status === "aguardando-login";
  const mostrando = preparando || esperandoQR;

  mostrar("painel-conexao", mostrando);
  if (mostrando) {
    const temQR = !!estado.qr;
    $("conexao-titulo").textContent = esperandoQR
      ? "Escaneie para conectar"
      : estado.status === "abrindo"
      ? "Abrindo o Chrome…"
      : "Conectar";
    $("conexao-dica").textContent = esperandoQR
      ? "Aguardando o QR aparecer…"
      : "Clique em Conectar para abrir o WhatsApp Web no Chrome.";
    mostrar("conexao-dica", !temQR);
    $("qr-caixa").innerHTML = temQR ? estado.qr : "";
    mostrar("qr-caixa", temQR);
    mostrar("qr-dica", temQR);
  }

  mostrar("painel-sync", estado.status === "sincronizando");
  if (estado.status === "sincronizando") {
    $("sync-texto").textContent =
      typeof estado.baixando === "number"
        ? `o celular está mandando as mensagens: ${estado.baixando}% — na primeira conexão isso pode levar alguns minutos`
        : `${numero(estado.conversas)} conversas carregadas — terminando de sincronizar…`;
  }

  const botao = $("btn-conectar");
  const desligando = logado || estado.status === "extraindo";
  botao.textContent = desligando ? "Desconectar" : "Conectar";
  botao.classList.toggle("perigo", desligando);
  botao.classList.toggle("primario", !desligando);
  botao.disabled = estado.status === "abrindo" || estado.status === "sincronizando";
}

function render() {
  const [texto, classe] = PILULAS[estado.status] || [estado.status, ""];
  $("pilula").textContent = erroNaConexao
    ? "sem conexão com o servidor"
    : estado.logado && typeof estado.conversas === "number"
    ? `${texto} · ${numero(estado.conversas)} conversas`
    : texto;
  $("pilula").className = `pilula ${erroNaConexao ? "ruim" : classe}`;

  mostrar("painel-erro", estado.status === "erro");
  if (estado.status === "erro") {
    $("erro-texto").textContent = estado.motivo || "erro desconhecido";
  }

  desenharConexao();
  desenharProgresso();

  const logado = !!estado.logado;
  mostrar("painel-grupos", logado);
  if (!logado && gruposCarregados) {
    gruposCarregados = false;
    grupos = [];
    assinaturaLista = null;
  }
  if (logado && !gruposCarregados && !carregandoGrupos) carregarGrupos();
  if (logado) desenharGrupos();

  desenharResultados();
}

async function carregarGrupos(atualizar) {
  carregandoGrupos = true;
  try {
    const resposta = await fetch(atualizar ? "/api/grupos?atualizar=1" : "/api/grupos");
    const dados = await resposta.json();
    grupos = dados.grupos || [];
    gruposCarregados = true;
  } catch (e) {
    if (!atualizar) grupos = [];
  } finally {
    carregandoGrupos = false;
  }
  assinaturaLista = null;
  desenharGrupos();
}

async function chamar(rota, corpo) {
  const resposta = await fetch(rota, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : "{}",
  });
  if (!resposta.ok) {
    const detalhe = await resposta.json().catch(() => null);
    throw new Error((detalhe && detalhe.erro) || `falhou (${resposta.status})`);
  }
  return resposta.json();
}

$("btn-conectar").addEventListener("click", async () => {
  const desligando = estado.logado || estado.status === "extraindo";
  $("btn-conectar").disabled = true;
  try {
    await chamar(desligando ? "/api/desconectar" : "/api/conectar");
  } catch (e) {
    alert(e.message);
  } finally {
    $("btn-conectar").disabled = false;
  }
});

$("busca").addEventListener("input", desenharGrupos);

document.querySelector(".exportar").addEventListener("input", atualizarExportacao);
document.querySelector(".exportar").addEventListener("change", atualizarExportacao);

for (const [id, marcar] of [["exp-todas", true], ["exp-nenhuma", false]]) {
  $(id).addEventListener("click", () => {
    for (const caixa of $("exp-colunas").querySelectorAll("input[type=checkbox]")) caixa.checked = marcar;
    atualizarExportacao();
  });
}

$("corpo-resultados").addEventListener("click", async (evento) => {
  const botao = evento.target.closest("button.apagar");
  if (!botao) return;
  if (!confirm(`Apagar do computador os arquivos de "${botao.dataset.nome}"? Não dá para desfazer.`)) return;
  botao.disabled = true;
  try {
    await chamar("/api/apagar", { jid: botao.dataset.jid });
  } catch (e) {
    alert(e.message);
    botao.disabled = false;
  }
});

$("exp-pdf").addEventListener("click", (evento) => {
  if ($("exp-pdf").classList.contains("desativado")) {
    evento.preventDefault();
    return;
  }
  const texto = $("exp-pdf").textContent;
  $("exp-pdf").textContent = "Gerando PDF…";
  setTimeout(() => ($("exp-pdf").textContent = texto), 4000);
});

$("exp-baixar").addEventListener("click", (evento) => {
  if ($("exp-baixar").classList.contains("desativado")) evento.preventDefault();
});

$("lista-grupos").addEventListener("change", (evento) => {
  const alvo = evento.target;
  if (alvo.type !== "checkbox") return;
  if (alvo.checked) selecionados.add(alvo.value);
  else selecionados.delete(alvo.value);
  alvo.closest(".grupo").classList.toggle("marcado", alvo.checked);
  atualizarResumoSelecao();
});

$("btn-atualizar").addEventListener("click", async () => {
  if (carregandoGrupos) return;
  $("btn-atualizar").disabled = true;
  $("btn-atualizar").textContent = "Atualizando…";
  await carregarGrupos(true);
  $("btn-atualizar").disabled = false;
  $("btn-atualizar").textContent = "Atualizar lista";
});

$("btn-marcar").addEventListener("click", () => {
  const visiveis = visiveisAgora();
  const todosMarcados = visiveis.length > 0 && visiveis.every((grupo) => selecionados.has(grupo.id));
  for (const grupo of visiveis) {
    if (todosMarcados) selecionados.delete(grupo.id);
    else selecionados.add(grupo.id);
  }
  desenharGrupos();
});

$("btn-limpar").addEventListener("click", () => {
  selecionados.clear();
  desenharGrupos();
});

$("btn-extrair").addEventListener("click", async () => {
  const ids = [...selecionados];
  if (!ids.length) return;
  $("btn-extrair").disabled = true;
  try {
    await chamar("/api/extrair", { ids });
  } catch (e) {
    alert(e.message);
  } finally {
    atualizarResumoSelecao();
  }
});

$("btn-baixar").addEventListener("click", async () => {
  const arquivos = [];
  for (const resultado of estado.resultados || []) {
    for (const formato of resultado.formatos || []) {
      arquivos.push(
        `/api/download?jid=${encodeURIComponent(resultado.jid)}&formato=${encodeURIComponent(formato)}`
      );
    }
  }

  $("btn-baixar").disabled = true;
  for (const endereco of arquivos) {
    const link = document.createElement("a");
    link.href = endereco;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
    await new Promise((esperar) => setTimeout(esperar, 350));
  }
  $("btn-baixar").disabled = false;
});

const eventos = new EventSource("/api/eventos");

eventos.addEventListener("estado", (evento) => {
  estado = JSON.parse(evento.data);
  render();
});

eventos.addEventListener("open", () => {
  if (!erroNaConexao) return;
  erroNaConexao = false;
  render();
});

eventos.addEventListener("error", () => {
  if (erroNaConexao) return;
  erroNaConexao = true;
  render();
});

render();

prepararExportacao();
