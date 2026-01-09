#!/bin/bash


# Caminho de destino
DEST_DIR="./shared"


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


echo "Script concluído com sucesso."