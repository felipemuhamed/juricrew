#!/bin/bash

# Caminho da pasta shared do diretório anterior
SOURCE_DIR="../shared"

# Caminho de destino
DEST_DIR="./shared"

# Copia a pasta shared do diretório anterior para o diretório atual
echo "Copiando a pasta shared..."
cp -r "$SOURCE_DIR" "$DEST_DIR"

# Verifica se a cópia foi bem-sucedida
if [ $? -eq 0 ]; then
    echo "Pasta shared copiada com sucesso."
else
    echo "Erro ao copiar a pasta shared."
    exit 1
fi

# Executa o comando Docker build
echo "Construindo a imagem Docker..."
sudo docker build -t juricrew .

# Verifica se o build foi bem-sucedido
if [ $? -eq 0 ]; then
    echo "Imagem Docker construída com sucesso."
else
    echo "Erro ao construir a imagem Docker."
    echo "Removendo a pasta shared copiada..."
    rm -rf "$DEST_DIR"
    exit 1
fi

# Remove a pasta shared copiada
echo "Removendo a pasta shared copiada..."
rm -rf "$DEST_DIR"

# Verifica se a remoção foi bem-sucedida
if [ $? -eq 0 ]; then
    echo "Pasta shared removida com sucesso."
else
    echo "Erro ao remover a pasta shared."
    exit 1
fi

echo "Script concluído com sucesso."