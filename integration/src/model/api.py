import json
from dataclasses import dataclass

from openai import OpenAI

from src.model.prompt import SYSTEM_PROMPT


@dataclass
class ModelResponse:
    title: str
    description: str
    category: str


class ModelAPIManager:
    def __init__(self, api_key: str, base_url: str, model: str):
        self.client = OpenAI(
            api_key=api_key,
            base_url=base_url,
        )
        self.model = model

    def send_prompt(self, document_text: str) -> ModelResponse:
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": document_text,
                },
            ],
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content
        assert content is not None

        answer = json.loads(content)
        model_response = ModelResponse(
            answer["title"],
            answer["description"],
            answer["category"],
        )
        return model_response
