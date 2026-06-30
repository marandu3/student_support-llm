import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:8000",
});

export async function askQuestion(question: string) {
  const start = performance.now();

  const res = await api.post("/ask", { question });

  const end = performance.now();

  return {
    answer: res.data.answer,
    time: ((end - start) / 1000).toFixed(2),
  };
}