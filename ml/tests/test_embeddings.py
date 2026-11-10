import asyncio
import threading
from unittest.mock import Mock

import numpy as np
import pytest

from ml.src.features.documents import embeddings


def test_batch_is_normalized_and_model_is_reused(monkeypatch):
    monkeypatch.setenv("ML_INFERENCE_WORKERS", "1")
    monkeypatch.setenv("ML_INFERENCE_MAX_WAITING", "2")
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
        service = embeddings.Embeddings([model], max_waiting=0)
        try:
            with pytest.raises(embeddings.EmbeddingError):
                await service.encode(["text"])
            model.encode.side_effect = None
            model.encode.return_value = np.ones((1, 384))
            assert (await service.encode(["retry"])).shape == (1, 384)
        finally:
            await service.close()

    asyncio.run(run())


def test_queue_capacity_and_cancellation():
    entered = threading.Event()
    release = threading.Event()
    model = Mock()

    def encode(*args, **kwargs):
        entered.set()
        assert release.wait(5)
        return np.ones((1, 384))

    model.encode.side_effect = encode

    async def run():
        service = embeddings.Embeddings([model], max_waiting=1)
        try:
            active = asyncio.create_task(service.encode(["active"]))
            assert await asyncio.to_thread(entered.wait, 5)
            queued = asyncio.create_task(service.encode(["queued"]))
            await asyncio.sleep(0)
            with pytest.raises(embeddings.InferenceUnavailable):
                await service.encode(["overflow"])

            queued.cancel()
            with pytest.raises(asyncio.CancelledError):
                await queued
            replacement = asyncio.create_task(service.encode(["replacement"]))
            await asyncio.sleep(0)
            assert not replacement.done()
            assert model.encode.call_count == 1

            active.cancel()
            with pytest.raises(asyncio.CancelledError):
                await active
            with pytest.raises(embeddings.InferenceUnavailable):
                await service.encode(["worker still running"])

            release.set()
            assert (await replacement).shape == (1, 384)
            assert model.encode.call_count == 2
        finally:
            release.set()
            await service.close()

    asyncio.run(run())


def test_close_waits_for_active_worker_and_rejects_queued_work():
    entered = threading.Event()
    release = threading.Event()

    def encode(*args, **kwargs):
        entered.set()
        assert release.wait(5)
        return np.ones((1, 384))

    async def run():
        service = embeddings.Embeddings([Mock(encode=Mock(side_effect=encode))])
        active = asyncio.create_task(service.encode(["active"]))
        try:
            assert await asyncio.to_thread(entered.wait, 5)
            queued = asyncio.create_task(service.encode(["queued"]))
            await asyncio.sleep(0)
            closing = asyncio.create_task(service.close())
            await asyncio.sleep(0)
            assert not closing.done()
            with pytest.raises(embeddings.InferenceUnavailable):
                await service.encode(["after shutdown"])
        finally:
            release.set()
        await active
        with pytest.raises(embeddings.InferenceUnavailable):
            await queued
        await closing

    asyncio.run(run())


def test_configured_workers_use_independent_models(monkeypatch):
    monkeypatch.setenv("ML_INFERENCE_WORKERS", "2")
    monkeypatch.setenv("ML_INFERENCE_MAX_WAITING", "0")
    started = [threading.Event(), threading.Event()]
    release = threading.Event()

    def make_model(entered):
        def encode(*args, **kwargs):
            entered.set()
            assert release.wait(5)
            return np.ones((1, 384))

        return Mock(encode=Mock(side_effect=encode))

    loader = Mock(side_effect=[make_model(entered) for entered in started])
    monkeypatch.setattr(embeddings, "load_model", loader)

    async def run():
        service = await embeddings.Embeddings.load()
        tasks = [asyncio.create_task(service.encode([str(i)])) for i in range(2)]
        try:
            for entered in started:
                assert await asyncio.to_thread(entered.wait, 5)
            with pytest.raises(embeddings.InferenceUnavailable):
                await service.encode(["third"])
        finally:
            release.set()
            await asyncio.gather(*tasks)
            await service.close()

    asyncio.run(run())
    assert loader.call_count == 2


@pytest.mark.parametrize(("workers", "max_waiting"), [("0", "1"), ("1", "-1")])
def test_invalid_configuration_fails_before_loading(monkeypatch, workers, max_waiting):
    monkeypatch.setenv("ML_INFERENCE_WORKERS", workers)
    monkeypatch.setenv("ML_INFERENCE_MAX_WAITING", max_waiting)
    loader = Mock()
    monkeypatch.setattr(embeddings, "load_model", loader)
    with pytest.raises(ValueError):
        asyncio.run(embeddings.Embeddings.load())
    loader.assert_not_called()
