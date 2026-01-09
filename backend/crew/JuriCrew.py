from crewai import Agent, Crew, Process, Task
from crewai.project import CrewBase, agent, task
from shared.llms.DeepSeekLLM import DeepSeekLLM
from shared.tools.WebSearchTool import WebSearchTool
from crewai_tools import RagTool
from docx import Document
import re
import io
import json
from docx.shared import Pt, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn

web_search_tool = WebSearchTool()

config = {
    "vectordb": {
        "provider": "chromadb",
        "config": {
            "persist_directory": "./data/chroma_db",
            "collection_name": "my-local-collection"
        }
    },
    "embedding_model": {
        "provider": "sentence-transformer",
        "config": {
            "model": "sentence-transformers/all-MiniLM-L6-v2"
        }
    }
}

rag_search_tool = RagTool(config=config, summarize=True)

@CrewBase
class JuriCrew:
    agents_config = "/app/crew/config/agent.yaml"
    tasks_config = "/app/crew/config/task.yaml"

    def _create_agent(self, agent_config_key: str, tools: list, llm) -> Agent:
        return Agent(
            config=self.agents_config[agent_config_key],
            tools=tools,
            llm=llm,
            verbose=False
        )

    @agent
    def legal_pleadings_agent(self, llm) -> Agent:
        return self._create_agent("legal_pleadings_agent", [rag_search_tool, web_search_tool], llm=llm)

    @task
    def draft_pleading(self, llm) -> Task:
        return Task(config=self.tasks_config["draft_pleading"], agent=self.legal_pleadings_agent(llm))


    @agent
    def legal_research_agent_us(self, llm) -> Agent:
        return self._create_agent("legal_research_agent_us", [rag_search_tool, web_search_tool], llm=llm)

    @task
    def legal_research_us(self, llm) -> Task:
        return Task(config=self.tasks_config["legal_research_us"], agent=self.legal_research_agent_us(llm))


    def sanitize_json(self, raw_string: str) -> str:
        start = raw_string.find('```json')
        end = raw_string.find('```', start + 1) if start != -1 else -1
        if start != -1 and end != -1:
            json_content = raw_string[start + 7: end]
        else:
            json_content = raw_string.replace(
                "```json", "").replace("```", "").strip()
        return json_content.strip()

    def _add_formatted_heading(self, doc, text, level):
        """Adiciona cabeçalho com formatação em negrito"""
        heading = doc.add_paragraph()
        heading.style = f'Heading {level}'
        self._add_formatted_text(heading, text)

    def _add_formatted_text(self, paragraph, text):
        """Adiciona texto com formatação em negrito para partes entre **"""
        parts = re.split(
            r'(\*\*.*?\*\*)', text)  # Divide preservando os marcadores de **negrito**

        for part in parts:
            if part.startswith('**') and part.endswith('**'):
                # Texto entre ** - aplica negrito
                run = paragraph.add_run(part[2:-2].strip())
                run.bold = True
            elif part:
                # Texto normal
                paragraph.add_run(part)

    def generate_docx(self, content: str) -> io.BytesIO:
        """Cria documento DOCX jurídico formatado e com referências"""
        doc = Document()

        # ====== FORMATAÇÃO PADRÃO ======
        # Define margens (2,5 cm padrão jurídico)
        sections = doc.sections
        for section in sections:
            section.top_margin = Inches(1)
            section.bottom_margin = Inches(1)
            section.left_margin = Inches(1)
            section.right_margin = Inches(1)

        # Define estilo de fonte
        style = doc.styles['Normal']
        font = style.font
        font.name = 'Times New Roman'
        font.size = Pt(12)
        # Compatibilidade com DOCX XML
        style.element.rPr.rFonts.set(qn('w:eastAsia'), 'Times New Roman')

        # ====== PROCESSA O CONTEÚDO ======
        for line in content.split('\n'):
            stripped_line = line.strip()
            if not stripped_line:
                continue

            # Cabeçalhos
            if stripped_line.startswith('# '):
                p = doc.add_paragraph(stripped_line[2:].strip().upper())
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                run = p.runs[0]
                run.bold = True
                run.font.size = Pt(14)
            elif stripped_line.startswith('## '):
                p = doc.add_paragraph(stripped_line[3:].strip())
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                run = p.runs[0]
                run.bold = True
            elif stripped_line.startswith('### '):
                p = doc.add_paragraph(stripped_line[4:].strip())
                run = p.runs[0]
                run.bold = True

            # Listas
            elif stripped_line.startswith('* '):
                p = doc.add_paragraph(stripped_line[2:].strip(), style='List Bullet')
                p_format = p.paragraph_format
                p_format.space_after = Pt(6)

            # Texto normal com formatação
            else:
                p = doc.add_paragraph()
                self._add_formatted_text(p, stripped_line)
                p.paragraph_format.space_after = Pt(6)

        # ====== SALVA E RETORNA ======
        output = io.BytesIO()
        doc.save(output)
        output.seek(0)
        return output

    def add_to_rag(self, path):
        rag_search_tool.add(data_type="file", path=path)


    async def create_pledge(self, motion_type, facts, process, court, parts, selected_authorities, firm_template, llm_tokens=None):
        api_keys = llm_tokens["api_key"].split(",")
        api_keys = [k.strip() for k in api_keys if k.strip()]

        llm = DeepSeekLLM(
            model=llm_tokens.get("model"),
            api_key=api_keys,
            temperature=0.1,
            top_p=0.1
        )

        drafting_inputs = {
            "motion_type": motion_type,
            "facts": facts,
            "process": process,
            "parts": parts,
            "court": court,
            "selected_authorities": selected_authorities,
            "firm_template": firm_template
        }

        pledge_crew = Crew(
            agents=[self.legal_pleadings_agent(llm)],
            tasks=[self.draft_pleading(llm)],
            process=Process.sequential,
            verbose=False
        )

        result = await pledge_crew.kickoff_async(inputs=drafting_inputs)
        return result.raw

    async def create_research(self, motion_type, facts, process, court, parts, llm_tokens: dict = None):
        api_keys = llm_tokens["api_key"].split(",")
        api_keys = [k.strip() for k in api_keys if k.strip()]

        llm = DeepSeekLLM(
            model=llm_tokens.get("model"),
            api_key=api_keys
        )

        inputs = {
            "motion_type": motion_type,
            "facts": facts,
            "process": process,
            "parts": parts,
            "court": court
        }

        # NOTE: aqui roda apenas a task de pesquisa
        research_crew = Crew(
            agents=[self.legal_research_agent_us(llm)],
            tasks=[self.legal_research_us(llm)],
            process=Process.sequential,
            verbose=False
        )

        result = await research_crew.kickoff_async(inputs=inputs)
        return result.raw