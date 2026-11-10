from src.loader.google_drive import GoogleDocumentLoader
from src.client import create_client
from dotenv import load_dotenv
import os

#DELETE
from pathlib import Path

LOADER_DIRECTORY = "./documents/"

def get_environment() -> tuple[str,str]:
    load_dotenv()
    drive_credentials_path = os.getenv("GOOGLE_DRIVE_CREDENTIALS")
    assert drive_credentials_path is not None
    folder_id = os.getenv("FOLDER_ID")
    assert folder_id is not None
    return drive_credentials_path,folder_id
    
if __name__ == "__main__":
    # getting the environment
    drive_credentials_path,folder_id = get_environment()
    
    # setting up google API client
    client = create_client(drive_credentials_path)

    loader = GoogleDocumentLoader(client)
    print(loader.list_files(folder_id))
