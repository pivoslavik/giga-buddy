import pytest

from ml.src.services.chunker import Chunker


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("", []),
        (" \t\n", []),
        ("  Короткий.  ", ["Короткий."]),
        ("First. Second. Third.", ["First. Second.", "Third."]),
        ("one two three four five", ["one two three", "four five"]),
        ("x" * 30, ["x" * 14, "x" * 14, "xx"]),
        ("a " + "x" * 15 + " tail", ["a", "x" * 14, "x tail"]),
    ],
)
def test_split(text, expected):
    chunks = Chunker(chunk_size=14, overlap=0).split(text)
    assert chunks == expected
    assert all(0 < len(chunk) <= 14 for chunk in chunks)


def test_overlap_respects_sentence_boundaries():
    chunker = Chunker(chunk_size=19, overlap=8)
    assert chunker.split("First. Second. Third.") == [
        "First. Second.",
        "Second. Third.",
    ]


def test_overlap_yields_to_next_word():
    chunker = Chunker(chunk_size=12, overlap=11)
    assert chunker.split("one two. ninechars") == ["one two.", "ninechars"]


def test_default_limit_and_order():
    words = [f"word{i}" for i in range(250)]
    chunks = Chunker().split(" ".join(words))
    assert all(0 < len(chunk) <= 450 for chunk in chunks)
    assert list(dict.fromkeys(" ".join(chunks).split())) == words
    assert set(chunks[0].split()) & set(chunks[1].split())


@pytest.mark.parametrize(("size", "overlap"), [(0, 0), (10, -1), (10, 10)])
def test_invalid_settings(size, overlap):
    with pytest.raises(ValueError):
        Chunker(size, overlap)
