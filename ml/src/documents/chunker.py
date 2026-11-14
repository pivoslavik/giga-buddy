import re

SENTENCE_END = re.compile(r"[.!?](?= )")


class Chunker:
    def __init__(self, chunk_size: int = 450, overlap: int = 75):
        if chunk_size <= 0 or not 0 <= overlap < chunk_size:
            raise ValueError("Invalid chunk settings")
        self.chunk_size = chunk_size
        self.overlap = overlap

    def split(self, text: str) -> list[str]:
        text = " ".join(text.split())
        chunks = []
        start = consumed = 0
        while consumed < len(text):
            end = self._chunk_end(text, start, consumed)
            if end <= consumed:
                # Drop overlap if it leaves no room for a new whole word.
                start = consumed
                end = self._chunk_end(text, start, consumed)
            chunks.append(text[start:end].strip())
            consumed = end + (text[end : end + 1] == " ")
            start = self._overlap_start(text, start, end, consumed)
        return chunks

    def _chunk_end(self, text: str, start: int, consumed: int) -> int:
        limit = start + self.chunk_size
        if limit >= len(text):
            return len(text)
        sentence_end = max(
            (match.end() for match in SENTENCE_END.finditer(text, consumed, limit + 1)),
            default=consumed,
        )
        if sentence_end > consumed:
            return sentence_end
        return self._split_long_sentence(text, start, limit, consumed)

    @staticmethod
    def _split_long_sentence(text: str, start: int, limit: int, consumed: int) -> int:
        space = text.rfind(" ", start, limit + 1)
        if space > consumed:
            return space
        return limit if start == consumed else consumed

    def _overlap_start(self, text: str, start: int, end: int, consumed: int) -> int:
        if not self.overlap or text[end : end + 1] != " ":
            return consumed
        earliest = max(start + 1, end - self.overlap)
        boundary = text.find(" ", earliest - 1, end)
        return boundary + 1 if boundary != -1 else consumed
