const $ = (s) => document.querySelector(s);
let imageData = null;
let imageLookupTimer = null;
let cameraStream = null;

$('#foodText').addEventListener('input', () => {
  if (imageData) return;
  clearTimeout(imageLookupTimer);
  const query = $('#foodText').value.trim();
  if (query.length >= 3) imageLookupTimer = setTimeout(() => lookupDishImage(query), 650);
});

$('#foodImage').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) return alert('Please choose an image file.');
  imageData = { mimeType: file.type, data: (await fileToBase64(file)).split(',')[1] };
  $('#imagePreview').src = URL.createObjectURL(file); $('#imagePreview').hidden = false;
  $('#uploadTitle').textContent = 'Photo ready'; $('#uploadHint').textContent = file.name; $('#imageSource').hidden = true;
});
function fileToBase64(file) { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); }); }

$('#cameraBtn').addEventListener('click', openCamera);
$('#cameraClose').addEventListener('click', closeCamera);
$('#cameraCancel').addEventListener('click', closeCamera);
$('#takePhoto').addEventListener('click', captureCameraPhoto);

async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) return alert('Camera access is not supported in this browser. Upload a photo instead.');
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    $('#cameraVideo').srcObject = cameraStream; $('#cameraPanel').hidden = false;
  } catch (error) { alert('Camera access was not granted. Allow camera permission, then try again.'); }
}
function closeCamera() {
  cameraStream?.getTracks().forEach(track => track.stop()); cameraStream = null;
  $('#cameraVideo').srcObject = null; $('#cameraPanel').hidden = true;
}
function captureCameraPhoto() {
  const video = $('#cameraVideo'), canvas = $('#cameraCanvas');
  if (!video.videoWidth) return alert('Camera is still starting—try again in a moment.');
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  imageData = { mimeType: 'image/jpeg', data: dataUrl.split(',')[1] };
  $('#imagePreview').src = dataUrl; $('#imagePreview').hidden = false;
  $('#uploadTitle').textContent = 'Camera photo ready'; $('#uploadHint').textContent = 'Ready for analysis'; $('#imageSource').hidden = true;
  closeCamera();
}

async function lookupDishImage(query) {
  if (imageData || $('#foodText').value.trim() !== query) return;
  $('#uploadTitle').textContent = 'Finding a real photo…'; $('#uploadHint').textContent = 'Searching Wikimedia Commons';
  try {
    const res = await fetch('/api/dish-image?q=' + encodeURIComponent(query));
    const data = await res.json();
    if (!res.ok || imageData || $('#foodText').value.trim() !== query) throw new Error(data.error || 'No image found');
    $('#imagePreview').src = data.url; $('#imagePreview').alt = `Public photo of ${query}`; $('#imagePreview').hidden = false;
    const source = $('#imageSource'); source.href = data.pageUrl || 'https://commons.wikimedia.org'; source.textContent = 'Real photo: Wikimedia Commons'; source.hidden = false;
    $('#uploadTitle').textContent = 'Internet photo found'; $('#uploadHint').textContent = 'Click to replace it with your own photo';
  } catch (_) {
    if ($('#foodText').value.trim() === query && !imageData) { $('#uploadTitle').textContent = 'Snap or upload a photo'; $('#uploadHint').textContent = 'No public match found — try a clearer dish name'; }
  }
}

$('#analyzeBtn').addEventListener('click', analyze);
async function analyze() {
  const foodText = $('#foodText').value.trim();
  if (!foodText && !imageData) return alert('Enter a food or ingredient list, upload a photo, or both.');
  $('#results').hidden = true; $('#loading').hidden = false; $('#analyzeBtn').disabled = true;
  const parts = [{ text: buildPrompt(foodText) }];
  if (imageData) parts.push({ inline_data: { mime_type: imageData.mimeType, data: imageData.data } });
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.15, maxOutputTokens: 1600, thinkingConfig: { thinkingLevel: 'minimal' } } })
    });
    const raw = await res.json();
    if (!res.ok) {
      const detail = typeof raw?.error === 'string' ? raw.error : raw?.error?.message;
      throw new Error(detail || `Google AI could not complete the request (HTTP ${res.status}).`);
    }
    // Gemma 4 may return internal thought parts alongside the user-facing answer.
    // Only its non-thought parts belong in our JSON parser.
    const answerParts = raw?.candidates?.[0]?.content?.parts?.filter(p => !p.thought) || [];
    const text = answerParts.map(p => p.text || '').join('') || '';
    render(parseModelJson(text));
  } catch (err) { alert('Analysis failed: ' + err.message); }
  finally { $('#loading').hidden = true; $('#analyzeBtn').disabled = false; }
}

function buildPrompt(foodText) { return `You are Slop Detector, an evidence-aware food-quality explainer with playful but never insulting language. Analyze the food below${foodText ? `: "${foodText}"` : ' shown in the attached image'}. A photo alone cannot establish a full ingredient list, exact nutrition, chemical residues, or microplastics. Make clear, calibrated estimates and never diagnose disease or claim lab verification. Scores are food QUALITY scores: 0 is poor, 10 is favorable. Judge the prepared food/product in a normal serving. Score exactly these four metrics: protein richness (quantity/quality), oil profile (minimally processed/appropriate fats rate high; heavily refined oils rate lower, without fearmongering), added sugar (low added sugar scores high), and contaminant signals (rate packaging/processing/ingredient signals only; absence of known information is not proof). Return ONLY valid JSON matching this schema:
{"foodName":"string","headline":"a playful 3-8 word verdict based on the score","overallScore":number,"summary":"1-2 sentences","metrics":[{"id":"protein","name":"Protein richness","score":number,"note":"brief calibrated reason"},{"id":"oils","name":"Oil profile","score":number,"note":"brief calibrated reason"},{"id":"sugar","name":"Added sugars","score":number,"note":"brief calibrated reason"},{"id":"contaminants","name":"Contaminant signals","score":number,"note":"brief calibrated reason"}],"pros":["string"],"cons":["string"],"upgrade":{"needed":boolean,"title":"string","text":"specific improvement"},"disclaimer":"short uncertainty note"}. Use 0-10 numbers with one decimal max. Overall should reflect the four metrics plus degree of processing. Keep it concise.`; }

function tier(score) { if (score < 4) return ['High slop risk', 'low']; if (score < 6) return ['Mixed bag', 'mid']; if (score < 8) return ['Solid choice', 'good']; return ['Strong pick', 'great']; }
function parseModelJson(text) {
  // Gemma can add a Markdown heading/fence even when JSON mode is requested.
  // Pull out the outer object instead of treating that wrapper as an API failure.
  const first = text.indexOf('{'), last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) throw new Error('The model returned no usable analysis. Please try again.');
  const candidate = text.slice(first, last + 1)
    .replace(/```(?:json)?/gi, '')
    .replace(/\*\*/g, '')
    .replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(candidate); }
  catch (_) { throw new Error('The model returned an incomplete result. Please try again.'); }
}
function fallbackHeadline(score) { if (score < 4) return 'Code red: snack emergency'; if (score < 6) return 'A little suspicious, bestie'; if (score < 8) return 'Actually kind of a win'; return 'Main-character meal energy'; }
function render(data) {
  const score = clamp(data.overallScore); const [label, cls] = tier(score);
  $('#foodName').textContent = data.foodName || 'Food analysis'; $('#headline').textContent = data.headline || fallbackHeadline(score); $('#summary').textContent = data.summary || '';
  $('#overallScore').textContent = score.toFixed(1); $('#tier').textContent = label; $('#verdictBadge').className = 'verdict-badge ' + cls;
  $('#metrics').replaceChildren(...(data.metrics || []).slice(0,4).map(m => metric(m)));
  fillList('#pros', data.pros); fillList('#cons', data.cons);
  $('#upgradeCard').hidden = !data.upgrade?.needed; $('#upgradeTitle').textContent = data.upgrade?.title || 'A smarter swap'; $('#upgradeText').textContent = data.upgrade?.text || '';
  $('#disclaimer').textContent = data.disclaimer || 'This is an AI estimate, not a laboratory test or medical assessment.';
  $('#results').hidden = false; $('#results').scrollIntoView({behavior:'smooth', block:'start'});
}
function clamp(v) { v = Number(v); return Number.isFinite(v) ? Math.max(0, Math.min(10, v)) : 0; }
function metric(m) { const score = clamp(m.score), el = document.createElement('article'); el.className = 'metric' + (score < 4 ? ' low' : ''); el.innerHTML = `<h3>${escapeHTML(m.name || 'Metric')}</h3><div class="metric-score">${score.toFixed(1)}<small>/10</small></div><div class="meter"><i style="width:${score*10}%"></i></div><p>${escapeHTML(m.note || '')}</p>`; return el; }
function fillList(selector, items) { const el=$(selector); el.replaceChildren(...(Array.isArray(items)&&items.length?items:['No strong signal identified from the available information.']).slice(0,4).map(x=>{const li=document.createElement('li');li.textContent=x;return li;})); }
function escapeHTML(s) { const d=document.createElement('div'); d.textContent=String(s);return d.innerHTML; }
