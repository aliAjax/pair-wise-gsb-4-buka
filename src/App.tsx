import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { FileDown, FileText, History, Info, Plus, RotateCcw, Scale, Search, Trash2, Upload, User, X } from 'lucide-react';
import { DISTRIBUTION_HINT, DISTRIBUTION_LABEL, evaluateLicense, VERDICT_LABEL, type Distribution, type Evaluation, type Verdict } from './license';
import { buildReport, reportFilename } from './report';
import { depsToText, fmtTime, loadState, nowIso, parseDependencies, saveState, seedState, SEED_TEXT, uid, type AuditEntry, type Decision, type Dependency, type Persisted } from './store';

type Filter = 'all' | Verdict | 'manual';

const depLabel = (d: Dependency): string => `${d.name}${d.version ? `@${d.version}` : ''}`;

export default function App() {
  const [state, setState] = useState<Persisted>(loadState);
  const [draft, setDraft] = useState<string>(() => depsToText(state.deps));
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addName, setAddName] = useState('');
  const [addLicense, setAddLicense] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => saveState(state), [state]);

  // 自动评估为派生数据：依赖清单或分发模型变化时即时重算
  const evals = useMemo(() => {
    const m = new Map<string, Evaluation>();
    state.deps.forEach(d => m.set(d.id, evaluateLicense(d.license, state.distribution)));
    return m;
  }, [state.deps, state.distribution]);

  const latestDecisions = useMemo(() => {
    const m = new Map<string, Decision>();
    state.decisions.forEach(d => {
      const cur = m.get(d.depId);
      if (!cur || Date.parse(d.time) > Date.parse(cur.time)) m.set(d.depId, d);
    });
    return m;
  }, [state.decisions]);

  const evalOf = (id: string): Evaluation => evals.get(id)!;
  const manualOf = (id: string): Decision | undefined => latestDecisions.get(id);
  const finalOf = (id: string): Verdict => manualOf(id)?.verdict ?? evalOf(id).verdict;

  const commit = (next: Partial<Persisted>, audit?: { actor?: string; action: string; target: string; detail: string }) => {
    setState(s => {
      const merged: Persisted = { ...s, ...next };
      if (!audit) return merged;
      const entry: AuditEntry = { id: uid(), time: nowIso(), actor: audit.actor ?? (s.handler || '系统'), action: audit.action, target: audit.target, detail: audit.detail };
      return { ...merged, audit: [entry, ...merged.audit].slice(0, 300) };
    });
  };

  const analyze = (text: string, action = '导入清单', target = '手工录入清单') => {
    const deps = parseDependencies(text);
    const combos = deps.filter(d => evaluateLicense(d.license, state.distribution).clauses.length > 1).length;
    commit({ deps }, { action, target, detail: `解析 ${deps.length} 条依赖（含组合许可证 ${combos} 条），已按「${DISTRIBUTION_LABEL[state.distribution]}」完成自动评估` });
    setStatus(`分析完成 · 已检查 ${deps.length} 条依赖`);
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      setDraft(text);
      analyze(text, '导入文件', f.name);
    };
    reader.readAsText(f);
    e.target.value = '';
  };

  const addDep = () => {
    const name = addName.trim();
    const lic = addLicense.trim();
    if (!name || !lic) return;
    const text = `${draft.trim()}\n${name} ${lic}`.trim();
    setDraft(text);
    analyze(text, '添加依赖', name);
    setAddName('');
    setAddLicense('');
  };

  const removeDep = (dep: Dependency) => {
    const deps = state.deps.filter(d => d.id !== dep.id);
    commit({ deps }, { action: '移除依赖', target: depLabel(dep), detail: `从清单中移除（原许可证：${dep.license}）` });
    setDraft(depsToText(deps));
    if (selectedId === dep.id) setSelectedId(null);
  };

  const switchDist = (d: Distribution) => {
    if (d === state.distribution) return;
    commit({ distribution: d }, { action: '切换分发模型', target: '全局', detail: `由「${DISTRIBUTION_LABEL[state.distribution]}」切换为「${DISTRIBUTION_LABEL[d]}」，全部依赖已按新模型重新评估` });
  };

  const submitDecision = (dep: Dependency, verdict: Verdict, handler: string, note: string) => {
    const auto = evalOf(dep.id).verdict;
    const decision: Decision = { id: uid(), depId: dep.id, verdict, handler, note, time: nowIso() };
    commit(
      { decisions: [...state.decisions, decision], handler },
      { actor: handler, action: '人工结论', target: depLabel(dep), detail: `结论：${VERDICT_LABEL[verdict]}（自动评估为「${VERDICT_LABEL[auto]}」）· ${note}` },
    );
    setStatus(`已记录 ${depLabel(dep)} 的人工结论：${VERDICT_LABEL[verdict]}`);
  };

  const revertDecision = (dep: Dependency) => {
    const latest = manualOf(dep.id);
    if (!latest) return;
    commit(
      { decisions: state.decisions.filter(d => d.id !== latest.id) },
      { action: '撤销人工结论', target: depLabel(dep), detail: `撤销 ${latest.handler} 于 ${fmtTime(latest.time)} 给出的「${VERDICT_LABEL[latest.verdict]}」结论，恢复采用自动评估` },
    );
  };

  const reset = () => {
    if (!window.confirm('将清空全部依赖、人工结论与决策记录，并恢复内置示例数据。确定重置吗？')) return;
    const seed = seedState();
    seed.audit = [{ id: uid(), time: nowIso(), actor: state.handler || '系统', action: '重置数据', target: '全局', detail: '清空全部数据并恢复内置示例（11 条依赖、2 条历史人工结论）' }, ...seed.audit];
    setState(seed);
    setDraft(SEED_TEXT);
    setSelectedId(null);
    setStatus('已重置为示例数据');
  };

  const exportReport = () => {
    const now = new Date();
    const md = buildReport({ deps: state.deps, evalOf, finalOf, manualOf, decisions: state.decisions, audit: state.audit, distribution: state.distribution, now });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
    a.download = reportFilename(now);
    a.click();
    URL.revokeObjectURL(a.href);
    commit({}, { action: '导出报告', target: reportFilename(now), detail: `导出 ${state.deps.length} 条依赖的审核报告，含逐项依据与完整决策记录` });
    setStatus('审核报告已导出');
  };

  const counts: Record<Verdict, number> = { pass: 0, review: 0, conflict: 0 };
  state.deps.forEach(d => counts[finalOf(d.id)]++);
  const manualCount = state.deps.filter(d => manualOf(d.id)).length;

  const q = query.trim().toLowerCase();
  const visible = state.deps.filter(d => {
    if (filter === 'manual' && !manualOf(d.id)) return false;
    if (filter !== 'all' && filter !== 'manual' && finalOf(d.id) !== filter) return false;
    return !q || d.name.toLowerCase().includes(q) || d.license.toLowerCase().includes(q);
  });

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: state.deps.length },
    { key: 'pass', label: '通过', count: counts.pass },
    { key: 'review', label: '需复核', count: counts.review },
    { key: 'conflict', label: '冲突', count: counts.conflict },
    { key: 'manual', label: '人工结论', count: manualCount },
  ];

  const selected = state.deps.find(d => d.id === selectedId) ?? null;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <div className="logo"><Scale size={19} /></div>
          <div>
            <h1>License Lens</h1>
            <small>依赖许可证审核台账</small>
          </div>
        </div>
        <div className="top-actions">
          <div className="seg" title="切换分发模型后，全部依赖将按新模型重新评估">
            {(['oss', 'saas'] as Distribution[]).map(d => (
              <button key={d} className={state.distribution === d ? 'active' : ''} onClick={() => switchDist(d)}>{DISTRIBUTION_LABEL[d]}</button>
            ))}
          </div>
          <div className="handler-box" title="当前处理人，将作为人工结论的默认记录人">
            <User size={14} />
            <input value={state.handler} onChange={e => commit({ handler: e.target.value })} placeholder="处理人" />
          </div>
          <button className="ghost" onClick={reset}><RotateCcw size={15} />重置</button>
          <button className="primary" onClick={exportReport}><FileDown size={15} />导出报告</button>
        </div>
      </header>

      <div className="dist-hint"><Info size={14} /><span>当前分发模型：<b>{DISTRIBUTION_LABEL[state.distribution]}</b>。{DISTRIBUTION_HINT[state.distribution]}</span></div>

      <section className="summary">
        <div className="metric"><small>已分析依赖</small><b>{state.deps.length}</b></div>
        <div className="metric"><small>通过</small><b className="good">{counts.pass}</b></div>
        <div className="metric"><small>需复核</small><b className="warn">{counts.review}</b></div>
        <div className="metric"><small>冲突</small><b className="bad">{counts.conflict}</b></div>
        <div className="metric"><small>人工结论</small><b className="manual">{manualCount}</b></div>
      </section>

      <section className="grid">
        <aside className="side">
          <div className="panel">
            <h3>导入依赖清单</h3>
            <textarea className="textarea" spellCheck={false} value={draft} onChange={e => setDraft(e.target.value)} />
            <button className="primary wide" onClick={() => analyze(draft)}>开始分析</button>
            <div className="drop">
              拖放 package.json 或许可证清单<br />
              <label htmlFor="file"><Upload size={13} /> 选择文件<input id="file" type="file" accept=".txt,.json,.csv,.lock,.md" onChange={onFile} /></label>
            </div>
            <p className="hint">支持每行一个依赖，格式：<code>名称@版本 许可证表达式</code>。组合许可证使用 SPDX 表达式，如 <code>(MIT OR Apache-2.0)</code>、<code>GPL-2.0-only WITH Classpath-exception-2.0</code>。未识别许可证会标记为需复核。</p>
            <div className="manual">
              <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="名称@版本" />
              <input value={addLicense} onChange={e => setAddLicense(e.target.value)} placeholder="许可证" list="license-options" />
              <datalist id="license-options">
                {['MIT', 'Apache-2.0', 'BSD-3-Clause', 'MPL-2.0', 'LGPL-3.0', 'GPL-3.0-only', 'AGPL-3.0-only', 'LicenseRef-Proprietary'].map(l => <option key={l} value={l} />)}
              </datalist>
              <button onClick={addDep} title="添加依赖"><Plus size={15} /></button>
            </div>
            <div className="status">{status}</div>
          </div>

          <div className="panel">
            <h3><History size={13} /> 决策记录</h3>
            <div className="audit-list">
              {state.audit.map(e => (
                <div className="audit-item" key={e.id}>
                  <div className="audit-meta"><b>{e.actor}</b><span className="audit-action">{e.action}</span><time>{fmtTime(e.time)}</time></div>
                  <div className="audit-target">{e.target}</div>
                  <p>{e.detail}</p>
                </div>
              ))}
              {state.audit.length === 0 && <div className="empty">暂无决策记录</div>}
            </div>
          </div>
        </aside>

        <section className="panel results">
          <div className="results-head">
            <h3>分析结果</h3>
            <div className="search"><Search size={14} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索依赖或许可证…" /></div>
          </div>
          <div className="filters">
            {chips.map(c => (
              <button key={c.key} className={filter === c.key ? 'chip active' : 'chip'} onClick={() => setFilter(c.key)}>{c.label} <span>{c.count}</span></button>
            ))}
          </div>
          <div className="row head">
            <div>依赖</div><div>许可证表达式</div><div>候选条款</div><div>结论</div><div></div>
          </div>
          {visible.map(d => {
            const ev = evalOf(d.id);
            const manual = manualOf(d.id);
            const final = finalOf(d.id);
            return (
              <div key={d.id} className={selectedId === d.id ? 'row selected' : 'row'} onClick={() => setSelectedId(d.id)}>
                <div className="pkg">
                  <div className="pkgicon">{d.name.replace(/^@/, '').charAt(0).toUpperCase() || '?'}</div>
                  <div className="pkg-name"><b>{d.name}</b><span className="version">@{d.version || '—'}</span></div>
                </div>
                <code className="license" title={d.license}>{d.license}</code>
                <div className="clause-badges">
                  {ev.clauses.slice(0, 3).map((c, i) => <span key={i} className={`mini ${c.verdict}`} title={`${c.id}：${VERDICT_LABEL[c.verdict]}`}>{c.id}</span>)}
                  {ev.clauses.length > 3 && <span className="mini more">+{ev.clauses.length - 3}</span>}
                </div>
                <div className="verdict-cell">
                  <span className={`badge ${final}`}>{VERDICT_LABEL[final]}</span>
                  {manual && <span className="tag-manual" title={`${manual.handler} · ${fmtTime(manual.time)} · ${manual.note}`}>人工</span>}
                </div>
                <div className="row-actions">
                  <button className="icon-btn" title="查看依据与审核" onClick={e => { e.stopPropagation(); setSelectedId(d.id); }}><FileText size={15} /></button>
                  <button className="icon-btn danger" title="移除依赖" onClick={e => { e.stopPropagation(); removeDep(d); }}><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })}
          {visible.length === 0 && <div className="empty">没有匹配的依赖</div>}
          <div className="notice"><b>审核提示</b><br />「人工结论」会覆盖对应依赖的自动评估结果，并随报告一并导出；切换分发模型只影响自动评估，不会清除人工结论。发布前请由法务复核全部「需复核」与「冲突」项。</div>
        </section>
      </section>

      {selected && (
        <DetailModal
          key={selected.id}
          dep={selected}
          evaluation={evalOf(selected.id)}
          decisions={state.decisions.filter(d => d.depId === selected.id).sort((a, b) => Date.parse(b.time) - Date.parse(a.time))}
          distribution={state.distribution}
          defaultHandler={state.handler}
          currentFinal={finalOf(selected.id)}
          onClose={() => setSelectedId(null)}
          onSubmit={(v, h, n) => submitDecision(selected, v, h, n)}
          onRevert={() => revertDecision(selected)}
        />
      )}
    </div>
  );
}

function DetailModal(props: {
  dep: Dependency;
  evaluation: Evaluation;
  decisions: Decision[];
  distribution: Distribution;
  defaultHandler: string;
  currentFinal: Verdict;
  onClose: () => void;
  onSubmit: (verdict: Verdict, handler: string, note: string) => void;
  onRevert: () => void;
}) {
  const { dep, evaluation, decisions, distribution, onClose, onSubmit, onRevert } = props;
  const [verdict, setVerdict] = useState<Verdict>(props.currentFinal);
  const [handler, setHandler] = useState(props.defaultHandler);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const latest = decisions[0];

  const submit = () => {
    if (!handler.trim()) { setError('请填写处理人'); return; }
    if (!note.trim()) { setError('请填写说明'); return; }
    onSubmit(verdict, handler.trim(), note.trim());
    setNote('');
    setError('');
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{dep.name}<span className="version">@{dep.version || '—'}</span></h2>
            <p className="modal-sub">许可证表达式 <code>{dep.license}</code> · {evaluation.kindLabel}</p>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-section">
          <h3>自动评估 · 候选条款（{DISTRIBUTION_LABEL[distribution]}）</h3>
          {evaluation.clauses.map((c, i) => (
            <div className="clause-card" key={i}>
              <div className="clause-head">
                <code>{c.id}</code>
                <span className="role">{c.role === 'exception' ? '例外条款' : '许可证'}</span>
                <span className={`badge ${c.verdict}`}>{VERDICT_LABEL[c.verdict]}</span>
              </div>
              <ul>{c.basis.map((b, j) => <li key={j}>{b}</li>)}</ul>
            </div>
          ))}
          {evaluation.notes.map((n, i) => <p className="combo-note" key={i}><Info size={13} />{n}</p>)}
          <p className="auto-summary">自动评估综合结论：<span className={`badge ${evaluation.verdict}`}>{VERDICT_LABEL[evaluation.verdict]}</span></p>
        </div>

        <div className="modal-section">
          <h3>人工结论（覆盖自动判断）</h3>
          {latest ? (
            <div className="current-manual">
              <div className="cm-head">
                <span className={`badge ${latest.verdict}`}>{VERDICT_LABEL[latest.verdict]}</span>
                <b>{latest.handler}</b>
                <time>{fmtTime(latest.time)}</time>
                <button className="danger-link" onClick={onRevert}>撤销，恢复自动评估</button>
              </div>
              <p>{latest.note}</p>
            </div>
          ) : <p className="muted">暂无人工结论，当前采用自动评估结果。</p>}
          <div className="decision-form">
            <div className="form-row">
              <label>结论
                <select value={verdict} onChange={e => setVerdict(e.target.value as Verdict)}>
                  <option value="pass">通过</option>
                  <option value="review">复核</option>
                  <option value="conflict">冲突</option>
                </select>
              </label>
              <label className="grow">处理人
                <input value={handler} onChange={e => setHandler(e.target.value)} placeholder="姓名 / 团队角色" />
              </label>
            </div>
            <label>说明
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="判定依据、授权合同编号、待办事项…" />
            </label>
            {error && <p className="form-error">{error}</p>}
            <div className="form-actions">
              <button className="primary" onClick={submit}>记录人工结论</button>
            </div>
          </div>
        </div>

        <div className="modal-section">
          <h3>历史决策（{decisions.length}）</h3>
          {decisions.length === 0 ? <p className="muted">该依赖暂无历史决策。</p> : (
            <div className="history-list">
              {decisions.map(d => (
                <div className="history-item" key={d.id}>
                  <div className="hi-head"><span className={`badge ${d.verdict}`}>{VERDICT_LABEL[d.verdict]}</span><b>{d.handler}</b><time>{fmtTime(d.time)}</time></div>
                  <p>{d.note}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
