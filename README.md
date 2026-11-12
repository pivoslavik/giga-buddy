# Giga buddy (Кейс Авито)

### ML service

Run `docker compose up -d --build ml` to build and start the CPU ML service.
The image bundles the pinned ONNX export of `intfloat/multilingual-e5-small`
and its tokenizer, so model loading at startup works offline.

### Google Drive credentials (secrets folder)

Create a `secrets` directory in the project root and place your Google
service account key file at:

```text
secrets/google_drive_credentials.json
```

Docker Compose mounts the credentials file into the integration container automatically.

Do not commit the credentials file.
