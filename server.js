import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(root, 'public')));

app.get('/api/dish-image', async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (query.length < 2) return res.status(400).json({ error: 'Enter a dish name first.' });
  try {
    // Searches human-uploaded, freely licensed photos; no image-generation model is used.
    const params = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: query + ' food', gsrnamespace: '6', gsrlimit: '8', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '900', origin: '*' });
    const response = await fetch('https://commons.wikimedia.org/w/api.php?' + params, { headers: { 'User-Agent': 'FoodCheck/1.0' } });
    const data = await response.json();
    const image = Object.values(data?.query?.pages || {}).map(page => ({
      url: page.imageinfo?.[0]?.thumburl || page.imageinfo?.[0]?.url,
      pageUrl: page.imageinfo?.[0]?.descriptionurl,
      source: 'Wikimedia Commons'
    })).find(item => item.url);
    if (!image) return res.status(404).json({ error: 'No matching public photo found.' });
    res.json(image);
  } catch (error) { res.status(502).json({ error: 'Image search failed: ' + error.message }); }
});

app.post('/api/analyze', async (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'Missing GEMINI_API_KEY. Add it to .env, then restart the server.' });
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemma-4-26b-a4b-it:generateContent?key=' + encodeURIComponent(process.env.GEMINI_API_KEY), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Google AI request failed:', error.message);
    res.status(502).json({ error: 'Could not reach Google AI: ' + error.message });
  }
});

app.listen(port, () => console.log(`Food Check is running at http://localhost:${port}`));
