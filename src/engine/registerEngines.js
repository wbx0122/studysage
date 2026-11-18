/**
 * 引擎注册中心
 * 集中把各能力注册到统一 AI 适配层；本地模式下命中规则实现，远程模式由 prompt 构建器驱动大模型。
 */
import './socraticEngine.js';
import './feynmanEngine.js';
import { llmAdapter } from './llmAdapter.js';
import { diagnoseKp, buildLearningPath } from './diagnosisEngine.js';
import { inferCause, mistakeStats, buildMistakeEntries } from './mistakeEngine.js';
import { completeReview, scheduleFirstReview } from './reviewScheduler.js';

llmAdapter.registerLocalHandler(
  'diagnosis',
  input => ({
    mastery: diagnoseKp(input.kpId, input.records),
    path: buildLearningPath(input.records)
  }),
  () => '你是学情诊断专家，请根据学生答题记录按知识点标记未学/薄弱/掌握，并给出按先修依赖排序的个性化学习路径。'
);

llmAdapter.registerLocalHandler(
  'mistake',
  input => {
    const cause = inferCause(input.question, input.payload);
    const entries = buildMistakeEntries(input.records, input.overrides);
    return { cause, stats: mistakeStats(entries) };
  },
  () => '你是错题分析教练，请把错误归类为概念误解、审题失误、计算错误、方法步骤缺失或粗心笔误，并给出统计。'
);

llmAdapter.registerLocalHandler(
  'review',
  input => input.schedule
    ? scheduleFirstReview(input.kpId)
    : completeReview(input.review, input.success),
  () => '你是间隔复习调度器，依据艾宾浩斯遗忘曲线安排复习间隔，通过则拉长间隔，失败则回退。'
);
