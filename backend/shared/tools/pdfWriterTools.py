from langchain.tools import tool
from datetime import datetime
from fpdf import FPDF
from io import BytesIO
from minio import Minio
from minio.error import S3Error

import os

# Obtém as variáveis de ambiente
minio_host = os.getenv("MINIO_HOST", "localhost:9000")  # Define um valor padrão, se necessário
minio_access_key = os.getenv("MINIO_ACCESS_KEY")
minio_secret_key = os.getenv("MINIO_SECRET_KEY")
minio_secure = os.getenv("MINIO_SECURE", "False").lower() in ["true", "1", "t", "y", "yes"]  # Converte para booleano

# Cria o cliente Minio
minio_client = Minio(
    minio_host,
    access_key=minio_access_key,
    secret_key=minio_secret_key,
    secure=minio_secure
)

@tool("pdf_writer_tool")
def pdf_writer_tool(pdf_txt) -> str:
    """
    Gera um PDF em memória e salva no MinIO.

    Args:
        pdf_txt (str): O texto a ser incluído no PDF.
        bucket_name (str): O nome do bucket no MinIO.
        object_name (str): O nome do arquivo no MinIO.
        minio_client (Minio): Instância do cliente MinIO.

    Returns:
        str: Link público para o PDF salvo no MinIO.
    """
    # Gerar PDF em memória
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", size=12)
    pdf.multi_cell(0, 10, pdf_txt)
    
    byte_string = pdf.output(dest="S")
    pdf_buffer = BytesIO(byte_string.encode('latin1'))
    pdf_buffer.seek(0)


    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = f"data_analysis_report_{timestamp}.pdf"
    bucket_name = "zabbixanalysis"

    # Salvar o PDF no MinIO
    try:
        minio_client.put_object(
            bucket_name=bucket_name,
            object_name=output_file,
            data=pdf_buffer,  # Passando o buffer diretamente
            length=len(pdf_buffer.getvalue()),  # Calcula o comprimento dos bytes
            content_type="application/pdf"
        )
    except S3Error as e:
        return f"Erro ao salvar no MinIO: {str(e)}"

    # Gerar URL público para o PDF
    public_url = minio_client.presigned_get_object(bucket_name, output_file)
    return public_url

