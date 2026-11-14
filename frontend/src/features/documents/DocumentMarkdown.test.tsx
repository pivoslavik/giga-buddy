import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { DocumentMarkdown } from "./DocumentMarkdown"

const headings = () =>
  screen
    .queryAllByRole("heading")
    .map((heading) => `${heading.tagName.toLowerCase()} ${heading.textContent}`)

describe("DocumentMarkdown", () => {
  it("drops the title of the document and puts its sections under the title of the modal", () => {
    render(<DocumentMarkdown text={"# Настройка\n\n## Инструменты\n\n### Docker\n\nТекст."} />)

    expect(headings()).toEqual(["h3 Инструменты", "h4 Docker"])
  })

  it("keeps the first heading when the document has several of the top level", () => {
    render(<DocumentMarkdown text={"# Утро\n\nТекст.\n\n# Вечер\n\n## Ужин"} />)

    expect(headings()).toEqual(["h3 Утро", "h3 Вечер", "h4 Ужин"])
  })

  it("keeps the first heading when it does not open the document", () => {
    render(<DocumentMarkdown text={"Вступление.\n\n# Раздел"} />)

    expect(headings()).toEqual(["h3 Раздел"])
  })

  it("numbers the lines of a code block", () => {
    const { container } = render(<DocumentMarkdown text={"```bash\ncd app\nnpm test\n```"} />)

    const lines = container.querySelectorAll("pre code > span")
    expect([...lines].map((line) => line.textContent)).toEqual(["cd app", "npm test"])
  })

  it("selects the code to copy by hand when the clipboard is not allowed", async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("Not allowed"))
    render(<DocumentMarkdown text={"```\nnpm test\n```"} />)

    await user.click(screen.getByRole("button", { name: "Скопировать код" }))

    expect(screen.getByRole("status")).toHaveTextContent("Код выделен, скопируй его вручную")
    expect(window.getSelection()?.toString()).toBe("npm test")
  })

  it("turns quotes into notes and lets wide tables scroll", () => {
    render(
      <DocumentMarkdown
        text={"> Важно знать.\n\n| Вопрос | К кому |\n| --- | --- |\n| Доступы | Тимлид |"}
      />,
    )

    expect(screen.getByText("Важно знать.").closest("blockquote")).toBeInTheDocument()
    const table = screen.getByRole("region", { name: "Таблица" })
    expect(within(table).getByRole("cell", { name: "Тимлид" })).toBeVisible()
  })

  it("opens links to other sites in a new tab", () => {
    render(<DocumentMarkdown text={"[Сайт](https://example.com) и [чат](/chat)"} />)

    const external = screen.getByRole("link", { name: "Сайт" })
    expect(external).toHaveAttribute("target", "_blank")
    expect(external).toHaveAttribute("rel", "noopener noreferrer")
    expect(screen.getByRole("link", { name: "чат" })).not.toHaveAttribute("target")
  })

  it("loads the pictures of a document only when they are scrolled to", () => {
    render(<DocumentMarkdown text={"![Схема сервисов](https://example.com/services.png)"} />)

    const picture = screen.getByRole("img", { name: "Схема сервисов" })
    expect(picture).toHaveAttribute("src", "https://example.com/services.png")
    expect(picture).toHaveAttribute("loading", "lazy")
  })

  it("renders the task lists of GitHub markdown", () => {
    render(<DocumentMarkdown text={"- [x] Доступы\n- [ ] Окружение"} />)

    const [access, setup] = screen.getAllByRole("checkbox")
    expect(access).toBeChecked()
    expect(setup).not.toBeChecked()
  })

  it("does not run the HTML of a document", () => {
    const { container } = render(
      <DocumentMarkdown text={'Текст <img src="x" onerror="alert(1)"> и <b>жирный</b>.'} />,
    )

    expect(container.querySelector("img, b")).not.toBeInTheDocument()
    expect(container).toHaveTextContent("Текст и жирный.")
  })
})
