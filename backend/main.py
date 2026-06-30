from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from model import QuestionRequest, AnswerResponse
from llm_client import ask_llm
from logger import logger

app = FastAPI(
    title="University Student Support Assistant",
    version="1.0.0",
)

# Allow React frontend to communicate with FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "message": "University Student Support Assistant API"
    }


@app.get("/health")
def health():
    return {
        "status": "running"
    }


@app.post("/ask", response_model=AnswerResponse)
def ask(request: QuestionRequest):

    question = request.question.strip()

    if question == "":
        raise HTTPException(
            status_code=400,
            detail="Question cannot be empty."
        )

    logger.info(f"Question: {question}")

    try:

        answer = ask_llm(question)

        logger.info(f"Answer: {answer}")

        return AnswerResponse(answer=answer)

    except Exception as e:

        logger.error(str(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to communicate with the language model."
        )