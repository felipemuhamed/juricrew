from langchain.tools import tool
from datetime import datetime, timedelta

@tool("time_tool")
def time_tool(days_ago: int) -> int:
    """
    Returns the epoch time for midnight of the day before the given offset 
    from today.

    Args:
        days_ago (int): Number of days to subtract from today. 
                        (0 = previous day's midnight, 1 = two days ago's midnight, etc.)

    Returns:
        int: The epoch timestamp for midnight of the calculated day.
    """
    target_date = datetime.today() - timedelta(days=days_ago + 1)  # Ajusta para o dia anterior
    midnight = datetime.combine(target_date, datetime.min.time())  # Define como meia-noite
    return int(midnight.timestamp())  # Retorna o timestamp em segundos