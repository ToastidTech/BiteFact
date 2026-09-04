# BiteFact Deployment Architecture

BiteFact is intentionally deployed as a containerized Node/Express service.

## Runtime flow

BiteFact PWA → `/api/bitefact-ai-analyze` → Express backend → Perplexity API

The Perplexity API key must remain server-side as `PERPLEXITY_API_KEY`.

## AWS direction

Deploy the existing Docker container to AWS rather than rebuilding the backend around Lambda. The `/health` endpoint is available for service health checks.

## Future Toastid Cloud direction

BiteFact should remain a discrete service so it can later sit behind a shared Toastid Cloud API/gateway layer with centralized authentication, billing, storage, observability, and additional AI services.

## Important

Do not place `PERPLEXITY_API_KEY` in browser JavaScript, HTML, the PWA manifest, or any public repository file.
