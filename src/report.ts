import { DISTRIBUTION_LABEL, VERDICT_LABEL, type Distribution, type Evaluation, type Verdict } from './license';
import { fmtTime, fmtTimeFull, type AuditEntry, type Decision, type Dependency } from './store';

const esc = (s: string): string => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

const depLabel = (d: Dependency): string => `${d.name}${d.version ? `@${d.version}` : ''}`;

export interface ReportInput {
  deps: Dependency[];
  evalOf: (depId: string) => Evaluation;
  finalOf: (depId: string) => Verdict;
  manualOf: (depId: string) => Decision | undefined;
  decisions: Decision[];
  audit: AuditEntry[];
  distribution: Distribution;
  now: Date;
}

export function buildReport(input: ReportInput): string {
  const { deps, evalOf, finalOf, manualOf, decisions, audit, distribution, now } = input;
  const counts: Record<Verdict, number> = { pass: 0, review: 0, conflict: 0 };
  deps.forEach(d => counts[finalOf(d.id)]++);
  const manualCount = deps.filter(d => manualOf(d.id)).length;

  const lines: string[] = [];
  lines.push('# License Lens 许可证审核报告');
  lines.push('');
  lines.push(`- 生成时间：${fmtTimeFull(now.toISOString())}`);
  lines.push(`- 分发模型：${DISTRIBUTION_LABEL[distribution]}`);
  lines.push(`- 依赖总数：${deps.length}（通过 ${counts.pass} · 复核 ${counts.review} · 冲突 ${counts.conflict}）`);
  lines.push(`- 人工结论：${manualCount} 项（覆盖自动判断）`);
  lines.push('');
  lines.push('## 一、逐项结论与依据');
  lines.push('');

  deps.forEach((dep, i) => {
    const ev = evalOf(dep.id);
    const final = finalOf(dep.id);
    const manual = manualOf(dep.id);
    lines.push(`### ${i + 1}. ${depLabel(dep)}`);
    lines.push('');
    lines.push(`- 许可证表达式：\`${dep.license}\`（${ev.kindLabel}）`);
    lines.push(
      manual
        ? `- 最终结论：**${VERDICT_LABEL[final]}**（人工结论覆盖；自动评估为「${VERDICT_LABEL[ev.verdict]}」）`
        : `- 最终结论：**${VERDICT_LABEL[final]}**（自动评估）`,
    );
    if (manual) {
      lines.push(`- 人工决策（最新）：${manual.handler} · ${fmtTime(manual.time)} · ${manual.note}`);
    }
    lines.push('- 候选条款评估：');
    ev.clauses.forEach(c => {
      lines.push(`  - \`${c.id}\`（${c.role === 'exception' ? '例外条款' : '许可证'}）→ **${VERDICT_LABEL[c.verdict]}**`);
      c.basis.forEach(b => lines.push(`    - ${b}`));
    });
    if (ev.notes.length > 0) {
      lines.push('- 组合逻辑：');
      ev.notes.forEach(n => lines.push(`  - ${n}`));
    }
    const history = decisions.filter(d => d.depId === dep.id).sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    if (history.length > 0) {
      lines.push('- 该依赖的决策历史：');
      history.forEach(h => lines.push(`  - ${fmtTime(h.time)} · ${h.handler} · ${VERDICT_LABEL[h.verdict]} · ${h.note}`));
    }
    lines.push('');
  });

  lines.push(`## 二、人工决策存档（${decisions.length} 条）`);
  lines.push('');
  if (decisions.length === 0) {
    lines.push('（无）');
  } else {
    lines.push('| 时间 | 依赖 | 结论 | 处理人 | 说明 |');
    lines.push('|---|---|---|---|---|');
    [...decisions]
      .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
      .forEach(d => {
        const dep = deps.find(x => x.id === d.depId);
        lines.push(`| ${fmtTime(d.time)} | ${esc(dep ? depLabel(dep) : `${d.depId}（已移除）`)} | ${VERDICT_LABEL[d.verdict]} | ${esc(d.handler)} | ${esc(d.note)} |`);
      });
  }
  lines.push('');
  lines.push(`## 三、决策记录（完整，${audit.length} 条）`);
  lines.push('');
  if (audit.length === 0) {
    lines.push('（无）');
  } else {
    lines.push('| 时间 | 操作人 | 动作 | 对象 | 详情 |');
    lines.push('|---|---|---|---|---|');
    [...audit]
      .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
      .forEach(e => lines.push(`| ${fmtTime(e.time)} | ${esc(e.actor)} | ${esc(e.action)} | ${esc(e.target)} | ${esc(e.detail)} |`));
  }
  lines.push('');
  lines.push('---');
  lines.push('> 本报告由 License Lens 自动生成。自动评估结论基于内置许可证知识库与所选分发模型，仅供发布前审核参考，最终结论以法务复核为准。');
  lines.push('');
  return lines.join('\n');
}

export function reportFilename(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `license-audit-report-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.md`;
}
