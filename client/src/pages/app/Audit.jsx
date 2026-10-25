import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, RefreshCw, ScrollText, Search, X } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Select, Skeleton, cn } from '../../components/ui';
import { get } from '../../lib/api';
import { dateLabel, timeLabel, titleCase } from '../../lib/format';

const LIMITS = [50, 80, 120, 200];
const ROLE_TONE = { admin: 'rose', hr: 'cyan', employee: 'violet', system: 'faint' };

const DOT = {
  cyan: 'bg-cyan',
  violet: 'bg-violet',
  mint: 'bg-mint',
  rose: 'bg-rose',
  faint: 'bg-white/30',
  neutral: 'bg-white/20',
};

/** Colour the action chip by its verb. */
const actionTone = (action = '') => {
  const a = String(action).toLowerCase();
  if (/delete|reject|cancel|remove|terminate/.test(a)) return 'rose';
  if (/approve|finali[sz]e/.test(a)) return 'mint';
  if (/login|logout|sign_?in|sign_?out/.test(a)) return 'faint';
  if (/create|add|import|apply|check_?in/.test(a)) return 'cyan';
  if (/update|edit|change|reset|correct|deactivate|activate/.test(a)) return 'violet';
  return 'neutral';
};

const pretty = (value) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const shortId = (value = '') => {
  const s = String(value);
  return s.length > 12 ? `${s.slice(0, 8)}…` : s;
};

const roleLabel = (value) => (String(value || '').toLowerCase() === 'hr' ? 'HR' : titleCase(value || 'system'));

function JsonBlock({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="label-mono mb-1.5">{label}</p>
      <pre className="max-h-64 overflow-auto rounded-lg border border-white/10 bg-ink-950/70 p-3 font-mono text-[11px] leading-relaxed text-text-muted">
        {pretty(value)}
      </pre>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-3 sm:px-5" aria-hidden="true">
      <div className="w-[74px] shrink-0 space-y-1.5 sm:w-[92px]">
        <Skeleton className="h-2.5 w-14" />
        <Skeleton className="h-2.5 w-10" />
      </div>
      <Skeleton className="mt-1 h-2.5 w-2.5 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-2.5 w-1/3" />
      </div>
    </div>
  );
}

export default function Audit() {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(80);
  const [expanded, setExpanded] = useState({});

  const logsQuery = useQuery({
    queryKey: ['audit-logs', limit],
    queryFn: () => get(`/audit-logs?limit=${limit}`),
  });

  const rows = Array.isArray(logsQuery.data) ? logsQuery.data : [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.action, row.actorName, row.summary, row.entity, row.actorRole].some((value) =>
        String(value || '').toLowerCase().includes(q),
      ),
    );
  }, [rows, query]);

  const toggle = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Audit log"
        description="Every privileged action in one append-only timeline. Entries are written by the server and cannot be edited."
        actions={
          <>
            <div className="relative w-full sm:w-64">
              <label htmlFor="audit-search" className="sr-only">Filter audit entries</label>
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint"
                aria-hidden="true"
              />
              <Input
                id="audit-search"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by action, actor or summary…"
                className={cn('pl-9', Boolean(query) && 'pr-12')}
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear filter"
                  className="absolute right-0.5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-text-faint transition hover:bg-white/5 hover:text-text"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="audit-limit" className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
                Show
              </label>
              <Select
                id="audit-limit"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="w-[92px]"
              >
                {LIMITS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </Select>
            </div>

            <Button
              variant="secondary"
              icon={RefreshCw}
              loading={logsQuery.isFetching}
              onClick={() => logsQuery.refetch()}
            >
              Refresh
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-violet-soft">
              <ScrollText size={15} aria-hidden="true" />
            </span>
            <div>
              <p className="text-[13px] font-medium text-text">Recent activity</p>
              <p className="text-[11.5px] text-text-faint">
                {logsQuery.isLoading
                  ? 'Loading entries…'
                  : `${filtered.length} of ${rows.length} entries${query.trim() ? ` matching “${query.trim()}”` : ''}`}
              </p>
            </div>
          </div>

          <div className="hidden flex-wrap items-center gap-3 sm:flex">
            {[
              ['create', 'bg-cyan'],
              ['update', 'bg-violet'],
              ['approve', 'bg-mint'],
              ['delete', 'bg-rose'],
              ['login', 'bg-white/30'],
            ].map(([label, dot]) => (
              <span key={label} className="inline-flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-text-faint">
                <span className={cn('h-1.5 w-1.5 rounded-full', dot)} aria-hidden="true" />
                {label}
              </span>
            ))}
          </div>
        </div>

        {logsQuery.isLoading ? (
          <div className="divide-y divide-white/[0.04]">
            {[0, 1, 2, 3, 4, 5].map((i) => <RowSkeleton key={i} />)}
          </div>
        ) : logsQuery.isError ? (
          <ErrorState message={logsQuery.error?.message} onRetry={() => logsQuery.refetch()} />
        ) : filtered.length === 0 ? (
          rows.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="No audit entries yet"
              description="Create, approve or delete something and the server will record it here."
            />
          ) : (
            <EmptyState
              icon={Search}
              title="No entries match that filter"
              description="Try a different action, actor name or summary."
              action={
                <Button variant="secondary" onClick={() => setQuery('')} icon={X}>
                  Clear filter
                </Button>
              }
            />
          )
        ) : (
          <ol className="divide-y divide-white/[0.04]">
            {filtered.map((log) => {
              const open = Boolean(expanded[log.id]);
              const hasJson = log.before != null || log.after != null;
              const tone = actionTone(log.action);
              return (
                <li key={log.id}>
                  <button
                    type="button"
                    onClick={() => hasJson && toggle(log.id)}
                    aria-expanded={hasJson ? open : undefined}
                    disabled={!hasJson}
                    className={cn(
                      'flex w-full items-start gap-2.5 px-4 py-3 text-left transition sm:gap-3 sm:px-5',
                      hasJson ? 'cursor-pointer hover:bg-white/[0.03]' : 'cursor-default',
                    )}
                  >
                    <span className="w-[74px] shrink-0 pt-0.5 sm:w-[92px]">
                      <span className="block font-mono text-[10.5px] leading-tight text-text-muted sm:text-[11px]">
                        {dateLabel(log.createdAt, { withYear: false })}
                      </span>
                      <span className="mt-0.5 block font-mono text-[10px] leading-tight text-text-faint">
                        {timeLabel(log.createdAt)}
                      </span>
                    </span>

                    <span className="mt-1 flex shrink-0 flex-col items-center self-stretch" aria-hidden="true">
                      <span className={cn('h-2 w-2 rounded-full ring-4 ring-ink-950', DOT[tone])} />
                      <span className="mt-1 w-px flex-1 bg-white/[0.07]" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[13px] font-medium text-text">{log.actorName || 'system'}</span>
                        <Badge tone={ROLE_TONE[log.actorRole] || 'neutral'}>{roleLabel(log.actorRole)}</Badge>
                        <Badge tone={tone} className="max-w-full break-all font-mono text-[10.5px] tracking-tight">{log.action}</Badge>
                      </span>

                      <span className="mt-1 block break-words text-[12.5px] leading-relaxed text-text-muted">
                        {log.summary || 'No summary recorded'}
                      </span>

                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-text-faint">
                        <span>{log.entity || '—'}{log.entityId ? ` · ${shortId(log.entityId)}` : ''}</span>
                        {log.ip ? <span>· {log.ip}</span> : null}
                        {hasJson ? (
                          <span className="inline-flex items-center gap-1 normal-case tracking-normal text-violet-soft">
                            {open ? 'Hide changes' : 'View changes'}
                            {open ? <ChevronDown size={11} aria-hidden="true" /> : <ChevronRight size={11} aria-hidden="true" />}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>

                  {open && hasJson ? (
                    <div className="grid gap-3 border-t border-white/[0.04] bg-ink-950/40 px-4 pb-4 pt-3 sm:grid-cols-2 sm:px-5">
                      {log.before != null ? <JsonBlock label="Before" value={log.before} /> : null}
                      {log.after != null ? <JsonBlock label="After" value={log.after} /> : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
        <span>Read-only log</span>
        <span>·</span>
        <span>Admin only</span>
        <span>·</span>
        <span>Server timestamped</span>
      </p>
    </div>
  );
}
