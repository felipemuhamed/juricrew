from typing import Any, Dict
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
import uvicorn
import tempfile
import io
import os
import logging
import json

from crew.JuriCrew import JuriCrew

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

app = FastAPI(
    title="JuriCrew API",
    version="1.1.0"
)

# ===============================
# MODELOS DE ENTRADA
# ===============================

class PledgeRequest(BaseModel):
    motion_type: str
    facts: str
    process: str
    court: str
    parts: str
    selected_authorities: Dict[str, Any]
    llm_tokens: Dict[str, Any]

    # Template em Markdown fornecido pela firma
    firm_template: str = Field(..., description="Firm/practice-specific template in Markdown.")


class ResearchRequest(BaseModel):
    motion_type: str
    facts: str
    process: str
    court: str
    parts: str
    llm_tokens: dict


class PledgeResponse(BaseModel):
    result: str


class ResearchResponse(BaseModel):
    # Devolve exatamente o JSON estruturado que o agente retorna
    result: Dict[str, Any]

# ===============================
# INSTÂNCIAS GLOBAIS
# ===============================
juri_crew = JuriCrew()

@app.post("/research", response_model=ResearchResponse)
async def research_motion(req: ResearchRequest):
    """
    Executa SOMENTE a etapa de pesquisa (USA): statutes, rules e case law,
    e devolve o output em JSON por tópicos.
    """
    try:
        crew = JuriCrew()

        # aqui você chama um método específico de pesquisa (vamos criar abaixo)
        raw = await crew.create_research(
            motion_type=req.motion_type,
            facts=req.facts,
            process=req.process,
            court=req.court,
            parts=req.parts,
            llm_tokens=req.llm_tokens
        )

        # O agente deve retornar JSON "limpo". Mesmo assim, sanitizamos.
        sanitized = crew.sanitize_json(raw)

        # valida se é JSON parseável
        parsed = json.loads(sanitized)

        return {"result": parsed}

    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Research agent returned invalid JSON. Error: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate-pleading/docx")
async def generate_pleading_docx(request: PledgeRequest):
    """
    Gera o arquivo DOCX da petição usando:
    - selected_authorities (congelado)
    - firm_template (markdown, fornecido pela firma)
    """
    try:
        # (Opcional) validação mínima do template
        if not request.firm_template.strip():
            raise HTTPException(status_code=400, detail="firm_template is required and cannot be empty.")
        if "#" not in request.firm_template:
            raise HTTPException(status_code=400, detail="firm_template must contain at least one markdown heading (#).")

        result_text = await juri_crew.create_pledge(
            motion_type=request.motion_type,
            facts=request.facts,
            process=request.process,
            court=request.court,
            parts=request.parts,
            selected_authorities=request.selected_authorities,
            firm_template=request.firm_template,
            llm_tokens=request.llm_tokens
        )

        docx_file = juri_crew.generate_docx(result_text)
        return StreamingResponse(
            io.BytesIO(docx_file.read()),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename=pleading_{request.process}.docx"}
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ===============================
# 🧩 ENDPOINT: UPLOAD DE DOCUMENTOS PARA RAG
# ===============================
@app.post("/rag/upload")
async def upload_to_rag(file: UploadFile = File(...)):
    try:
        # Cria arquivo temporário
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp_file:
            contents = await file.read()
            tmp_file.write(contents)
            tmp_file_path = tmp_file.name

        # Adiciona à RAG
        juri_crew.add_to_rag(tmp_file_path)

        # Limpa o arquivo temporário
        os.remove(tmp_file_path)

        return JSONResponse(
            status_code=200,
            content={"message": f"Documento '{file.filename}' adicionado à RAG com sucesso."}
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao adicionar documento: {str(e)}")



if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
