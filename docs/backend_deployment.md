# Backend Deployment Guide - Google Cloud Run (Table Booking)

Complete step-by-step guide for deploying the **Table Booking backend** (Express + MongoDB + Firebase Admin) to Google Cloud Run using Google Cloud Build.

This mirrors the frontend deployment pattern: `Dockerfile` + `cloudbuild.yaml` + Cloud Build trigger.

## What’s included in this repo

- `Dockerfile`  
  Multi-stage build that:
  - installs deps
  - compiles TypeScript to `dist/`
  - runs production image with only production dependencies
  - listens on port `8080` (Cloud Run-friendly)

- `cloudbuild.yaml`  
  Cloud Build pipeline that:
  - builds a Docker image
  - pushes it to Artifact Registry
  - deploys it to Cloud Run

## Required environment variables

Your backend validates env vars at startup (`src/config/env.ts`). You must provide:

- `MONGODB_URI`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `CORS_ORIGIN` (comma-separated allowed origins; example: `https://your-frontend.com,https://admin.your-frontend.com`)

Cloud Run will inject these into `process.env` at runtime.

### Important: Firebase private key format

If you paste the key into an env var, it may contain literal `\n` sequences. The backend already normalizes this:

- `FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")`

So it’s fine to store the key with escaped newlines (common in Secret Manager).

## Recommended: use Secret Manager for sensitive values

Do **not** put secrets into Cloud Build substitutions. Use Secret Manager and mount them as env vars in Cloud Run.

Recommended secrets (names are up to you):

- `tablebooking-mongodb-uri`
- `tablebooking-firebase-project-id`
- `tablebooking-firebase-client-email`
- `tablebooking-firebase-private-key`

Grant the Cloud Run service account **Secret Manager Secret Accessor** role to read them.

## GCS credentials JSON (service account key file)

Locally, you may point `GCS_FILE_UPLOAD_CONFIG` to a JSON file path (for example `./secrets/gcs-credentials.json` in `.env.local`). On Cloud Run, **you should not bake this file into the container image** and you usually can't rely on a relative path like `./secrets/...`.

Instead, store the JSON in **Secret Manager** and mount it into the container filesystem as a file.

### How `--update-secrets` works (and how the code uses it)

Cloud Run supports secrets in two forms:

- **Secret as env var**: Cloud Run reads the secret value at instance startup and places it into `process.env.<NAME>`.
- **Secret as file (volume mount)**: Cloud Run exposes the secret value as a **file at a container path**. Your code reads the file from the filesystem.

With `gcloud run deploy`, the flag `--update-secrets` can do **either**, depending on what you put on the left-hand side:

- If the left side looks like an env var name, it's injected as an env var:
  - `--update-secrets=FIREBASE_PRIVATE_KEY=my-secret:latest`
- If the left side starts with a `/`, Cloud Run mounts a file at that path:
  - `--update-secrets=/secrets/gcs-credentials.json=my-gcs-secret:latest`

In this backend, the GCS client is configured here:

- `src/config/env.ts` validates that `GCS_FILE_UPLOAD_CONFIG` exists in `process.env`.
- `src/config/gcs.ts` reads the value and passes it to Google Cloud Storage SDK:
  - `new Storage({ keyFilename: credentialsPath })`

So on Cloud Run you do:

1. **Mount the secret value as a file** at a known absolute path (example: `/secrets/gcs-credentials.json`)
2. Set `GCS_FILE_UPLOAD_CONFIG` to that same path, so the code can read it.

### What to configure in Secret Manager / Cloud Run

1. Create a Secret Manager secret containing the full JSON key file contents, for example:
   - `tablebooking-backend-dev-gcs-credentials`
2. Grant the Cloud Run runtime service account `roles/secretmanager.secretAccessor` on that secret.
3. Ensure the service also has access to the bucket in the **GCS project** (e.g. `roles/storage.objectAdmin` or least-privilege equivalent) for the service account identity contained in the JSON.

### What to configure in Cloud Build trigger

Add substitutions such as:

- `_GCS_CREDENTIALS_SECRET`: e.g. `tablebooking-backend-dev-gcs-credentials`
- `_GCS_BUCKET`: e.g. `tablebooking`

### Example Cloud Run flags (via Cloud Build)

In your `cloudbuild.yaml` deploy step, set the env vars and mount the file:

- `--set-env-vars` should include:
  - `GCS_FILE_UPLOAD_CONFIG=/secrets/gcs-credentials.json`
  - `GCS_BUCKET=${_GCS_BUCKET}`
- `--update-secrets` should include:
  - `/secrets/gcs-credentials.json=${_GCS_CREDENTIALS_SECRET}:latest`

Reference: Cloud Run secrets for services documentation at [Configure secrets for services](https://cloud.google.com/run/docs/configuring/services/secrets).

## Cloud Build substitutions (per environment)

When you create a Cloud Build trigger for this repo, configure:

- `_REGION`: e.g. `asia-south1`
- `_AR_REPOSITORY`: e.g. `tablebooking-backend`
- `_SERVICE_NAME`: e.g. `tablebooking-backend-dev` / `tablebooking-backend-staging` / `tablebooking-backend-prod`
- `_ENVIRONMENT`: e.g. `dev` / `staging` / `prod`
- `_CORS_ORIGIN`: e.g. `https://your-frontend-domain.com`

Optional if you choose to use the `--set-secrets` section in `cloudbuild.yaml`:

- `_MONGODB_URI_SECRET`
- `_FIREBASE_PROJECT_ID_SECRET`
- `_FIREBASE_CLIENT_EMAIL_SECRET`
- `_FIREBASE_PRIVATE_KEY_SECRET`

## High-level deployment steps

1. **GCP setup**
   - Enable: Cloud Run, Cloud Build, Artifact Registry, Secret Manager.
   - Create an Artifact Registry **Docker** repository (example: `tablebooking-backend`).

2. **IAM**
   - Cloud Build service account: grant
     - Artifact Registry Repository Administrator
     - Cloud Run Admin
     - (Optional but recommended) Service Account User
   - Cloud Run runtime service account: grant
     - Secret Manager Secret Accessor (if using secrets)

3. **Create Cloud Build Trigger**
   - Point it to this repository.
   - Config file: `cloudbuild.yaml`
   - Add the substitutions listed above.

4. **Set secrets/env vars**
   - Either:
     - configure secrets in Cloud Run Console → *Variables & Secrets*, or
     - use `--set-secrets` in `cloudbuild.yaml` (and set the secret-name substitutions).

5. **Deploy**
   - Push to the branch that matches your trigger.
   - Monitor Cloud Build → History.
   - Monitor Cloud Run service logs.

## Multi-environment pattern (recommended)

- `dev` branch → `tablebooking-backend-dev`
- `staging` branch → `tablebooking-backend-staging`
- `main` branch → `tablebooking-backend-prod`

Create one trigger per branch with different substitutions.

