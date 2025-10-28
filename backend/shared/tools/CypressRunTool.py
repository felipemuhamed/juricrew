
from crewai.tools import BaseTool
from pydantic import BaseModel, Field, PrivateAttr
from typing import Optional, Type, Any
import subprocess
import json
import os
import glob
from datetime import datetime


class CypressRunToolInput(BaseModel):
    repo: str =  Field(..., description="Path of the repository")
    path: str = Field(..., description="Path of the spec file to be tested")


class CypressRunTool(BaseTool):
    name: str = "Cypress Executor for Jira"
    description: str = (
        "Executes Cypress tests and produces a structured JSON suitable for Jira integration, "
        "including test status, errors, screenshots, and videos."
    )
    args_schema: Type[BaseModel] = CypressRunToolInput
    _cwd: Any = PrivateAttr()

    def __init__(self):
        super().__init__()
        self._cwd = None

    def _run(self, path: str = None, repo: str = None) -> dict:
        project_path = repo + "/cypress"
        self._cwd = project_path

        # Comando Cypress
        command = ["npx", "cypress", "run"]
        command.append("--headless")
        if path:
            command.extend(["--spec", path])

        try:
            result = subprocess.run(
                command, cwd=self._cwd, capture_output=True, text=True, check=False
            )

            stdout = result.stdout
            stderr = result.stderr

            # Parse simples do stdout
            tests = []
            current_spec = path
            current_error = {}
            collecting_error = False

            for line in stdout.splitlines():
                line = line.strip()

                if line.startswith("✓"):
                    title = line[1:].strip()
                    tests.append({"spec": current_spec, "title": title, "status": "passed"})
                    collecting_error = False

                elif line.startswith("✖"):
                    title = line[1:].strip()
                    current_error = {
                        "spec": current_spec,
                        "title": title,
                        "status": "failed",
                        "error": ""
                    }
                    tests.append(current_error)
                    collecting_error = True

                elif line.startswith("-"):
                    title = line[1:].strip()
                    tests.append({"spec": current_spec, "title": title, "status": "skipped"})
                    collecting_error = False

                elif collecting_error:
                    if line and not line.startswith(("✓", "✖", "-")):
                        current_error["error"] += line + "\n"
                    else:
                        collecting_error = False

            # Resumo dos testes
            summary = {
                "total": len(tests),
                "passes": sum(1 for t in tests if t["status"] == "passed"),
                "failures": sum(1 for t in tests if t["status"] == "failed"),
                "tests": tests
            }

            if result.returncode != 0:
                return {
                    "error": "Cypress execution failed",
                    "summary": summary,
                    "exit_code": result.returncode,
                    "stdout": stdout,
                    "stderr": stderr,
                }



            return {
                "summary": summary,
                "exit_code": result.returncode,
            }

        except Exception as e:
            return {"error": str(e)}
