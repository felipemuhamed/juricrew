from crewai.tools import BaseTool
from pydantic import BaseModel, Field
from typing import Optional, Type, Any
from pydantic import PrivateAttr

class CodeSearchToolInput(BaseModel):
    """Input schema for code search tool."""
    query: str = Field(..., description="Search query to find relevant code snippets")
    file_filter: Optional[str] = Field(
        None, 
        description="Optional filter to search in specific files (e.g., 'src/utils/*.py')"
    )

class CodeSearchTool(BaseTool):
    name: str = "Codebase Search"
    description: str = (
        "Searches existing codebase for relevant snippets and implementations. "
        "Essential for maintaining code consistency and avoiding duplication."
    )
    args_schema: Type[BaseModel] = CodeSearchToolInput
    _retriever: Any = PrivateAttr()  # This won't be part of the schema


    def __init__(self, vector_store):
        super().__init__()
        self._retriever = vector_store.as_retriever(
            search_type="mmr",
            search_kwargs={
                "k": 32,
                "score_threshold": 0.8,
            }
        )
    def _run(self, query: str, file_filter: Optional[str] = None) -> dict:
        search_kwargs = {}
        if file_filter:
            search_kwargs["filter"] = {"source": file_filter}
        
        docs = self._retriever.invoke(
            query,
            search_kwargs=search_kwargs
        )
        
        return self._format_results(docs)

    def _format_results(self, docs) -> dict:
        results = []
        unique_files = set()
        
        for i, doc in enumerate(docs):
            full_path = doc.metadata['source']
            unique_files.add(full_path)
            
            # Tentar obter caminho relativo
            relative_path = doc.metadata.get('relative_path', '')
            if not relative_path and 'cloned_repos/' in full_path:
                relative_path = full_path.split('cloned_repos/', 1)[-1]
            
            results.append({
                "file_path": full_path,
                "relative_path": relative_path,
                "language": doc.metadata.get('language', 'unknown'),
                "start_line": doc.metadata.get('start_index', 0),
                "code_snippet": doc.page_content,
                "file_size": doc.metadata.get('file_size', 0),
                "last_modified": doc.metadata.get('last_modified', 0),
                "git_url": doc.metadata.get('git_url', '')
            })
        
        return {
            "query_results": results,
            "stats": {
                "total_matches": len(results),
                "unique_files_matched": len(unique_files)
            },
            "context": "Use these code snippets as reference for implementation"
        }