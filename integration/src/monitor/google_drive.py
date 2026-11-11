from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from googleapiclient._apis.drive.v3 import DriveResource


def list_documents(client: DriveResource, folder_id: str) -> list[dict]:
    files = []
    page_token = None

    while True:
        response = (
            client.files()
            .list(
                q=f"'{folder_id}' in parents and trashed = false",
                fields="nextPageToken, files(id, name, mimeType, modifiedTime)",
                pageSize=1000,
                pageToken=page_token,
            )
            .execute()
        )

        files.extend(response.get("files", []))

        page_token = response.get("nextPageToken")
        if not page_token:
            break

    return files
