from pathlib import Path

import numpy as np

MODEL_NAME = "intfloat/multilingual-e5-small"
MODEL_REVISION = "614241f622f53c4eeff9890bdc4f31cfecc418b3"
MODEL_FILE = "onnx/model.onnx"
TOKENIZER_FILE = "tokenizer.json"
BATCH_SIZE = 32
MAX_TOKENS = 512


def download_model(local_dir: str | None = None) -> str:
    from huggingface_hub import snapshot_download

    return snapshot_download(
        MODEL_NAME,
        revision=MODEL_REVISION,
        local_dir=local_dir,
        allow_patterns=[MODEL_FILE, TOKENIZER_FILE],
    )


class OnnxModel:
    def __init__(self, model_path: str):
        from onnxruntime import InferenceSession
        from tokenizers import Tokenizer

        model_path = Path(model_path)
        self._tokenizer = Tokenizer.from_file(str(model_path / TOKENIZER_FILE))
        self._tokenizer.enable_truncation(max_length=MAX_TOKENS)
        self._tokenizer.enable_padding(
            pad_id=self._tokenizer.token_to_id("<pad>"), pad_token="<pad>"
        )
        self._session = InferenceSession(
            str(model_path / MODEL_FILE), providers=["CPUExecutionProvider"]
        )
        self._input_names = [item.name for item in self._session.get_inputs()]

    def encode(self, passages: list[str], *, normalize_embeddings: bool) -> np.ndarray:
        batches = []
        for start in range(0, len(passages), BATCH_SIZE):
            batch = [text.strip() for text in passages[start : start + BATCH_SIZE]]
            tokens = self._tokenizer.encode_batch(batch)
            mask = np.array([token.attention_mask for token in tokens], dtype=np.int64)
            inputs = {
                "input_ids": np.array([token.ids for token in tokens], dtype=np.int64),
                "attention_mask": mask,
                "token_type_ids": np.array(
                    [token.type_ids for token in tokens], dtype=np.int64
                ),
            }
            (hidden_states,) = self._session.run(
                ["last_hidden_state"],
                {name: inputs[name] for name in self._input_names},
            )
            pooled = (hidden_states * mask[..., None].astype(np.float32)).sum(axis=1)
            pooled /= mask.sum(axis=1, keepdims=True)
            if normalize_embeddings:
                pooled /= np.maximum(
                    np.linalg.norm(pooled, axis=1, keepdims=True), 1e-12
                )
            batches.append(pooled)
        return np.concatenate(batches, axis=0)
