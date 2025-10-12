from langchain.tools import tool
import requests
import os
import json


@tool("rag_tool")
def rag_tool(query: str) -> str:
    """
    Queries a RAG (Retrieval-Augmented Generation) tool with the provided query.

    Args:
        query (str): A JSON string containing the query to be sent to the RAG tool.

    Returns:
        str: The response returned by the RAG tool, or an error message if something goes wrong.
    """
    # URL of the RAG tool
    rag_url = os.environ.get("RAG_URL", "http://localhost:5000")
    # Cabeçalhos HTTP
    headers = {
        "Content-Type": "application/json",  # Especifica que o conteúdo é JSON
    }

    # Criando um dicionário com a chave 'query' e o valor da string 'query'
    payload = {"query": query}

    # Realiza a requisição POST
    response = requests.post(rag_url, json=payload, headers=headers)

    # Check the result
    if response.status_code == 200:
        # Get the content of the 'response' key directly
        json_response = response.json()
        return json_response.get("response", "Response not found")
    else:
        return f"Error sending the request: {response.status_code}, {response.text}"
