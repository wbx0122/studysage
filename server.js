/**
 * 零依赖静态文件服务器 + LLM API 代理（Node 内置模块，离线可用）
 * ─────────────────────────────────────────────
 *  - 静态文件：serve source/ 目录
 *  - API 代理：/api/llm-proxy 将浏览器请求转发到用户配置的大模型 API，
 *    API Key 仅保存在服务端（llm-config.json），局域网内任一电脑无需重复配置；
 *  - 配置管理：/api/llm-config (GET/POST) 读写服务端配置；
 *  - 连接测试：/api/llm-test 服务端直接测试 LLM API 连通性；
 *  - 监听 0.0.0.0，局域网内其他电脑可通过 http://<本机IP>:8090 访问。
 * 用法：node server.js  或  npm start
 */
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { networkInterfaces } from 'node:os';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8090;
const HOST = process.env.HOST || '0.0.0.0';
const CONFIG_FILE = join(ROOT, 'llm-config.json');
const MAX_BODY = 25 * 1024 * 1024; // 25MB（含 base64 图片）

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8'
};

/* ──────────────── LLM 配置读写 ──────────────── */

/** 是否为云部署模式（有环境变量配置时自动启用） */
const isCloudDeploy = !!process.env.LLM_API_KEY;

async function readLLMConfig() {
  // 云部署模式：从环境变量读取（文件系统不持久）
  if (isCloudDeploy) {
    return {
      mode: process.env.LLM_MODE || 'remote',
      baseURL: process.env.LLM_BASE_URL || '',
      apiKey: process.env.LLM_API_KEY || '',
      model: process.env.LLM_MODEL || 'gpt-4o-mini',
      temperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.4,
      timeout: parseInt(process.env.LLM_TIMEOUT) || 30000
    };
  }
  // 本地模式：从 llm-config.json 读取
  try {
    return JSON.parse(await readFile(CONFIG_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

async function writeLLMConfig(cfg) {
  // 云部署模式：文件系统只读，静默跳过（配置通过环境变量管理）
  if (isCloudDeploy) return;
  await writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

/** 规范化端点：兼容带或不带 /chat/completions 的 baseURL */
function endpointURL(base) {
  let url = String(base || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  if (!/\/chat\/completions$/.test(url)) url += '/chat/completions';
  return url;
}

/* ──────────────── HTTP 工具 ──────────────── */

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch { reject(new Error('JSON 解析失败')); }
    });
    req.on('error', reject);
  });
}

/* ──────────────── API 路由处理 ──────────────── */

async function handleAPI(path, req, res) {
  // GET /api/llm-config → 返回服务端配置（不含 apiKey，安全）
  if (path === '/api/llm-config' && req.method === 'GET') {
    const cfg = await readLLMConfig();
    if (!cfg) return json(res, 200, { mode: 'local' });
    const { apiKey, ...safe } = cfg;
    return json(res, 200, { ...safe, hasApiKey: !!apiKey });
  }

  // POST /api/llm-config → 保存配置到服务端
  if (path === '/api/llm-config' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const prev = (await readLLMConfig()) || {};
      // 合并：新值覆盖旧值，但空 apiKey 不覆盖已有值（避免误清）
      const next = { ...prev, ...body };
      if (!body.apiKey && prev.apiKey) next.apiKey = prev.apiKey;
      await writeLLMConfig(next);
      return json(res, 200, { ok: true });
    } catch (e) {
      return json(res, 400, { ok: false, error: e.message });
    }
  }

  // POST /api/llm-proxy → 转发大模型请求（服务端持有 apiKey）
  if (path === '/api/llm-proxy' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const cfg = await readLLMConfig();
      if (!cfg || cfg.mode !== 'remote') {
        return json(res, 503, { error: { message: '服务端未开启远程大模型模式，请先在引擎设置中配置。' } });
      }
      const url = endpointURL(cfg.baseURL);
      if (!url) return json(res, 400, { error: { message: 'Base URL 为空，请先配置。' } });
      if (!cfg.apiKey) return json(res, 400, { error: { message: 'API Key 为空，请先配置。' } });

      const payload = {
        model: body.model || cfg.model,
        temperature: body.temperature ?? cfg.temperature ?? 0.4,
        messages: body.messages
      };
      if (body.jsonMode) payload.response_format = { type: 'json_object' };

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`
        },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      return json(res, resp.ok ? 200 : resp.status, data);
    } catch (e) {
      const msg = e.name === 'AbortError' ? '请求超时' :
        /fetch|network|ENOTFOUND|ECONNREFUSED/i.test(e.message) ? `网络连接失败：${e.message}` : e.message;
      return json(res, 502, { error: { message: `API 代理请求失败：${msg}` } });
    }
  }

  // POST /api/llm-test → 服务端测试 LLM API 连通性
  if (path === '/api/llm-test' && req.method === 'POST') {
    const cfg = await readLLMConfig();
    const url = cfg ? endpointURL(cfg.baseURL) : '';
    if (!url) return json(res, 200, { ok: false, message: '❌ Base URL 为空，请先填写 API 地址。' });
    if (!cfg.apiKey) return json(res, 200, { ok: false, message: '❌ API Key 为空，请先填写你的 Key。' });
    const t0 = Date.now();
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`
        },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: 16,
          messages: [{ role: 'user', content: '请回复"连接成功"四个字。' }]
        })
      });
      const latency = Date.now() - t0;
      const data = await resp.json();
      if (!resp.ok) {
        const s = resp.status;
        const hint = s === 401 || s === 403 ? 'API Key 无效或无权限' :
          s === 404 ? `接口不存在（404），请检查 Base URL` :
          s === 429 ? '请求过于频繁或额度不足' : `服务端错误（${s}）`;
        return json(res, 200, { ok: false, message: `❌ ${hint}`, latency });
      }
      const reply = data.choices?.[0]?.message?.content || '(空响应)';
      return json(res, 200, {
        ok: true,
        latency,
        model: data.model || cfg.model,
        message: `✅ 连接成功！模型 ${data.model || cfg.model}，耗时 ${latency}ms，回复："${String(reply).slice(0, 40)}"`
      });
    } catch (e) {
      return json(res, 200, { ok: false, message: `❌ ${e.name === 'TimeoutError' ? '请求超时' : e.message}` });
    }
  }

  return json(res, 404, { error: 'API not found' });
}

/* ──────────────── 主服务 ──────────────── */

const server = http.createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(req.url.split('?')[0]);
    if (path === '/') path = '/index.html';

    // API 路由
    if (path.startsWith('/api/')) {
      return await handleAPI(path, req, res);
    }

    // 静态文件
    const filePath = normalize(join(ROOT, path));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403); return res.end('Forbidden');
    }
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
});

/** 获取本机局域网 IPv4 地址 */
function getLANIPs() {
  const nets = networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) ips.push({ name, address: net.address });
    }
  }
  return ips;
}

server.listen(PORT, HOST, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  思齐 StudySage · AI 学习辅助智能体');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  本机访问：  http://127.0.0.1:${PORT}`);
  const ips = getLANIPs();
  if (ips.length) {
    console.log('  局域网访问（其他电脑用这个地址）：');
    for (const { name, address } of ips) {
      console.log(`    http://${address}:${PORT}  (${name})`);
    }
  }
  console.log('  按 Ctrl+C 停止服务');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});