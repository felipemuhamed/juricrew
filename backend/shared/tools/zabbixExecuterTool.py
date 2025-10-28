from crewai.tools import tool
import requests
import os

@tool("zabbix_executer_tool")
def zabbix_executer_tool(query: str, ip:str = None, porta:str = None, auth:str = None) -> str:
    """
    Executa um comando no Zabbix através de uma requisição POST.
    
    Parâmetros:
        query (str): O JSON a ser enviado como corpo da requisição.
        ip (str): ip do zabbix.
        porta (str): porta do zabbix.
        auth (str): token do zabbix.

    Retorna:
        str: A resposta da API do Zabbix em formato JSON.
    """
    try:
        if ip != None and porta != None:
            zabbix_url = f"http://{ip}:{porta}/api_jsonrpc.php"
            zabbix_token = auth
        else:

            # Obter URL e token do ambiente
            zabbix_url = os.getenv("ZABBIX_URL")
            zabbix_token = os.getenv("ZABBIX_TOKEN")

        if not zabbix_url or not zabbix_token:
            return "Erro: ZABBIX_URL ou ZABBIX_TOKEN não configurados no ambiente."

        # Cabeçalhos da requisição
        headers = {
            "Content-Type": "application/json-rpc",
            "Authorization": f"Bearer {zabbix_token}"
        }

        # Realizar o POST
        response = requests.post(zabbix_url, headers=headers, data=query)

        # Retornar a resposta como string
        return response.text

    except Exception as e:
        return f"Erro ao executar o comando no Zabbix: {str(e)}"