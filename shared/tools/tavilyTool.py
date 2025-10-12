from langchain_community.tools import TavilySearchResults

from crewai.tools import BaseTool
from pydantic import Field


search = TavilySearchResults(max_results=10, search_depth="advanced", include_domains=["https://www.sharetechnote.com/", "https://www.telecomhall.net/"])

class TavilyTool(BaseTool):
    name: str = "Search"
    description: str = "Useful for search-based queries. Use this to find current information about markets, companies, and trends."
    search: TavilySearchResults = Field(default_factory=TavilySearchResults)

    def _run(self, query: str) -> str:
        """Execute the search query and return results"""
        try:
            return self.search.run(query)
        except Exception as e:
            return f"Error performing search: {str(e)}"
