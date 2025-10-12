import smtplib
import os
import re
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Tuple
import logging
from crewai.tools import tool
from email.mime.application import MIMEApplication
import mimetypes

# Configuração de logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constantes
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
TIMEOUT = 10  # segundos

# Expressão regular para validação básica de e-mail
EMAIL_REGEX = re.compile(r'^[\w\.-]+@[\w\.-]+\.\w+$')

def validate_email(email: str) -> bool:
    """Valida o formato básico de um endereço de e-mail."""
    return bool(EMAIL_REGEX.match(email))

def get_env_vars() -> Tuple[str, str]:
    """Obtém e valida variáveis de ambiente necessárias."""
    sender = os.getenv("EMAIL_REMETENTE")
    password = os.getenv("EMAIL_SENHA")
    
    if not sender or not password:
        raise ValueError("Variáveis de ambiente EMAIL_REMETENTE e EMAIL_SENHA devem ser definidas")
    
    return sender, password

def create_email_message(
    sender: str,
    recipient: str,
    subject: str,
    body: str,
    attachments: list = None) -> MIMEMultipart:
    """Cria mensagem de e-mail com suporte a anexos em memória."""
    msg = MIMEMultipart('mixed')
    msg["From"] = f"Sistema de Notificações <{sender}>"
    msg["To"] = recipient
    msg["Subject"] = subject
    msg["X-Priority"] = "3"
    msg["Content-Language"] = "pt-BR"

    # Parte alternativa para texto e HTML
    alternative_part = MIMEMultipart('alternative')
    text_part = MIMEText(body, 'plain', 'utf-8')
    
    html_content = f'''
    <html>
    <body>
        <p style="font-family: Arial; color: #333;">{body.replace(chr(10), '<br>')}</p>
        <hr>
        <small>E-mail automático - Não responda</small>
    </body>
    </html>
    '''
    html_part = MIMEText(html_content, 'html', 'utf-8')
    
    alternative_part.attach(text_part)
    alternative_part.attach(html_part)
    msg.attach(alternative_part)

    # Anexar arquivos de buffer
    if attachments:
        for attachment in attachments:
            try:
                filename = attachment['filename']
                filepath = attachment['filepath']
                
                # Validar caminho do arquivo
                if not os.path.isfile(filepath):
                    raise ValueError(f"Arquivo não encontrado: {filepath}")

                with open(filepath, 'rb') as f:
                    content = f.read()

                # Determinar tipo MIME
                mime_type, _ = mimetypes.guess_type(filename)
                if mime_type is None:
                    mime_type = 'application/octet-stream'
                main_type, sub_type = mime_type.split('/', 1)

                logger.warning(f"mime type {str(mime_type)} main type {main_type}")

                # Criar parte MIME
                if main_type == 'text':
                    part = MIMEText(content.decode('utf-8'), _subtype=sub_type, _charset='utf-8')
                else:
                    part = MIMEApplication(content, _subtype=sub_type)

                part.add_header(
                    'Content-Disposition',
                    'attachment',
                    filename=filename
                )
                msg.attach(part)
                
            except Exception as e:
                logger.warning(f"Falha ao processar anexo {filename}: {str(e)}")
                continue

    return msg

@tool("send_email_tool")
def send_email(recipient: str, subject: str, body: str, attachments: list = None, email_info: dict = None) -> dict:
    """
    Envia e-mail usando servidor SMTP do Gmail com tratamento aprimorado de erros.
    
    Args:
        recipient (str): Endereço de e-mail do destinatário
        subject (str): Assunto do e-mail
        body (str): Conteúdo do e-mail
        attachments: Lista de dicionários contendo:
            - 'filename': nome do arquivo para exibição (str)
            - 'filepath': caminho completo do arquivo temporário (str)
        email_info(dict): dicionario com informações de email
    Returns:
        dict: Resultado da operação com status e detalhes
    """
    # Validação inicial
    if not all([recipient, subject, body]):
        return {"status": "error", "message": "Todos os campos devem ser preenchidos"}
    
    if not validate_email(recipient):
        return {"status": "error", "message": "Formato de e-mail do destinatário inválido"}

    # Validar anexos
    if attachments is not None:
        if not isinstance(attachments, list):
            return {"status": "error", "message": "Anexos devem ser uma lista de dicionários"}
            
        required_keys = {'filename', 'filepath'}

        for attachment in attachments:
            if not isinstance(attachment, dict):
                return {"status": "error", "message": "Cada anexo deve ser um dicionário"}
                
            if not required_keys.issubset(attachment.keys()):
                return {"status": "error", "message": f"Anexo deve conter chaves: {required_keys}"}

            if not os.path.exists(attachment['filepath']):
                return {"status": "error", "message": f"Caminho de arquivo inválido: {attachment['filepath']}"}


    try:
        if email_info != None and email_info != {}:
            sender = email_info['generator']
            recip = email_info['destiny']
            password = email_info['pass']
        else:        
            sender, password = get_env_vars()
            recip = recipient

        msg = create_email_message(sender, recip, subject, body, attachments)
        
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=TIMEOUT) as server:
            server.starttls()
            server.login(sender, password)
            server.sendmail(sender, recipient, msg.as_string())
            
        return {"status": "success", "message": "E-mail enviado com sucesso"}
    
    except smtplib.SMTPAuthenticationError:
        error_msg = "Falha na autenticação. Verifique usuário e senha"
        logger.error(error_msg)
        return {"status": "error", "message": error_msg}
    
    except smtplib.SMTPException as e:
        error_msg = f"Erro no servidor SMTP: {str(e)}"
        logger.error(error_msg)
        return {"status": "error", "message": error_msg}
    
    except Exception as e:
        error_msg = f"Erro inesperado: {str(e)}"
        logger.exception(error_msg)
        return {"status": "error", "message": error_msg}