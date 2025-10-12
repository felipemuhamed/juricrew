from langchain.tools import tool
import requests
import json
import os

# URL do Webhook (substitua pela sua)
webhook_url = os.environ.get("WEBHOOK_URL", "https://outlook.office.com/webhook/SEU-WEBHOOK")

@tool("teams_sender_tool")
def teams_sender_tool(public_url: str) -> str:
    """
    Sends a message with a Microsoft Teams card containing a link to download a report.

    Args:
        public_url (str): The public URL for downloading the PDF report.

    Returns:
        str: A success message if the message was sent successfully, or an error message if something goes wrong.
    """
    # Improved message structure using a Microsoft Teams Hero Card
    message = {
        "type": "message",
        "attachments": [
            {
                "contentType": "application/vnd.microsoft.card.hero",
                "content": {
                    "title": "New LTE Network Analysis Report Available",
                    "subtitle": "Created by Zabbix AI",
                    "text": "You can access the full report through the link below:",
                    "buttons": [
                        {
                            "type": "openUrl",
                            "title": "Download PDF",
                            "value": public_url
                        }
                    ]
                }
            }
        ]
    }

    # Send the message
    response = requests.post(
        webhook_url,
        headers={"Content-Type": "application/json"},
        data=json.dumps(message)
    )

    # Check the result
    if response.status_code == 200:
        return "Message sent successfully"
    else:
        return f"Error sending message: {response.status_code}, {response.text}"