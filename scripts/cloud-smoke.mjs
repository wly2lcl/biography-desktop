const provider = process.env.PROVIDER;
const apiKey = process.env.API_KEY;

const configs = {
  deepseek: { url: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat' },
  openai: { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
};

const config = configs[provider];
if (!config || !apiKey) throw new Error('Missing provider configuration or protected API key');

const response = await fetch(config.url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: config.model,
    messages: [{ role: 'user', content: 'Reply with OK only.' }],
    temperature: 0,
    max_tokens: 8,
    stream: true,
  }),
  signal: AbortSignal.timeout(30000),
});

if (!response.ok) throw new Error(`${provider} smoke test failed with HTTP ${response.status}`);
const body = await response.text();
let content = '';
let completed = false;
for (const line of body.split(/\r?\n/)) {
  if (!line.startsWith('data:')) continue;
  const data = line.slice(5).trimStart();
  if (data === '[DONE]') {
    completed = true;
    continue;
  }
  const payload = JSON.parse(data);
  const token = payload.choices?.[0]?.delta?.content;
  if (typeof token === 'string') content += token;
}
if (!completed || !content.trim()) {
  throw new Error(`${provider} returned an incomplete streaming response`);
}
console.log(`${provider} smoke test passed`);
