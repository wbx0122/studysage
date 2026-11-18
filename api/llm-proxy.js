/**
 * POST /api/llm-proxy → 转发大模型请求（服务端持有 apiKey）
 * Vercel Serverless Function · maxDuration 60s
 */
export const config = { maxDuration: 60 };

function endpointURL(base) {
  let url = String(base || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  if (!/\/chat\/completions$/.test(url)) url += '/chat/completions';
  return url;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  try {
    const body = req.body || {};
    const baseURL = process.env.LLM_BASE_URL || '';
    const apiKey = process.env.LLM_API_KEY || '';
    const model = process.env.LLM_MODEL || 'gpt-4o-mini';
    const temperature = parseFloat(process.env.LLM_TEMPERATURE) || 0.4;

    if (!baseURL) {
      return res.status(400).json({ error: { message: 'Base URL 为空，请先配置环境变量。' } });
    }
    if (!apiKey) {
      return res.status(400).json({ error: { message: 'API Key 为空，请先配置环境变量。' } });
    }

    const url = endpointURL(baseURL);
    const payload = {
      model: body.model || model,
      temperature: body.temperature ?? temperature,
      messages: body.messages
    };
    if (body.jsonMode) payload.response_format = { type: 'json_object' };

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    return res.status(resp.ok ? 200 : resp.status).json(data);
  } catch (e) {
    const msg = e.name === 'AbortError' ? '请求超时' :
      /fetch|network|ENOTFOUND|ECONNREFUSED/i.test(e.message) ? `网络连接失败：${e.message}` : e.message;
    return res.status(502).json({ error: { message: `API 代理请求失败：${msg}` } });
  }
}