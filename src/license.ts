// 许可证知识库 + SPDX 表达式解析 + 按分发模型逐条款评估

export type Verdict = 'pass' | 'review' | 'conflict';
export type Distribution = 'oss' | 'saas';

export const VERDICT_LABEL: Record<Verdict, string> = {
  pass: '通过',
  review: '复核',
  conflict: '冲突',
};

export const DISTRIBUTION_LABEL: Record<Distribution, string> = {
  oss: '开源分发',
  saas: '闭源云服务',
};

export const DISTRIBUTION_HINT: Record<Distribution, string> = {
  oss: '产品以源码或可执行产物形式对外发布，Copyleft 类许可证的分发义务会被触发。',
  saas: '产品仅通过网络提供服务、不对外交付产物，分发义务通常不触发，但 AGPL 等网络 Copyleft 仍然生效。',
};

export interface ClauseEval {
  id: string; // SPDX 标识或例外条款标识（保留原始写法）
  role: 'license' | 'exception';
  verdict: Verdict;
  basis: string[]; // 判定依据，逐条可追溯
}

export interface Evaluation {
  clauses: ClauseEval[];
  verdict: Verdict; // 自动评估综合结论
  kindLabel: string; // 表达式形态说明
  notes: string[]; // 组合逻辑说明
}

interface DistRule {
  verdict: Verdict;
  basis: string[];
}

interface LicenseRule {
  oss: DistRule;
  saas: DistRule;
}

const PERMISSIVE_BASIS = {
  oss: ['宽松许可证：允许商用、修改、再分发与再授权', '分发时需保留原始版权与许可声明'],
  saas: ['宽松许可证：作为云服务内部组件使用无额外义务', '建议保留版权与许可声明以备审计'],
};

const RULES: Record<string, LicenseRule> = {
  MIT: { oss: { verdict: 'pass', basis: PERMISSIVE_BASIS.oss }, saas: { verdict: 'pass', basis: PERMISSIVE_BASIS.saas } },
  ISC: { oss: { verdict: 'pass', basis: PERMISSIVE_BASIS.oss }, saas: { verdict: 'pass', basis: PERMISSIVE_BASIS.saas } },
  'BSD-2-Clause': { oss: { verdict: 'pass', basis: PERMISSIVE_BASIS.oss }, saas: { verdict: 'pass', basis: PERMISSIVE_BASIS.saas } },
  'BSD-3-Clause': {
    oss: { verdict: 'pass', basis: [...PERMISSIVE_BASIS.oss, '未经书面许可不得使用作者姓名为衍生产品背书'] },
    saas: { verdict: 'pass', basis: PERMISSIVE_BASIS.saas },
  },
  '0BSD': { oss: { verdict: 'pass', basis: ['零条款 BSD：等同公有领域，无保留义务'] }, saas: { verdict: 'pass', basis: ['零条款 BSD：等同公有领域，无保留义务'] } },
  Zlib: { oss: { verdict: 'pass', basis: PERMISSIVE_BASIS.oss }, saas: { verdict: 'pass', basis: PERMISSIVE_BASIS.saas } },
  Unlicense: { oss: { verdict: 'pass', basis: ['公有领域奉献：无保留义务'] }, saas: { verdict: 'pass', basis: ['公有领域奉献：无保留义务'] } },
  'CC0-1.0': {
    oss: { verdict: 'pass', basis: ['近似公有领域奉献，无保留义务', '注意：明确不授予专利许可，建议法务知悉'] },
    saas: { verdict: 'pass', basis: ['近似公有领域奉献，无保留义务', '注意：明确不授予专利许可，建议法务知悉'] },
  },
  'Apache-2.0': {
    oss: { verdict: 'pass', basis: ['明确授予专利许可，允许商用、修改与再分发', '需保留许可证文本与 NOTICE 文件，修改过的文件需标注说明'] },
    saas: { verdict: 'pass', basis: ['明确授予专利许可，服务端使用无额外义务', '若对外提供下载产物，需保留许可证文本与 NOTICE 文件'] },
  },
  'MPL-2.0': {
    oss: { verdict: 'review', basis: ['文件级 Copyleft：对 MPL 覆盖文件的修改需以 MPL 公开源码', '可与专有代码共存于同一项目，但需按文件粒度隔离'] },
    saas: { verdict: 'review', basis: ['仅通过网络提供服务不触发开源义务', '若将修改后的 MPL 文件交付给客户，需公开对应源码'] },
  },
  'EPL-2.0': {
    oss: { verdict: 'review', basis: ['弱 Copyleft：衍生模块需以 EPL 发布', '与 GPL 系许可证混布存在已知不兼容，需确认依赖组合'] },
    saas: { verdict: 'review', basis: ['服务端使用通常不触发分发义务', '对外交付包含该组件的产物时需公开对应模块源码'] },
  },
  'LGPL-2.1': {
    oss: { verdict: 'review', basis: ['弱 Copyleft：动态链接可商用，静态链接或修改库本身需开源', '需向用户提供可替换该库的机制（目标文件或动态链接）'] },
    saas: { verdict: 'review', basis: ['服务端使用通常不触发分发义务', '若向客户交付包含该库的产物，需满足链接与替换要求'] },
  },
  'LGPL-3.0': {
    oss: { verdict: 'review', basis: ['弱 Copyleft：动态链接可商用，静态链接或修改库本身需开源', '需向用户提供可替换该库的机制（目标文件或动态链接）'] },
    saas: { verdict: 'review', basis: ['服务端使用通常不触发分发义务', '若向客户交付包含该库的产物，需满足链接与替换要求'] },
  },
  'GPL-2.0': {
    oss: { verdict: 'conflict', basis: ['强 Copyleft：衍生作品整体须以 GPL-2.0 相同条款发布', '与专有/闭源分发模式直接冲突，需替换依赖或调整授权策略'] },
    saas: { verdict: 'review', basis: ['仅通过网络提供服务通常不触发 GPL 分发义务', '需确保不向客户交付包含该组件的产物，并做好架构隔离'] },
  },
  'GPL-3.0': {
    oss: { verdict: 'conflict', basis: ['强 Copyleft：衍生作品整体须以 GPL-3.0 相同条款发布', '与专有/闭源分发模式直接冲突，需替换依赖或调整授权策略'] },
    saas: { verdict: 'review', basis: ['仅通过网络提供服务通常不触发 GPL 分发义务', '需确保不向客户交付包含该组件的产物，并做好架构隔离'] },
  },
  'AGPL-3.0': {
    oss: { verdict: 'conflict', basis: ['强网络 Copyleft：衍生作品须以 AGPL-3.0 发布', '与常规产品分发策略冲突，需替换依赖或取得商业授权'] },
    saas: { verdict: 'conflict', basis: ['网络交互即触发开源义务：向用户提供服务的修改版须公开全部对应源码', '闭源云服务模式下不可直接使用，需替换依赖或取得商业授权'] },
  },
  'CC-BY-4.0': {
    oss: { verdict: 'review', basis: ['知识共享署名许可：非软件许可证，多用于字体、素材与文档', '需按许可要求署名、给出许可链接并标注变更'] },
    saas: { verdict: 'review', basis: ['知识共享署名许可：非软件许可证，多用于字体、素材与文档', '需按许可要求署名、给出许可链接并标注变更'] },
  },
  'CC-BY-3.0': {
    oss: { verdict: 'review', basis: ['知识共享署名许可：非软件许可证，多用于素材与文档', '需按许可要求署名并标注变更'] },
    saas: { verdict: 'review', basis: ['知识共享署名许可：非软件许可证，多用于素材与文档', '需按许可要求署名并标注变更'] },
  },
  'CC-BY-SA-4.0': {
    oss: { verdict: 'conflict', basis: ['相同方式共享：改编后的作品须以 CC-BY-SA-4.0 发布', '与产品整体授权策略冲突，需替换素材或取得额外授权'] },
    saas: { verdict: 'review', basis: ['网络展示场景需署名；改编内容再分发受 SA 条款约束', '建议法务确认素材的使用与改编范围'] },
  },
  'OFL-1.1': {
    oss: { verdict: 'review', basis: ['字体专用许可：可随产品嵌入分发，需保留许可文本', '不得单独销售字体文件本身，修改版需改名'] },
    saas: { verdict: 'review', basis: ['网页/服务中嵌入使用允许，需保留许可文本', '不得单独销售字体文件本身，修改版需改名'] },
  },
  'LicenseRef-Proprietary': {
    oss: { verdict: 'review', basis: ['专有/商业许可证：无标准条款，需逐份核对授权范围', '确认是否允许再分发、修改以及与开源组件混合分发'] },
    saas: { verdict: 'review', basis: ['专有/商业许可证：确认授权是否覆盖 SaaS 场景与部署规模', '核对费用、期限、审计与违约责任条款'] },
  },
};

const ALIASES: Record<string, string> = {
  apache: 'Apache-2.0',
  apache2: 'Apache-2.0',
  'apache-2': 'Apache-2.0',
  'apache-license': 'Apache-2.0',
  bsd: 'BSD-3-Clause',
  'bsd-2': 'BSD-2-Clause',
  'bsd-3': 'BSD-3-Clause',
  gpl: 'GPL-3.0',
  gpl2: 'GPL-2.0',
  gpl3: 'GPL-3.0',
  lgpl: 'LGPL-3.0',
  agpl: 'AGPL-3.0',
  mpl: 'MPL-2.0',
  proprietary: 'LicenseRef-Proprietary',
  commercial: 'LicenseRef-Proprietary',
  'cc-by': 'CC-BY-4.0',
  ofl: 'OFL-1.1',
};

const EXCEPTIONS: Record<string, string[]> = {
  'classpath-exception-2.0': ['Classpath 例外：以特定机制链接该库的衍生作品不受 GPL 传染性约束', '主许可证的冲突结论因此放宽，降级为复核'],
  'bison-exception-2.2': ['Bison 例外：生成的解析器代码不受 GPL 传染性约束', '主许可证的冲突结论因此放宽，降级为复核'],
  'llvm-exception': ['LLVM 例外：按约定方式使用该工具链的产物不受 GPL 传染性约束', '主许可证的冲突结论因此放宽，降级为复核'],
  'openssl-exception': ['OpenSSL 例外：允许与 OpenSSL 链接而不触发额外开源义务', '主许可证的冲突结论因此放宽，降级为复核'],
  'font-exception-2.0': ['字体嵌入例外：文档中嵌入字体不使文档受 GPL 约束', '主许可证的冲突结论因此放宽，降级为复核'],
};

const RANK: Record<Verdict, number> = { pass: 0, review: 1, conflict: 2 };
const bestOf = (a: Verdict, b: Verdict): Verdict => (RANK[a] <= RANK[b] ? a : b);
const worstOf = (a: Verdict, b: Verdict): Verdict => (RANK[a] >= RANK[b] ? a : b);

// ---------- SPDX 表达式解析 ----------

type Node =
  | { kind: 'license'; id: string }
  | { kind: 'with'; base: Node; exception: string }
  | { kind: 'and'; items: Node[] }
  | { kind: 'or'; items: Node[] };

type Token = { t: 'id' | 'and' | 'or' | 'with' | 'lp' | 'rp'; v: string };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  const re = /\s*(\(|\)|[^\s()]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const raw = m[1];
    if (raw === '(') tokens.push({ t: 'lp', v: raw });
    else if (raw === ')') tokens.push({ t: 'rp', v: raw });
    else if (/^(and|&&)$/i.test(raw)) tokens.push({ t: 'and', v: raw });
    else if (/^(or|\|\|)$/i.test(raw)) tokens.push({ t: 'or', v: raw });
    else if (/^with$/i.test(raw)) tokens.push({ t: 'with', v: raw });
    else tokens.push({ t: 'id', v: raw });
  }
  return tokens;
}

export function parseExpression(src: string): Node | null {
  const tokens = tokenize(src);
  if (tokens.length === 0) return null;
  let pos = 0;
  const peek = () => tokens[pos];

  function parsePrimary(): Node | null {
    const tk = peek();
    if (!tk) return null;
    if (tk.t === 'lp') {
      pos++;
      const n = parseOr();
      if (peek()?.t !== 'rp') return null;
      pos++;
      return n;
    }
    if (tk.t === 'id') {
      pos++;
      return { kind: 'license', id: tk.v };
    }
    return null;
  }
  function parseWith(): Node | null {
    let base = parsePrimary();
    if (!base) return null;
    while (peek()?.t === 'with') {
      pos++;
      const ex = peek();
      if (!ex || ex.t !== 'id') return null;
      pos++;
      base = { kind: 'with', base, exception: ex.v };
    }
    return base;
  }
  function parseAnd(): Node | null {
    const items: Node[] = [];
    let n = parseWith();
    if (!n) return null;
    items.push(n);
    while (peek()?.t === 'and') {
      pos++;
      n = parseWith();
      if (!n) return null;
      items.push(n);
    }
    return items.length === 1 ? items[0] : { kind: 'and', items };
  }
  function parseOr(): Node | null {
    const items: Node[] = [];
    let n = parseAnd();
    if (!n) return null;
    items.push(n);
    while (peek()?.t === 'or') {
      pos++;
      n = parseAnd();
      if (!n) return null;
      items.push(n);
    }
    return items.length === 1 ? items[0] : { kind: 'or', items };
  }

  const root = parseOr();
  if (!root || pos !== tokens.length) return null;
  return root;
}

// ---------- 评估 ----------

function lookupLicense(rawId: string): { rule: LicenseRule | null; notes: string[] } {
  const notes: string[] = [];
  let id = rawId.trim();
  if (id.endsWith('+')) {
    id = id.slice(0, -1);
    notes.push('「+」表示该版本或更高版本，按同族已收录版本评估');
  }
  const variant = id.match(/^(.*)-(only|or-later)$/i);
  if (variant) {
    id = variant[1];
    notes.push(variant[2].toLowerCase() === 'only' ? '后缀 -only：仅该版本条款适用' : '后缀 -or-later：该版本或更高版本均适用，按已收录版本评估');
  }
  if (RULES[id]) return { rule: RULES[id], notes };
  const alias = ALIASES[id.toLowerCase()];
  if (alias) {
    notes.push(`非标写法，按 ${alias} 归一评估`);
    return { rule: RULES[alias], notes };
  }
  const hit = Object.keys(RULES).find(k => k.toLowerCase() === id.toLowerCase());
  if (hit) {
    notes.push(`大小写归一，按 ${hit} 评估`);
    return { rule: RULES[hit], notes };
  }
  return { rule: null, notes };
}

function lookupException(rawId: string): string[] | null {
  const hit = Object.keys(EXCEPTIONS).find(k => k.toLowerCase() === rawId.trim().toLowerCase());
  return hit ? EXCEPTIONS[hit] : null;
}

interface NodeEval {
  verdict: Verdict;
  notes: string[];
  clauses: ClauseEval[];
}

function evalNode(node: Node, dist: Distribution): NodeEval {
  switch (node.kind) {
    case 'license': {
      const { rule, notes } = lookupLicense(node.id);
      if (!rule) {
        return {
          verdict: 'review',
          notes,
          clauses: [{ id: node.id, role: 'license', verdict: 'review', basis: [`未收录的许可证标识「${node.id}」，无法自动判定`, '需人工核对许可证全文与使用方式'] }],
        };
      }
      const r = rule[dist];
      return { verdict: r.verdict, notes, clauses: [{ id: node.id, role: 'license', verdict: r.verdict, basis: r.basis }] };
    }
    case 'with': {
      const base = evalNode(node.base, dist);
      const excBasis = lookupException(node.exception);
      const excClause: ClauseEval = excBasis
        ? { id: node.exception, role: 'exception', verdict: 'pass', basis: excBasis }
        : { id: node.exception, role: 'exception', verdict: 'review', basis: ['未收录的例外条款，需人工确认其对主许可证的影响'] };
      let verdict = base.verdict;
      const notes = [...base.notes];
      if (excBasis && base.verdict === 'conflict') {
        verdict = 'review';
        notes.push(`例外条款 ${node.exception} 放宽了主许可证的传染性约束，综合结论由「冲突」降级为「复核」`);
      } else if (!excBasis) {
        if (verdict === 'pass') verdict = 'review';
        notes.push(`例外条款 ${node.exception} 未收录，结论保守处理`);
      }
      return { verdict, notes, clauses: [...base.clauses, excClause] };
    }
    case 'or': {
      const parts = node.items.map(it => evalNode(it, dist));
      let verdict: Verdict = 'conflict';
      for (const p of parts) verdict = bestOf(verdict, p.verdict);
      const winners = parts.flatMap(p => p.clauses.filter(c => c.role === 'license' && c.verdict === verdict).map(c => c.id));
      const note =
        verdict === 'conflict'
          ? 'OR 组合：所有候选条款均为冲突，无可选路径'
          : `OR 组合：满足任一候选条款即可，按最优路径「${Array.from(new Set(winners)).join(' / ')}」得出结论`;
      return {
        verdict,
        notes: [note, ...parts.flatMap(p => p.notes)],
        clauses: parts.flatMap(p => p.clauses),
      };
    }
    case 'and': {
      const parts = node.items.map(it => evalNode(it, dist));
      let verdict: Verdict = 'pass';
      for (const p of parts) verdict = worstOf(verdict, p.verdict);
      const worstIds = parts.flatMap(p => p.clauses.filter(c => c.role === 'license' && c.verdict === verdict).map(c => c.id));
      return {
        verdict,
        notes: [`AND 组合：需同时满足全部 ${node.items.length} 项条款，综合结论取最严格项（${Array.from(new Set(worstIds)).join(' / ')}）`, ...parts.flatMap(p => p.notes)],
        clauses: parts.flatMap(p => p.clauses),
      };
    }
  }
}

function kindLabel(root: Node): string {
  switch (root.kind) {
    case 'license':
      return '单一许可证';
    case 'with':
      return '含例外条款';
    case 'or':
      return root.items.some(i => i.kind === 'and') ? '复合组合（OR 嵌套 AND）' : 'OR 组合（任选其一）';
    case 'and':
      return root.items.some(i => i.kind === 'or') ? '复合组合（AND 嵌套 OR）' : 'AND 组合（需同时满足）';
  }
}

export function evaluateLicense(expr: string, dist: Distribution): Evaluation {
  const root = parseExpression(expr);
  if (!root) {
    return {
      clauses: [{ id: expr.trim() || 'Unknown', role: 'license', verdict: 'review', basis: ['许可证表达式无法解析，已按未识别许可证处理', '需人工核对许可证全文与使用方式'] }],
      verdict: 'review',
      kindLabel: '无法解析',
      notes: ['表达式解析失败，综合结论保守置为「复核」'],
    };
  }
  const res = evalNode(root, dist);
  return { clauses: res.clauses, verdict: res.verdict, kindLabel: kindLabel(root), notes: res.notes };
}
