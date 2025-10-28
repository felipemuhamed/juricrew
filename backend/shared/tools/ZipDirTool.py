from crewai.tools import BaseTool
from pydantic import BaseModel, Field
from typing import Optional, Type
import os, zipfile, datetime


class ZipDirInput(BaseModel):
    dir_path: str = Field(..., description="Caminho absoluto do diretório a ser compactado")


class ZipDirTool(BaseTool):
    name: str = "Directory Zipper"
    description: str = (
        "Cria um arquivo ZIP a partir de um diretório fornecido. "
        "Compacta todos os arquivos e subdiretórios preservando a estrutura."
    )
    args_schema: Type[BaseModel] = ZipDirInput

    def _run(self, dir_path: str) -> dict:
        if not os.path.isdir(dir_path):
            return {"error": f"O caminho {dir_path} não é um diretório válido."}

        base_name = os.path.basename(os.path.normpath(dir_path))
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")

        # Salva o ZIP no diretório pai (não dentro do próprio diretório zipado)
        output_dir = os.path.dirname(dir_path)
        output_path = os.path.join(output_dir, f"{base_name}_{timestamp}.zip")

        try:
            with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zipf:
                for root, _, files in os.walk(dir_path):
                    for file in files:
                        abs_path = os.path.join(root, file)
                        rel_path = os.path.relpath(abs_path, start=dir_path)
                        zipf.write(abs_path, rel_path)

            print(f"Arquivo ZIP criado em: {output_path}")
            return {"success": True, "zip_path": output_path}

        except Exception as e:
            return {"error": str(e)}
