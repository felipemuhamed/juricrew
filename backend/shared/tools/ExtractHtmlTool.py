from crewai.tools import BaseTool
from pydantic import BaseModel, Field
from typing import Type
import asyncio
from playwright.async_api import async_playwright

from bs4 import BeautifulSoup
import difflib


class ExtractSpaHtmlInput(BaseModel):
    url: str = Field(..., description="URL da página para extrair o HTML")
    username: str = Field(..., description="Username to login")
    password: str = Field(..., description="Password to login")


class ExtractHtmlTool(BaseTool):
    name: str = "Generic SPA HTML & Elements Extractor"
    description: str = (
        "Extrai HTML renderizado de qualquer SPA (Angular, React, Vue), "
        "trata login genérico, captura elementos interativos estruturados "
        "para gerar testes Cypress confiáveis."
    )
    args_schema: Type[BaseModel] = ExtractSpaHtmlInput

    def _get_clean_html(self, raw_html: str) -> str:
        soup = BeautifulSoup(raw_html, "html.parser")
        for tag in soup(["script", "style", "noscript", "meta", "link"]):
            tag.decompose()
        body = soup.body
        return body.prettify() if body else soup.prettify()

    def _get_diff_html(self, old_html: str, new_html: str) -> str:
        """Retorna apenas as diferenças entre dois HTMLs"""
        diff = difflib.unified_diff(
            old_html.splitlines(),
            new_html.splitlines(),
            lineterm=""
        )
        added = [line[1:] for line in diff if line.startswith(
            "+") and not line.startswith("+++")]
        return "\n".join(added).strip()

    async def _run_async(self, username, password, url: str, wait_time: float = 1.0) -> dict:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()

            # Carrega a página inicial
            await page.goto(url, wait_until="domcontentloaded")
            await page.wait_for_timeout(wait_time * 1000)

            # Faz login se necessário
            if await self._is_login_page_async(page):
                await self._handle_login_async(page, wait_time, username, password)

            # Snapshot inicial
            initial_html = self._get_clean_html(await page.content())

            # Busca elementos clicáveis
            soup = BeautifulSoup(initial_html, "html.parser")
            clickable_elements = []
            seen = set()

            for el in soup.find_all(["button", "a"]):
                text = el.get_text(strip=True)
                if text and text.lower() not in seen:
                    clickable_elements.append(f"text={text}")
                    seen.add(text.lower())
                elif el.get("aria-expanded") == "false":
                    if "aria-expanded=false" not in seen:
                        clickable_elements.append(
                            "button[aria-expanded='false']")
                        seen.add("aria-expanded=false")
                elif el.get("role") == "button":
                    if el.name not in seen:
                        clickable_elements.append(el.name)
                        seen.add(el.name)

            # Executa cliques em paralelo em novos contextos (isola o estado)
            async def process_click(target: str):
                try:
                    ctx = await browser.new_context()
                    pg = await ctx.new_page()
                    await pg.goto(url, wait_until="domcontentloaded")
                    await pg.wait_for_timeout(wait_time * 1000)

                    if await self._is_login_page_async(pg):
                        await self._handle_login_async(pg, wait_time, username, password)

                    result = await self._click_and_extract_async(pg, target, wait_time)
                    await ctx.close()
                    return target, result
                except Exception as e:
                    return target, f"Erro ao clicar: {str(e)}"

            tasks = [process_click(t) for t in clickable_elements]
            results = await asyncio.gather(*tasks)

            expanded = dict(results)

            await browser.close()
            return {"initial": initial_html, "expanded": expanded}

    def _run(self, username, password, url: str, wait_time: float = 1.0) -> dict:
        """Interface síncrona chamando a versão assíncrona"""
        return asyncio.run(self._run_async(username, password, url, wait_time))

    # Métodos auxiliares async
    async def _is_login_page_async(self, page):
        selectors = [
            'input[name="username"]', 'input[name="user"]', 'input[type="email"]',
            'input[type="password"]', '#username', '#password', 'form[action*="login"]'
        ]
        for s in selectors:
            if await page.query_selector(s):
                return True
        return False

    async def _handle_login_async(self, page, wait_time: float, username: str, password: str):
        try:
            for s in ['input[name="username"]', 'input[name="user"]', 'input[type="email"]', '#username']:
                if await page.query_selector(s):
                    await page.fill(s, username)
                    break
            await page.fill('input[type="password"]', password)
            for s in ['input[type="submit"]', 'button[type="submit"]', '#kc-login', 'button:has-text("Sign in")']:
                if await page.query_selector(s):
                    await page.click(s)
                    break
            await page.wait_for_load_state("networkidle")
        except Exception as e:
            raise RuntimeError(f"Falha no login: {str(e)}")

    async def _click_and_extract_async(self, page, target_element: str, wait_time: float) -> str:
        element = await page.query_selector(target_element) or await page.query_selector(f"text={target_element}")
        if not element:
            raise RuntimeError(f"Elemento não encontrado: {target_element}")

        original_url = page.url
        old_html = self._get_clean_html(await page.content())

        await element.click()
        await page.wait_for_timeout(wait_time * 1000)

        new_url = page.url
        new_html = self._get_clean_html(await page.content())

        # Caso 1: se mudou de rota → ignora
        if new_url != original_url:
            # volta para a URL original para manter consistência
            await page.goto(original_url, wait_until="domcontentloaded")
            await page.wait_for_timeout(wait_time * 1000)
            return "Ignorado: mudança de página"

        # Caso 2: aria-controls → pega painel direto
        aria_controls = await element.get_attribute("aria-controls")
        if aria_controls:
            panel = await page.query_selector(f"#{aria_controls}")
            if panel:
                return await panel.inner_html()

        # Caso 3: aria-expanded → pega conteúdo vizinho expandido
        aria_expanded = await element.get_attribute("aria-expanded")
        if aria_expanded == "true":
            sibling = await element.evaluate_handle("el => el.nextElementSibling")
            if sibling:
                return await sibling.inner_html()

        # Caso 4: se houve alteração no DOM → diff simples
        if old_html != new_html:
            return self._get_diff_html(old_html, new_html)

        # Caso 5: fallback → retorna inner_html do próprio elemento
        return await element.inner_html()