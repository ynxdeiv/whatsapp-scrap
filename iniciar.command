#!/bin/bash
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Falta o Node.js. Instale a versão LTS em https://nodejs.org e abra este arquivo de novo."
  read -r -p "Enter para fechar..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Primeira vez: instalando dependências..."
  npm install --no-fund --no-audit || { read -r -p "Falhou. Enter para fechar..."; exit 1; }
fi

npm start
