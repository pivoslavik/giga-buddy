from collections.abc import AsyncGenerator, Iterable, Sequence

from openai import AsyncOpenAI
from openai.types.chat import ChatCompletionMessageParam
from openai.types.chat.chat_completion_chunk import ChoiceDelta


from .store import ChatMessage
from .system_prompt import SYSTEM_PROMPT


def build_chat_messages(
    history: Sequence[ChatMessage], chunks: Sequence[tuple[int, str]]
) -> list[ChatCompletionMessageParam]:
    messages: list[ChatCompletionMessageParam] = [
        {"role": "system", "content": SYSTEM_PROMPT}
    ]
    for message in history[:-1]:
        if message.role == "assistant":
            messages.append({"role": "assistant", "content": message.text})
        else:
            messages.append({"role": "user", "content": message.text})

    context = "\n\n".join(f"[{chunk_id}] {text}" for chunk_id, text in chunks)
    messages.append(
        {
            "role": "user",
            "content": (
                f"Фрагменты базы знаний:\n{context or 'Подходящих фрагментов нет.'}"
                f"\n\nВопрос пользователя:\n{history[-1].text}"
            ),
        }
    )
    return messages


class ModelAPIError(Exception):
    """The model API returned an invalid or incomplete response."""


class ModelAPIManager:
    def __init__(self, client: AsyncOpenAI, chat_model: str) -> None:
        self.client = client
        self.chat_model = chat_model

    async def generate_reply(
        self, messages: Iterable[ChatCompletionMessageParam]
    ) -> str:
        response = await self.client.chat.completions.create(
            model=self.chat_model, messages=messages
        )
        if not response.choices:
            raise ModelAPIError("Missing completion choice")

        content = response.choices[0].message.content
        if not isinstance(content, str) or not content.strip():
            raise ModelAPIError("Invalid completion content")
        return content

    async def stream(
        self, messages: Iterable[ChatCompletionMessageParam]
    ) -> AsyncGenerator[str, None]:
        stream = await self.client.chat.completions.create(
            model=self.chat_model, messages=messages, stream=True
        )
        finished = False
        async with stream:
            async for chunk in stream:
                if not chunk.choices:
                    continue

                choice = chunk.choices[0]
                delta = choice.delta
                if not isinstance(delta, ChoiceDelta):
                    raise ModelAPIError("Invalid streaming delta")
                if delta.content is not None:
                    if not isinstance(delta.content, str):
                        raise ModelAPIError("Invalid streaming content")
                    if delta.content:
                        yield delta.content
                if choice.finish_reason is not None:
                    finished = True

        if not finished:
            raise ModelAPIError("Stream ended before a finish reason")
