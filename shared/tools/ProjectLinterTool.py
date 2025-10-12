import os
import subprocess
import tempfile
import shutil
import re
import sys
import logging
import json
from pathlib import Path
from crewai.tools import BaseTool
from typing import Dict, Any, List, Optional, Type
from pydantic import BaseModel, Field


class ProjectLinterToollInput(BaseModel):
    """Input schema for code search tool."""
    new_code: List[str] = Field(..., description="code snippets")
    file_path: List[str] = Field(
        ...,
        description="file path"
    )
    language: Optional[str] = Field(
        ...,
        description="language of code"
    )


class ProjectLinterTool(BaseTool):
    name: str = "Project Linter Tool"
    description: str = (
        "Executes deep static analysis in the context of the entire project. "
        "Parameters: new_code (list), file_path (list), language (str, optional). "
        "Returns JSON with keys: 'valid' (bool), 'errors' (list), 'corrected_code' (str)."
    )
    args_schema: Type[BaseModel] = ProjectLinterToollInput

    def _run(self, new_code: List[str], file_path: List[str], language: str = "python") -> str:
        """Execute deep static analysis considering the full project context"""
        try:
            result = self._run_linter(
                new_code, file_path, language)
            return json.dumps(result)
        except Exception as e:
            logging.exception("Unexpected error during linting")
            return json.dumps({
                'valid': False,
                'errors': [f"Critical analysis error: {str(e)}"],
                'corrected_code': None
            })

    def _run_linter(self, new_code_list: List[str], file_path_list: List[str], language: str) -> Dict[str, Any]:
        """Main linting workflow with error correction para múltiplos arquivos"""
        if language not in ["python", "java", "typescript", "html"]:
            return self._error_result(f"Unsupported language: {language}")

        if missing_tools := self._check_required_tools(language):
            return self._error_result(f"Missing required tools: {', '.join(missing_tools)}")

        if len(new_code_list) != len(file_path_list):
            return self._error_result("Mismatch between number of code entries and file paths")

        with tempfile.TemporaryDirectory() as tmpdir:
            try:
                project_path = Path("cloned_repos")
                self._copy_project(project_path, tmpdir, language)

                created_files = []

                # Criar todos os arquivos fornecidos
                for code, path in zip(new_code_list, file_path_list):
                    test_file_path = Path(tmpdir) / path.removeprefix("cloned_repos/")
                    test_file_path.parent.mkdir(parents=True, exist_ok=True)
                    with open(test_file_path, 'w', encoding='utf-8') as f:
                        f.write(code)
                    print(f"✅ Arquivo criado: {test_file_path}")
                    created_files.append(test_file_path)

                all_static_errors = []
                all_test_errors = []
                # Rodar análise estática apenas uma vez se for TypeScript
                if language.lower() == "typescript":
                    # Executa análise estática para todo o diretório (todos os arquivos)
                    static_errors = self._run_analysis(language, tmpdir, None)
                    all_static_errors.extend(static_errors)
                    
                    # Itera pelos arquivos apenas para executar testes (se aplicável)
                    for test_file_path in created_files:
                        is_test_file = self._is_test_file(test_file_path, language)
                        if not static_errors and is_test_file:
                            test_errors = self._run_unit_tests(language, tmpdir, test_file_path)
                            all_test_errors.extend(test_errors)

                # Para outras linguagens, mantém o processo original
                else:
                    for test_file_path in created_files:
                        is_test_file = self._is_test_file(test_file_path, language)
                        static_errors = self._run_analysis(language, tmpdir, test_file_path)
                        all_static_errors.extend(static_errors)
                        if not static_errors and is_test_file:
                            test_errors = self._run_unit_tests(language, tmpdir, test_file_path)
                            all_test_errors.extend(test_errors)

                # Ler os códigos finais dos arquivos
                final_code_map = {str(path): path.read_text(encoding='utf-8') for path in created_files}

                return {
                    'valid': not all_static_errors and not all_test_errors,
                    'errors': all_static_errors + all_test_errors,
                    'corrected_code': final_code_map  # Agora retorna um dict {file_path: code}
                }

            except subprocess.TimeoutExpired:
                return self._error_result("Analysis timed out")
            except Exception as e:
                logging.exception("Error during project analysis")
                return self._error_result(f"Execution error: {str(e)}")
    def _is_test_file(self, file_path: Path, language: str) -> bool:
        """Identifica se o arquivo é um teste unitário"""
        filename = file_path.name.lower()

        if language == "python":
            return filename.startswith("test_") or filename.endswith("_test.py")

        elif language == "java":
            return ("test" in filename and file_path.suffix == ".java") or \
                   (file_path.parent.name == "test" or "test" in file_path.parts)

        return False

    def _run_unit_tests(self, language: str, tmpdir: str, test_file_path: Path) -> List[str]:
        """Executa testes unitários específicos para o arquivo"""
        if language == "python":
            return self._run_python_unit_tests(tmpdir, test_file_path)
        elif language == "java":
            return self._run_java_unit_tests(tmpdir, test_file_path)
        return [f"Test execution not supported for {language}"]

    def _run_python_unit_tests(self, tmpdir: str, test_file_path: Path) -> List[str]:
        """Executa testes unitários em Python usando pytest"""
        try:
            # Executar pytest no arquivo específico
            result = subprocess.run(
                ["pytest", str(test_file_path.relative_to(tmpdir))],
                cwd=tmpdir,
                capture_output=True,
                text=True,
                timeout=300
            )

            # Processar resultados
            if result.returncode == 0:
                return []

            # Extrair falhas dos testes
            errors = []
            for line in result.stdout.splitlines():
                if "FAILED" in line or "ERROR" in line:
                    errors.append(line)

            return errors if errors else ["Unit tests failed with unknown error"]

        except subprocess.TimeoutExpired:
            return ["Unit tests execution timed out"]
        except Exception as e:
            return [f"Error running unit tests: {str(e)}"]

    def _run_java_unit_tests(self, tmpdir: str, test_file_path: Path) -> List[str]:
        """Executa testes unitários em Java usando Maven Surefire"""
        try:
            # Determinar nome da classe de teste
            class_name = self._get_java_test_class_name(tmpdir, test_file_path)
            if not class_name:
                return ["Could not determine test class name"]

            # Executar teste específico com Maven
            result = subprocess.run(
                ["mvn", "test", "-Dtest=" + class_name],
                cwd=tmpdir,
                capture_output=True,
                text=True,
                timeout=300
            )

            # Processar resultados
            if result.returncode == 0:
                return []  # Retorna lista vazia se sucesso

            # Extrair falhas dos testes
            errors = []
            found_errors = False

            clean_stdout = self.remove_ansi_codes(result.stdout)
            clean_stderr = self.remove_ansi_codes(result.stderr)
            all_output = clean_stdout.splitlines() + clean_stderr.splitlines()
            for line in all_output:
                # Capture lines within error block
                if "[ERROR]" in line or "FAILURE" in line:
                    errors.append(line)
                    found_errors = True
                elif found_errors and not line.startswith("["):
                    errors[-1] += " " + line.strip()
                else:
                    found_errors = False
            
            # CORREÇÃO: Retornar a lista de erros
            return errors

        except subprocess.TimeoutExpired:
            return ["Unit tests execution timed out"]
        except Exception as e:
            return [f"Error running unit tests: {str(e)}"]

    def _get_java_test_class_name(self, tmpdir: str, test_file_path: Path) -> str:
        """Extrai o nome totalmente qualificado da classe de teste Java"""
        return str(test_file_path).split("/")[-1].split(".")[0]

    def _check_required_tools(self, language: str) -> List[str]:
        """Check for required tools in PATH"""
        tools = ['pylint', 'autopep8', 'mypy'] if language == "python" else [
            'javac', 'google-java-format']
        return [tool for tool in tools if not shutil.which(tool)]

    def _copy_project(self, src: Path, dest: str, language: str) -> None:
        """Copy relevant project files to temporary directory"""
        IGNORE_DIRS = {'venv', '.git', '__pycache__', '.env',
                       'node_modules', 'target', 'build', '.mvn'}

        for root, _, files in os.walk(src):
            if any(ignore_dir in Path(root).parts for ignore_dir in IGNORE_DIRS):
                continue

            rel_path = Path(root).relative_to(src)
            dest_path = Path(dest) / rel_path
            dest_path.mkdir(parents=True, exist_ok=True)

            for file in files:
                src_file = Path(root) / file
                if self._is_relevant_file(file, language):
                    shutil.copy2(src_file, dest_path / file)

    def _is_relevant_file(self, filename: str, language: str) -> bool:
        """Check if file should be included in analysis"""
        if language == "python":
            return (filename.endswith('.py') or 
                    filename in {'requirements.txt', 'setup.py', 'pyproject.toml'})
        elif language in ["javascript", "typescript"]:
            # Inclui arquivos de código e arquivos de configuração importantes
            return (filename.endswith(('.js', '.jsx', '.ts', '.tsx', '.json')) or
                (filename in {'package.json', 'package-lock.json', 'yarn.lock',
                                'tsconfig.json', 'angular.json', 'karma.conf.js',
                                'tslint.json', 'babel.config.js', '.babelrc'}))
        else:  # Java e ecossistema
            return (filename.endswith(('.java', '.xml', '.properties', '.gradle', '.pom')) or
                (filename in {'pom.xml', 'build.gradle', 'settings.gradle'}))

    def _run_analysis(self, language: str, tmpdir: str, target_path: Path) -> List[str]:
        """Run static analysis based on language"""
        if language == "python":
            return self._run_python_analysis(tmpdir, target_path)
        elif language == "typescript":
            return self._run_typescript_analysis(tmpdir, target_path)
        elif language == "html":
            return []
        else:
            return self._run_java_analysis(tmpdir, target_path)

    def _run_typescript_analysis(self, tmpdir: str, target_path: Path) -> List[str]:
        """Executa análise estática para projetos Angular"""
        errors = []

        # Verifica se node_modules existe
        node_modules_path = Path(tmpdir) / "node_modules"
        if not node_modules_path.exists():
            # Executa npm install
            install_result = subprocess.run(
                ["npm", "install", "--legacy-peer-deps"],
                cwd=tmpdir,
                capture_output=True,
                text=True,
                timeout=600  # npm install pode levar mais tempo
            )
            if install_result.returncode != 0:
                errors.extend(install_result.stdout.splitlines())
                errors.append("Falha ao instalar dependências npm")
                return errors  # Retorna early se a instalação falhar

        tsc_result = subprocess.run(
            ["npx", "tsc", "--noEmit"],
            cwd=tmpdir,
            capture_output=True,
            text=True,
            timeout=300
        )
        if tsc_result.returncode != 0:
            errors.extend(tsc_result.stdout.splitlines())

        # eslint_result = subprocess.run(
        #     ["npx", "eslint", str(target_path)],
        #     cwd=tmpdir,
        #     capture_output=True,
        #     text=True,
        #     timeout=300
        # )
        # if eslint_result.returncode != 0:
        #     errors.extend(eslint_result.stdout.splitlines())

        # nglint_result = subprocess.run(
        #     ["npx", "ng", "lint"],
        #     cwd=tmpdir,
        #     capture_output=True,
        #     text=True,
        #     timeout=300
        # )
        # if nglint_result.returncode != 0:
        #     errors.extend(nglint_result.stdout.splitlines())

        return errors

    def _run_python_analysis(self, tmpdir: str, target_path: Path) -> List[str]:
        """Executa análise estática focada em erros de compilação/sintaxe"""
        errors = []

        # 1. Instala dependências se requirements.txt existir
        requirements_path = Path(tmpdir) / "requirements.txt"
        if requirements_path.exists():
            install_result = subprocess.run(
                [sys.executable, "-m", "pip", "install", "-r", str(requirements_path)],
                cwd=tmpdir,
                capture_output=True,
                text=True
            )
            if install_result.returncode != 0:
                errors.append("Falha ao instalar dependências:")
                errors.extend(install_result.stderr.splitlines())
                return errors  # Aborta se não conseguir instalar dependências

        # 2. Verificação de sintaxe com py_compile
        compile_result = subprocess.run(
            [sys.executable, "-m", "py_compile", str(target_path)],
            cwd=tmpdir,
            capture_output=True,
            text=True,
            timeout=300
        )
        if compile_result.returncode != 0:
            errors.extend(compile_result.stderr.splitlines())

        # # 3. Verificação estática com pyflakes
        # pyflakes_result = subprocess.run(
        #     ["pyflakes", str(target_path)],
        #     cwd=tmpdir,
        #     capture_output=True,
        #     text=True,
        #     timeout=300
        # )
        # if pyflakes_result.returncode != 0:
        #     errors.extend(pyflakes_result.stdout.splitlines())

        return errors

    def remove_ansi_codes(self, text: str) -> str:
        """Remove ANSI escape codes from text"""
        ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
        return ansi_escape.sub('', text)

    def _run_java_analysis(self, tmpdir: str, target_path: Path) -> List[str]:
        """Execute Java compilation using Maven and extract errors"""
        errors = []
        base_path = str(tmpdir)
        if not base_path.endswith(os.sep):
            base_path += os.sep

        try:
            # Run Maven build
            mvn_result = subprocess.run(
                ["mvn", "clean", "compile", "test-compile", "-DskipTests"],
                cwd=tmpdir,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=300
            )

            if mvn_result.returncode != 0:
                # Remove ANSI codes and combine output
                clean_stdout = self.remove_ansi_codes(mvn_result.stdout)
                clean_stderr = self.remove_ansi_codes(mvn_result.stderr)
                all_output = clean_stdout.splitlines() + clean_stderr.splitlines()

                in_error_block = False
                found_errors = False

                for line in all_output:
                    # Remove base path prefix
                    clean_line = line.replace(base_path, "")

                    # Capture lines within error block
                    if in_error_block:
                        if "[INFO]" in clean_line and "---" in clean_line:
                            in_error_block = False
                        elif "[ERROR]" in clean_line:
                            errors.append(clean_line)
                        continue

                    # Capture standalone error patterns
                    if "[ERROR]" in clean_line:
                        # Pattern 1: .java file with line number
                        if ".java" in clean_line and re.search(r':\d+', clean_line):
                            found_errors = True
                            errors.append(clean_line)
                        # Pattern 2: Common error keywords
                        elif any(kw.lower() in clean_line.lower() for kw in [
                            "error", "symbol", "package", "class", "cannot", 
                            "exception", "reached end of file", "compilation failure"
                        ]):
                            found_errors = True
                            errors.append(clean_line)

                if not found_errors:
                    errors.append(
                        "Maven compile failed, but no specific errors found.")

        except subprocess.TimeoutExpired:
            errors.append("Java Maven compilation timed out.")
        except Exception as e:
            errors.append(f"Java Maven error: {str(e)}")

        return errors

    def _error_result(self, message: str) -> Dict[str, Any]:
        """Generate standard error result"""
        return {
            'valid': False,
            'errors': [message],
            'corrected_code': None
        }
