/**
 * GET /api/llm-config → 返回云端配置（不含 apiKey，安全）
 * POST /api/llm-config → 云端只读，静默成功
 */
export default async function handler(req, res) {
  // 云端配置从环境变量读取
  const cfg = {
    mode: process.env.LLM_MODE || 'remote',
    baseURL: process.env.LLM_BASE_URL || '',
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    temperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.4,
    timeout: parseInt(process.env.LLM_TIMEOUT) || 30000
  };

  if (req.method === 'GET') {
    const { apiKey, ...safe } = cfg;
    return res.status(200).json({ ...safe, hasApiKey: !!apiKey });
  }

  if (req.method === 'POST') {
    // 云端文件系统只读，静默成功（配置通过 Vercel 环境变量管理）
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}