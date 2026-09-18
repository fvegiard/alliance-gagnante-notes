import type { Note } from '../types';

export interface Finding {
  value: string;
  noteTitle: string;
}

export interface AgentReport {
  keys: Finding[];
  emails: Finding[];
  links: Finding[];
  tasks: Finding[];
  dates: Finding[];
}

/** Well-known API key / token shapes. */
const KEY_PATTERNS: { name: RegExp; label: (m: string) => string }[] = [
  { name: /sk-ant-[A-Za-z0-9_-]{20,}/g, label: () => 'Anthropic key' },
  { name: /sk-kimi-[A-Za-z0-9]{20,}/g, label: () => 'Kimi key' },
  { name: /sk-or-v1-[a-f0-9]{20,}/g, label: () => 'OpenRouter key' },
  { name: /sk-(?!ant-|kimi-|or-v1-)[A-Za-z0-9_-]{20,}/g, label: () => 'API key (sk-…)' },
  { name: /github_pat_[A-Za-z0-9_]{20,}/g, label: () => 'GitHub PAT' },
  { name: /ghp_[A-Za-z0-9]{20,}/g, label: () => 'GitHub token' },
  { name: /glpat-[A-Za-z0-9_-]{20,}/g, label: () => 'GitLab token' },
  { name: /xox[baprs]-[A-Za-z0-9-]{10,}/g, label: () => 'Slack token' },
  { name: /AKIA[0-9A-Z]{16}/g, label: () => 'AWS access key' },
  { name: /AIza[0-9A-Za-z_-]{20,}/g, label: () => 'Google API key' },
  { name: /cfat_[A-Za-z0-9]{20,}/g, label: () => 'Cloudflare API token' },
  { name: /sbp_[a-f0-9]{20,}/g, label: () => 'Supabase key' },
  { name: /nfp_[A-Za-z0-9]{20,}/g, label: () => 'Netlify token' },
  { name: /hf_[A-Za-z0-9]{20,}/g, label: () => 'Hugging Face token' },
  { name: /nvapi-[A-Za-z0-9_-]{20,}/g, label: () => 'NVIDIA API key' },
  { name: /tskey-auth-[A-Za-z0-9_-]{10,}/g, label: () => 'Tailscale auth key' },
  { name: /ws-[a-f0-9]{40,}/g, label: () => 'Webflow token' },
  // Ollama Cloud / Warp style: 32-hex . base64-ish
  { name: /[a-f0-9]{32}\.[A-Za-z0-9_-]{20,}/g, label: () => 'Ollama/Warp token' },
  // Google/Stitch AQ. style
  { name: /AQ\.[A-Za-z0-9_-]{20,}/g, label: () => 'Google/Stitch key' },
  // VirusTotal & generic 64-hex (not when part of a longer token)
  { name: /(?<![A-Za-z0-9_-])[a-f0-9]{64}(?![A-Za-z0-9_-])/g, label: () => '64-hex key (VirusTotal-style)' },
  // UUID-ish keys (Exa)
  { name: /(?<![A-Za-z0-9_-])[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?![A-Za-z0-9_-])/g, label: () => 'UUID key' },
  // SSH public keys
  { name: /ssh-(?:ed25519|rsa) AAAA[A-Za-z0-9+/=]{20,}/g, label: () => 'SSH public key' },
  // Generic short tokens (e.g. Brave Search) — only on lines mentioning key/token
  { name: /(?:(?:brave|search|key|token)\b[^\n]*?)\b([A-Za-z0-9]{26,})\b/gi, label: () => 'Named token' },
  { name: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, label: () => 'JWT token' },
  { name: /(?:api[_-]?key|apikey|token|secret|password|passwd|pwd)\s*[:=]\s*["']?([^\s"']{6,})/gi, label: () => 'Named credential' },
];

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_RE = /https?:\/\/[^\s)"'>\]]+/g;
const TASK_RE = /- \[ \] (.+)/g;
// ISO-ish and common date shapes (e.g. 2026-09-12, 12/09/2026, Sep 12 2026)
const DATE_RE = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4})\b/g;

/** Titles of notes the agent itself manages — excluded from scans to avoid feedback loops. */
export const AGENT_NOTE_TITLES = {
  keys: '🔑 Keys & Codes',
  digest: '🧭 Agent Digest',
};

const EXCLUDED = new Set([...Object.values(AGENT_NOTE_TITLES), '🔐 Credentials Vault']);

function collect(content: string, re: RegExp): string[] {
  const out: string[] = [];
  for (const m of content.matchAll(re)) out.push(m[1] ?? m[0]);
  return out;
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    if (seen.has(f.value)) return false;
    seen.add(f.value);
    return true;
  });
}

export function scanNotes(notes: Note[]): AgentReport {
  const report: AgentReport = { keys: [], emails: [], links: [], tasks: [], dates: [] };

  for (const note of notes) {
    if (EXCLUDED.has(note.title)) continue;
    const text = `${note.title}\n${note.content}`;

    for (const { name, label } of KEY_PATTERNS) {
      for (const m of text.matchAll(name)) {
        const raw = m[1] ?? m[0];
        // Mask all but the last 4 chars so secrets aren't re-displayed in full
        const masked = raw.length > 8 ? `${raw.slice(0, 4)}…${raw.slice(-4)}` : raw;
        report.keys.push({ value: `${label(m[0])}: \`${masked}\` — found in [[${note.title}]]`, noteTitle: note.title });
      }
    }
    for (const v of collect(text, EMAIL_RE)) report.emails.push({ value: v, noteTitle: note.title });
    for (const v of collect(text, URL_RE)) report.links.push({ value: v, noteTitle: note.title });
    for (const v of collect(note.content, TASK_RE)) report.tasks.push({ value: v, noteTitle: note.title });
    for (const v of collect(text, DATE_RE)) report.dates.push({ value: v, noteTitle: note.title });
  }

  report.keys = dedupe(report.keys);
  report.emails = dedupe(report.emails);
  report.links = dedupe(report.links);
  report.tasks = dedupe(report.tasks);
  report.dates = dedupe(report.dates);
  return report;
}

export function buildKeysNote(report: AgentReport): string {
  const lines = [
    `# ${AGENT_NOTE_TITLES.keys}`,
    '',
    '> Auto-compiled by the Note Agent. Secrets are **masked** — copy the full value from the source note it links to, and move live keys to a real password manager.',
    '',
    '## Found credentials',
    '',
  ];
  if (report.keys.length === 0) {
    lines.push('- _Nothing found yet — the agent scans for API keys, tokens, and `key = value` lines._');
  } else {
    for (const k of report.keys) lines.push(`- ${k.value}`);
  }
  lines.push('', '## Emails', '');
  if (report.emails.length === 0) lines.push('- _None found_');
  else for (const e of report.emails) lines.push(`- ${e.value} — [[${e.noteTitle}]]`);
  return lines.join('\n');
}

export function buildDigestNote(report: AgentReport): string {
  const lines = [
    `# ${AGENT_NOTE_TITLES.digest}`,
    '',
    `Last scan: ${new Date().toLocaleString()}`,
    '',
    '## Open tasks',
    '',
  ];
  if (report.tasks.length === 0) lines.push('- _No open tasks found_');
  else for (const t of report.tasks) lines.push(`- [ ] ${t.value} — [[${t.noteTitle}]]`);

  lines.push('', '## Links worth keeping', '');
  if (report.links.length === 0) lines.push('- _No links found_');
  else for (const l of report.links) lines.push(`- ${l.value} — [[${l.noteTitle}]]`);

  lines.push('', '## Dates mentioned', '');
  if (report.dates.length === 0) lines.push('- _No dates found_');
  else for (const d of report.dates) lines.push(`- ${d.value} — [[${d.noteTitle}]]`);
  return lines.join('\n');
}
