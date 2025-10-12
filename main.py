from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
import uvicorn
import tempfile
import io
import os
import logging

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
    llm_tokens: dict

class PledgeResponse(BaseModel):
    result: str


# ===============================
# INSTÂNCIAS GLOBAIS
# ===============================
juri_crew = JuriCrew()


@app.post("/generate-pleading/docx")
async def generate_pleading_docx(request: PledgeRequest):
    """
    Gera o arquivo DOCX da petição (com formatação e negrito).
    """
    try:
        result = await juri_crew.create_pledge(
            motion_type=request.motion_type,
            facts=request.facts,
            process=request.process,
            court=request.court,
            parts=request.parts,
            llm_tokens=request.llm_tokens
        )

        # Gera DOCX a partir do texto
        docx_file = juri_crew.generate_docx(result)
        return StreamingResponse(
            io.BytesIO(docx_file.read()),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={
                "Content-Disposition": f"attachment; filename=pleading_{request.process}.docx"
            }
        )

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
