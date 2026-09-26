import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronRight, Cloud, CircleHelp, Clock3, Download,
  FileText, History, Package, RotateCcw, Scale, Search, ShieldCheck, UserRound,
} from 'lucide-react';

/* ---------------------------------- 领域模型 ---------------------------------- */

type Verdict = 'pass' | 'review' | 'conflict';
type Mode = 'oss' | 'saas'; // oss = 开源分发, saas = 闭源云服务

interface LicensePolicy {
  spdx: string;
  name: string;
  category: string;
  verdict: Record<Mode, Verdict>;
  basis: Record<Mode, string>; // 各分发模式下的判定依据
}

interface Dep {
  id: string;
  name: string;
  version: string;
  ecosystem: string;
  direct: boolean;
  expr: string; // 原始许可证表达式
  op: 'single' | 'OR' | 'AND';
  clauses: string[]; // 候选条款（SPDX）
}

interface LogEntry {
  id: string;
  depId: string;
  kind: 'manual' | 'revert'; // manual = 人工裁定, revert = 恢复自动判断
  verdict: Verdict | null;
  handler: string;
  note: string;
  time: string; // ISO
  mode: Mode; // 记录时所处的分发模式
}

interface ClauseResult {
  spdx: string;
  name: string;
  category: string;
  verdict: Verdict;
  basis: string;
  known: boolean;
}

interface DepEval {
  dep: Dep;
  clauses: ClauseResult[];
  auto: Verdict;
  override: LogEntry | null; // 当前生效的人工裁定
  effective: Verdict;
}

/* ---------------------------------- 许可证政策库 ---------------------------------- */

const LICENSES: Record<string, LicensePolicy> = {
  'MIT': {
    spdx: 'MIT', name: 'MIT License', category: '宽松许可证',
    verdict: { oss: 'pass', saas: 'pass' },
    basis: {
      oss: '宽松许可证，保留版权与许可声明即可随产品分发，无 copyleft 义务。',
      saas: '宽松许可证，保留声明即可，作为云服务内部使用无额外义务。',
    },
  },
  'Apache-2.0': {
    spdx: 'Apache-2.0', name: 'Apache License 2.0', category: '宽松许可证',
    verdict: { oss: 'pass', saas: 'pass' },
    basis: {
      oss: '允许商用与分发，需保留 NOTICE 文件并遵守专利授权条款。',
      saas: '允许内部使用与修改，保留 NOTICE 与专利条款说明即可。',
    },
  },
  'BSD-3-Clause': {
    spdx: 'BSD-3-Clause', name: 'BSD 3-Clause License', category: '宽松许可证',
    verdict: { oss: 'pass', saas: 'pass' },
    basis: {
      oss: '宽松许可证，保留声明即可分发，且不得使用作者名义背书。',
      saas: '宽松许可证，云服务内部使用无额外义务。',
    },
  },
  'AFL-2.1': {
    spdx: 'AFL-2.1', name: 'Academic Free License 2.1', category: '宽松许可证',
    verdict: { oss: 'pass', saas: 'pass' },
    basis: {
      oss: '宽松许可证，保留版权声明即可分发。',
      saas: '宽松许可证，内部使用无额外义务。',
    },
  },
  'ISC': {
    spdx: 'ISC', name: 'ISC License', category: '宽松许可证',
    verdict: { oss: 'pass', saas: 'pass' },
    basis: {
      oss: '宽松许可证，保留声明即可分发。',
      saas: '宽松许可证，内部使用无额外义务。',
    },
  },
  'OFL-1.1': {
    spdx: 'OFL-1.1', name: 'SIL Open Font License 1.1', category: '字体许可证',
    verdict: { oss: 'pass', saas: 'pass' },
    basis: {
      oss: '字体可随产品再分发，不得单独销售字体文件，需保留 OFL 声明。',
      saas: '字体可嵌入网页与客户端使用，保留 OFL 声明即可。',
    },
  },
  'CC-BY-4.0': {
    spdx: 'CC-BY-4.0', name: 'Creative Commons Attribution 4.0', category: '署名许可',
    verdict: { oss: 'review', saas: 'pass' },
    basis: {
      oss: '素材随产品再分发需显著署名并标注修改，需核对素材清单与署名位置。',
      saas: '页面与客户端内展示素材，按规范署名即可满足要求。',
    },
  },
  'LGPL-2.1-or-later': {
    spdx: 'LGPL-2.1-or-later', name: 'GNU LGPL 2.1+', category: '弱 Copyleft',
    verdict: { oss: 'review', saas: 'pass' },
    basis: {
      oss: '随产品分发时须允许用户替换该库（动态链接或提供可重链接目标文件），并附带对应源码获取方式，需人工确认链接方式。',
      saas: '不对外分发软件本体，服务端内部使用不触发 LGPL 分发义务。',
    },
  },
  'MPL-2.0': {
    spdx: 'MPL-2.0', name: 'Mozilla Public License 2.0', category: '弱 Copyleft',
    verdict: { oss: 'review', saas: 'pass' },
    basis: {
      oss: '文件级 copyleft：对 MPL 文件本身的修改需开源，需确认未改动其源文件。',
      saas: '不对外分发，内部使用不触发 MPL 开源义务。',
    },
  },
  'GPL-2.0-with-classpath': {
    spdx: 'GPL-2.0-with-classpath', name: 'GPL 2.0 + Classpath 例外', category: '弱 Copyleft',
    verdict: { oss: 'review', saas: 'pass' },
    basis: {
      oss: 'Classpath 例外允许以独立模块方式链接使用，但不得修改该组件本体，需确认使用方式。',
      saas: '不对外分发，内部使用不触发 copyleft。',
    },
  },
  'GPL-3.0-only': {
    spdx: 'GPL-3.0-only', name: 'GNU GPL 3.0', category: '强 Copyleft',
    verdict: { oss: 'conflict', saas: 'review' },
    basis: {
      oss: '强 copyleft：随产品分发将要求整体衍生作品以 GPL-3.0 开源，与当前发布策略冲突。',
      saas: '不对外分发即不触发 copyleft，但需确认该组件不进入任何对外交付物。',
    },
  },
  'AGPL-3.0-only': {
    spdx: 'AGPL-3.0-only', name: 'GNU AGPL 3.0', category: '网络 Copyleft',
    verdict: { oss: 'conflict', saas: 'conflict' },
    basis: {
      oss: '强 copyleft：分发将要求整体衍生作品开源，与发布策略冲突。',
      saas: '网络交互即触发开源义务：通过云服务对外提供功能即须开放对应源码，与闭源模式冲突。',
    },
  },
  'SSPL-1.0': {
    spdx: 'SSPL-1.0', name: 'Server Side Public License', category: '网络 Copyleft',
    verdict: { oss: 'conflict', saas: 'conflict' },
    basis: {
      oss: 'SSPL 未被 OSI 认定为开源许可证，随产品分发存在合规风险。',
      saas: '以云服务形式提供该组件能力时，须开放整个服务栈源码，与闭源模式冲突。',
    },
  },
  'CC-BY-NC-4.0': {
    spdx: 'CC-BY-NC-4.0', name: 'CC 署名-非商业性使用 4.0', category: '非商业许可',
    verdict: { oss: 'conflict', saas: 'conflict' },
    basis: {
      oss: '含非商业使用限制，禁止用于商业产品分发。',
      saas: '含非商业使用限制，禁止用于商业云服务。',
    },
  },
  'LicenseRef-Proprietary': {
    spdx: 'LicenseRef-Proprietary', name: '专有许可证', category: '专有许可',
    verdict: { oss: 'review', saas: 'review' },
    basis: {
      oss: '专有许可条款需逐案核对，确认是否允许随本产品再分发。',
      saas: '专有许可条款需逐案核对，确认是否授权以云服务方式使用。',
    },
  },
};

const UNKNOWN_BASIS: Record<Mode, string> = {
  oss: '未能识别的许可证标识，需人工确认许可证文本与分发条款。',
  saas: '未能识别的许可证标识，需人工确认许可证文本与使用条款。',
};

/* ---------------------------------- 依赖清单（发布快照） ---------------------------------- */

const DEPS: Dep[] = [
  { id: 'react', name: 'react', version: '18.3.1', ecosystem: 'npm', direct: true, expr: 'MIT', op: 'single', clauses: ['MIT'] },
  { id: 'axios', name: 'axios', version: '1.7.2', ecosystem: 'npm', direct: true, expr: 'MIT', op: 'single', clauses: ['MIT'] },
  { id: 'sharp', name: 'sharp', version: '0.33.4', ecosystem: 'npm', direct: true, expr: 'Apache-2.0', op: 'single', clauses: ['Apache-2.0'] },
  { id: 'json-schema', name: 'json-schema', version: '0.4.0', ecosystem: 'npm', direct: false, expr: 'AFL-2.1 OR BSD-3-Clause', op: 'OR', clauses: ['AFL-2.1', 'BSD-3-Clause'] },
  { id: 'font-awesome', name: 'font-awesome', version: '6.5.2', ecosystem: 'npm', direct: true, expr: '(OFL-1.1 AND MIT AND CC-BY-4.0)', op: 'AND', clauses: ['OFL-1.1', 'MIT', 'CC-BY-4.0'] },
  { id: 'ffmpeg-static', name: 'ffmpeg-static', version: '5.2.0', ecosystem: 'npm', direct: true, expr: 'LGPL-2.1-or-later', op: 'single', clauses: ['LGPL-2.1-or-later'] },
  { id: 'legacy-analytics', name: 'legacy-analytics', version: '2.4.0', ecosystem: 'npm', direct: true, expr: 'GPL-3.0-only', op: 'single', clauses: ['GPL-3.0-only'] },
  { id: 'mysql-connector-j', name: 'mysql-connector-j', version: '8.3.0', ecosystem: 'maven', direct: true, expr: 'GPL-2.0-only WITH Classpath-exception-2.0', op: 'single', clauses: ['GPL-2.0-with-classpath'] },
  { id: 'mongodb-server', name: 'mongodb-server', version: '7.0.5', ecosystem: 'docker', direct: true, expr: 'SSPL-1.0', op: 'single', clauses: ['SSPL-1.0'] },
  { id: 'icon-pack-cc', name: 'icon-pack-cc', version: '3.1.0', ecosystem: 'npm', direct: false, expr: 'CC-BY-NC-4.0', op: 'single', clauses: ['CC-BY-NC-4.0'] },
  { id: 'internal-auth-sdk', name: 'internal-auth-sdk', version: '0.9.1', ecosystem: 'npm', direct: true, expr: 'LicenseRef-Proprietary', op: 'single', clauses: ['LicenseRef-Proprietary'] },
  { id: 'old-utils', name: 'old-utils', version: '1.2.3', ecosystem: 'npm', direct: false, expr: 'Unknown', op: 'single', clauses: ['Unknown'] },
];

// 历史决策：首次打开时写入台账，之后以本地记录为准
const SEED_LOG: LogEntry[] = [
  {
    id: 'seed-1', depId: 'ffmpeg-static', kind: 'manual', verdict: 'pass',
    handler: '王法务', note: '确认产品仅以动态链接方式调用，发布包已附带源码获取说明与替换指引，准予随产品分发。',
    time: '2026-08-14T10:32:00+08:00', mode: 'oss',
  },
  {
    id: 'seed-2', depId: 'legacy-analytics', kind: 'manual', verdict: 'review',
    handler: '张工', note: '该组件仅用于内部数据脚本，暂不随产品分发；发布前需从依赖树中移除或替换，先挂复核。',
    time: '2026-08-20T16:05:00+08:00', mode: 'oss',
  },
  {
    id: 'seed-3', depId: 'internal-auth-sdk', kind: 'manual', verdict: 'pass',
    handler: '王法务', note: '已核对采购合同补充条款，授权范围覆盖本产品全部使用场景。',
    time: '2026-09-02T09:48:00+08:00', mode: 'oss',
  },
];

/* ---------------------------------- 判定逻辑 ---------------------------------- */

const RANK: Record<Verdict, number> = { conflict: 3, review: 2, pass: 1 };
const VERDICT_LABEL: Record<Verdict, string> = { pass: '通过', review: '复核', conflict: '冲突' };
const MODE_LABEL: Record<Mode, string> = { oss: '开源分发', saas: '闭源云服务' };
const STORAGE_KEY = 'license-lens-audit-log-v1';
const HANDLER_KEY = 'license-lens-handler';

function clauseResult(spdx: string, mode: Mode): ClauseResult {
  const policy = LICENSES[spdx];
  if (!policy) {
    return { spdx, name: '未识别许可证', category: '未知', verdict: 'review', basis: UNKNOWN_BASIS[mode], known: false };
  }
  return { spdx, name: policy.name, category: policy.category, verdict: policy.verdict[mode], basis: policy.basis[mode], known: true };
}

function combineAuto(dep: Dep, clauses: ClauseResult[]): Verdict {
  if (dep.op === 'OR') {
    // OR：任选其一履行即可，取最优路径
    return clauses.reduce<Verdict>((best, c) => (RANK[c.verdict] < RANK[best] ? c.verdict : best), 'conflict');
  }
  // single / AND：需同时满足，取最差结论
  return clauses.reduce<Verdict>((worst, c) => (RANK[c.verdict] > RANK[worst] ? c.verdict : worst), 'pass');
}

function evaluateAll(log: LogEntry[], mode: Mode): DepEval[] {
  return DEPS.map(dep => {
    const clauses = dep.clauses.map(c => clauseResult(c, mode));
    const auto = combineAuto(dep, clauses);
    const override = [...log].reverse().find(e => e.depId === dep.id && e.kind === 'manual') ?? null;
    return { dep, clauses, auto, override, effective: override?.verdict ?? auto };
  });
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function loadLog(): LogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as LogEntry[];
  } catch { /* 忽略损坏数据，回退到种子记录 */ }
  return SEED_LOG;
}

/* ---------------------------------- 报告导出 ---------------------------------- */

function buildReport(evals: DepEval[], log: LogEntry[], mode: Mode): string {
  const count = (v: Verdict) => evals.filter(e => e.effective === v).length;
  const mark = (v: Verdict) => (v === 'pass' ? '✅ 通过' : v === 'review' ? '⚠️ 复核' : '⛔ 冲突');
  const lines: string[] = [
    '# 许可证审核报告',
    '',
    `- 产品：DataWorks Console v4.2.0（发布候选）`,
    `- 分发模式：${MODE_LABEL[mode]}`,
    `- 生成时间：${fmtTime(new Date().toISOString())}`,
    `- 依赖总数：${evals.length} ｜ 通过 ${count('pass')} ｜ 复核 ${count('review')} ｜ 冲突 ${count('conflict')}`,
    '',
    '## 逐项审核依据',
    '',
  ];
  for (const e of evals) {
    lines.push(`### ${e.dep.name}@${e.dep.version}`);
    lines.push('');
    lines.push(`- 许可证表达式：\`${e.dep.expr}\``);
    lines.push(`- 依赖类型：${e.dep.ecosystem} · ${e.dep.direct ? '直接依赖' : '间接依赖'}`);
    lines.push('- 候选条款判定：');
    for (const c of e.clauses) {
      lines.push(`  - \`${c.spdx}\`（${c.name}）：${mark(c.verdict)} — ${c.basis}`);
    }
    if (e.dep.op === 'OR') lines.push('- 组合逻辑：OR —— 任选其一履行即可，自动结论取最优条款路径。');
    if (e.dep.op === 'AND') lines.push('- 组合逻辑：AND —— 需同时满足全部条款，自动结论取最差判定。');
    lines.push(`- 自动结论：${mark(e.auto)}`);
    if (e.override) {
      lines.push(`- 人工裁定：${mark(e.override.verdict as Verdict)}（覆盖自动判断）`);
      lines.push(`  - 处理人：${e.override.handler}`);
      lines.push(`  - 说明：${e.override.note}`);
      lines.push(`  - 时间：${fmtTime(e.override.time)}（记录于「${MODE_LABEL[e.override.mode]}」模式）`);
    } else {
      lines.push('- 人工裁定：无（以自动结论为准）');
    }
    lines.push(`- 最终结论：${mark(e.effective)}`);
    lines.push('');
  }
  lines.push('## 完整决策记录');
  lines.push('');
  lines.push('| 时间 | 依赖 | 操作 | 结论 | 处理人 | 说明 | 分发模式 |');
  lines.push('|---|---|---|---|---|---|---|');
  const depName = (id: string) => DEPS.find(d => d.id === id)?.name ?? id;
  for (const e of [...log].sort((a, b) => a.time.localeCompare(b.time))) {
    const action = e.kind === 'manual' ? '人工裁定' : '恢复自动';
    const verdict = e.verdict ? mark(e.verdict) : '—';
    lines.push(`| ${fmtTime(e.time)} | ${depName(e.depId)} | ${action} | ${verdict} | ${e.handler} | ${e.note} | ${MODE_LABEL[e.mode]} |`);
  }
  lines.push('');
  return lines.join('\n');
}

/* ---------------------------------- 界面 ---------------------------------- */

const PRODUCT = 'DataWorks Console';
const RELEASE = 'v4.2.0';

function VerdictBadge({ verdict, small }: { verdict: Verdict; small?: boolean }) {
  const Icon = verdict === 'pass' ? CheckCircle2 : verdict === 'review' ? AlertTriangle : AlertTriangle;
  return (
    <span className={`badge ${verdict} ${small ? 'small' : ''}`}>
      <Icon size={small ? 11 : 13} />
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>('oss');
  const [log, setLog] = useState<LogEntry[]>(loadLog);
  const [selectedId, setSelectedId] = useState(DEPS[0].id);
  const [filter, setFilter] = useState<'all' | Verdict | 'manual'>('all');
  const [query, setQuery] = useState('');
  const [handler, setHandler] = useState(() => localStorage.getItem(HANDLER_KEY) ?? '');
  const [verdictChoice, setVerdictChoice] = useState<Verdict>('pass');
  const [note, setNote] = useState('');
  const [exported, setExported] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  }, [log]);

  const evals = useMemo(() => evaluateAll(log, mode), [log, mode]);
  const selected = evals.find(e => e.dep.id === selectedId) ?? evals[0];
  const depLog = useMemo(
    () => log.filter(e => e.depId === selected.dep.id).sort((a, b) => b.time.localeCompare(a.time)),
    [log, selected],
  );

  const counts = useMemo(() => ({
    pass: evals.filter(e => e.effective === 'pass').length,
    review: evals.filter(e => e.effective === 'review').length,
    conflict: evals.filter(e => e.effective === 'conflict').length,
    manual: evals.filter(e => e.override).length,
  }), [evals]);

  const filtered = evals.filter(e => {
    if (filter === 'manual' && !e.override) return false;
    if ((filter === 'pass' || filter === 'review' || filter === 'conflict') && e.effective !== filter) return false;
    const q = query.trim().toLowerCase();
    return !q || e.dep.name.toLowerCase().includes(q) || e.dep.expr.toLowerCase().includes(q);
  });

  const submitDecision = () => {
    const who = handler.trim();
    if (!who || !note.trim()) return;
    const entry: LogEntry = {
      id: `d-${Date.now()}`, depId: selected.dep.id, kind: 'manual', verdict: verdictChoice,
      handler: who, note: note.trim(), time: new Date().toISOString(), mode,
    };
    setLog(l => [...l, entry]);
    localStorage.setItem(HANDLER_KEY, who);
    setNote('');
  };

  const revertToAuto = () => {
    const who = handler.trim() || selected.override?.handler || '未署名';
    const entry: LogEntry = {
      id: `d-${Date.now()}`, depId: selected.dep.id, kind: 'revert', verdict: null,
      handler: who, note: '撤销人工裁定，恢复按政策库自动判断。', time: new Date().toISOString(), mode,
    };
    setLog(l => [...l, entry]);
    localStorage.setItem(HANDLER_KEY, who);
  };

  const exportReport = () => {
    const md = buildReport(evals, log, mode);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
    a.download = `license-audit-${RELEASE}-${mode}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
    setExported(true);
    window.setTimeout(() => setExported(false), 2600);
  };

  const FILTERS: { key: typeof filter; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: evals.length },
    { key: 'pass', label: '通过', count: counts.pass },
    { key: 'review', label: '复核', count: counts.review },
    { key: 'conflict', label: '冲突', count: counts.conflict },
    { key: 'manual', label: '已人工裁定', count: counts.manual },
  ];

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <div className="logo"><Scale size={19} /></div>
          <div>
            <h1>License Lens · 发布许可证审核</h1>
            <small>{PRODUCT} {RELEASE} · 发布候选 · 依赖 {DEPS.length} 项</small>
          </div>
        </div>
        <div className="top-actions">
          <div className="mode-switch" role="tablist" aria-label="分发模式">
            <button className={mode === 'oss' ? 'active' : ''} onClick={() => setMode('oss')}>
              <Package size={14} /> 开源分发
            </button>
            <button className={mode === 'saas' ? 'active' : ''} onClick={() => setMode('saas')}>
              <Cloud size={14} /> 闭源云服务
            </button>
          </div>
          <button className="primary" onClick={exportReport}>
            <Download size={15} /> {exported ? '已导出报告' : '导出审核报告'}
          </button>
        </div>
      </header>

      <section className="summary">
        <div className="metric">
          <small>依赖总数</small>
          <b>{evals.length}</b>
          <span className="sub"><ShieldCheck size={12} /> {counts.manual} 项已人工裁定</span>
        </div>
        <div className="metric">
          <small>通过</small>
          <b className="good">{counts.pass}</b>
          <span className="sub">当前分发模式下可放行</span>
        </div>
        <div className="metric">
          <small>需复核</small>
          <b className="warn">{counts.review}</b>
          <span className="sub">等待人工确认条款适用</span>
        </div>
        <div className="metric">
          <small>冲突</small>
          <b className="bad">{counts.conflict}</b>
          <span className="sub">与当前分发模式冲突</span>
        </div>
      </section>

      <div className="layout">
        <section className="panel list-panel">
          <div className="panel-head">
            <h3><FileText size={14} /> 依赖清单</h3>
            <div className="search">
              <Search size={14} />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索依赖或许可证" />
            </div>
          </div>
          <div className="filters">
            {FILTERS.map(f => (
              <button key={f.key} className={filter === f.key ? 'chip active' : 'chip'} onClick={() => setFilter(f.key)}>
                {f.label} <em>{f.count}</em>
              </button>
            ))}
          </div>
          <div className="dep-list">
            {filtered.map(e => (
              <button
                key={e.dep.id}
                className={e.dep.id === selected.dep.id ? 'dep-row selected' : 'dep-row'}
                onClick={() => setSelectedId(e.dep.id)}
              >
                <div className="dep-main">
                  <strong>{e.dep.name} <span className="version">@{e.dep.version}</span></strong>
                  <span className="expr">{e.dep.expr}</span>
                  <span className="meta">
                    <i>{e.dep.ecosystem}</i>
                    <i>{e.dep.direct ? '直接依赖' : '间接依赖'}</i>
                    {e.dep.op !== 'single' && <i className="combo">{e.dep.op === 'OR' ? '组合 · 任选其一' : '组合 · 需同时满足'}</i>}
                  </span>
                </div>
                <div className="dep-verdict">
                  <VerdictBadge verdict={e.effective} />
                  {e.override
                    ? <span className="tag manual"><UserRound size={11} /> 人工 · {e.override.handler}</span>
                    : <span className="tag auto">自动</span>}
                </div>
                <ChevronRight size={15} className="go" />
              </button>
            ))}
            {filtered.length === 0 && <div className="empty">没有匹配的依赖</div>}
          </div>
        </section>

        <section className="panel detail-panel">
          <div className="panel-head">
            <h3>审核详情</h3>
            <span className="mode-hint">当前模式：{MODE_LABEL[mode]}</span>
          </div>

          <div className="detail-title">
            <div>
              <strong>{selected.dep.name}@{selected.dep.version}</strong>
              <span className="expr">{selected.dep.expr}</span>
            </div>
            <VerdictBadge verdict={selected.effective} />
          </div>

          {selected.override && (
            <div className="override-banner">
              <UserRound size={14} />
              <div>
                <b>{selected.override.handler}</b> 于 {fmtTime(selected.override.time)} 裁定为「{VERDICT_LABEL[selected.override.verdict as Verdict]}」，已覆盖自动结论（{VERDICT_LABEL[selected.auto]}）。
                {selected.override.mode !== mode && (
                  <span className="mode-mismatch">该裁定记录于「{MODE_LABEL[selected.override.mode]}」模式，切换分发模式后建议复核。</span>
                )}
              </div>
            </div>
          )}

          <div className="block-label">候选条款判定 · {selected.dep.op === 'single' ? '单一条款' : selected.dep.op === 'OR' ? 'OR 组合：任选其一履行即可，自动结论取最优路径' : 'AND 组合：需同时满足全部条款，自动结论取最差判定'}</div>
          <div className="clause-list">
            {selected.clauses.map(c => (
              <div key={c.spdx} className={`clause ${c.verdict}`}>
                <div className="clause-head">
                  <code>{c.spdx}</code>
                  <span className="clause-name">{c.name} · {c.category}</span>
                  <VerdictBadge verdict={c.verdict} small />
                </div>
                <p>{c.basis}</p>
              </div>
            ))}
          </div>

          <div className="conclusion-strip">
            <div><span>自动结论</span><VerdictBadge verdict={selected.auto} small /></div>
            <ChevronRight size={14} />
            <div><span>最终结论</span><VerdictBadge verdict={selected.effective} /></div>
            {selected.override && <span className="tag manual"><UserRound size={11} /> 人工覆盖</span>}
          </div>

          <div className="block-label"><History size={13} /> 决策记录（{depLog.length}）</div>
          {depLog.length === 0 && <div className="empty small">暂无人工决策，当前以政策库自动判断为准。</div>}
          <div className="timeline">
            {depLog.map(e => (
              <div key={e.id} className="timeline-item">
                <div className="timeline-head">
                  {e.kind === 'manual'
                    ? <VerdictBadge verdict={e.verdict as Verdict} small />
                    : <span className="badge revert small"><RotateCcw size={11} /> 恢复自动</span>}
                  <b>{e.handler}</b>
                  <span className="time"><Clock3 size={11} /> {fmtTime(e.time)} · {MODE_LABEL[e.mode]}</span>
                </div>
                <p>{e.note}</p>
              </div>
            ))}
          </div>

          <div className="block-label"><UserRound size={13} /> 人工裁定</div>
          <div className="review-form">
            <div className="form-row">
              <input
                value={handler}
                onChange={e => setHandler(e.target.value)}
                placeholder="处理人（必填）"
                aria-label="处理人"
              />
              <select value={verdictChoice} onChange={e => setVerdictChoice(e.target.value as Verdict)} aria-label="裁定结论">
                <option value="pass">通过</option>
                <option value="review">复核</option>
                <option value="conflict">冲突</option>
              </select>
            </div>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="裁定说明（必填）：记录依据、适用条款与后续要求，将写入决策记录并随报告导出。"
            />
            <div className="form-actions">
              {selected.override && (
                <button className="ghost-btn" onClick={revertToAuto}>
                  <RotateCcw size={13} /> 恢复自动判断
                </button>
              )}
              <button className="primary" disabled={!handler.trim() || !note.trim()} onClick={submitDecision}>
                <ShieldCheck size={14} /> 提交裁定并覆盖自动结论
              </button>
            </div>
          </div>

          <div className="notice">
            <CircleHelp size={14} />
            <p>切换「开源分发 / 闭源云服务」后，自动结论与条款判定将按对应政策重新计算；人工裁定继续生效并全程留痕，导出报告包含每项判定依据与完整决策记录。</p>
          </div>
        </section>
      </div>
    </div>
  );
}
