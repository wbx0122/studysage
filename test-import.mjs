/**
 * 数据导入引擎自动化测试
 * 验证：GBK 编码识别、姓名列智能识别、非科目列过滤、表头行定位、统计计算
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

const { parseCSV, structureGradeTable, computeStats, scoreBands, totalScoreBands, decodeBuffer } =
  await import('./src/engine/dataImportEngine.js');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
}

console.log('\n【测试 1】标准 UTF-8 CSV 解析');
{
  const csv = '姓名,语文,数学,英语\n张三,85,92,78\n李四,72,65,80\n王五,90,88,95';
  const rows = parseCSV(csv);
  check('解析出 4 行', rows.length === 4, `实际 ${rows.length}`);
  const cd = structureGradeTable(rows);
  check('识别 3 个科目', cd.subjects.length === 3 && cd.subjects.join() === '语文,数学,英语', cd.subjects.join());
  check('识别 3 名学生', cd.students.length === 3, `实际 ${cd.students.length}`);
  check('张三总分 255', cd.students.find(s => s.name === '张三').total === 255);
  check('王五排名第 1', cd.students.find(s => s.name === '王五').rank === 1);
}

console.log('\n【测试 2】GBK 编码自动识别（Excel 中文版另存 CSV）');
{
  // 手动构造 GBK 字节：姓名,语文,数学\n张三,85,92\n李四,72,65
  const gbkBytes = new Uint8Array([
    0xD0,0xD5,0xC3,0xFB, 0x2C, 0xD3,0xEF,0xCE,0xC4, 0x2C, 0xCA,0xFD,0xD1,0xA7, 0x0A,
    0xD5,0xC5,0xC8,0xFD, 0x2C, 0x38,0x35, 0x2C, 0x39,0x32, 0x0A,
    0xC0,0xEE,0xCB,0xC4, 0x2C, 0x37,0x32, 0x2C, 0x36,0x35
  ]);
  const text = decodeBuffer(gbkBytes.buffer.slice(gbkBytes.byteOffset, gbkBytes.byteOffset + gbkBytes.byteLength));
  check('GBK 解码无乱码', text.includes('姓名') && text.includes('张三'), text.slice(0, 20));
  const rows = parseCSV(text);
  const cd = structureGradeTable(rows);
  check('GBK 表头识别成功', cd.subjects.join() === '语文,数学', cd.subjects.join());
  check('GBK 姓名识别成功', cd.students[0].name === '张三', cd.students[0].name);
}

console.log('\n【测试 3】学号在第一列，姓名在第二列');
{
  const csv = '学号,姓名,语文,数学,英语\n2024001,赵六,88,76,90\n2024002,钱七,65,58,72\n2024003,孙八,92,95,89';
  const rows = parseCSV(csv);
  const cd = structureGradeTable(rows);
  check('姓名列定位到第 2 列', cd.students[0].name === '赵六', cd.students[0].name);
  check('学号列被跳过', cd.subjects.length === 3, cd.subjects.join());
  check('孙八排名第 1', cd.students.find(s => s.name === '孙八').rank === 1);
}

console.log('\n【测试 4】含总分/排名/班级列（应自动过滤）');
{
  const csv = '班级,姓名,语文,数学,总分,排名\n一班,张三,85,92,177,2\n一班,李四,90,95,185,1\n二班,王五,70,65,135,3';
  const rows = parseCSV(csv);
  const cd = structureGradeTable(rows);
  check('总分列被过滤', !cd.subjects.includes('总分'), cd.subjects.join());
  check('排名列被过滤', !cd.subjects.includes('排名'), cd.subjects.join());
  check('班级列被过滤', !cd.subjects.includes('班级'), cd.subjects.join());
  check('仅保留语文数学', cd.subjects.join() === '语文,数学', cd.subjects.join());
  check('总分重新计算（非取原列）', cd.students.find(s => s.name === '李四').total === 185);
}

console.log('\n【测试 5】带标题行（第一行是大标题，第二行才是表头）');
{
  const csv = '三年级二班期中考试成绩表\n\n姓名,语文,数学\n张三,85,92\n李四,72,65';
  const rows = parseCSV(csv);
  const cd = structureGradeTable(rows);
  check('跳过标题行定位表头', cd.subjects.join() === '语文,数学', cd.subjects.join());
  check('学生数据正确', cd.students.length === 2 && cd.students[0].name === '张三');
}

console.log('\n【测试 6】统计计算正确性');
{
  const scores = [85, 72, 90, 65, 78, 92, 58, 88];
  const st = computeStats(scores);
  check('人数 8', st.count === 8);
  check('平均分 78.5', st.avg === 78.5, `实际 ${st.avg}`);
  check('最高 92', st.max === 92);
  check('最低 58', st.min === 58);
  check('中位数 81.5', st.median === 81.5, `实际 ${st.median}`);
  check('及格率 87.5%', st.passRate === 87.5, `实际 ${st.passRate}`);
  check('优秀率 50%（85/90/92/88 共4人≥85）', st.excellentRate === 50, `实际 ${st.excellentRate}`);
  const bands = scoreBands(scores);
  check('0-59 段 1 人', bands[0].value === 1);
  check('90+ 段 2 人', bands[4].value === 2);
}

console.log('\n【测试 7】制表符分隔（Excel 另存为"文本文件"）');
{
  const tsv = '姓名\t语文\t数学\n张三\t85\t92\n李四\t72\t65';
  const rows = parseCSV(tsv);
  const cd = structureGradeTable(rows);
  check('制表符分隔识别', cd.subjects.join() === '语文,数学' && cd.students.length === 2);
}

console.log('\n【测试 8】部分科目缺考（空值处理）');
{
  const csv = '姓名,语文,数学,英语\n张三,85,92,\n李四,72,,80\n王五,90,88,95';
  const rows = parseCSV(csv);
  const cd = structureGradeTable(rows);
  const zs = cd.students.find(s => s.name === '张三');
  check('缺考科目不计入', zs.scores['英语'] === undefined);
  check('缺考学生总分正确', zs.total === 177, `实际 ${zs.total}`);
  const sub = cd.subjects;
  check('三科均保留', sub.length === 3, sub.join());
}

console.log('\n【测试 9】总分分数段区间（100以下/100~150/151~200/201~250/251~300）');
{
  // 总分样本：95(100以下), 120(100~150), 150(100~150), 180(151~200), 230(201~250), 280(251~300), 305(251~300兜底)
  const totals = [95, 120, 150, 180, 230, 280, 305];
  const bands = totalScoreBands(totals);
  check('五段标签正确', bands.map(b => b.label).join() === '100以下,100~150,151~200,201~250,251~300', bands.map(b => b.label).join());
  check('100以下 1 人', bands[0].value === 1, `实际 ${bands[0].value}`);
  check('100~150 段 2 人（含边界150）', bands[1].value === 2, `实际 ${bands[1].value}`);
  check('151~200 段 1 人', bands[2].value === 1, `实际 ${bands[2].value}`);
  check('201~250 段 1 人', bands[3].value === 1, `实际 ${bands[3].value}`);
  check('251~300 段 2 人（含300以上兜底）', bands[4].value === 2, `实际 ${bands[4].value}`);
  check('总人数无遗漏', bands.reduce((a, b) => a + b.value, 0) === 7, `实际 ${bands.reduce((a, b) => a + b.value, 0)}`);
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);