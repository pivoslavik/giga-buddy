from __future__ import annotations

from typing import TYPE_CHECKING

from google.oauth2 import service_account
from googleapiclient.discovery import build

if TYPE_CHECKING:
    from googleapiclient._apis.drive.v3 import DriveResource


def create_client(drive_credentials_path: str) -> DriveResource:
    drive_credentials = service_account.Credentials.from_service_account_file(
        drive_credentials_path,
        scopes=["https://www.googleapis.com/auth/drive.readonly"],
    )
    client = build("drive", "v3", credentials=drive_credentials)
    return client
