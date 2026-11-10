import asyncio
import os
from concurrent.futures import ThreadPoolExecutor

import numpy as np

MODEL_NAME = "intfloat/multilingual-e5-small"
DIMENSION = 384


class EmbeddingError(RuntimeError):
    pass


class InferenceUnavailable(RuntimeError):
    pass


def load_model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(MODEL_NAME)


class Embeddings:
    def __init__(self, models, max_waiting: int = 2):
        self._available = asyncio.Queue(maxsize=len(models))
        for model in models:
            self._available.put_nowait(model)
        self._capacity = len(models) + max_waiting
        self._admitted = 0
        self._closing = False
        self._executor = ThreadPoolExecutor(max_workers=len(models))

    @classmethod
    async def load(cls) -> "Embeddings":
        workers = int(os.getenv("ML_INFERENCE_WORKERS", "1"))
        max_waiting = int(os.getenv("ML_INFERENCE_MAX_WAITING", "2"))
        if workers < 1 or max_waiting < 0:
            raise ValueError(
                "ML_INFERENCE_WORKERS must be positive and ML_INFERENCE_MAX_WAITING nonnegative"
            )
        # Each worker has its own model and tokenizer state.
        models = [await asyncio.to_thread(load_model) for _ in range(workers)]
        return cls(models, max_waiting)

    async def close(self) -> None:
        self._closing = True
        await asyncio.to_thread(self._executor.shutdown, cancel_futures=True)

    async def encode(self, chunks: list[str]) -> np.ndarray:
        if self._closing or self._admitted >= self._capacity:
            raise InferenceUnavailable

        self._admitted += 1
        model = future = None
        try:
            model = await self._available.get()
            if self._closing:
                raise InferenceUnavailable
            future = asyncio.get_running_loop().run_in_executor(
                self._executor, self._encode, model, chunks
            )
            # An abandoned request still owns its worker until the thread finishes.
            return await asyncio.shield(future)
        finally:
            if future is None:
                self._admitted -= 1
                if model is not None:
                    self._available.put_nowait(model)
            elif future.done():
                self._finish(model, future)
            else:
                future.add_done_callback(lambda done: self._finish(model, done))

    def _finish(self, model, future: asyncio.Future) -> None:
        self._available.put_nowait(model)
        self._admitted -= 1
        if not future.cancelled():
            future.exception()  # Consume a possible error after request cancellation.

    @staticmethod
    def _encode(model, chunks: list[str]) -> np.ndarray:
        try:
            vectors = model.encode(
                [f"passage: {chunk}" for chunk in chunks], normalize_embeddings=True
            )
            vectors = np.asarray(vectors, dtype=np.float32)
        except Exception as exc:
            raise EmbeddingError("Model inference failed") from exc

        if vectors.shape != (len(chunks), DIMENSION) or not np.isfinite(vectors).all():
            raise EmbeddingError("Model returned invalid embeddings")
        return vectors
