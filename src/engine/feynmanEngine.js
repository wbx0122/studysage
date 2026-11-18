/**
 * 费曼复述检测引擎
 * ─────────────────────────────────────────────
 * 痛点：学生“看懂了”但讲不出来，一讲就暴露理解偏差；老师无法逐个听学生复述。
 * 学生用自己的话复述知识点，引擎检查关键概念覆盖、识别典型误解并指出遗漏。
 */
import { KP_MAP } from '../data/knowledgeMap.js';
import { normalizeText, countHits, clamp } from '../utils/helpers.js';
import { llmAdapter } from './llmAdapter.js';

/**
 * 误解识别规则：正则命中学生复述中的错误表述。
 * 每条含：pattern（正则）、point（问题点）、fix（纠正方向）。
 */
const MISCONCEPTION_RULES = {
  kp_rat_sign: [
    { pattern: /异号.{0,6}(相加|加).{0,8}绝对值(相加|加)/, point: '异号相加法则错误', fix: '异号相加应取绝对值较大数的符号，并用较大绝对值“减去”较小绝对值。' },
    { pattern: /(两个负数|负.{0,3}乘.{0,3}负).{0,10}(得|是|等于).{0,4}负/, point: '负负得正被讲反', fix: '同号相乘得正，两个负数相乘结果为正数。' }
  ],
  kp_linear_eq: [
    { pattern: /移项.{0,8}(不变号|不用变号|符号不变)/, point: '移项规则错误', fix: '项从等号一边移到另一边必须改变符号。' },
    { pattern: /系数化为?1.{0,10}(乘|加)/, point: '系数化为1的操作错误', fix: '系数化为1应在两边同时除以未知数的系数。' }
  ],
  kp_linear_app: [
    { pattern: /(不用|不需要).{0,6}等量关系/, point: '忽视等量关系', fix: '列方程的核心是找到题目中的等量关系。' },
    { pattern: /单位.{0,8}(不用|不需要).{0,4}统一/, point: '单位处理错误', fix: '列式前要先统一单位，否则方程两边量纲不一致。' }
  ],
  kp_newton1: [
    { pattern: /运动.{0,8}需要力.{0,4}维持/, point: '亚里士多德式错误观念', fix: '物体的运动不需要力来维持，不受力时可保持匀速直线运动。' },
    { pattern: /不受力.{0,8}一定.{0,4}静止/, point: '把“保持静止”绝对化', fix: '不受力时可能静止，也可能做匀速直线运动，取决于初始状态。' }
  ],
  kp_inertia: [
    { pattern: /惯性力/, point: '把惯性当成了力', fix: '惯性是物体保持原有运动状态的“性质”，不是一种力，不能说“惯性力”。' },
    { pattern: /速度(越大|大).{0,6}惯性(越大|大)/, point: '认为惯性与速度有关', fix: '惯性大小只由质量决定，与速度大小无关。' },
    { pattern: /只有运动.{0,6}才(有|具有).{0,4}惯性/, point: '认为静止物体没有惯性', fix: '一切物体在任何状态下都有惯性，静止的物体同样具有。' }
  ],
  kp_force_balance: [
    { pattern: /(两个物体|不同物体|分别).{0,12}平衡力/, point: '平衡力作用对象错误', fix: '平衡力必须作用在“同一个物体”上；作用在两个物体上的是相互作用力。' },
    { pattern: /(不用|不需要|忽略).{0,8}同一直线/, point: '忽略共线条件', fix: '二力平衡要求两个力作用在同一直线上，否则会产生转动效果。' }
  ]
};

/**
 * 评估一次费曼复述
 * @returns {{score, level, hits, missing, misconceptions, suggestions, coverage}}
 */
export function assessFeynman(kpId, rawText) {
  const kp = KP_MAP[kpId];
  const text = String(rawText || '');
  const norm = normalizeText(text);

  // 1. 关键概念覆盖
  const hits = countHits(text, kp.keyConcepts);
  const missing = kp.keyConcepts.filter(c => !hits.includes(c));
  const coverage = kp.keyConcepts.length ? hits.length / kp.keyConcepts.length : 0;

  // 2. 误解识别
  const rules = MISCONCEPTION_RULES[kpId] || [];
  const found = [];
  for (const rule of rules) {
    if (rule.pattern.test(norm)) {
      found.push({ point: rule.point, fix: rule.fix });
    }
  }

  // 3. 评分：覆盖度 70% + 准确性 30%，每个误解扣 15 分
  const accuracy = clamp(1 - found.length * 0.25, 0.25, 1);
  const score = clamp(Math.round((coverage * 0.7 + accuracy * 0.3) * 100), 0, 100);

  let level;
  if (score >= 85 && found.length === 0) level = '讲解清晰，可当小老师';
  else if (score >= 65) level = '基本理解，仍有遗漏';
  else level = '存在明显偏差，需重新学习';

  // 4. 改进建议
  const suggestions = [];
  if (missing.length) suggestions.push(`补上遗漏的关键概念：${missing.join('、')}`);
  found.forEach(f => suggestions.push(`纠正「${f.point}」：${f.fix}`));
  if (!suggestions.length) suggestions.push('结构完整，可以尝试用更生活化的例子再讲一遍。');

  return {
    kpId,
    score,
    level,
    coverage: Math.round(coverage * 100),
    hits,
    missing,
    misconceptions: found,
    suggestions,
    wordCount: text.replace(/\s/g, '').length,
    time: Date.now()
  };
}

llmAdapter.registerLocalHandler(
  'feynman',
  input => assessFeynman(input.kpId, input.text),
  input => `你是费曼学习法教练。学生正在用自己的话复述知识点，请指出关键概念遗漏与理解偏差，给出纠正建议，不要替学生重写整段复述。`
);
