import os
from pathlib import Path
from time import sleep

from dotenv import load_dotenv

from src.client import create_client
from src.db import Database
from src.loader.google_drive import GoogleDocumentLoader
from src.model.api import ModelAPIManager
from src.monitor.differences import get_documents_to_process
from src.sync.pipeline import sync_documents

DOCUMENTS_DIR = Path("./documents/")

if __name__ == "__main__":
    # getting the environment
    load_dotenv()
    drive_credentials_path = os.environ["GOOGLE_DRIVE_CREDENTIALS"]
    folder_id = os.environ["FOLDER_ID"]
    model_base_url = os.environ["OPENAI_BASE_URL"]
    model_api_key = os.environ["OPENAI_API_KEY"]
    model_name = os.environ["OPENAI_CHAT_MODEL"]
    db_url = os.environ["DB_URL"]
    ml_url = os.environ["ML_URL"]

    # setting up structures
    client = create_client(drive_credentials_path)
    loader = GoogleDocumentLoader(client)
    model = ModelAPIManager(model_api_key, model_base_url, model_name)
    db = Database(db_url)

    print("Monitoring google drive")
    while True:
        documents = get_documents_to_process(db, client, folder_id)
        if documents:
            print(f"Found {len(documents)} changes: syncing")
            sync_documents(model, loader, db, DOCUMENTS_DIR, documents, ml_url)
            print(f"Synced {len(documents)} documents")
        sleep(30)
