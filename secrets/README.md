# Secrets (do not commit credential files)

This folder holds credential files used by the backend. **Never commit real keys or JSON key files here.**

## GCS (Google Cloud Storage) – photo upload

1. Place your GCP service account key JSON in this folder.
2. Name it `gcs-credentials.json` (or set `GCS_FILE_UPLOAD_CONFIG` in `.env.local` to the path you use).
3. In `.env.local` set:
   ```
   GCS_FILE_UPLOAD_CONFIG=./secrets/gcs-credentials.json
   GCS_BUCKET=your-bucket-name
   ```

All files in this folder except `.gitkeep` and this README are ignored by git.
