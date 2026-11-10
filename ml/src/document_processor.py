from sentence_transformers import SentenceTransformer
import re

MODEL_NAME = "intfloat/multilingual-e5-small"

model = SentenceTransformer(MODEL_NAME)


def split_into_chunks(text: str, chunk_size: int = 450, overlap: int = 75) -> list[str]:
    if chunk_size <= 0 or not 0 <= overlap < chunk_size:
        raise ValueError("Invalid chunk settings")

    if not text.strip():
        return []

    sentences = re.split(r"(?<=[.!?])\s+", text.strip())

    parts = []

    for sentence in sentences:
        if len(sentence) <= chunk_size:
            parts.append(sentence)
            continue

        current = ""

        for word in sentence.split():
            if len(word) > chunk_size:
                if current:
                    parts.append(current)
                start = 0
                while start + chunk_size < len(word):
                    parts.append(word[start : start + chunk_size])
                    start += chunk_size
                current = word[start:]
                continue

            candidate = f"{current} {word}".strip()

            if len(candidate) > chunk_size:
                parts.append(current)
                current = word
            else:
                current = candidate

        if current:
            parts.append(current)

    chunks = []
    current = ""

    for part in parts:
        candidate = f"{current} {part}".strip()

        if len(candidate) <= chunk_size:
            current = candidate
            continue

        chunks.append(current)

        overlap_parts = []
        total = 0

        for sentence in reversed(re.split(r"(?<=[.!?])\s+", current)):
            length = len(sentence)

            if total + length > overlap:
                break

            overlap_parts.insert(0, sentence)
            total += length + 1

        prefix = " ".join(overlap_parts)
        candidate = f"{prefix} {part}".strip()

        current = candidate if len(candidate) <= chunk_size else part

    if current:
        chunks.append(current)

    return chunks


def generate_embeddings(chunks: list[str]):
    passages = [f"passage: {chunk}" for chunk in chunks]

    return model.encode(passages, normalize_embeddings=True).tolist()


def process_document(text: str) -> list[dict]:
    chunks = split_into_chunks(text)
    embeddings = generate_embeddings(chunks)

    return [
        {"chunk_index": index, "content": chunk, "embedding": embedding}
        for index, (chunk, embedding) in enumerate(zip(chunks, embeddings, strict=True))
    ]
