import type { Distribution, Verdict } from './license';

export interface Dependency {
  id: string; // 稳定标识：name@version，重复时追加 #n
  name: string;
  version: string;
  license: string; // 原始许可证表达式
}

export interface Decision {
  id: string;
  depId: string;
  verdict: Verdict;
  handler: string; // 处理人
  note: string; // 说明
  time: string; // ISO 时间
}

export interface AuditEntry {
  id: string;
  time: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
}

export interface Persisted {
  deps: Dependency[];
  decisions: Decision[];
  audit: AuditEntry[];
  distribution: Distribution;
  handler: string;
}

// ---------- 工具 ----------

export const uid = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const nowIso = (): string => new Date().toISOString();

export const fmtTime = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const fmtTimeFull = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${fmtTime(iso)}:${p(d.getSeconds())}`;
};

// ---------- 依赖清单解析 ----------

export function parseDependencies(text: string): Dependency[] {
  const seen = new Map<string, number>();
  return text
    .split(/[\r\n,]+/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      let name = line;
      let version = '';
      let license = 'Unknown';
      const sp = line.search(/\s/);
      if (sp > 0) {
        const head = line.slice(0, sp);
        license = line.slice(sp).trim() || 'Unknown';
        // 兼容 npm 作用域包：@scope/pkg@1.0.0
        const at = head.lastIndexOf('@');
        if (at > 0) {
          name = head.slice(0, at);
          version = head.slice(at + 1);
        } else {
          name = head;
        }
      } else {
        const at = line.lastIndexOf('@');
        if (at > 0) {
          name = line.slice(0, at);
          version = line.slice(at + 1);
        }
      }
      let id = version ? `${name}@${version}` : name;
      const n = seen.get(id) ?? 0;
      seen.set(id, n + 1);
      if (n > 0) id = `${id}#${n + 1}`;
      return { id, name, version, license };
    });
}

export const depsToText = (deps: Dependency[]): string =>
  deps.map(d => `${d.name}${d.version ? `@${d.version}` : ''} ${d.license}`).join('\n');

// ---------- 种子数据（含组合许可证与历史决策） ----------

export const SEED_TEXT = [
  'react@18.3.1 MIT',
  'lodash@4.17.21 MIT',
  'axios@1.7.2 MIT',
  'zod@3.23.8 MIT',
  'sharp@0.33.4 Apache-2.0',
  'rc@1.2.8 (BSD-2-Clause OR MIT OR Apache-2.0)',
  'font-awesome@6.5.2 (CC-BY-4.0 AND OFL-1.1 AND MIT)',
  'mpl-bridge@3.1.0 MPL-2.0',
  'legacy-gpl@2.4.0 GPL-3.0-only',
  'agpl-pdf@1.4.2 AGPL-3.0-only',
  'some-proprietary@1.0.0 LicenseRef-Proprietary',
].join('\n');

export function seedState(): Persisted {
  return {
    deps: parseDependencies(SEED_TEXT),
    distribution: 'oss',
    handler: '',
    decisions: [
      {
        id: 'seed-dec-1',
        depId: 'some-proprietary@1.0.0',
        verdict: 'pass',
        handler: '王敏（法务）',
        note: '已购商业授权（合同 SA-2026-011），授权范围覆盖本产品分发与 SaaS 场景',
        time: '2026-09-18T14:02:00+08:00',
      },
      {
        id: 'seed-dec-2',
        depId: 'mpl-bridge@3.1.0',
        verdict: 'review',
        handler: '李航（架构组）',
        note: '需确认对 MPL 覆盖文件的修改范围，发布前完成源码走查并准备开放对应文件',
        time: '2026-09-22T10:24:00+08:00',
      },
    ],
    audit: [
      {
        id: 'seed-a4',
        time: '2026-09-24T16:40:00+08:00',
        actor: '王敏（法务）',
        action: '切换分发模型',
        target: '全局',
        detail: '由「开源分发」切换为「闭源云服务」预演评估，确认结论变化后恢复为「开源分发」',
      },
      {
        id: 'seed-a3',
        time: '2026-09-22T10:24:00+08:00',
        actor: '李航（架构组）',
        action: '人工结论',
        target: 'mpl-bridge@3.1.0',
        detail: '结论：复核（与自动评估一致）· 需确认对 MPL 覆盖文件的修改范围',
      },
      {
        id: 'seed-a2',
        time: '2026-09-18T14:02:00+08:00',
        actor: '王敏（法务）',
        action: '人工结论',
        target: 'some-proprietary@1.0.0',
        detail: '结论：通过（自动评估为「复核」）· 已购商业授权（合同 SA-2026-011）',
      },
      {
        id: 'seed-a1',
        time: '2026-09-15T09:30:00+08:00',
        actor: '系统',
        action: '导入清单',
        target: 'release/2.4.0 依赖清单',
        detail: '解析 11 条依赖（含组合许可证 3 条），完成首轮自动评估',
      },
    ],
  };
}

// ---------- 持久化 ----------

const STORAGE_KEY = 'license-lens-audit-v1';

export function loadState(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    if (!Array.isArray(parsed.deps) || !Array.isArray(parsed.decisions) || !Array.isArray(parsed.audit)) return seedState();
    return {
      deps: parsed.deps,
      decisions: parsed.decisions,
      audit: parsed.audit,
      distribution: parsed.distribution === 'saas' ? 'saas' : 'oss',
      handler: typeof parsed.handler === 'string' ? parsed.handler : '',
    };
  } catch {
    return seedState();
  }
}

export function saveState(state: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时静默降级（如隐私模式），页面内状态仍然有效
  }
}
