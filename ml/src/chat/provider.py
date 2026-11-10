import json
from collections.abc import AsyncIterator

import aiohttp


class ProviderError(Exception):
    """The model API failed or returned an invalid response."""


class Provider:
    def __init__(
        self,
        session: aiohttp.ClientSession,
        base_url: str,
        api_key: str,
        chat_model: str,
    ):
        self.session = session
        self.base_url = base_url.rstrip("/")
        self.headers = {"Authorization": f"Bearer {api_key}"}
        self.chat_model = chat_model

    async def _post(self, path: str, payload: dict) -> dict:
        async with self.session.post(
            f"{self.base_url}/{path}", json=payload, headers=self.headers
        ) as response:
            response.raise_for_status()
            return await response.json()

    async def complete(self, messages: list[dict]) -> str:
        result = await self._post(
            "chat/completions", {"model": self.chat_model, "messages": messages}
        )
        try:
            content = result["choices"][0]["message"]["content"]
            if not isinstance(content, str) or not content.strip():
                raise ValueError("Empty completion")
            return content
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise ProviderError("Invalid completion response") from exc

    async def stream(self, messages: list[dict]) -> AsyncIterator[str]:
        async with self.session.post(
            f"{self.base_url}/chat/completions",
            json={"model": self.chat_model, "messages": messages, "stream": True},
            headers={**self.headers, "Accept": "text/event-stream"},
        ) as response:
            response.raise_for_status()
            data_lines = []
            async for raw_line in response.content:
                line = raw_line.decode("utf-8").rstrip("\r\n")
                if line.startswith("data:"):
                    data_lines.append(line[5:].lstrip(" "))
                elif not line and data_lines:
                    data = "\n".join(data_lines)
                    data_lines.clear()
                    if data == "[DONE]":
                        return
                    try:
                        chunk = json.loads(data)
                        if "error" in chunk:
                            raise ProviderError("Upstream streaming error")
                        choices = chunk["choices"]
                        if not choices:
                            continue
                        delta = choices[0]["delta"]
                        if not isinstance(delta, dict):
                            raise ValueError("Invalid delta")
                        content = delta.get("content")
                        if content is not None:
                            if not isinstance(content, str):
                                raise ValueError("Invalid delta")
                            if content:
                                yield content
                    except (KeyError, IndexError, TypeError, ValueError) as exc:
                        raise ProviderError("Invalid streaming response") from exc
            raise ProviderError("Stream ended before [DONE]")
