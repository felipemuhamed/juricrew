import re
import base64
import requests
import io
from docx import Document
from docx.shared import Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from typing import Dict, Tuple
import logging
from PIL import Image
from time import sleep

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

def run_conversor(markdown_content: str, ai=None) -> io.BytesIO:
    """
    Processa conteúdo Markdown com diagramas Mermaid e retorna documento DOCX em memória
    
    Args:
        markdown_content: Conteúdo Markdown completo com blocos Mermaid
        
    Returns:
        io.BytesIO: Stream de bytes do documento DOCX pronto para uso
    """
    # Processa conteúdo e extrai diagramas
    processed_content, images = _process_markdown(markdown_content, ai)
    
    # Cria documento DOCX em memória
    docx_stream = _generate_docx(processed_content, images)
    
    return docx_stream

def _process_markdown(content: str, ai=None) -> Tuple[str, Dict[str, bytes]]:
    """Extrai diagramas Mermaid e substitui por placeholders"""
    pattern = r'```mermaid\s*([\s\S]*?)```'
    images = {}
    processed_content = content
    counter = 1
    
    for match in re.finditer(pattern, content, re.DOTALL):
        diagram_code = match.group(1).strip()
        image_bytes, _ = _generate_mermaid_png_with_retry(diagram_code, ai)
        
        if image_bytes:
            img_key = f"%%MERMAID_IMG_{counter}%%"
            images[img_key] = image_bytes
            processed_content = processed_content.replace(match.group(0), img_key)
            counter += 1
    
    return processed_content, images

def _generate_mermaid_png_with_retry(diagram_code: str, ai, max_width: int = 800, max_retries: int = 10) -> tuple[bytes | None, str | None]:
    """Gera imagem PNG a partir de código Mermaid com correção automática de erros"""
    original_code = diagram_code
    retry_count = 0
    last_error = None
    
    while retry_count <= max_retries:
        # Tenta gerar a imagem
        img_bytes, error = _generate_mermaid_png(original_code, max_width)
        
        # Se sucesso, retorna a imagem
        if img_bytes:
            return img_bytes, None
        
        # Guarda o último erro
        last_error = error        
        # Se não houver mais tentativas, sai do loop
        if retry_count >= max_retries or ai is None:
            break
            
        # Tenta corrigir o código usando IA
        try:
            original_code = ai.kickoff(inputs={'error': error, 'mermaid': original_code}).raw
            padrao = r'```mermaid(.*?)```'
            original_code = re.search(padrao, original_code, re.DOTALL).group(1).strip()
            logging.warning(original_code)

            retry_count += 1
            sleep(1)
            
        except Exception as e:
            last_error = f"Falha na correção por IA: {str(e)}"
            break

    return None, last_error or "Erro desconhecido"

def _generate_mermaid_png(diagram_code: str, max_width: int = 800) -> tuple[bytes | None, str | None]:
    """Função base para gerar imagem PNG a partir de código Mermaid"""
    try:
        # Codifica o diagrama em URL-safe base64
        encoded = base64.urlsafe_b64encode(diagram_code.encode()).decode()
        url = f"https://mermaid.ink/img/{encoded}"
        
        # Faz a requisição para a API
        response = requests.get(url, timeout=15)
        
        if response.status_code == 200:
            with Image.open(io.BytesIO(response.content)) as img:
                # Mantém proporções
                width_percent = max_width / float(img.size[0])
                new_height = int(float(img.size[1]) * width_percent)
                
                img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
                
                output_buffer = io.BytesIO()
                img.save(output_buffer, format="PNG")
                return output_buffer.getvalue(), None
        
        elif response.status_code == 400:
            return None, f"Erro de compilação Mermaid: {response.text.strip()}"
        else:
            return None, f"Erro HTTP {response.status_code}: {response.text}"

    except requests.exceptions.Timeout:
        return None, "Timeout ao acessar a API do Mermaid"
    except requests.exceptions.RequestException as e:
        return None, f"Erro de rede: {str(e)}"
    except Exception as e:
        return None, f"Erro no processamento: {str(e)}"

def _generate_docx(content: str, images: Dict[str, bytes]) -> io.BytesIO:
    """Cria documento DOCX com conteúdo Markdown, imagens incorporadas e formatação em negrito"""
    doc = Document()
    
    # Processa linhas do Markdown
    for line in content.split('\n'):
        stripped_line = line.strip()
        
        # Verifica se é placeholder de imagem
        if stripped_line in images:
            img_key = stripped_line
            _add_image_to_doc(doc, images[img_key])
        
        # Verifica cabeçalhos com formatação em negrito
        elif line.startswith('# '):
            _add_formatted_heading(doc, line[2:].strip(), level=1)
        elif line.startswith('## '):
            _add_formatted_heading(doc, line[3:].strip(), level=2)
        elif line.startswith('### '):
            _add_formatted_heading(doc, line[4:].strip(), level=3)
        
        # Verifica listas com formatação em negrito
        elif line.startswith('* '):
            p = doc.add_paragraph(style='List Bullet')
            _add_formatted_text(p, line[2:].strip())
        
        # Texto normal com formatação em negrito
        elif stripped_line:
            p = doc.add_paragraph()
            _add_formatted_text(p, stripped_line)
    
    output = io.BytesIO()
    doc.save(output)
    output.seek(0)
    return output

def _add_formatted_heading(doc, text, level):
    """Adiciona cabeçalho com formatação em negrito"""
    heading = doc.add_paragraph()
    heading.style = f'Heading {level}'
    _add_formatted_text(heading, text)

def _add_formatted_text(paragraph, text):
    """Adiciona texto com formatação em negrito para partes entre **"""
    parts = re.split(r'(\*\*.*?\*\*)', text)  # Divide preservando os marcadores de **negrito**
    
    for part in parts:
        if part.startswith('**') and part.endswith('**'):
            # Texto entre ** - aplica negrito
            run = paragraph.add_run(part[2:-2].strip())
            run.bold = True
        elif part:
            # Texto normal
            paragraph.add_run(part)

def _add_image_to_doc(doc: Document, image_bytes: bytes):
    """Adiciona imagem ao documento DOCX a partir de bytes"""
    img_stream = io.BytesIO(image_bytes)
    paragraph = doc.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = paragraph.add_run()
    run.add_picture(img_stream, width=Inches(6))
    img_stream.close()