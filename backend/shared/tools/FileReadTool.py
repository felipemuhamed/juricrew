from typing import Any, Optional, Type

from crewai.tools import BaseTool
from pydantic import BaseModel, Field
from pathlib import Path
from itertools import islice

class FileReadToolSchema(BaseModel):
    """Input for FileReadTool."""

    file_path: str = Field(..., description="Mandatory file full path to read the file")
    start_line: Optional[int] = Field(1, description="Line number to start reading from (1-indexed)")
    line_count: Optional[int] = Field(None, description="Number of lines to read. If None, reads the entire file")


class FileReadTool(BaseTool):
    """A tool for reading file contents.

    This tool inherits its schema handling from BaseTool to avoid recursive schema
    definition issues. The args_schema is set to FileReadToolSchema which defines
    the required file_path parameter. The schema should not be overridden in the
    constructor as it would break the inheritance chain and cause infinite loops.

    The tool supports two ways of specifying the file path:
    1. At construction time via the file_path parameter
    2. At runtime via the file_path parameter in the tool's input

    Args:
        file_path (Optional[str]): Path to the file to be read. If provided,
            this becomes the default file path for the tool.
        **kwargs: Additional keyword arguments passed to BaseTool.

    Example:
        >>> tool = FileReadTool(file_path="/path/to/file.txt")
        >>> content = tool.run()  # Reads /path/to/file.txt
        >>> content = tool.run(file_path="/path/to/other.txt")  # Reads other.txt
        >>> content = tool.run(file_path="/path/to/file.txt", start_line=100, line_count=50)  # Reads lines 100-149
    """

    name: str = "Read a file's content"
    description: str = "A tool that reads the content of a file. To use this tool, provide a 'file_path' parameter with the path to the file you want to read. Optionally, provide 'start_line' to start reading from a specific line and 'line_count' to limit the number of lines read."
    args_schema: Type[BaseModel] = FileReadToolSchema
    file_path: Optional[str] = None

    def __init__(self, file_path: Optional[str] = None, **kwargs: Any) -> None:
        """Initialize the FileReadTool.

        Args:
            file_path (Optional[str]): Path to the file to be read. If provided,
                this becomes the default file path for the tool.
            **kwargs: Additional keyword arguments passed to BaseTool.
        """
        if file_path is not None:
            kwargs["description"] = (
                f"A tool that reads file content. The default file is {file_path}, but you can provide a different 'file_path' parameter to read another file. You can also specify 'start_line' and 'line_count' to read specific parts of the file."
            )

        super().__init__(**kwargs)
        self.file_path = file_path

    def _run(
        self,
        file_path: Optional[str] = None,
        start_line: Optional[int] = 1,
        line_count: Optional[int] = None,
    ) -> str:
        # Validação crítica
        file_path = file_path or self.file_path
        if not file_path:
            return "ERRO: Forneça um caminho de arquivo via parâmetro ou no construtor"
        
        try:
            # Normaliza caminho
            file_path = str(Path(file_path).resolve())
            start_idx = max(start_line - 1, 0)
            
            with open(file_path, "r", errors='replace') as file:
                # Leitura otimizada
                if start_idx > 0:
                    for _ in range(start_idx):
                        if not next(file, None):
                            return f"ERRO: Arquivo tem menos de {start_line} linhas"
                
                if line_count:
                    lines = islice(file, line_count)
                    return "".join(lines)
                else:
                    return file.read()
                    
        except FileNotFoundError:
            return f"ERRO: Arquivo não encontrado: {file_path}"
        except PermissionError:
            return f"ERRO: Sem permissão para ler: {file_path}"
        except Exception as e:
            return f"Error: Failed to read file {file_path}. {str(e)}"