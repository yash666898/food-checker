# Food Check

A Gemma 4 food analyzer with a tiny local server that keeps your Google AI key out of the browser.

## Run it

1. Install Node.js 18 or newer.
2. In this folder, run `npm install`.
3. Copy `.env.example` to `.env` and set `GEMINI_API_KEY` to your Google AI Studio key.
4. Run `npm start`, then visit `http://localhost:3000`.

It calls `gemma-4-26b-a4b-it` through the Gemini API and requests JSON output, so the UI can reliably render four quality metrics. The browser only calls the local `/api/analyze` route; your key never reaches browser JavaScript.

This is an informational estimate, not nutrition, medical, food-safety, or laboratory advice. Image/name-only checks cannot confirm ingredients, contaminants, chemicals, or microplastics.
