/**
 * 知识图谱：知识点元数据
 * - prerequisites：先修依赖（个性化路径按拓扑顺序生成）
 * - keyConcepts：费曼复述检测要求覆盖的关键概念
 * - misconceptions：常见误解（费曼检测与苏格拉底追问会命中）
 * - canonical：标准表述，供引擎对照（不直接展示给学生，避免“抄答案”）
 */
export const KNOWLEDGE_POINTS = [
  {
    id: 'kp_rat_sign',
    name: '有理数的符号运算',
    subject: '数学',
    chapter: '有理数',
    prerequisites: [],
    keyConcepts: ['同号', '异号', '绝对值', '符号', '负负得正'],
    misconceptions: ['异号相加直接把绝对值相加', '两个负数相乘得到负数'],
    canonical: '同号两数相加取相同符号并把绝对值相加；异号两数相加取绝对值较大数的符号，用较大绝对值减去较小绝对值；两数相乘同号得正、异号得负，负负得正。'
  },
  {
    id: 'kp_linear_eq',
    name: '一元一次方程的解法',
    subject: '数学',
    chapter: '一元一次方程',
    prerequisites: ['kp_rat_sign'],
    keyConcepts: ['移项', '合并同类项', '系数化为1', '等式性质', '未知数'],
    misconceptions: ['移项不变号', '系数化为1时两边除错'],
    canonical: '解一元一次方程通过去分母、去括号、移项（要变号）、合并同类项、系数化为1，依据等式两边同时加减或乘除同一个数（除数不为0）等式仍成立。'
  },
  {
    id: 'kp_linear_app',
    name: '一元一次方程应用题',
    subject: '数学',
    chapter: '一元一次方程',
    prerequisites: ['kp_linear_eq'],
    keyConcepts: ['设未知数', '等量关系', '列方程', '审题', '单位'],
    misconceptions: ['没有找准等量关系', '单位不统一就列式'],
    canonical: '应用题先审题设未知数，用含未知数的式子表示相关量，抓住关键句中的等量关系列方程，解后检验并作答。'
  },
  {
    id: 'kp_newton1',
    name: '牛顿第一定律',
    subject: '物理',
    chapter: '运动和力',
    prerequisites: [],
    keyConcepts: ['不受力', '匀速直线运动', '静止', '理想实验', '推理'],
    misconceptions: ['认为物体运动需要力来维持', '认为不受力物体一定静止'],
    canonical: '一切物体在没有受到力的作用时，总保持静止状态或匀速直线运动状态；它是在实验基础上通过推理概括得出的，不能用实验直接验证。'
  },
  {
    id: 'kp_inertia',
    name: '惯性的概念',
    subject: '物理',
    chapter: '运动和力',
    prerequisites: ['kp_newton1'],
    keyConcepts: ['保持原有运动状态', '固有属性', '质量', '一切物体'],
    misconceptions: ['把惯性说成“惯性力”', '认为速度越大惯性越大', '认为只有运动的物体才有惯性'],
    canonical: '一切物体都有保持原来运动状态不变的性质，叫惯性；惯性是物体本身的固有属性，大小只与质量有关，与速度、是否受力无关。'
  },
  {
    id: 'kp_force_balance',
    name: '二力平衡',
    subject: '物理',
    chapter: '运动和力',
    prerequisites: ['kp_newton1'],
    keyConcepts: ['同一物体', '大小相等', '方向相反', '同一直线', '平衡状态'],
    misconceptions: ['把分别作用在两个物体上的力当成平衡力', '忽略“同一直线”条件'],
    canonical: '作用在同一物体上的两个力，如果大小相等、方向相反、并且在同一直线上，这两个力就彼此平衡，物体处于静止或匀速直线运动的平衡状态。'
  }
];

export const KP_MAP = Object.fromEntries(KNOWLEDGE_POINTS.map(kp => [kp.id, kp]));

export const SUBJECTS = [...new Set(KNOWLEDGE_POINTS.map(kp => kp.subject))];
