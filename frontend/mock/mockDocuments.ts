/*
 * Documents of the knowledge base for the mock API. In the real app the integration service takes
 * them from Google Drive and lets a model pick the title, the description and the category.
 */

/** The `document_category` enum of the database. */
export const MOCK_DOCUMENT_CATEGORIES = [
  "start_work",
  "development",
  "work_processes",
  "team_values",
  "contacts",
  "ai_answers",
  "company",
]

export interface MockDocument {
  id: number
  title: string
  description: string
  category: string
}

export const MOCK_DOCUMENTS: MockDocument[] = [
  {
    id: 1,
    title: "Первый день в команде",
    description: "Доступы, знакомства и первые шаги на стажировке.",
    category: "start_work",
  },
  {
    id: 2,
    title: "Настройка окружения",
    description: "Подготовь инструменты и запусти проект локально.",
    category: "development",
  },
  {
    id: 3,
    title: "Архитектура проекта",
    description: "Как устроены сервисы и как они связаны между собой.",
    category: "development",
  },
  {
    id: 4,
    title: "Как мы работаем",
    description: "Задачи, встречи и правила взаимодействия в команде.",
    category: "work_processes",
  },
  {
    id: 5,
    title: "Code review",
    description: "Как подготовить изменения и получить обратную связь.",
    category: "development",
  },
  {
    id: 6,
    title: "К кому обратиться",
    description: "Найди нужного человека и получи помощь.",
    category: "contacts",
  },
  {
    id: 7,
    title: "Чек-лист первой недели",
    description: "Что успеть за первые пять дней, чтобы уверенно взяться за задачи.",
    category: "start_work",
  },
  {
    id: 8,
    title: "Ценности команды",
    description: "Что для нас важно в работе и как мы принимаем решения.",
    category: "team_values",
  },
  {
    id: 9,
    title: "О компании",
    description: "Чем занимается компания и какое место в ней у нашей команды.",
    category: "company",
  },
  {
    id: 10,
    title: "Отпуск и больничный",
    description: "Как предупредить команду и оформить отсутствие.",
    category: "work_processes",
  },
  {
    id: 11,
    title: "Как спрашивать AI Buddy",
    description: "Как сформулировать вопрос, чтобы получить точный ответ со ссылками на документы.",
    category: "ai_answers",
  },
  {
    id: 12,
    title: "Ветки, коммиты и пулл-реквесты",
    description: "Как называть ветки, писать сообщения коммитов и оформлять пулл-реквесты.",
    category: "development",
  },
]
