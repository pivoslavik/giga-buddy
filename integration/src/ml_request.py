from time import sleep

import requests

from src.monitor.differences import DocumentStatus


def get_body(document_id: int, status: DocumentStatus) -> dict[str, int | str]:
    body = {"document_id": document_id, "status": status.value}
    return body


def send_ml_request(ml_url: str, document_id: int, status: DocumentStatus):
    # infinitely sending until ml responds
    while True:
        try:
            response = requests.post(
                f"{ml_url}/documents", json=get_body(document_id, status), timeout=10
            )
            response.raise_for_status()
            return
        except requests.exceptions.RequestException as exc:
            print(f"Failed to notify ML using URL {ml_url}/documents: {exc}")
            print("trying again in 5 seconds")
            sleep(5)
