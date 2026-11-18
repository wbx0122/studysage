/**
 * 知识掌握度诊断与个性化学习路径引擎
 * ─────────────────────────────────────────────
 * 痛点：学生不知道自己“到底哪里不会”，复习平均用力；老师无法给每个学生定制路径。
 * 依据答题/对话记录，按知识点标记 未学 / 薄弱 / 掌握，并按先修依赖生成补漏路径。
 */
import { KNOWLEDGE_POINTS, KP_MAP } from '../data/knowledgeMap.js';
import { QUESTIONS } from '../data/questionBank.js';
import { clamp } from '../utils/helpers.js';

/** 单条记录得分：正确为基础分，额外尝试/依赖提示扣分；错误为低分 */
function recordScore(rec) {
  if (!rec.correct) return 25;
  let s = 100;
  s -= Math.max(0, (rec.attempts || 1) - 1) * 15;
  s -= (rec.usedHints || 0) * 12;
  return clamp(s, 40, 100);
}

/** 时间衰减权重：越近的记录权重越高 */
function timeWeight(rec, now) {
  const days = (now - rec.time) / (24 * 3600 * 1000);
  return 1 / (1 + 0.12 * Math.max(0, days));
}

/** 计算单个知识点的掌握状态 */
export function diagnoseKp(kpId, records, now = Date.now()) {
  const recs = records.filter(r => r.kpId === kpId);
  if (!recs.length) {
    return { kpId, status: 'unseen', score: 0, total: 0, correct: 0, label: '未学' };
  }
  let wsum = 0, wscore = 0, correct = 0;
  for (const r of recs) {
    const w = timeWeight(r, now);
    wsum += w;
    wscore += recordScore(r) * w;
    if (r.correct) correct += 1;
  }
  const score = Math.round(wscore / wsum);
  const firstTryMastered = recs.some(r => r.correct && (r.attempts || 1) === 1 && !(r.usedHints > 0));
  let status, label;
  if (score >= 75 && firstTryMastered) { status = 'mastered'; label = '掌握'; }
  else { status = 'weak'; label = '薄弱'; }
  return { kpId, status, label, score, total: recs.length, correct };
}

/** 全部知识点掌握度映射 */
export function computeMasteryMap(records) {
  return Object.fromEntries(KNOWLEDGE_POINTS.map(kp => [kp.id, diagnoseKp(kp.id, records)]));
}

/** 整体掌握率（已掌握知识点占比） */
export function overallMastery(records) {
  const m = computeMasteryMap(records);
  const vals = Object.values(m);
  const mastered = vals.filter(v => v.status === 'mastered').length;
  const touched = vals.filter(v => v.status !== 'unseen').length;
  return {
    mastered,
    touched,
    total: vals.length,
    percent: Math.round((mastered / vals.length) * 100),
    avgScore: Math.round(vals.reduce((a, v) => a + v.score, 0) / vals.length)
  };
}

/** 拓扑排序：保证先修知识点排在前面 */
function topoOrder() {
  const order = [];
  const visited = new Set();
  function dfs(id) {
    if (visited.has(id)) return;
    visited.add(id);
    const kp = KP_MAP[id];
    (kp.prerequisites || []).forEach(dfs);
    order.push(id);
  }
  KNOWLEDGE_POINTS.forEach(kp => dfs(kp.id));
  return order;
}

/**
 * 生成个性化学习路径
 * 薄弱点优先补先修，再做针对性题目；未学点按依赖顺序安排。
 */
export function buildLearningPath(records) {
  const mastery = computeMasteryMap(records);
  const order = topoOrder();
  const steps = [];
  let stepNo = 1;

  for (const id of order) {
    const kp = KP_MAP[id];
    const m = mastery[id];
    if (m.status === 'mastered') continue;

    const targetQuestions = QUESTIONS.filter(q => q.kpId === id);
    const missingPrereq = (kp.prerequisites || []).filter(p => mastery[p]?.status !== 'mastered');

    let reason, action;
    if (m.status === 'unseen') {
      reason = '尚未学习该知识点';
      action = '先学习核心概念，再完成入门题';
    } else {
      const wrong = m.total - m.correct;
      reason = `已练习 ${m.total} 次、其中 ${wrong} 次未通过，掌握度 ${m.score} 分`;
      action = missingPrereq.length
        ? `先补先修知识点「${KP_MAP[missingPrereq[0]].name}」，再回来做针对性练习`
        : '针对该知识点完成 2-3 道专项题并查看分层提示';
    }

    steps.push({
      step: stepNo++,
      kpId: id,
      name: kp.name,
      subject: kp.subject,
      status: m.status,
      score: m.score,
      reason,
      action,
      blockedBy: missingPrereq,
      questionIds: targetQuestions.map(q => q.id),
      estimatedMin: 15 + targetQuestions.length * 5
    });
  }
  return steps;
}

/** 教师端：对任意学生记录计算掌握度（复用同一套规则） */
export function studentMasteryFor(records, studentId) {
  const recs = records.filter(r => r.studentId === studentId);
  return computeMasteryMap(recs);
}
