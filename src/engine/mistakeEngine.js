/**
 * 错题归因引擎
 * ─────────────────────────────────────────────
 * 痛点：错题本只“收藏”不分析，同样的错误反复犯；老师看不到班级错误类型结构。
 * 错题自动归类为 概念误解 / 审题失误 / 计算错误 / 方法步骤缺失 / 粗心笔误，
 * 无法自动判定时让学生自我归因，并按原因与知识点统计。
 */
import { Q_MAP } from '../data/questionBank.js';
import { KP_MAP } from '../data/knowledgeMap.js';
import { inferCommonWrong } from '../utils/helpers.js';

/** 根据作答情况推断错误原因；返回 cause 或 null（需学生自我归因） */
export function inferCause(question, payload) {
  if (question.type === 'choice' && payload.choiceIndex != null) {
    return question.distractorCauses?.[payload.choiceIndex] || null;
  }
  if (question.type === 'input') {
    const hit = inferCommonWrong(payload.text, question.commonWrong);
    if (hit) return hit.cause;
  }
  return null;
}

/** 由答题记录构建错题条目，应用学生的原因修正与已解决标记 */
export function buildMistakeEntries(records, overrides = {}) {
  return records
    .filter(r => !r.correct)
    .map(r => {
      const q = Q_MAP[r.questionId];
      const ov = overrides[r.rid] || {};
      return {
        rid: r.rid,
        questionId: r.questionId,
        kpId: r.kpId,
        kpName: KP_MAP[r.kpId]?.name || r.kpId,
        stem: q?.stem,
        qType: q?.qType,
        autoCause: r.cause,
        cause: ov.cause || r.cause || null,
        selfAttributed: !!ov.cause,
        resolved: ov.resolved ?? false,
        attempts: r.attempts,
        time: r.time
      };
    })
    .sort((a, b) => b.time - a.time);
}

/** 错题统计：按原因、按知识点、解决率 */
export function mistakeStats(entries) {
  const byCause = {};
  const byKp = {};
  let resolved = 0;
  for (const e of entries) {
    const key = e.cause || 'unclassified';
    byCause[key] = (byCause[key] || 0) + 1;
    byKp[e.kpId] = (byKp[e.kpId] || 0) + 1;
    if (e.resolved) resolved += 1;
  }
  return {
    total: entries.length,
    resolved,
    unresolved: entries.length - resolved,
    resolveRate: entries.length ? Math.round((resolved / entries.length) * 100) : 0,
    byCause,
    byKp
  };
}

/** 教师端：按错误原因聚合任意记录集 */
export function aggregateCauses(records) {
  const byCause = {};
  for (const r of records) {
    if (r.correct || !r.cause) continue;
    byCause[r.cause] = (byCause[r.cause] || 0) + 1;
  }
  return byCause;
}

/** 教师端：按知识点聚合薄弱人数（该知识点有错误记录的学生数） */
export function weakStudentsByKp(records) {
  const map = {};
  for (const r of records) {
    if (r.correct) continue;
    map[r.kpId] = map[r.kpId] || new Set();
    map[r.kpId].add(r.studentId);
  }
  return Object.fromEntries(Object.entries(map).map(([k, set]) => [k, set.size]));
}
