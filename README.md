# Giga buddy (Кейс Авито)

### Google Drive credentials (secrets folder)

Create a `secrets` directory in the project root and place your Google
service account key file at:

```text
secrets/google_drive_credentials.json
```

Docker Compose mounts the credentials file into the integration container automatically.

Do not commit the credentials file.
