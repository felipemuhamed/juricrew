import paramiko
import re
import time

def execute_ssh_commands(data):
    """
    Executa comandos SSH em uma sessão persistente, mantendo o estado entre comandos.
    O input deve ser um texto separado por hashtag (`#`) com o host, username, password e os comandos.
    Exemplo: `10.60.20.1#admin#password#cd /var/www, ls, pwd`.
    """

    def open_persistent_channel(client):
        """Abre um canal SSH persistente."""
        channel = client.invoke_shell()
        channel.settimeout(10)  # Timeout para evitar travamentos
        time.sleep(1)  # Aguarda o canal inicializar
        if channel.recv_ready():
            channel.recv(65535)  # Limpa o buffer inicial
        return channel

    def send_command(channel, command):
        """Envia um comando pelo canal SSH e captura toda a saída."""
        channel.send(command + '\n')
        output = ""

        while True:
            time.sleep(0.5)  # Dá tempo para o comando processar
            if channel.recv_ready():
                chunk = channel.recv(65535).decode("utf-8")
                output += chunk

                # Detecta o prompt do shell como indicador de finalização
                if re.search(r"[\r\n][^#\n]*[#\$] ", output):
                    break

        return output.strip()

    # Verifica o formato do input
    if data.count('#') != 3:
        return "Erro: O input deve ter exatamente 3 hashtags (`#`) separando os valores."

    host, username, password, commands = data.split('#')
    commands = [cmd.strip() for cmd in commands.split(",")]

    output = ""
    ssh = None

    try:
        # Inicializa o cliente SSH
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(host, username=username, password=password, port=22)

        # Abre um canal persistente
        channel = open_persistent_channel(ssh)

        # Executa os comandos
        for command in commands:
            output += f"Comando: {command}\n"
            output += f"Saída:\n{send_command(channel, command)}\n\n"

    except paramiko.ssh_exception.AuthenticationException:
        return "Erro: Autenticação falhou. Verifique suas credenciais."
    except paramiko.ssh_exception.SSHException as e:
        return f"Erro de conexão SSH: {e}"
    except Exception as e:
        return f"Erro inesperado: {e}"
    finally:
        if ssh:
            ssh.close()

    return output