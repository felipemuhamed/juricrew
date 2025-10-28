import xml.etree.ElementTree as ET
import subprocess
import os
from typing import List, Dict, Optional, Tuple

from crewai.tools import BaseTool
from pydantic import BaseModel, Field
from typing import Optional, Type


class CoverageServiceInput(BaseModel):
    """Input schema for code search tool."""
    repo_path: str = Field(..., description="repository path")
    class_name: str = Field(
        None,
        description="class name to be tested"
    )


class CoverageServiceTool(BaseTool):

    name: str = "Coverage TOOL"
    description: str = (
        "Coverage test tool"
    )
    args_schema: Type[BaseModel] = CoverageServiceInput

    def _run(self, repo_path: str, class_name: Optional[str] = None, regenerate: bool = True) -> str:
        """Gera relatório formatado, regenerando dados se necessário"""
        if regenerate:
            success, message = self.run_maven_test(repo_path, class_name)
            if not success:
                return f"⚠️ Falha ao gerar relatório:\n{message}"

        data = self.parse_jacoco_xml(repo_path)
        if not data or isinstance(data, dict) and 'error' in data:
            return "❌ Nenhum dado de cobertura encontrado"

        # Formatação do relatório (mesmo código anterior)
        report_lines = []

        for item in data:
            report_lines.append(f"📦 Pacote: {item['package']}")
            report_lines.append(
                f"🏷️ Classe: {item['class']} ({item['source_file']})")

            for counter_type, values in item['class_counters'].items():
                report_lines.append(
                    f"  ▶ {counter_type:12}: {values['covered']}/{values['total']} "
                    f"({values['percentage']}%)"
                )

            if item['methods']:
                report_lines.append("\n  🔹 Métodos:")
                for method in item['methods']:
                    report_lines.append(
                        f"    🎯 {method['name']} (Linha {method['line']})")
                    for ctype, values in method['counters'].items():
                        report_lines.append(
                            f"      • {ctype:10}: {values['covered']}/{values['total']} "
                            f"({values['percentage']}%)"
                        )

            report_lines.append("\n" + "-"*50 + "\n")

        return "\n".join(report_lines)

    def run_maven_test(self, repo_path: str, class_name: str) -> Tuple[bool, str]:
        """Executa o comando Maven para regenerar o relatório de cobertura"""
        command = f"mvn clean test -Dtest={class_name}"
        try:
            result = subprocess.run(
                command,
                cwd=repo_path,
                shell=True,
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            return True, result.stdout
        except subprocess.CalledProcessError as e:
            error_msg = f"Erro ao executar Maven: {e.stderr}" if e.stderr else "Erro desconhecido"
            return False, error_msg
        except Exception as e:
            return False, f"Erro inesperado: {str(e)}"

    def parse_jacoco_xml(self, repo_path, target_class: Optional[str] = None) -> List[Dict]:
        report_path = os.path.join(repo_path, 'target', 'site', 'jacoco', 'jacoco.xml')

        """Parseia o relatório JaCoCo e retorna dados estruturados"""
        if not os.path.exists(report_path):
            raise FileNotFoundError(
                f"Relatório JaCoCo não encontrado em: {report_path}")

        try:
            tree = ET.parse(report_path)
            root = tree.getroot()
            coverage_data = []

            for package in root.findall('package'):
                package_name = package.attrib['name']

                for clazz in package.findall('class'):
                    class_name = clazz.attrib['name']
                    simple_class = class_name.split('/')[-1]

                    if target_class and simple_class.lower() != target_class.lower():
                        continue

                    source_file = clazz.attrib.get('sourcefilename', '')

                    # Coleta de métricas da classe
                    class_counters = {}
                    for counter in clazz.findall('counter'):
                        counter_type = counter.attrib['type']
                        missed = int(counter.attrib['missed'])
                        covered = int(counter.attrib['covered'])
                        total = missed + covered
                        percentage = round(
                            100 * covered / total, 1) if total > 0 else 0
                        class_counters[counter_type] = {
                            'missed': missed,
                            'covered': covered,
                            'total': total,
                            'percentage': percentage
                        }

                    # Coleta de métricas dos métodos
                    methods = []
                    for method in clazz.findall('method'):
                        method_name = method.attrib['name']
                        line = method.attrib.get('line', 'N/A')
                        method_counters = {}

                        for counter in method.findall('counter'):
                            counter_type = counter.attrib['type']
                            missed = int(counter.attrib['missed'])
                            covered = int(counter.attrib['covered'])
                            total = missed + covered
                            percentage = round(
                                100 * covered / total, 1) if total > 0 else 0
                            method_counters[counter_type] = {
                                'missed': missed,
                                'covered': covered,
                                'total': total,
                                'percentage': percentage
                            }

                        methods.append({
                            'name': method_name,
                            'line': line,
                            'counters': method_counters
                        })

                    coverage_data.append({
                        'package': package_name,
                        'class': class_name,
                        'simple_class': simple_class,
                        'source_file': source_file,
                        'class_counters': class_counters,
                        'methods': methods
                    })

            return coverage_data

        except ET.ParseError as e:
            raise ValueError(f"Erro de parsing XML: {str(e)}")
        except Exception as e:
            raise ValueError(f"Erro ao processar relatório: {str(e)}")