from pathlib import Path

def read_document(path:Path) -> str:
    if not path.is_file():
        raise ValueError("path is not a file")
    return path.read_text()
