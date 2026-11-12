/*
 * Texts of the main page. "Первые шаги" and the first FAQ answer follow the design reference,
 * the rest of the answers are short drafts to replace once the knowledge base has the real ones.
 */

export interface FirstStep {
  title: string
  text: string
  tone: "green" | "purple" | "blue"
}

export const FIRST_STEPS: FirstStep[] = [
  {
    title: "Получи доступы",
    text: "Проверь доступ к репозиторию, трекеру задач и командному чату.",
    tone: "green",
  },
  {
    title: "Настрой окружение",
    text: "Установи инструменты и запусти проект локально.",
    tone: "purple",
  },
  {
    title: "Изучи проект",
    text: "Познакомься с архитектурой и правилами работы команды.",
    tone: "blue",
  },
  {
    title: "Возьми первую задачу",
    text: "Обсуди её с наставником и уточни ожидаемый результат.",
    tone: "purple",
  },
]

export interface FaqItem {
  question: string
  answer: string
  /** A shell command shown under the answer, ready to copy. */
  command?: string
}

export const FAQ: FaqItem[] = [
  {
    question: "Как запустить проект локально?",
    answer: "Склонируй репозиторий, создай .env по примеру .env.example и запусти сервисы:",
    command: "docker compose up -d --build",
  },
  {
    question: "Где найти документацию проекта?",
    answer:
      "В базе знаний AI Buddy: там собраны инструкции по окружению, архитектуре и процессам команды. Если нужного документа нет, спроси AI Buddy в чате.",
  },
  {
    question: "Что делать, если не хватает доступа?",
    answer:
      "Напиши наставнику, к какому сервису нужен доступ и для какой задачи. Пока ждёшь, можно почитать документацию и настроить окружение.",
  },
  {
    question: "К кому обратиться с вопросом по задаче?",
    answer:
      "Сначала к наставнику: он знает контекст задачи. Вопросы о требованиях можно задать автору задачи, а общие вопросы о проекте — AI Buddy.",
  },
  {
    question: "Как подготовить код к ревью?",
    answer:
      "Проверь, что линтер и тесты проходят, разбей изменения на понятные коммиты и опиши в пулл-реквесте, что сделано и как это проверить.",
  },
]
