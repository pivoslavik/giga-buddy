import sys
from types import SimpleNamespace
from unittest.mock import Mock

import numpy as np
import pytest

from ml.src import e5_model
from ml.src.documents import embeddings


@pytest.mark.parametrize("model_path", ["", "/models/local"])
def test_load_model_uses_explicit_path_or_download(monkeypatch, model_path):
    snapshot = Mock(return_value="/models/download")
    monkeypatch.setitem(
        sys.modules, "huggingface_hub", SimpleNamespace(snapshot_download=snapshot)
    )
    model = Mock()
    monkeypatch.setattr(embeddings, "OnnxModel", model)
    assert embeddings.load_model(model_path) is model.return_value
    model.assert_called_once_with(model_path or "/models/download")
    if model_path:
        snapshot.assert_not_called()
    else:
        snapshot.assert_called_once_with(
            e5_model.MODEL_NAME,
            revision=e5_model.MODEL_REVISION,
            local_dir=None,
            allow_patterns=[e5_model.MODEL_FILE, e5_model.TOKENIZER_FILE],
        )


@pytest.mark.parametrize("normalize, expected", [(False, [3, 4]), (True, [0.6, 0.8])])
def test_onnx_batches_mask_padding_and_normalize(
    monkeypatch, tmp_path, normalize, expected
):
    tokenizer_type = Mock()
    tokenizer = tokenizer_type.from_file.return_value
    tokenizer.token_to_id.return_value = 0

    def tokenize(batch):
        return [
            SimpleNamespace(ids=[1, 0], attention_mask=[1, 0], type_ids=[0, 0])
            for _ in batch
        ]

    tokenizer.encode_batch.side_effect = tokenize
    session_type = Mock()
    session = session_type.return_value
    session.get_inputs.return_value = [
        SimpleNamespace(name="input_ids"),
        SimpleNamespace(name="attention_mask"),
    ]

    def inference(outputs, inputs):
        assert outputs == ["last_hidden_state"]
        assert inputs.keys() == {"input_ids", "attention_mask"}
        assert inputs["input_ids"].dtype == inputs["attention_mask"].dtype == np.int64
        assert np.all(inputs["attention_mask"] == [1, 0])
        return (
            np.tile(
                np.array([[3, 4], [99, 99]], dtype=np.float32),
                (len(inputs["input_ids"]), 1, 1),
            ),
        )

    session.run.side_effect = inference
    monkeypatch.setitem(
        sys.modules, "tokenizers", SimpleNamespace(Tokenizer=tokenizer_type)
    )
    monkeypatch.setitem(
        sys.modules, "onnxruntime", SimpleNamespace(InferenceSession=session_type)
    )
    monkeypatch.setattr(e5_model, "BATCH_SIZE", 2)

    model = e5_model.OnnxModel(str(tmp_path))
    vectors = model.encode(
        [" first ", "second", " third"], normalize_embeddings=normalize
    )
    tokenizer_type.from_file.assert_called_once_with(str(tmp_path / "tokenizer.json"))
    tokenizer.enable_truncation.assert_called_once_with(max_length=512)
    tokenizer.enable_padding.assert_called_once_with(pad_id=0, pad_token="<pad>")
    session_type.assert_called_once_with(
        str(tmp_path / "onnx/model.onnx"), providers=["CPUExecutionProvider"]
    )
    assert [call.args[0] for call in tokenizer.encode_batch.call_args_list] == [
        ["first", "second"],
        ["third"],
    ]
    np.testing.assert_allclose(vectors, [expected] * 3)
