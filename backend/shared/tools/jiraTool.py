from langchain_community.utilities.jira import JiraAPIWrapper
from crewai.tools import BaseTool
from pydantic import Field

jira = JiraAPIWrapper()

class JiraTool(BaseTool):
    name: str = "Jira"
    description: str = "Facilitates integration with Jira for managing and automating tasks, creating issues, updating statuses, and retrieving project details."
    jira: JiraAPIWrapper = Field(default_factory=JiraAPIWrapper)

    def _run(self, query: str) -> str:
        """Execute the jira integration and return results"""
        try:
            return self.jira.run(query)
        except Exception as e:
            return f"Error performing jira execution: {str(e)}"
