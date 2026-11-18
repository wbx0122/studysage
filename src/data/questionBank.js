/**
 * 题库
 * qType：题型，苏格拉底引擎据此选择引导策略（概念题 / 计算题 / 应用题）
 * hints：分层提示链（由浅入深，引擎逐级释放，不直接给答案）
 * solution：完整解答（学生连续卡住或主动请求后才展示）
 * distractorCauses：每个错误选项 → 错误原因（错题归因引擎使用）
 * answerRules：填空题可接受答案（数值容差 / 关键词）
 */
export const ERROR_CAUSES = {
  concept: '概念误解',
  reading: '审题失误',
  calc: '计算错误',
  method: '方法步骤缺失',
  careless: '粗心笔误'
};

export const QUESTIONS = [
  // ============ 有理数符号运算 ============
  {
    id: 'q_rat_1',
    kpId: 'kp_rat_sign',
    type: 'choice',
    qType: '概念题',
    stem: '计算 (-3) + (-5) 的结果是？',
    choices: ['-8', '8', '-2', '2'],
    answer: 0,
    distractorCauses: { 1: 'concept', 2: 'calc', 3: 'concept' },
    hints: [
      '先判断这两个数的符号：它们是同号还是异号？',
      '同号两数相加，应取什么符号？绝对值又该如何处理？',
      '符号取负号，再把两个绝对值 3 和 5 相加，想想结果是多少？'
    ],
    solution: '两个负数是同号，取相同的负号，绝对值相加 3+5=8，所以结果是 -8。'
  },
  {
    id: 'q_rat_2',
    kpId: 'kp_rat_sign',
    type: 'choice',
    qType: '概念题',
    stem: '计算 (-2) × (-4) 的结果是？',
    choices: ['-8', '8', '-6', '6'],
    answer: 1,
    distractorCauses: { 0: 'concept', 2: 'careless', 3: 'careless' },
    hints: [
      '回忆乘法的符号法则：同号相乘得什么？异号相乘得什么？',
      '这里两个数都是负数，属于同号，所以结果的符号应该是？',
      '符号确定后，把绝对值 2×4 算出来即可。'
    ],
    solution: '两数同号（都为负），同号得正，绝对值相乘 2×4=8，结果是 8（负负得正）。'
  },
  {
    id: 'q_rat_3',
    kpId: 'kp_rat_sign',
    type: 'input',
    qType: '计算题',
    stem: '计算：(-7) + (+3) = ____',
    answerRules: [{ numeric: -4, tolerance: 0 }],
    displayAnswer: '-4',
    commonWrong: [
      { match: ['-10', -10], cause: 'concept', note: '异号误按同号把绝对值相加' },
      { match: ['4', 4], cause: 'concept', note: '符号取反，未取绝对值较大数的符号' },
      { match: ['10', 10], cause: 'concept', note: '忽略了负号' }
    ],
    hints: [
      '这两个数符号相同吗？异号相加应该用什么法则？',
      '异号相加取绝对值较大的数的符号——|-7| 和 |3| 谁大？',
      '符号取负，再用较大的绝对值减去较小的绝对值：7-3=？'
    ],
    solution: '异号相加，取绝对值较大的 -7 的负号，用 7-3=4，结果是 -4。'
  },

  // ============ 一元一次方程解法 ============
  {
    id: 'q_eq_1',
    kpId: 'kp_linear_eq',
    type: 'choice',
    qType: '计算题',
    stem: '方程 2x + 3 = 11 的解是？',
    choices: ['x = 4', 'x = 7', 'x = 3', 'x = 8'],
    answer: 0,
    distractorCauses: { 1: 'method', 2: 'calc', 3: 'method' },
    hints: [
      '要把含 x 的项单独留在左边，第一步应该对常数 3 做什么？（依据等式性质）',
      '两边同时减去 3：2x = 11-3，右边等于多少？',
      '得到 2x=8 后，怎样把 x 的系数化为 1？'
    ],
    solution: '两边减 3 得 2x=8，两边再除以 2，得 x=4。'
  },
  {
    id: 'q_eq_2',
    kpId: 'kp_linear_eq',
    type: 'input',
    qType: '计算题',
    stem: '解方程：3x - 5 = x + 7，x = ____',
    answerRules: [{ numeric: 6, tolerance: 0 }],
    displayAnswer: '6',
    commonWrong: [
      { match: ['1', 1], cause: 'method', note: '移项时未变号或合并错误' },
      { match: ['6.5', 6.5], cause: 'calc', note: '系数化为1时计算错误' },
      { match: ['2', 2], cause: 'method', note: '移项方向错误' }
    ],
    hints: [
      '方程两边都有 x，先把含 x 的项移到左边、常数移到右边——注意移项要怎样？',
      '移项要变号：3x - x = 7 + 5，合并后是？',
      '得到 2x = 12，系数化为 1 即可。'
    ],
    solution: '移项（变号）得 3x-x=7+5，合并同类项得 2x=12，系数化为1得 x=6。'
  },
  {
    id: 'q_eq_3',
    kpId: 'kp_linear_eq',
    type: 'choice',
    qType: '概念题',
    stem: '把方程 5x = 2x - 6 移项，正确的是？',
    choices: ['5x - 2x = -6', '5x + 2x = -6', '5x - 2x = 6', '5x = 2x - 6'],
    answer: 0,
    distractorCauses: { 1: 'concept', 2: 'concept', 3: 'method' },
    hints: [
      '移项的目的是什么？把右边的 2x 移到左边。',
      '关键规则：项从等号一边移到另一边，符号必须怎样变化？',
      '2x 移到左边变成 -2x，右边的 -6 不动，写出式子。'
    ],
    solution: '把 2x 移到左边并变号，得 5x-2x=-6。'
  },

  // ============ 一元一次方程应用题 ============
  {
    id: 'q_app_1',
    kpId: 'kp_linear_app',
    type: 'choice',
    qType: '应用题',
    stem: '小明买 3 本同样的笔记本，付了 20 元，找回 5 元。设每本笔记本 x 元，下列方程正确的是？',
    choices: ['3x + 5 = 20', '3x - 5 = 20', '3x = 20 + 5', 'x + 5 = 20'],
    answer: 0,
    distractorCauses: { 1: 'concept', 2: 'concept', 3: 'reading' },
    hints: [
      '先审题：3 本笔记本的总价、找回的钱、付出的钱之间是什么关系？',
      '等量关系：笔记本总价 + 找回的钱 = 付出的钱。',
      '3 本笔记本总价用 x 怎么表示？代入等量关系即可。'
    ],
    solution: '3 本笔记本共 3x 元，加上找回的 5 元等于付出的 20 元，列方程 3x+5=20。'
  },
  {
    id: 'q_app_2',
    kpId: 'kp_linear_app',
    type: 'input',
    qType: '应用题',
    stem: '一个数的 4 倍比它本身大 24，设这个数为 x，求这个数。x = ____',
    answerRules: [{ numeric: 8, tolerance: 0 }],
    displayAnswer: '8',
    commonWrong: [
      { match: ['6', 6], cause: 'method', note: '等量关系理解为 4x=24' },
      { match: ['-8', -8], cause: 'calc', note: '符号处理错误' }
    ],
    hints: [
      '先找等量关系：“4 倍”与“它本身”相差 24，用式子怎么写？',
      '可列方程 4x - x = 24，左边合并是？',
      '得到 3x=24，系数化为 1。'
    ],
    solution: '由题意列方程 4x-x=24，即 3x=24，解得 x=8。'
  },

  // ============ 牛顿第一定律 ============
  {
    id: 'q_n1_1',
    kpId: 'kp_newton1',
    type: 'choice',
    qType: '概念题',
    stem: '根据牛顿第一定律，正在运动的物体若所受外力突然全部消失，它将？',
    choices: ['立即停下来', '慢慢停下来', '做匀速直线运动', '先减速后停止'],
    answer: 2,
    distractorCauses: { 0: 'concept', 1: 'concept', 3: 'concept' },
    hints: [
      '回忆牛顿第一定律：物体不受力时会保持哪两种状态？',
      '这个物体原来正在运动，消失外力瞬间它的速度还在吗？',
      '既然不受力且原来在运动，它会保持这个速度一直运动下去，这叫什么运动？'
    ],
    solution: '外力全部消失即物体不受力，原来运动的物体将保持当时的速度做匀速直线运动。'
  },
  {
    id: 'q_n1_2',
    kpId: 'kp_newton1',
    type: 'choice',
    qType: '概念题',
    stem: '关于牛顿第一定律，下列说法正确的是？',
    choices: [
      '它可以通过直接做实验得到验证',
      '它是在实验基础上通过推理概括得出的',
      '它只适用于静止的物体',
      '不受力的物体一定保持静止'
    ],
    answer: 1,
    distractorCauses: { 0: 'concept', 2: 'concept', 3: 'concept' },
    hints: [
      '现实中能找到“完全不受力”的物体吗？',
      '既然无法直接实验，科学家是怎样得到这条定律的？',
      '回忆伽利略斜面理想实验：在实验事实基础上做什么？'
    ],
    solution: '自然界不存在完全不受力的物体，牛顿第一定律是在实验（如斜面理想实验）基础上通过科学推理概括得出的。'
  },

  // ============ 惯性 ============
  {
    id: 'q_in_1',
    kpId: 'kp_inertia',
    type: 'choice',
    qType: '概念题',
    stem: '汽车急刹车时，乘客身体会向前倾，这是因为？',
    choices: [
      '乘客受到向前的“惯性力”',
      '乘客具有惯性，要保持原来的运动状态',
      '汽车有惯性而乘客没有',
      '乘客受到的惯性比阻力大'
    ],
    answer: 1,
    distractorCauses: { 0: 'concept', 2: 'concept', 3: 'concept' },
    hints: [
      '刹车前乘客和汽车一起处于什么运动状态？',
      '刹车时车减速了，乘客的下半身随车减速，上半身为什么还向前？',
      '注意：惯性是一种性质而不是力，能不能说“惯性力”？'
    ],
    solution: '乘客原来随车向前运动，刹车时车减速，乘客由于具有惯性要保持原来的向前运动状态，所以身体前倾。惯性不是力。'
  },
  {
    id: 'q_in_2',
    kpId: 'kp_inertia',
    type: 'choice',
    qType: '概念题',
    stem: '关于惯性，下列说法正确的是？',
    choices: [
      '速度越大，物体的惯性越大',
      '只有运动的物体才具有惯性',
      '惯性大小只与物体的质量有关',
      '受力越大惯性越大'
    ],
    answer: 2,
    distractorCauses: { 0: 'concept', 1: 'concept', 3: 'concept' },
    hints: [
      '惯性是物体的什么？（一种固有属性）',
      '一切物体在什么状态下都有惯性？静止的物体有没有？',
      '衡量惯性大小的唯一量度是哪个物理量？'
    ],
    solution: '惯性是一切物体固有的属性，与速度、受力情况无关，其大小只由质量决定，质量越大惯性越大。'
  },

  // ============ 二力平衡 ============
  {
    id: 'q_bal_1',
    kpId: 'kp_force_balance',
    type: 'choice',
    qType: '概念题',
    stem: '下列物体受到的两个力，属于一对平衡力的是？',
    choices: [
      '静止在桌面上的书受到的重力和桌面对书的支持力',
      '书对桌面的压力和桌面对书的支持力',
      '大小相等、方向相反的任意两个力',
      '作用在两个物体上、大小相等的两个力'
    ],
    answer: 0,
    distractorCauses: { 1: 'concept', 2: 'reading', 3: 'concept' },
    hints: [
      '二力平衡的四个条件是什么？（提示：先看是否作用在同一物体上）',
      '选项 B 中的压力作用在桌面、支持力作用在书，它们是同一物体受到的力吗？',
      '选项 A 中两个力都作用在书上，再核对大小、方向、是否共线。'
    ],
    solution: '书的重力和桌面的支持力都作用在书上，大小相等、方向相反、在同一直线上，满足二力平衡四条件；B 中两个力作用在不同物体上，是相互作用力而非平衡力。'
  },
  {
    id: 'q_bal_2',
    kpId: 'kp_force_balance',
    type: 'choice',
    qType: '概念题',
    stem: '一个物体受到一对平衡力作用，该物体？',
    choices: [
      '一定静止',
      '一定做匀速直线运动',
      '可能静止，也可能做匀速直线运动',
      '运动状态一定改变'
    ],
    answer: 2,
    distractorCauses: { 0: 'concept', 1: 'concept', 3: 'concept' },
    hints: [
      '平衡力作用下物体的合力是多少？',
      '合力为零意味着运动状态会不会改变？',
      '平衡状态包含哪两种情况？'
    ],
    solution: '受平衡力时合力为零，物体运动状态不变，处于平衡状态，即静止或匀速直线运动，两种都可能。'
  }
];

export const Q_MAP = Object.fromEntries(QUESTIONS.map(q => [q.id, q]));
