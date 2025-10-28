from crewai.tools import BaseTool
from pydantic import BaseModel, Field, PrivateAttr
from typing import Optional, Type, Any, List
from ddgs import DDGS
import time

class WebSearchToolInput(BaseModel):
    query: str = Field(..., description="Search query or keywords to find relevant information on the web.")
    max_results: Optional[int] = Field(5, description="Maximum number of results to retrieve (default: 5).")
    region: Optional[str] = Field("en", description="Region or language code for localized search (default: 'en').")
    timeout: Optional[int] = Field(10, description="Timeout in seconds for each search request (default: 10).")
    retries: Optional[int] = Field(2, description="Number of retries for timed-out requests (default: 2).")

class WebSearchTool(BaseTool):
    name: str = "Web Search"
    description: str = (
        "Performs a live search on the web using DuckDuckGo to retrieve the most relevant information "
        "based on a given query. Returns titles, snippets, and URLs for contextual reference."
    )
    args_schema: Type[BaseModel] = WebSearchToolInput
    _client: Any = PrivateAttr()
    _default_timeout: int = PrivateAttr()
    _default_retries: int = PrivateAttr()

    def __init__(self, default_timeout: int = 10, default_retries: int = 2):
        super().__init__()
        self._client = DDGS(timeout=default_timeout)
        self._default_timeout = default_timeout
        self._default_retries = default_retries

    def _run(self, query: str, max_results: int = 5, region: str = "br-pt",
             timeout: Optional[int] = None, retries: Optional[int] = None) -> dict:
        results = []
        timeout = timeout or self._default_timeout
        retries = retries if retries is not None else self._default_retries

        attempt = 0
        while attempt <= retries:
            try:
                with self._client as ddgs:
                    search_results = ddgs.text(query, max_results=max_results, region=region)
                    for res in search_results:
                        if isinstance(res, dict):
                            results.append({
                                "title": res.get("title", ""),
                                "snippet": res.get("body", ""),
                                "url": res.get("href", "")
                            })
                        elif isinstance(res, (list, tuple)) and len(res) >= 3:
                            results.append({
                                "title": str(res[0]),
                                "snippet": str(res[1]),
                                "url": str(res[2])
                            })
                        else:
                            results.append({
                                "title": str(res),
                                "snippet": "",
                                "url": ""
                            })
                break
            except Exception as e:
                if "timed out" in str(e).lower() or "timeout" in str(e).lower():
                    attempt += 1
                    if attempt > retries:
                        return {"error": f"Web search failed after {retries} retries: {str(e)}"}
                    time.sleep(2)
                    continue
                else:
                    return {"error": f"Web search failed: {str(e)}"}

        return self._format_results(results)

    def _format_results(self, results: List[dict]) -> dict:
        return {
            "query_results": results,
            "stats": {"total_results": len(results)},
            "context": (
                "These web search results may contain relevant jurisprudence, legal articles, or factual data. "
                "Use them to support reasoning, drafting, or fact-checking."
            )
        }
