import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createRoot } from "react-dom/client"
import "@fontsource-variable/manrope"
import "../../index.css"
import { AppHeader } from "../../shared/ui/AppHeader/AppHeader"
import { ChatConversation } from "./ChatConversation"
import styles from "./ChatPage.module.css"
import type { ChatMessage, ChatTransport } from "./chatApi"
import demoAnswer from "./demoAnswer.md?raw"

export const demoQuestion =
  "Как устроен проект AI Buddy, как запустить его локально и какие технологии используются?"
const fragmentSizes = [35, 82, 51, 112, 46, 94, 68, 126, 57, 102]

function normalizeQuestion(question: string) {
  return question
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[?!.]+$/, "")
    .toLocaleLowerCase("ru-RU")
}

export function previewReply(message: string, demoMode: boolean) {
  if (!demoMode || normalizeQuestion(message) !== normalizeQuestion(demoQuestion)) {
    return ["Это ", "тестовый ответ ", "в локальном ", "предпросмотре."]
  }

  const characters = Array.from(demoAnswer)
  const fragments: string[] = []
  for (let offset = 0; offset < characters.length;) {
    const size = fragmentSizes[fragments.length % fragmentSizes.length]
    fragments.push(characters.slice(offset, offset + size).join(""))
    offset += size
  }
  return fragments
}

function todayAt(minute: number) {
  const date = new Date()
  date.setHours(10, minute, 0, 0)
  return date.toISOString()
}

const demoMessages: ChatMessage[] = [
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

const demoMode = new URLSearchParams(window.location.search).get("demo") === "1"
let messages = demoMode ? demoMessages : []

const transport: ChatTransport = {
  async load(signal) {
    signal.throwIfAborted()
    return messages
  },
  async send(message, signal, onDelta) {
    const reply = previewReply(message, demoMode)
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

const root = document.getElementById("root")
if (import.meta.env.DEV && root) {
  createRoot(root).render(
    <QueryClientProvider client={new QueryClient()}>
      <div className={styles.preview}>
        <AppHeader initial="Г" activePage="chat" />
        <main>
          <ChatConversation userId={0} displayName="Г" transport={transport} />
        </main>
      </div>
    </QueryClientProvider>,
  )
}
