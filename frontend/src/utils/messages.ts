export function getMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function getChatTitle(question: string) {
  const trimmed = question.trim().replace(/\s+/g, ' ')

  if (!trimmed) {
    return 'New chat'
  }

  return trimmed.length > 42 ? `${trimmed.slice(0, 39)}...` : trimmed
}

export function getAnswerFromResponse(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return 'The assistant returned an empty response.'
  }

  const response = payload as Record<string, unknown>
  const answer =
    response.answer ??
    response.response ??
    response.text ??
    response.message ??
    response.generated_text

  return typeof answer === 'string' && answer.trim()
    ? answer
    : JSON.stringify(response, null, 2)
}

export function formatHistoryTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
