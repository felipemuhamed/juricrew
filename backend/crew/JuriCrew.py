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
import os

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
            json_content = raw_string.replace("```json", "").replace("```", "").strip()
        return json_content.strip()

    def _add_formatted_text(self, paragraph, text):
        parts = re.split(r'(\*\*.*?\*\*)', text)
        for part in parts:
            if part.startswith('**') and part.endswith('**'):
                run = paragraph.add_run(part[2:-2].strip())
                run.bold = True
            elif part:
                paragraph.add_run(part)

    def _normalize_markdown_for_docx(self, content: str) -> str:
        """Light cleanup so the DOCX renderer produces predictable, court-friendly output.

        Key goals:
        - Preserve paragraph breaks (blank lines) so Word doesn't look like every sentence is its own paragraph.
        - Remove invisible characters that create phantom blank paragraphs.
        - Remove duplicate "References" headings without deleting the actual reference entries.
        """
        if not content:
            return ""

        # Normalize newlines.
        content = content.replace("\r\n", "\n").replace("\r", "\n")

        def _clean_invisible(s: str) -> str:
            return (s
                    .replace("\u00A0", " ")   # NBSP
                    .replace("\u200B", "")   # zero-width space
                    .replace("\u200C", "")
                    .replace("\u200D", "")
                    .replace("\uFEFF", ""))  # BOM/zero-width no-break

        lines = content.split("\n")
        out: list[str] = []

        seen_references_heading = False
        in_references = False
        seen_reference_lines: set[str] = set()

        blank_pending = False

        for raw in lines:
            line = _clean_invisible(raw).rstrip()
            stripped = line.strip()

            # Preserve paragraph breaks, but collapse multiple consecutive blank lines to a single blank.
            if not stripped:
                blank_pending = True
                continue

            if blank_pending:
                out.append("")
                blank_pending = False

            is_bare_references_heading = stripped.lower() == "references" or stripped.lower() == "reference"
            is_heading = stripped.startswith("#")
            heading_text = stripped.lstrip("#").strip().lower() if is_heading else ""

            if (is_heading and "reference" in heading_text) or is_bare_references_heading:
                # Keep only the first References heading; later ones are dropped.
                if seen_references_heading:
                    in_references = True
                    continue
                seen_references_heading = True
                in_references = True
                out.append(line)
                continue

            if is_heading and "reference" not in heading_text:
                in_references = False

            # De-dupe exact duplicate reference lines (LLMs sometimes repeat them).
            if in_references:
                key = stripped
                if key in seen_reference_lines:
                    continue
                seen_reference_lines.add(key)

            out.append(line)

        # Trim leading/trailing blank lines.
        while out and out[0] == "":
            out.pop(0)
        while out and out[-1] == "":
            out.pop()

        return "\n".join(out)

    def generate_docx(self, content: str) -> io.BytesIO:
        doc = Document()

        sections = doc.sections
        for section in sections:
            section.top_margin = Inches(1)
            section.bottom_margin = Inches(1)
            section.left_margin = Inches(1)
            section.right_margin = Inches(1)

        style = doc.styles['Normal']
        font = style.font
        font.name = 'Times New Roman'
        font.size = Pt(12)
        style.element.rPr.rFonts.set(qn('w:eastAsia'), 'Times New Roman')

        # Paragraph defaults:
        # - Control paragraph spacing (avoid extra gaps)
        # - Line spacing is configurable via DOCX_LINE_SPACING
        #   (For CA filings, CRC 2.108 requires 1.5 or double; for internal drafts, 1.0–1.15 is common.)
        pf = style.paragraph_format
        pf.space_before = Pt(0)
        pf.space_after = Pt(0)
        try:
            line_spacing = float(os.getenv("DOCX_LINE_SPACING", "1.15"))
        except ValueError:
            line_spacing = 1.15
        pf.line_spacing = line_spacing

        # Alignment policy: default LEFT (safer for filings); optional JUSTIFY for internal drafts.
        # Use DOCX_ALIGNMENT=justify to enable.
        alignment_mode = os.getenv("DOCX_ALIGNMENT", "left").strip().lower()
        default_alignment = WD_ALIGN_PARAGRAPH.LEFT if alignment_mode != "justify" else WD_ALIGN_PARAGRAPH.JUSTIFY

        content = self._normalize_markdown_for_docx(content)

        def _apply_body_format(paragraph):
            paragraph.alignment = default_alignment
            paragraph.paragraph_format.space_before = Pt(0)
            paragraph.paragraph_format.space_after = Pt(0)
            paragraph.paragraph_format.line_spacing = line_spacing

        def _keep_with_next(paragraph):
            paragraph.paragraph_format.keep_with_next = True

        def _keep_together(paragraph):
            paragraph.paragraph_format.keep_together = True

        def _clean_invisible(s: str) -> str:
            return (s
                    .replace("\u00A0", " ")
                    .replace("\u200B", "")
                    .replace("\u200C", "")
                    .replace("\u200D", "")
                    .replace("\uFEFF", ""))

        def _is_numbered(line_text: str) -> bool:
            return bool(re.match(r"^\d+\.\s+", line_text))

        # Track whether we're inside a signature/verification block to reduce orphans.
        in_signature_block = False

        # Paragraph buffering: treat consecutive non-empty normal lines as a single paragraph.
        para_buf: list[str] = []

        def _flush_para_buf():
            nonlocal para_buf, in_signature_block
            if not para_buf:
                return
            text = " ".join(s.strip() for s in para_buf if s.strip())
            para_buf = []
            if not text:
                return
            p = doc.add_paragraph()
            self._add_formatted_text(p, text)
            _apply_body_format(p)

            lower = text.lower()
            if any(tok in lower for tok in ["respectfully submitted", "executed on", "i declare under penalty", "signature", "[[signature]]"]):
                in_signature_block = True
            if in_signature_block:
                _keep_together(p)
                if "[[signature]]" not in lower:
                    _keep_with_next(p)
            if in_signature_block and "[[signature]]" in lower:
                in_signature_block = False

        for line in content.split('\n'):
            stripped_line = _clean_invisible(line).strip()

            # Blank line = paragraph break.
            if not stripped_line:
                _flush_para_buf()
                continue

            # Structural line types flush the buffer first.
            is_heading = stripped_line.startswith(('# ', '## ', '### '))
            is_bullet = stripped_line.startswith(('* ', '- ', '• '))
            is_numbered = _is_numbered(stripped_line)
            if is_heading or is_bullet or is_numbered:
                _flush_para_buf()

            if stripped_line.startswith('# '):
                p = doc.add_paragraph(stripped_line[2:].strip().upper())
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                run = p.runs[0]
                run.bold = True
                run.font.size = Pt(14)
                p.paragraph_format.space_before = Pt(12)
                p.paragraph_format.space_after = Pt(6)
                _keep_with_next(p)
            elif stripped_line.startswith('## '):
                p = doc.add_paragraph(stripped_line[3:].strip())
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                run = p.runs[0]
                run.bold = True
                p.paragraph_format.space_before = Pt(12)
                p.paragraph_format.space_after = Pt(6)
                _keep_with_next(p)
            elif stripped_line.startswith('### '):
                p = doc.add_paragraph(stripped_line[4:].strip())
                run = p.runs[0]
                run.bold = True
                _apply_body_format(p)
                p.paragraph_format.space_before = Pt(12)
                p.paragraph_format.space_after = Pt(6)
                _keep_with_next(p)
            elif is_numbered:
                # Numbered list item.
                p = doc.add_paragraph(stripped_line, style='List Number')
                _apply_body_format(p)
            elif stripped_line.startswith(('* ', '- ', '• ')):
                # Bullet list items (support common LLM bullet styles).
                bullet_text = stripped_line[2:].strip()
                p = doc.add_paragraph(bullet_text, style='List Bullet')
                _apply_body_format(p)
            else:
                # Normal line: buffer it to avoid turning wrapped text into separate paragraphs.
                para_buf.append(stripped_line)
                continue

            # References heading should never be separated from the first reference entry.
            if stripped_line.strip().lower() in ["references", "# references", "## references", "### references"]:
                _keep_with_next(p)

            # Signature/verification blocks: keep lines together so the signature line
            # doesn't get stranded at the top/bottom of a page.
            lower = stripped_line.lower()
            if any(tok in lower for tok in ["respectfully submitted", "executed on", "i declare under penalty", "signature", "[[signature]]"]):
                in_signature_block = True
            if in_signature_block:
                _keep_together(p)
                if "[[signature]]" not in lower:
                    _keep_with_next(p)
            if in_signature_block and "[[signature]]" in lower:
                in_signature_block = False

        # Flush any remaining buffered paragraph.
        _flush_para_buf()

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
            verbose=False,
            # Disable CrewAI built-in tracing in API environments.
            # This prevents the interactive prompt:
            # "Would you like to view your execution traces? [y/N] (20s timeout)"
            tracing=False
        )

        result = await pledge_crew.kickoff_async(inputs=drafting_inputs)
        draft = (result.raw or "").strip()

        # Quality gate: If the LLM omits major sections or fails to include selected authorities,
        # run a single "repair" pass that preserves existing text and only adds missing components.
        missing_sections = self._find_missing_court_ready_sections(draft)
        missing_authorities = self._find_missing_selected_authorities(draft, selected_authorities)

        if missing_sections or missing_authorities:
            repair_task = Task(
                description=(
                    "You are revising a drafted legal motion to be complete, professional, and court-ready.\n\n"
                    "STRICT REQUIREMENTS:\n"
                    "- Preserve the existing text and structure as much as possible.\n"
                    "- DO NOT delete substantive sections that already exist.\n"
                    "- ONLY add the missing sections and missing authority citations listed below.\n"
                    "- Use ONLY the provided selected_authorities; DO NOT add new rules/cases/statutes.\n"
                    "- Use placeholders like [[HEARING DATE]], [[TIME]], [[DEPT]], [[DATE]] where details are missing.\n"
                    "- Keep a single References section.\n\n"
                    f"MISSING SECTIONS TO ADD: {missing_sections if missing_sections else 'None'}\n"
                    f"MISSING SELECTED AUTHORITIES TO CITE/LIST: {missing_authorities if missing_authorities else 'None'}\n\n"
                    "INPUTS (SOURCE OF TRUTH):\n"
                    f"- motion_type: {motion_type}\n"
                    f"- court: {court}\n"
                    f"- facts: {facts}\n"
                    f"- selected_authorities: {selected_authorities}\n"
                    f"- firm_template: {firm_template}\n\n"
                    "HERE IS THE CURRENT DRAFT (revise it):\n"
                    "--- BEGIN DRAFT ---\n"
                    f"{draft}\n"
                    "--- END DRAFT ---\n\n"
                    "OUTPUT ONLY THE REVISED FINAL PLEADING."
                ),
                expected_output="ONLY the revised final pleading, with no explanations.",
                agent=self.legal_pleadings_agent(llm)
            )

            repair_crew = Crew(
                agents=[self.legal_pleadings_agent(llm)],
                tasks=[repair_task],
                process=Process.sequential,
                verbose=False,
                tracing=False
            )
            repaired = await repair_crew.kickoff_async(inputs={})
            draft = (repaired.raw or draft).strip()

        return draft

    def _find_missing_court_ready_sections(self, draft: str) -> list[str]:
        if not draft:
            return [
                "Caption/Title",
                "Notice of Motion and Motion",
                "Memorandum of Points and Authorities",
                "Declaration re: Meet and Confer",
                "Proposed Order",
                "Proof of Service",
                "References",
                "Signature",
            ]

        d = draft.lower()
        required = [
            ("notice of motion", "Notice of Motion and Motion"),
            ("memorandum", "Memorandum of Points and Authorities"),
            ("points and authorities", "Memorandum of Points and Authorities"),
            ("declaration", "Declaration re: Meet and Confer"),
            ("meet and confer", "Declaration re: Meet and Confer"),
            ("proposed order", "Proposed Order"),
            ("proof of service", "Proof of Service"),
            ("references", "References"),
            ("signature", "Signature"),
        ]

        missing: set[str] = set()
        # caption/title are hard to reliably detect; rely on presence of court name or motion title.
        if "superior court" not in d and "united states" not in d and "court" not in d[:400]:
            missing.add("Caption/Title")

        for needle, label in required:
            if needle not in d:
                missing.add(label)

        # If "memorandum" is present but not "points and authorities", we still accept it.
        if "memorandum" in d:
            missing.discard("Memorandum of Points and Authorities")

        # If declaration exists but not meet-and-confer phrasing, still accept.
        if "declaration" in d:
            missing.discard("Declaration re: Meet and Confer")

        return sorted(missing)

    def _find_missing_selected_authorities(self, draft: str, selected_authorities) -> list[str]:
        try:
            auth = selected_authorities
            if isinstance(selected_authorities, str):
                auth = json.loads(selected_authorities)
        except Exception:
            return []

        if not isinstance(auth, dict) or not draft:
            return []

        d = draft.lower()

        def _tokens_for_entry(entry: dict) -> list[str]:
            toks: list[str] = []
            for k in ("citation", "title", "case_name"):
                v = entry.get(k)
                if isinstance(v, str) and v.strip():
                    toks.append(v.strip())
            return toks

        entries: list[dict] = []
        for key in ("procedural_rules", "statutes", "binding_case_law", "persuasive_case_law"):
            v = auth.get(key)
            if isinstance(v, list):
                entries.extend([e for e in v if isinstance(e, dict)])

        missing: list[str] = []
        for e in entries:
            toks = _tokens_for_entry(e)
            if not toks:
                continue
            # Consider the authority present if any token appears.
            if not any(t.lower() in d for t in toks):
                # Prefer citation label for reporting.
                missing.append(toks[0])

        return missing

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

        research_crew = Crew(
            agents=[self.legal_research_agent_us(llm)],
            tasks=[self.legal_research_us(llm)],
            process=Process.sequential,
            verbose=False,
            tracing=False
        )

        result = await research_crew.kickoff_async(inputs=inputs)
        return result.raw