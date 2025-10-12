from crewai.tools import BaseTool
from pydantic import Field
from pysnmp.smi import builder, view, compiler
import subprocess
import re
import os
from typing import List, Dict


class SNMPMIBTool(BaseTool):
    name: str = "SNMP MIB Analyzer"
    description: str = (
        "Analisa arquivos MIB e extrai OIDs para monitoramento no Zabbix. "
        "Combina pysnmp com ferramentas CLI do Net-SNMP para máxima confiabilidade. "
        "Parâmetros: 'mib_path' (caminho do arquivo MIB)"
    )

    mib_sources: List[str] = Field(
        default=["/usr/share/snmp/mibs"],
        description="Diretórios para busca de MIBs dependentes"
    )

    cache_enabled: bool = Field(
        default=True,
        description="Habilita cache de OIDs para melhor performance"
    )

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.mib_builder = builder.MibBuilder()
        self.mib_view = view.MibViewController(self.mib_builder)
        self._configure_mib_paths()
        self._oid_cache = {}

    def _configure_mib_paths(self):
        """Configura os caminhos das MIBs"""
        os.environ['MIBDIRS'] = ':'.join(self.mib_sources)
        self.mib_builder.setMibSources(
            *self.mib_builder.getMibSources() + (
                builder.DirMibSource(os.getenv('MIBDIRS')),
            )
        )

    def _run(self, query: str) -> Dict:
        """Executa a análise da MIB"""
        try:
            return self.analyze_mib_file(query)
        except Exception as e:
            return {"error": f"Falha na análise: {str(e)}"}

    async def _arun(self, query: str) -> str:
        raise NotImplementedError("Async não suportado")

    def analyze_mib_file(self, mib_path: str) -> Dict:
        """Analisa o arquivo MIB e retorna OIDs válidos"""
        if self.cache_enabled and mib_path in self._oid_cache:
            return self._oid_cache[mib_path]

        # Carrega MIB usando pysnmp
        mib_name = os.path.basename(mib_path).split('.')[0]
        try:
            self.mib_builder.loadModules(mib_name)
            oids = self._get_pysnmp_oids(mib_name)
        except compiler.SmiError:
            oids = self._textual_mib_analysis(mib_path)

        # Validação final
        validated_oids = self._validate_oids(oids)

        if self.cache_enabled:
            self._oid_cache[mib_path] = validated_oids

        return {
            "mib_name": mib_name,
            "oids": validated_oids,
            "stats": {
                "total_oids": len(validated_oids),
                "unique_oids": len({oid['oid'] for oid in validated_oids})
            }
        }

    def _get_pysnmp_oids(self, mib_name: str) -> List[Dict]:
        """Obtém OIDs via pysnmp"""
        oids = []
        for module in self.mib_builder.getMibSymbols(mib_name):
            for name, sym in self.mib_builder.getMibSymbols(module):
                oid = self.mib_view.nodeNameToOid(name)
                oids.append({
                    "name": name,
                    "oid": '.'.join(map(str, oid)),
                    "description": sym.getDescription(),
                    "type": str(sym.getSyntax())
                })
        return oids

    def _textual_mib_analysis(self, mib_path: str) -> List[Dict]:
        """Análise textual para MIBs não padrão"""
        with open(mib_path, 'r') as f:
            content = f.read()

        oid_pattern = r'(?:--\s*((?:\d+\.)+\d+)|([A-Za-z0-9-]+)\s+OBJECT IDENTIFIER\s+::=\s+{\s*([A-Za-z0-9-]+)\s+(\d+)\s*})'
        matches = re.finditer(oid_pattern, content)

        oids = []
        for match in matches:
            if match.group(1):  # OID numérico
                oids.append({"oid": match.group(1)})
            else:  # Definição simbólica
                oid_name = match.group(2)
                parent = match.group(3)
                child = match.group(4)
                oids.append({
                    "name": oid_name,
                    "oid": f"{self._resolve_symbolic_oid(parent)}.{child}"
                })

        return oids

    def _resolve_symbolic_oid(self, symbolic: str) -> str:
        """Resolve OIDs simbólicos usando snmptranslate"""
        try:
            result = subprocess.run(
                ['snmptranslate', '-On', symbolic],
                capture_output=True,
                text=True,
                check=True
            )
            return result.stdout.strip().strip('.')
        except subprocess.CalledProcessError:
            return ""

    def _validate_oids(self, oid_list: List[Dict]) -> List[Dict]:
        """Valida OIDs usando snmptranslate"""
        valid_oids = []
        for oid_info in oid_list:
            oid = oid_info.get('oid', '')
            if not oid:
                continue

            try:
                result = subprocess.run(
                    ['snmptranslate', '-On', oid],
                    capture_output=True,
                    text=True,
                    check=True
                )
                valid_oid = result.stdout.strip().strip('.')
                oid_info['validated_oid'] = valid_oid
                valid_oids.append(oid_info)
            except subprocess.CalledProcessError:
                continue

        return valid_oids
