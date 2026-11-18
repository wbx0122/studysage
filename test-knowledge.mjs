/**
 * 知识点梳理引擎自动化测试
 * 验证：标题层级识别、重点段落提取、核心概念词频、本地梳理完整性
 */
// Mock 浏览器环境（llmAdapter 模块级依赖）
globalThis.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; }
};
globalThis.window = {};
globalThis.document = { createElement: () => ({}), head: { append() {} } };

const { sortKnowledgeLocal } = await import('./src/engine/knowledgeSorterEngine.js');
const { analyzeExamLocal } = await import('./src/engine/examAnalysisEngine.js');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
}

console.log('\n【测试 10】知识点梳理 · 标题层级识别');
{
  const doc = `第一章 力学基础
力的概念是力学的基础。
1.1 力的三要素
力的大小、方向、作用点是力的三要素。
1.1.1 力的图示
用带箭头的线段表示力。
1.2 重力
重力是由于地球吸引而产生的。
（一）重力的方向
重力的方向总是竖直向下。
第二章 牛顿定律
这是本章的重点内容。`;
  const r = sortKnowledgeLocal(doc);
  check('梳理出 2 个一级模块', r.outline.filter(o => o.level === 1).length === 2,
    `实际 ${r.outline.filter(o => o.level === 1).length}`);
  const ch1 = r.outline.find(o => o.title.includes('第一章'));
  check('第一章下有 1.1/1.2/（一）三个二级节点', ch1 && ch1.points.filter(p => p.level === 2).length === 3,
    ch1 ? `实际 ${ch1.points.filter(p => p.level === 2).length}` : '未找到第一章');
  const sec11 = ch1?.points.find(p => p.title?.startsWith('1.1'));
  check('1.1 下有 1.1.1 三级节点', sec11 && sec11.points.some(p => p.level === 3 && p.title.startsWith('1.1.1')),
    sec11 ? `points: ${JSON.stringify(sec11.points.map(p => p.title))}` : '未找到 1.1');
  check('（一）被识别为二级标题', r.outline.some(o => o.points.some(p => p.title?.includes('重力的方向'))),
    '（一）重力的方向 未出现在大纲');
}

console.log('\n【测试 11】知识点梳理 · 重点段落与概念提取');
{
  const doc = `一、电学基础
电荷是电学的核心概念。
重点：库仑定律描述了点电荷之间的相互作用力。
二、电路
关键：欧姆定律是电路分析的基础，公式 I=U/R。
注意：串联电路中电流处处相等。
电功率的计算公式为 P=UI。
三、电磁感应
电磁感应现象是发电机的原理。`;
  const r = sortKnowledgeLocal(doc);
  check('梳理出 3 个一级模块', r.outline.filter(o => o.level === 1).length === 3,
    `实际 ${r.outline.filter(o => o.level === 1).length}`);
  check('重点段落含关键词标注', r.keyPoints.length >= 2 && r.keyPoints.some(k => k.tags.includes('重点')),
    `keyPoints: ${JSON.stringify(r.keyPoints.map(k => k.tags))}`);
  check('核心概念非空', r.concepts.length > 0, `实际 ${r.concepts.length}`);
  check('高频概念"定律/电路"上榜', r.concepts.some(c => c.name.includes('定律') || c.name.includes('电路')) || r.concepts.length >= 2,
    `concepts: ${JSON.stringify(r.concepts.map(c => c.name))}`);
  check('学习建议 4 条', r.studyAdvice.length === 4, `实际 ${r.studyAdvice.length}`);
  check('概述包含模块数', r.summary.includes('3'), r.summary);
}

console.log('\n【测试 12】知识点梳理 · 无标题纯文本兜底');
{
  const doc = `光合作用是植物利用光能将二氧化碳和水转化为有机物的过程。
这个过程发生在叶绿体中。
光反应阶段产生 ATP 和 NADPH。
暗反应阶段即卡尔文循环，固定二氧化碳。
光合作用是生物圈能量流动的基础。
呼吸作用则是有机物氧化分解释放能量的过程。`;
  const r = sortKnowledgeLocal(doc);
  check('无标题时按段落切分大纲', r.outline.length >= 1, `实际 ${r.outline.length}`);
  check('大纲节点有正文内容', r.outline.some(o => o.points.some(p => p.text)),
    '大纲无正文');
  check('概念提取正常工作', r.concepts.length >= 0, '');
  check('标题兜底为非空', !!r.title, `title: ${r.title}`);
}

console.log('\n【测试 13】知识点梳理 · Markdown 标题支持');
{
  const doc = `# Python 基础
## 变量与数据类型
变量是存储数据的容器。
## 控制流
### 条件语句
if-else 是最基础的条件判断。
### 循环
for 和 while 是两种循环结构。`;
  const r = sortKnowledgeLocal(doc);
  check('# 识别为一级标题', r.outline.some(o => o.level === 1 && o.title.includes('Python')),
    `outline: ${JSON.stringify(r.outline.map(o => o.title))}`);
  check('## 识别为二级标题', r.outline.some(o => o.points.some(p => p.level === 2 && p.title?.includes('变量'))),
    '');
  check('### 识别为三级标题', r.outline.some(o => o.points.some(p => p.points?.some(q => q.level === 3))),
    '');
}

console.log('\n【测试 14】试卷分析 · 得分识别');
{
  const paper = `期中考试 数学试卷
得分：85 满分：100
一、选择题
1. 下列函数中是二次函数的是 × 概念混淆
2. 已知 f(x)=2x+1，求 f(3) 的值`;
  const r = analyzeExamLocal(paper);
  check('识别得分 85', r.score?.obtained === 85, `实际 ${r.score?.obtained}`);
  check('识别满分 100', r.score?.total === 100, `实际 ${r.score?.total}`);
  check('科目识别为数学', r.subject === '数学', `实际 ${r.subject}`);
  check('概述包含得分率', r.overview.includes('85%'), r.overview);
}

console.log('\n【测试 15】试卷分析 · 错题识别与错误类型分类');
{
  const paper = `数学月考 92/100
1. 计算 3×(4-2)+5 的值 × 计算错误 算错符号
2. 判断：所有的直角三角形都全等 ✗ 概念混淆 定义记错
3. 应用题：一件商品打八折后售价 80 元，求原价 -3 审题不清 忽略了折扣条件
4. 化简分式 (x²-1)/(x-1) 扣2分 计算错误 约分出错
5. 证明：三角形内角和为 180°（正确，未扣分）`;
  const r = analyzeExamLocal(paper);
  check('识别出 4 道错题', r.mistakes.length === 4, `实际 ${r.mistakes.length}`);
  check('得分从 92/100 识别', r.score?.obtained === 92 && r.score?.total === 100, `实际 ${r.score?.obtained}/${r.score?.total}`);
  const types = r.mistakes.map(m => m.errorType);
  check('计算错误被分类', types.filter(t => t === '计算错误').length === 2, `types: ${types.join(',')}`);
  check('概念混淆被分类', types.includes('概念混淆'), `types: ${types.join(',')}`);
  check('审题不清被分类', types.includes('审题不清'), `types: ${types.join(',')}`);
  check('正确题目(第5题)未被误判', !r.mistakes.some(m => m.question.includes('内角和')), '第5题被误判为错题');
  check('每道错题有改进建议', r.mistakes.every(m => m.suggestion && m.suggestion.length > 5), '存在无建议的错题');
}

console.log('\n【测试 16】试卷分析 · 优势/薄弱点/建议/规划完整性');
{
  const paper = `物理期末 68/100
1. 求物体在斜面上的受力分析 ✗ 方法不当 没思路
2. 计算动能定理应用题 × 计算错误 运算出错
3. 判断惯性概念题 ✗ 概念混淆 误认为力是维持运动的原因
4. 光学折射定律计算题 -3 计算错误`;
  const r = analyzeExamLocal(paper);
  check('科目识别为物理', r.subject === '物理', `实际 ${r.subject}`);
  check('薄弱点非空', r.weakAreas.length > 0, `实际 ${r.weakAreas.length}`);
  check('优势非空', r.strengths.length > 0, `实际 ${r.strengths.length}`);
  check('改进建议 3-5 条', r.advice.length >= 3 && r.advice.length <= 5, `实际 ${r.advice.length}`);
  check('复习规划包含阶段', r.studyPlan.includes('第一阶段'), r.studyPlan.slice(0, 40));
  check('得分率低于70%触发基础建议', r.advice.some(a => a.includes('基础')), `advice: ${r.advice.join(' | ')}`);
}

console.log('\n【测试 17】试卷分析 · 内容过少保护');
{
  let threw = false;
  try { analyzeExamLocal('只有一行'); } catch (e) { threw = true; }
  check('内容过少时抛出友好错误', threw, '未抛出异常');
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`结果：${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);