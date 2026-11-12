import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createRoot } from "react-dom/client"
import "@fontsource-variable/manrope"
import "../../index.css"
import { ChatConversation } from "./ChatConversation"
import type { ChatMessage, ChatTransport } from "./chatApi"

function todayAt(minute: number) {
  const date = new Date()
  date.setHours(10, minute, 0, 0)
  return date.toISOString()
}

let messages: ChatMessage[] = [
  {
    id: "preview-1",
    role: "assistant",
    content:
      "Привет! Я AI Buddy. Помогу разобраться в проекте и найти нужную информацию. С чего начнём?",
    created_at: todayAt(24),
  },
  {
    id: "preview-2",
    role: "user",
    content: "Как запустить проект локально?",
    created_at: todayAt(25),
  },
  {
    id: "preview-3",
    role: "assistant",
    content: [
      "Начни с настройки окружения:",
      "1. Склонируй репозиторий.",
      "2. Создай .env по примеру .env.example.",
      "3. Запусти сервисы командой ниже.",
      "",
      "```sh",
      "docker compose up -d --build",
      "```",
      "",
      "Подробная инструкция — в базе знаний.  ",
      "[Настройка окружения](#environment)",
    ].join("\n"),
    created_at: todayAt(25),
  },
  {
    id: "preview-4",
    role: "user",
    content: "Спасибо! Где посмотреть архитектуру?",
    created_at: todayAt(27),
  },
  {
    id: "preview-5",
    role: "assistant",
    content:
      "В документе „Архитектура проекта“ описаны сервисы и их взаимодействие.  \n[Архитектура проекта](#architecture)",
    created_at: todayAt(27),
  },
]

const transport: ChatTransport = {
  async load(signal) {
    signal.throwIfAborted()
    return messages
  },
  async send(message, signal, onDelta) {
    const reply = ["Это ", "тестовый ответ ", "в локальном ", "предпросмотре."]
    for (const part of reply) {
      await new Promise((resolve) => setTimeout(resolve, 160))
      signal.throwIfAborted()
      onDelta(part)
    }

    const created_at = new Date().toISOString()
    messages = [
      ...messages,
      { id: `preview-${messages.length + 1}`, role: "user", content: message, created_at },
      {
        id: `preview-${messages.length + 2}`,
        role: "assistant",
        content: reply.join(""),
        created_at,
      },
    ]
  },
}

if (import.meta.env.DEV) {
  createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={new QueryClient()}>
      <ChatConversation userId={0} displayName="Г" transport={transport} />
    </QueryClientProvider>,
  )
}
