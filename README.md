# BiteFact

AI-powered nutrition tracking PWA for Toastid Tech.

## AI architecture

BiteFact is AWS-first and no longer uses AWS Lambda for food-photo analysis.

The PWA calls `/api/bitefact-ai-analyze` on the BiteFact/Toastid Cloud backend. The backend runs as a standard Node.js service in an AWS container environment and calls the Perplexity Sonar API. The Perplexity API key stays server-side and is never shipped to the browser.

### Toastid Cloud direction

BiteFact is the first application being structured around the future Toastid Cloud platform. The backend boundary is intentionally kept separate from the UI so authentication, subscriptions, usage metering, AI routing, provider credentials, analytics, and additional Toastid Tech applications can be added without rebuilding each app.

### Required server environment variables

```text
PERPLEXITY_API_KEY=your_perplexity_api_key
```

Optional production CORS restriction when the frontend and API use different origins:

```text
BITEFACT_ALLOWED_ORIGIN=https://your-bitefact-domain.example
```

The backend listens on the `PORT` supplied by the AWS container service and defaults to `8080`.

### AWS deployment shape

```text
BiteFact PWA
    |
    v
AWS containerized Node.js backend
    |
    v
Toastid Cloud API boundary
    |
    v
Perplexity Sonar API
```

This intentionally avoids Lambda so BiteFact can grow into a reusable Toastid Cloud service layer.

## Food-photo flow

1. User taps **Use Camera**.
2. BiteFact captures the photo.
3. The browser resizes it to a maximum 1600px dimension and converts it to JPEG before upload.
4. The AWS-hosted backend sends the image to Perplexity Sonar Pro.
5. Perplexity returns structured nutrition data.
6. BiteFact displays the estimate for user verification.
7. Nothing is added to the daily totals until the user taps **Verify & Log**.

Nutrition values are estimates and are not medical advice.
