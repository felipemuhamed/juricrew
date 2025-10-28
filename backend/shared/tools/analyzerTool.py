from langchain.tools import tool
import pandas as pd
import os
from datetime import datetime, timedelta
import requests


# Obter URL e token do ambiente
zabbix_url = os.getenv("ZABBIX_URL")
zabbix_token = os.getenv("ZABBIX_TOKEN")


def _get_items_history(items_dict, start, end):
    """
    Função para buscar histórico de itens associados a partir de um dicionário com nome e itemid.
    
    :param items_dict: Dicionário no formato {nome_do_item: itemid}.
    :param start: Timestamp de início do intervalo.
    :param end: Timestamp de fim do intervalo.
    :return: Histórico dos itens como string formatada.
    """
    # Extraindo os itemids do dicionário
    itemids = list(items_dict.values())

    # Requisição única para buscar todos os itens associados
    payload = {
        "jsonrpc": "2.0",
        "method": "history.get",
        "params": {
            "output": "extend",
            "history": 0,
            "itemids": itemids,
            "sortfield": "clock",
            "sortorder": "DESC",
            "time_from": start,
            "time_till": end
        },
        "id": 1
    }

    # Cabeçalhos HTTP
    headers = {
        "Content-Type": "application/json-rpc",
        "Authorization": f"Bearer {zabbix_token}"
    }

    # Fazendo a requisição para o Zabbix
    response = requests.post(zabbix_url, json=payload, headers=headers)
    data = response.json()

    if "result" in data:
        # Criando o DataFrame
        df = pd.DataFrame(data['result'])

        # Removendo a coluna 'ns', caso exista
        if 'ns' in df.columns:
            df = df.drop(columns=['ns'])

        # Convertendo o clock para formato datetime e ajustando para o formato desejado
        df['clock'] = pd.to_datetime(df['clock'].astype(int), unit='s')
        df['clock'] = df['clock'].dt.strftime('%d/%m/%y %H:%M:%S')

        # Adicionando o nome dos itens ao DataFrame
        df['name'] = df['itemid'].map({str(v): k for k, v in items_dict.items()})

        # Removendo a coluna 'itemid'
        df = df.drop(columns=['itemid'])

        # Ordenando os dados por 'name' e 'clock'
        df_sorted = df.sort_values(by=['name', 'clock'])

        # Transformando o DataFrame inteiro em uma string
        return df_sorted.to_string(index=False)

    return "Nenhum resultado encontrado ou erro na resposta."

def _get_item_ids(hosts_and_items):
    """
    Faz uma única requisição para buscar itemids com base em hosts e itens.
    :param hosts_and_items: Lista de dicionários contendo 'host' e 'item' a buscar.
    :return: Dicionário com pares { (host, item): itemid }.
    """

    # Extrair todos os hosts e itens únicos
    hosts = list(set(entry['host'] for entry in hosts_and_items))
    items = list(set(entry['item'] for entry in hosts_and_items))

    # Requisição única para buscar todos os itens associados
    payload = {
        "jsonrpc": "2.0",
        "method": "item.get",
        "params": {
            "output": ["itemid", "name", "hostid"],
            "filter": {"name": items},
            "selectHosts": hosts
        },
        "id": 1
    }

    # Cabeçalhos HTTP
    headers = {
        "Content-Type": "application/json-rpc",
        "Authorization": f"Bearer {zabbix_token}"
    }

    response = requests.post(zabbix_url, json=payload, headers=headers)
    data = response.json()

    # Construir o dicionário de retorno com os itemids
    itemid_map = {}
    if "result" in data:
        for item in data["result"]:

            itemid_map[item["name"]] = item["itemid"]

    return itemid_map


@tool("analyzer_tool")
def analyzer_tool(data: dict) -> str:
    """
        A tool for interacting with the Zabbix API to retrieve information about dashboards and extract unique host-item pairs from SVG graph widgets.

        Parameters:
            data (dict): A dictionary containing the following keys:
                - 'dashboard': Name of the dashboard to query.
                - 'view': Name of the specific SVG graph widget to extract data from.
                - 'period': period of the values on the view.
        
        example of input for the tool:
        "{"data": {"dashboard": "Global view", "view": "RSSI por VSA", "period": {"start": 1737456000, "end": 1737542400}}}"
        Returns:
            str: A JSON string mapping host-item pairs to their corresponding item IDs, or an error message if the request fails.
        """

    # Corpo da requisição
    payload = {
        "jsonrpc": "2.0",
        "method": "dashboard.get",
        "params": {
            "output": "extend",
            "selectPages": "extend",
            "filter": {
                "name": data['dashboard']
            }
        },
        "id": 1
    }

    # Cabeçalhos HTTP
    headers = {
        "Content-Type": "application/json-rpc",
        "Authorization": f"Bearer {zabbix_token}"
    }
    # Enviando a requisição para a API do Zabbix
    response = requests.post(zabbix_url, json=payload, headers=headers)

    if response.status_code == 200:
        result_data = response.json()

        # Extraindo valores únicos dos itens com "*.items.*" ou "*.hosts.*" em widgets do tipo 'svggraph'
        item_values = []  # Lista para armazenar os pares de host e item
        found_widget = False  # Flag para indicar que o widget foi encontrado

        for result in result_data.get("result", []):
            if found_widget:
                break  # Interrompe o loop quando o widget já foi encontrado
            for page in result.get("pages", []):
                if found_widget:
                    break  # Interrompe o loop quando o widget já foi encontrado
                for _, widget in enumerate(page.get("widgets", [])):
                    if found_widget:
                        break  # Interrompe o loop quando o widget já foi encontrado
                    if widget.get("type") == "svggraph" and widget.get("name") == data['view']:
                        fields = widget.get("fields", [])

                        # Variável para armazenar o host atual
                        host = None

                        for _, field in enumerate(fields):
                            field_name = field.get("name", "")
                            field_value = field.get("value", "")

                            # Verificando se o nome contém ".hosts." e armazenando o host
                            if ".hosts." in field_name:
                                host = field_value
                            # Quando encontrar um .items. e tiver um host, cria o par host-item
                            elif ".items." in field_name and host:
                                item = field_value
                                # Adiciona o par host-item à lista como um dicionário
                                item_values.append(
                                    {"host": host, "item": item})
                                # Resetando o host para o próximo par
                                host = None

                        found_widget = True  # Marca que o widget foi encontrado
                        break  # Interrompe o loop do widget

        # Faz uma requisição única para buscar os itemids
        itemid_map = _get_item_ids(item_values)
        return _get_items_history(itemid_map, data['period']['start'], data['period']['end'])

    else:
        return f"Erro na requisição: {response.status_code} - {response.text}"
