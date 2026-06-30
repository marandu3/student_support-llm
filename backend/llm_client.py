import requests

from config import MODEL_NAME, SYSTEM_PROMPT

OLLAMA_URL = "http://localhost:11434/api/chat"


def ask_llm(question: str) -> str:
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {
                "role": "system",
                "content": SYSTEM_PROMPT
            },
            {
                "role": "user",
                "content": question
            }
        ],
        "stream": False
    }

    response = requests.post(OLLAMA_URL, json=payload, timeout=120)

    response.raise_for_status()

    data = response.json()

    return data["message"]["content"]