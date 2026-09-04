# BiteFact

AI-powered nutrition tracking PWA for Toastid Tech.

## AI architecture

BiteFact no longer uses AWS Lambda for food-photo analysis.

The PWA sends the meal/photo to the local `/api/bitefact-ai-analyze` endpoint. That serverless function calls the Perplexity Sonar API while keeping the Perplexity API key off the client.

### Required deployment

This repository is configured for Vercel because the `api/` directory contains the serverless endpoint.

Add this environment variable in the deployment settings:

```text
PERPLEXITY_API_KEY=your_perplexity_api_key
```

Optional production CORS restriction:

```text
BITEFACT_ALLOWED_ORIGIN=https://your-bitefact-domain.example
```

If the PWA and API are served from the same Vercel deployment, the default same-origin `/api/bitefact-ai-analyze` path is used automatically.

## Food-photo flow

1. User taps **Use Camera**.
2. BiteFact captures the photo.
3. The browser resizes it to a maximum 1600px dimension and converts it to JPEG before upload.
4. The serverless endpoint sends the image to Perplexity Sonar Pro.
5. Perplexity returns structured nutrition data.
6. BiteFact displays the estimate for user verification.
7. Nothing is added to the daily totals until the user taps **Verify & Log**.

Nutrition values are estimates and are not medical advice.
