/**
 * 苏格拉底式引导答疑引擎
 * ─────────────────────────────────────────────
 * 痛点：学生一搜就抄答案、只记结论不会推导；普通答疑机器人直接给答案。
 * 策略：先判断题型 → 用分层追问/提示引导学生自己推导；
 *       学生连续卡住（错答/求助达到阈值）或明确请求后，才给完整解答。
 * 纯状态机实现，输入 session + 学生发言，输出新的 session 与回复。
 */
import { Q_MAP } from '../data/questionBank.js';
import { KP_MAP, KNOWLEDGE_POINTS } from '../data/knowledgeMap.js';
import { matchAnswer, normalizeText, containsKeyword } from '../utils/helpers.js';
import { llmAdapter } from './llmAdapter.js';

const STUCK_WORDS = ['不会', '不知道', '不懂', '卡住', '没思路', '提示', '帮帮', '怎么想', 'help', 'hint', 'stuck'];
const REVEAL_WORDS = ['直接给答案', '看答案', '完整解答', '告诉我答案', 'show answer'];
const MAX_WRONG_BEFORE_REVEAL = 2;
// 连续错答达到该次数后，配合“提示已用尽”才允许释放完整解答，避免学生直接抄答案

export function isStuck(text) {
  const t = normalizeText(text);
  return STUCK_WORDS.some(w => t.includes(normalizeText(w)));
}

function wantsReveal(text) {
  const t = normalizeText(text);
  return REVEAL_WORDS.some(w => t.includes(normalizeText(w)));
}

/** 题型识别：优先用题库标注，自由提问按关键词推断 */
export function classifyQuestion(q) {
  if (q.qType) return q.qType;
  const t = q.stem || '';
  if (/应用|多少元|一共|比.*大|设.*为/.test(t)) return '应用题';
  if (/计算|=|×|\+|方程|解/.test(t)) return '计算题';
  return '概念题';
}

/** 自由提问 → 知识点路由（关键词命中知识点名称/关键概念） */
export function routeFreeQuestion(text) {
  const t = normalizeText(text);
  let best = null, bestScore = 0;
  for (const kp of KNOWLEDGE_POINTS) {
    let score = 0;
    if (containsKeyword(text, kp.name)) score += 3;
    for (const c of kp.keyConcepts) {
      if (containsKeyword(text, c)) score += 1;
    }
    if (score > bestScore) { bestScore = score; best = kp; }
  }
  return bestScore > 0 ? best : null;
}

function openingFor(q) {
  const qt = classifyQuestion(q);
  const map = {
    概念题: '这是一道概念题。先别急着选答案——你能先用自己的话说一说题目涉及的核心概念是什么吗？',
    计算题: '这是一道计算题。我们一步步来。你先判断：解决它需要用到哪条法则或性质？把你的第一反应告诉我。',
    应用题: '这是一道应用题。第一步永远是审题——你能找出题目里的“已知量”和“等量关系”吗？'
  };
  return map[qt] || map['概念题'];
}

export function createSession(questionId) {
  const q = Q_MAP[questionId];
  return {
    questionId,
    mode: 'bank',
    stage: 'guiding',
    qType: classifyQuestion(q),
    hintLevel: 0,
    wrongAttempts: 0,
    revealed: false,
    solved: false,
    history: [{ role: 'sage', kind: 'opening', text: openingFor(q), time: Date.now() }]
  };
}

/** 自由提问的概念引导会话 */
export function createFreeSession(text) {
  const kp = routeFreeQuestion(text);
  if (!kp) {
    return {
      mode: 'free', stage: 'no-route', solved: false, revealed: false,
      history: [
        { role: 'student', kind: 'ask', text, time: Date.now() },
        {
          role: 'sage', kind: 'miss', time: Date.now(),
          text: '我暂时没把这个问题对应到内置知识点。你可以换个说法，或从左侧“题库答疑”选择具体题目，我会一步步引导你推导。'
        }
      ]
    };
  }
  return {
    mode: 'free',
    kpId: kp.id,
    stage: 'guiding',
    hintLevel: 0,
    wrongAttempts: 0,
    solved: false,
    revealed: false,
    history: [
      { role: 'student', kind: 'ask', text, time: Date.now() },
      {
        role: 'sage', kind: 'opening', time: Date.now(),
        text: `这个问题对应「${kp.name}」。我先不直接下结论——你能先说说你对“${kp.keyConcepts[0]}”是怎么理解的吗？`
      }
    ]
  };
}

function isCorrect(q, text) {
  if (q.type === 'choice') {
    // 支持选项字母（A/B/C/D）或直接输入选项内容
    const letter = /^([a-d])\b/i.exec(text.trim());
    if (letter) return letter[1].toLowerCase() === ['a', 'b', 'c', 'd'][q.answer];
    const idx = q.choices.findIndex(c => normalizeText(c) === normalizeText(text) || normalizeText(text).includes(normalizeText(c)));
    return idx === q.answer;
  }
  return matchAnswer(text, q.answerRules);
}

function push(session, role, kind, text) {
  session.history.push({ role, kind, text, time: Date.now() });
}

/**
 * 核心转移函数：学生发言 → 引擎回复
 * 返回 { session, reply, finished:bool, independent:bool }
 */
export function respond(session, rawText) {
  const text = String(rawText || '').trim();
  push(session, 'student', 'say', text);

  // 自由提问模式：用追问链引导，不提供标准答案
  if (session.mode === 'free') {
    return handleFree(session, text);
  }

  const q = Q_MAP[session.questionId];
  if (session.solved || session.revealed) {
    return { session, reply: attach(session, 'info', '这道题已经结束了，可以在左侧切换下一题继续。'), finished: true };
  }

  // 明确请求完整解答
  if (wantsReveal(text)) return reveal(session, q, false);

  // 答对
  if (isCorrect(q, text)) {
    session.solved = true;
    session.stage = 'solved';
    const independent = session.hintLevel === 0 && session.wrongAttempts === 0;
    const praise = independent
      ? `太棒了！你没有借助提示就独立得出了正确答案（${q.displayAnswer || q.choices[q.answer]}），说明这个知识点已经掌握得很扎实。`
      : `经过引导你推导出了正确答案（${q.displayAnswer || q.choices[q.answer]}），值得肯定。建议回顾刚才卡住的那一步，确保下次能独立完成。`;
    push(session, 'sage', 'praise', praise);
    return { session, reply: { kind: 'praise', text: praise }, finished: true, independent };
  }

  // 求助 / 卡住
  if (isStuck(text)) {
    return nextHint(session, q, true);
  }

  // 答错
  session.wrongAttempts += 1;
  return nextHint(session, q, false);
}

function nextHint(session, q, explicitAsk) {
  const prefix = explicitAsk ? '好，我给你一个提示：' : '这个方向还不对，先别着急——';
  if (session.hintLevel < q.hints.length) {
    const hint = q.hints[session.hintLevel];
    session.hintLevel += 1;
    const reply = `${prefix}${hint}\n\n想一想，再把你的结论告诉我；如果确实推不动，可以说“再提示”，或在连续卡住后让我给出完整解答。`;
    push(session, 'sage', 'hint', reply);
    return { session, reply: { kind: 'hint', text: reply }, finished: false };
  }
  // 提示已用尽
  if (session.wrongAttempts >= MAX_WRONG_BEFORE_REVEAL || explicitAsk) {
    return reveal(session, q, true);
  }
  const reply = '提示已经给完了。你再尝试对照最后一条提示算一次；如果仍然得不出，我可以直接给出完整解答。';
  push(session, 'sage', 'hint', reply);
  return { session, reply: { kind: 'hint', text: reply }, finished: false };
}

function reveal(session, q, afterHints) {
  session.revealed = true;
  session.stage = 'revealed';
  const lead = afterHints ? '你已经连续卡住，我现在给出完整解答，请对照自己卡在哪一步：' : '按你的请求，给出完整解答（请重点理解推导过程，而不只是记结果）：';
  const text = `${lead}\n\n${q.solution}`;
  push(session, 'sage', 'solution', text);
  return { session, reply: { kind: 'solution', text }, finished: true, independent: false };
}

function handleFree(session, text) {
  const kp = KP_MAP[session.kpId];
  if (wantsReveal(text)) {
    session.revealed = true;
    const t = `关于「${kp.name}」的完整表述：${kp.canonical}`;
    push(session, 'sage', 'solution', t);
    return { session, reply: { kind: 'solution', text: t }, finished: true, independent: false };
  }
  if (isStuck(text)) {
    const concept = kp.keyConcepts[Math.min(session.hintLevel, kp.keyConcepts.length - 1)];
    session.hintLevel += 1;
    const t = `换个角度想：试着围绕“${concept}”组织一下，它和你刚才说的内容有什么联系？`;
    push(session, 'sage', 'hint', t);
    return { session, reply: { kind: 'hint', text: t }, finished: false };
  }
  // 学生在尝试表达：检查是否覆盖了关键概念，继续追问下一个
  const covered = kp.keyConcepts.filter(c => containsKeyword(text, c));
  if (covered.length >= Math.ceil(kp.keyConcepts.length * 0.6)) {
    session.solved = true;
    const t = `你已经抓住了 ${covered.join('、')} 等关键点，理解基本到位。可以去“费曼复述”做一次完整讲解来检验。`;
    push(session, 'sage', 'praise', t);
    return { session, reply: { kind: 'praise', text: t }, finished: true, independent: true };
  }
  const next = kp.keyConcepts[session.hintLevel % kp.keyConcepts.length];
  session.hintLevel += 1;
  const t = `你提到了 ${covered.length ? covered.join('、') : '一些想法'}。再追问一步：“${next}”在其中起什么作用？`;
  push(session, 'sage', 'question', t);
  return { session, reply: { kind: 'question', text: t }, finished: false };
}

function attach(session, kind, text) {
  return { kind, text };
}

// 注册到统一 AI 适配层（远程模式下同样的引导可由大模型完成）
llmAdapter.registerLocalHandler(
  'socratic',
  input => {
    const session = input.session || createSession(input.questionId);
    return respond(session, input.text).reply;
  },
  input => `你是苏格拉底式导师，绝不直接给答案。题型：${input.qType || '未知'}。请通过分层追问和提示，引导学生自己推导出答案；只有学生连续卡住或明确请求时才给完整解答。`
);
