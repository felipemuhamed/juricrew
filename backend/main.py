from typing import Any, Dict
import os
import builtins
import json
import io
import tempfile
import logging
import asyncio

# IMPORTANT:
# CrewAI can prompt interactively to "view execution traces".
# In an API/Docker environment this blocks requests and causes timeouts/500s.
# Disable tracing/telemetry BEFORE importing anything from crewai.
os.environ.setdefault("CREWAI_TRACING_ENABLED", "false")
os.environ.setdefault("CREWAI_DISABLE_TRACING", "true")
os.environ.setdefault("CREWAI_DISABLE_TELEMETRY", "true")
os.environ.setdefault("OTEL_SDK_DISABLED", "true")
os.environ.setdefault("OTEL_TRACES_EXPORTER", "none")
os.environ.setdefault("OTEL_METRICS_EXPORTER", "none")
os.environ.setdefault("OTEL_LOGS_EXPORTER", "none")

# Hard stop any interactive prompt that might block a web request
builtins.input = lambda *args, **kwargs: "N"

from fastapi import FastAPI, HTTPException, UploadFile, File, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
import uvicorn

from crew.JuriCrew import JuriCrew

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger("juricrew")

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
    firm_template: str = Field(..., description="Firm/practice-specific template in Markdown.")


class ResearchRequest(BaseModel):
    motion_type: str
    facts: str
    process: str
    court: str
    parts: str
    llm_tokens: dict


class ResearchResponse(BaseModel):
    result: Dict[str, Any]


# ===============================
# GLOBAL INSTANCE
# ===============================
juri_crew = JuriCrew()

# ===============================
# GLOBAL ERROR HANDLER
# ===============================
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Log full error server-side
    logger.exception("Unhandled exception: %s", str(exc))
    # Return a consistent JSON error to Java/UI
    return JSONResponse(
        status_code=500,
        content={"error": str(exc)}
    )

# ===============================
# ENDPOINTS
# ===============================

@app.post("/research", response_model=ResearchResponse)
async def research_motion(req: ResearchRequest):
    """
    Executes ONLY the research step (USA): statutes, rules, case law,
    returns structured JSON output.
    """
    try:
        # Hard timeout so Java doesn't hang forever
        async def _impl():
            raw = await juri_crew.create_research(
                motion_type=req.motion_type,
                facts=req.facts,
                process=req.process,
                court=req.court,
                parts=req.parts,
                llm_tokens=req.llm_tokens
            )

            sanitized = juri_crew.sanitize_json(raw)
            parsed = json.loads(sanitized)
            return {"result": parsed}

        # 90s research cap (adjust if you want)
        return await asyncio.wait_for(_impl(), timeout=90)

    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Research timed out. Try again or shorten the facts.")
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Research agent returned invalid JSON. Error: {str(e)}"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate-pleading/docx")
async def generate_pleading_docx(request: PledgeRequest):
    """
    Generates the DOCX pleading using:
    - selected_authorities (frozen)
    - firm_template (markdown)
    """
    try:
        if not request.firm_template.strip():
            raise HTTPException(status_code=400, detail="firm_template is required and cannot be empty.")
        if "#" not in request.firm_template:
            raise HTTPException(status_code=400, detail="firm_template must contain at least one markdown heading (#).")

        async def _impl():
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
            return docx_file

        # 180s cap (matches your Java readTimeout)
        docx_file = await asyncio.wait_for(_impl(), timeout=180)

        return StreamingResponse(
            io.BytesIO(docx_file.read()),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename=pleading_{request.process}.docx"}
        )

    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="DOCX generation timed out. Try again or reduce content.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rag/upload")
async def upload_to_rag(file: UploadFile = File(...)):
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp_file:
            contents = await file.read()
            tmp_file.write(contents)
            tmp_file_path = tmp_file.name

        juri_crew.add_to_rag(tmp_file_path)
        os.remove(tmp_file_path)

        return JSONResponse(
            status_code=200,
            content={"message": f"Documento '{file.filename}' adicionado à RAG com sucesso."}
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao adicionar documento: {str(e)}")


if __name__ == "__main__":
    # IMPORTANT: Must be 5000 to match Docker: -p 5000:5000
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=False)