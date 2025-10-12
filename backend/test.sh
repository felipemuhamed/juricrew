#!/bin/bash

curl -X POST "http://localhost:5000/generate-pleading/docx" \
     -H "Content-Type: application/json" \
     -d '{
           "motion_type": "Ação de Ressarcimento de Danos",
           "facts": "O autor, Elisangela Iris dos Reis Magalhães, ajuizou ação de ressarcimento de danos em decorrência de locação de imóvel contra os fiadores Edivaldo Alves de Lima e Odete Maria dos Santos. O contrato de locação encerrou-se em junho de 2024, e o imóvel foi devolvido em más condições, com danos nos pisos, pintura e demais itens. A autora pleiteia o ressarcimento de R$ 6.400,00. Os requeridos contestaram alegando ilegitimidade passiva, inépcia da inicial e inexistência de responsabilidade pelos danos, sendo a defesa refutada em tríplica.",
           "process": "XXXXX-51.2024.8.26.0554",
           "court": "1ª Vara Cível da Comarca de Santo André - SP",
            "parts": 
               "author: Elisangela Iris dos Reis Magalhães; defendants: [Edivaldo Alves de Lima, Odete Maria dos Santos]",
           "llm_tokens": {
               "api_key": "AIzaSyA_mTK57hkER7aZ8LsgsgkNDJCPzxUQk0A, AIzaSyBSbTllQZF4SBCZDHYyJcjHXMlKFPQB_OE",
               "model": "gemini/gemini-2.5-flash"
           }
         }' \
     --output pleading_XXXXX-51.2024.8.26.0554.docx