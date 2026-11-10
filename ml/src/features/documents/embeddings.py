import asyncio
from concurrent.futures import ThreadPoolExecutor

import numpy as np

MODEL_NAME = "intfloat/multilingual-e5-small"
DIMENSION = 384


class EmbeddingError(RuntimeError):
    pass


def load_model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(MODEL_NAME)


class Embeddings:
    def __init__(self, model):
        self._model = model
        # Keep inference serialized even when a waiting HTTP request is cancelled.
        self._executor = ThreadPoolExecutor(max_workers=1)

    @classmethod
    async def load(cls) -> "Embeddings":
        return cls(await asyncio.to_thread(load_model))

    async def close(self) -> None:
        await asyncio.to_thread(self._executor.shutdown, cancel_futures=True)

    async def encode(self, chunks: list[str]) -> np.ndarray:
        return await asyncio.get_running_loop().run_in_executor(
            self._executor, self._encode, chunks
        )

    def _encode(self, chunks: list[str]) -> np.ndarray:
        try:
            vectors = self._model.encode(
                [f"passage: {chunk}" for chunk in chunks], normalize_embeddings=True
            )
            vectors = np.asarray(vectors, dtype=np.float32)
        except Exception as exc:
            raise EmbeddingError("Model inference failed") from exc

        if vectors.shape != (len(chunks), DIMENSION) or not np.isfinite(vectors).all():
            raise EmbeddingError("Model returned invalid embeddings")
        return vectors
