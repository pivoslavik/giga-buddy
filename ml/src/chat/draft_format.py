def format_draft(tool: str, draft: dict) -> str:
    title, fields = {
        "access_prepare": (
            "доступ",
            {
                "resource": "Ресурс",
                "level": "Уровень",
                "justification": "Обоснование",
                "approver": "Согласующий",
            },
        ),
        "review_prepare": (
            "ревью",
            {
                "pr_number": "PR",
                "commit": "Commit",
                "reviewer": "Ревьюер",
            },
        ),
        "absence_prepare": (
            "отсутствие",
            {
                "requested_start": "Начало",
                "requested_end": "Конец",
                "absence_type": "Тип",
                "approver": "Согласующий",
            },
        ),
    }[tool]
    payload = draft["payload"]
    lines = [f"**Тестовый черновик — {title}**", ""]
    for key, label in fields.items():
        value = " ".join(str(payload[key]).split())
        lines.append(f"- {label} — {value}")
    source = draft.get("source")
    if source:
        lines.extend(["", f"Инструкция — [{source['section']}]({source['url']})"])
    lines.extend(
        [
            "",
            "Чтобы отправить, напиши отдельным сообщением:",
            f"`Подтверждаю {draft['action_id']} {draft['version']}`",
        ]
    )
    return "\n".join(lines)
