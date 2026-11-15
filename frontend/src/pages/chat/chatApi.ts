import { ApiError, apiFetch } from "../../shared/api/client"
import { readEventStream } from "./eventStream"

export interface ChatMessage {
  id: string
  role: "assistant" | "user"
  content: string
  created_at: string
}

export interface ChatTransport {
  load: (signal: AbortSignal) => Promise<ChatMessage[]>
  send: (
    message: string,
    signal: AbortSignal,
    onDelta: (delta: string) => void,
  ) => Promise<string | void>
}

const chatPath = "/api/chat"

export const chatTransport: ChatTransport = {
  async load(signal) {
    const history = await apiFetch<{ messages: ChatMessage[] }>(chatPath, { signal })
    if (!Array.isArray(history?.messages)) throw new Error("Expected a chat message history")
    return history.messages
  },

  async send(message, signal, onDelta) {
    const baseUrl = import.meta.env.VITE_API_URL ?? ""
    const response = await fetch(`${baseUrl}${chatPath}`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      signal,
    })

    if (!response.ok) {
      throw new ApiError(response.status, `POST ${chatPath} failed with status ${response.status}`)
    }

    const mediaType = response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase()
    if (mediaType !== "text/event-stream" || !response.body) {
      throw new Error("Expected a chat event stream")
    }

    let finalResponse: string | undefined
    let nextPaint = 0
    async function showText(text: string) {
      const characters = Array.from(text)
      // A network read can contain several events or one large delta.
      const batchSize = Math.max(24, Math.ceil(characters.length / 40))
      for (let start = 0; start < characters.length; start += batchSize) {
        const delay = nextPaint - performance.now()
        if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, delay))
        if (signal.aborted) throw signal.reason
        onDelta(characters.slice(start, start + batchSize).join(""))
        nextPaint = performance.now() + 24
      }
    }

    await readEventStream(response.body, ({ type, data }) => {
      switch (type) {
        case "token": {
          const { delta } = JSON.parse(data)
          if (typeof delta === "string") return showText(delta)
          break
        }
        case "done": {
          const { response } = JSON.parse(data)
          if (typeof response === "string") {
            finalResponse = response
            if (!nextPaint) return showText(response)
          }
          break
        }
        case "error":
          throw new Error("Chat event stream reported an error")
      }
    })
    return finalResponse
  },
}
