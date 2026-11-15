import re

PAGES = {
    "onboarding": (
        "TEAM",
        "Первые шаги команды",
        "Чек-лист стажёра",
        "Проверь доступ к базе команды, подготовь первый PR и узнай порядок оформления отсутствия.",
        None,
    ),
    "access": (
        "TEAM",
        "Доступ к базе команды",
        "Запросить доступ",
        "К пространству CAT-DEV можно запросить доступ на чтение. Укажи рабочее обоснование. Согласует наставник.",
        None,
    ),
    "first-pr": (
        "TEAM",
        "Первый PR",
        "Перед запросом ревью",
        "Проверь CI для текущего commit и выбери ревьюера из списка команды.",
        None,
    ),
    "ci": (
        "TEAM",
        "Диагностика CI",
        "Если упали тесты",
        "Открой лог упавшей проверки, исправь причину и дождись CI для нового commit.",
        None,
    ),
    "absence": (
        "TEAM",
        "Как оформить отсутствие",
        "Краткое отсутствие",
        "Укажи точные начало и конец с часовым поясом. Согласует руководитель команды.",
        None,
    ),
    "repository-access": (
        "TEAM",
        "Доступы команды",
        "Доступ к репозиторию",
        "Для первой задачи можно запросить доступ contributor к репозиторию buddy-demo.",
        None,
    ),
    "cat-dev": (
        "CAT-DEV",
        "Материалы команды CAT",
        "Примеры задач",
        "Синтетические примеры задач команды CAT.",
        2,
    ),
}


def get_page(page_id: str, user_id: int) -> dict | None:
    page = PAGES.get(page_id)
    if page is None:
        return None
    space, title, section, text, allowed_user = page
    if allowed_user is not None and allowed_user != user_id:
        return None
    return {
        "page_id": page_id,
        "site_key": "demo",
        "space_key": space,
        "title": title,
        "section": section,
        "version": 1,
        "updated_at": "2026-11-01T09:00:00Z",
        "url": None,
        "text": text,
    }


def search_pages(query: str, user_id: int) -> list[dict]:
    words = set(re.findall(r"[\w-]{3,}", query.casefold()))
    matches = []
    for page_id in PAGES:
        page = get_page(page_id, user_id)
        if page is None:
            continue
        content = " ".join(
            page[key].casefold() for key in ("title", "section", "text", "page_id")
        )
        score = sum(word in content for word in words)
        if score:
            matches.append((score, page))
    matches.sort(key=lambda match: match[0], reverse=True)
    return [page for _, page in matches[:5]]
