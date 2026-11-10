from src.loader.google_drive import GoogleDocumentLoader
from src.client import create_client
from src.monitor.differences import get_files_to_process
from dotenv import load_dotenv
import os

#DELETE
from pathlib import Path
from src.model import api
from src.reader import read_document
from src.model.api import ModelAPIManager
from src.db import Database

LOADER_TARGET_DIRECTORY = "./documents/"

if __name__ == "__main__":
    # getting the environment
    load_dotenv()
    drive_credentials_path = os.environ["GOOGLE_DRIVE_CREDENTIALS"]
    folder_id = os.environ["FOLDER_ID"]
    model_base_url = os.environ["OPENAI_BASE_URL"]
    model_api_key = os.environ["OPENAI_API_KEY"]
    model_name = os.environ["OPENAI_CHAT_MODEL"]
    db_url = os.environ["DB_URL"]


    # setting up google API client
    client = create_client(drive_credentials_path)

    loader = GoogleDocumentLoader(client)

    document_text = read_document(Path(LOADER_TARGET_DIRECTORY+"test.md"))
    model_manager = ModelAPIManager(model_api_key,model_base_url,model_name)
    # response = model_manager.send_prompt(document_text)


    #setting up the db
    db = Database(db_url)

    print(get_files_to_process(db,client,folder_id))

