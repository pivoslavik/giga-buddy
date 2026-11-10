import asyncio
import threading
from unittest.mock import Mock

import numpy as np
import pytest

from ml.src.services import embeddings


def test_batch_is_normalized_and_model_is_reused(monkeypatch):
    model = Mock()
    load_model = Mock(return_value=model)
    monkeypatch.setattr(embeddings, "load_model", load_model)

    async def run():
        caller_thread = threading.get_ident()

        def encode(passages, *, normalize_embeddings):
            assert threading.get_ident() != caller_thread
            assert normalize_embeddings
            return np.ones((len(passages), 384), dtype=np.float64)

        model.encode.side_effect = encode
        service = await embeddings.Embeddings.load()
        try:
            first, second = await asyncio.gather(
                service.encode(["first", "second"]), service.encode(["third"])
            )
            assert first.shape == (2, 384)
            assert second.shape == (1, 384)
            assert first.dtype == np.float32
        finally:
            await service.close()

    asyncio.run(run())
    load_model.assert_called_once_with()
    assert model.encode.call_count == 2
    model.encode.assert_any_call(
        ["passage: first", "passage: second"], normalize_embeddings=True
    )
    model.encode.assert_any_call(["passage: third"], normalize_embeddings=True)


@pytest.mark.parametrize(
    "output",
    [np.zeros((1, 383)), np.zeros((2, 384)), np.full((1, 384), np.nan), RuntimeError()],
)
def test_inference_errors(output):
    model = Mock()
    if isinstance(output, Exception):
        model.encode.side_effect = output
    else:
        model.encode.return_value = output

    async def run():
        service = embeddings.Embeddings(model)
        try:
            with pytest.raises(embeddings.EmbeddingError):
                await service.encode(["text"])
        finally:
            await service.close()

    asyncio.run(run())
