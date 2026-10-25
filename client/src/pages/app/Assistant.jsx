import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowUpRight, BarChart3, Bot, Cpu, Gauge, Info, RefreshCw, RotateCcw, Send,
  ShieldCheck, Sparkles, TrendingUp,
} from 'lucide-react';
import { Badge, Button, Card, CardHeader, ErrorState, Skeleton, Spinner, Textarea, cn } from '../../components/ui';
import { get, post } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { titleCase } from '../../lib/format';

const MAX_QUESTION = 500;

const STAFF_SUGGESTIONS = [
  'How many active employees do we have?',
  'Who came late most often this month?',
  "What is this month's attendance rate?",
  'Summarize the dashboard',
  "What is this month's payroll net?",
  'Who is on leave today?',
];

const EMPLOYEE_SUGGESTIONS = [
  'How many sick leaves do I have left?',
  'What is my last payslip?',
  'Who is on leave today?',
  'I need next Monday off',
  'How many times was I late this month?',
];

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const roleLabel = (value) => (String(value || '').toLowerCase() === 'hr' ? 'HR' : titleCase(value || 'employee'));

const toAssistantMessage = (data) => ({
  id: newId(),
  role: 'assistant',
  text: data?.answer || 'I could not find an answer to that.',
  toolCalls: Array.isArray(data?.toolCalls) ? data.toolCalls : [],
  aiGenerated: Boolean(data?.aiGenerated),
  model: data?.model || null,
  degraded: Boolean(data?.degraded),
});

const toolTitle = (call) => {
  try {
    return `${call.name}(${JSON.stringify(call.args || {})})\n→ ${JSON.stringify(call.result).slice(0, 400)}`;
  } catch {
    return call.name;
  }
};

/* ------------------------------- one message ------------------------------ */

function MessageBubble({ message }) {
  if (message.role === 'user') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="flex justify-end"
      >
        <div className="max-w-[88%] rounded-2xl rounded-br-md border border-violet/30 bg-violet-deep px-3.5 py-2.5 shadow-[0_12px_30px_-18px_rgba(91,62,232,0.9)] sm:max-w-[75%]">
          <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-white">{message.text}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="flex items-start gap-2.5"
    >
      <span
        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-violet/25 bg-violet/15 text-violet-soft"
        aria-hidden="true"
      >
        <Bot size={14} />
      </span>
      <div className="min-w-0 max-w-[88%] sm:max-w-[82%]">
        <div className="glass rounded-2xl rounded-tl-md border-white/10 bg-white/[0.03] px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-text">{message.text}</p>

          {message.toolCalls?.length ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] pt-2">
              <span className="label-mono">Tools</span>
              {message.toolCalls.map((call, index) => (
                <span
                  key={`${call.name}-${index}`}
                  title={toolTitle(call)}
                  className="inline-flex cursor-help items-center rounded-md border border-cyan/20 bg-cyan/[0.07] px-1.5 py-0.5 font-mono text-[10.5px] text-cyan-soft"
                >
                  {call.name}()
                </span>
              ))}
            </div>
          ) : null}

          {message.degraded ? (
            <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber/25 bg-amber/[0.07] px-2.5 py-1.5 text-[11.5px] leading-snug text-amber">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
              AI service unavailable, this answer came from local rules.
            </div>
          ) : null}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
          <span className={cn('inline-flex items-center gap-1', message.aiGenerated ? 'text-violet-soft' : 'text-text-faint')}>
            {message.aiGenerated ? <Sparkles size={10} aria-hidden="true" /> : <Cpu size={10} aria-hidden="true" />}
            {message.aiGenerated ? 'AI-generated' : 'local rules'}
          </span>
          {message.model ? <span>· {message.model}</span> : null}
        </div>
      </div>
    </motion.div>
  );
}

/* -------------------------------- welcome -------------------------------- */

function WelcomePanel({ role, onPick, disabled }) {
  const suggestions = role === 'employee' ? EMPLOYEE_SUGGESTIONS : STAFF_SUGGESTIONS;

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center sm:py-6">
      <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-gradient-to-br from-violet/25 to-cyan/10 text-cyan-soft shadow-glow">
        <Sparkles size={22} aria-hidden="true" />
      </span>
      <div className="max-w-lg">
        <h2 className="font-display text-lg font-semibold text-text">Ask about your own people data</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
          {role === 'employee'
            ? 'Leave balances, your payslip and your own attendance. Questions about other employees are refused — that is the role scope working.'
            : 'Headcount, attendance, late-comers, leave and payroll — read straight from this workspace.'}
        </p>
      </div>

      <div className="grid w-full max-w-2xl gap-2 text-left sm:grid-cols-2">
        {suggestions.map((q) => (
          <button
            key={q}
            type="button"
            disabled={disabled}
            onClick={() => onPick(q)}
            className="group flex min-h-[44px] items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left text-[13px] text-text-muted transition hover:border-violet/40 hover:bg-white/[0.06] hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="leading-snug">{q}</span>
            <ArrowUpRight size={14} className="shrink-0 text-text-faint transition group-hover:text-cyan-soft" aria-hidden="true" />
          </button>
        ))}
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-text-faint">
        <ShieldCheck size={12} aria-hidden="true" />
        The assistant can only read data — it never changes records.
      </p>
    </div>
  );
}

/* --------------------------------- rail ---------------------------------- */

function SummaryRail({ summaryQuery, status }) {
  const insights = Array.isArray(summaryQuery.data?.insights) ? summaryQuery.data.insights : [];

  return (
    <aside className="hidden lg:sticky lg:top-20 lg:flex lg:flex-col lg:gap-4">
      <Card>
        <CardHeader
          icon={TrendingUp}
          title="Dashboard summary"
          subtitle="3–5 insights from your KPIs"
          action={
            <Button
              variant="ghost"
              size="md"
              className="w-11 !px-0"
              aria-label="Refresh dashboard summary"
              title="Refresh dashboard summary"
              icon={RefreshCw}
              loading={summaryQuery.isFetching}
              onClick={() => summaryQuery.refetch()}
            />
          }
        />
        <div className="px-5 py-4">
          {summaryQuery.isLoading ? (
            <div className="space-y-3" aria-hidden="true">
              <Skeleton className="h-3 w-11/12" />
              <Skeleton className="h-3 w-10/12" />
              <Skeleton className="h-3 w-9/12" />
              <Skeleton className="h-3 w-7/12" />
            </div>
          ) : summaryQuery.isError ? (
            <ErrorState message={summaryQuery.error?.message} onRetry={() => summaryQuery.refetch()} />
          ) : insights.length ? (
            <ul className="space-y-2.5">
              {insights.map((insight, index) => (
                <li key={`${index}-${String(insight).slice(0, 12)}`} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-text-muted">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-br from-violet to-cyan" aria-hidden="true" />
                  <span>{String(insight).replace(/^[-*•]\s*/, '')}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-text-faint">No insights right now. Refresh in a moment.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-5 py-3">
          {summaryQuery.data ? (
            <Badge tone={summaryQuery.data.aiGenerated ? 'violet' : 'faint'} dot>
              {summaryQuery.data.aiGenerated ? 'AI-generated' : 'local rules'}
            </Badge>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">Summary</span>
          )}
          <Button as={Link} to="/app/analytics" variant="secondary" size="md" icon={BarChart3} className="px-3 text-[12.5px]">
            Analytics
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <p className="label-mono mb-2.5">How this works</p>
        <ul className="space-y-2.5 text-[12px] leading-relaxed text-text-muted">
          <li className="flex items-start gap-2">
            <ShieldCheck size={13} className="mt-0.5 shrink-0 text-cyan-soft" aria-hidden="true" />
            <span>Tools run with your role scope — the model cannot read data you cannot.</span>
          </li>
          <li className="flex items-start gap-2">
            <Cpu size={13} className="mt-0.5 shrink-0 text-violet-soft" aria-hidden="true" />
            <span>
              Model <span className="font-mono text-text">{status?.model || '—'}</span> via{' '}
              <span className="font-mono text-text">{status?.provider || '—'}</span>.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Gauge size={13} className="mt-0.5 shrink-0 text-amber" aria-hidden="true" />
            <span>{status?.limitPerHour ?? 20} questions per hour, per login. Every answer is logged.</span>
          </li>
        </ul>
      </Card>
    </aside>
  );
}

/* --------------------------------- page ---------------------------------- */

export default function Assistant() {
  const { role, isStaff } = useAuth();
  const toast = useToast();

  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [composerError, setComposerError] = useState('');
  const [rateLimited, setRateLimited] = useState(false);

  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  const statusQuery = useQuery({ queryKey: ['ai-status'], queryFn: () => get('/ai/status') });
  const status = statusQuery.data;

  const summaryQuery = useQuery({
    queryKey: ['ai-summary', role],
    queryFn: () => post('/ai/summary'),
    enabled: isStaff,
    staleTime: 5 * 60_000,
    retry: 0,
  });

  const chat = useMutation({
    mutationFn: (text) => post('/ai/chat', { question: text }),
    onSuccess: (data) => {
      setMessages((prev) => [...prev, toAssistantMessage(data)]);
      setComposerError('');
      setRateLimited(false);
      if (data?.degraded) {
        toast.warning('AI service unavailable', 'This answer came from the local rules engine.');
      }
    },
    onError: (err) => {
      const message = err?.message || 'The assistant could not answer that. Try again.';
      const limited = err?.status === 429;
      setComposerError(message);
      setRateLimited(limited);
      toast.error(limited ? 'AI limit reached' : 'Could not get an answer', message);
    },
  });

  const ask = (text, { appendUser = true } = {}) => {
    if (chat.isPending) return;
    const trimmed = String(text || '').trim();
    if (trimmed.length < 2) return;
    setComposerError('');
    setRateLimited(false);
    if (appendUser) {
      setMessages((prev) => [...prev, { id: newId(), role: 'user', text: trimmed }]);
      setQuestion('');
    }
    chat.mutate(trimmed);
  };

  const lastQuestion = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'user') return messages[i].text;
    }
    return '';
  }, [messages]);

  /* auto-scroll to the newest message */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [messages.length, chat.isPending]);

  /* grow the textarea up to ~5 lines */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [question]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      ask(question);
    }
  };

  const resetChat = () => {
    setMessages([]);
    setQuestion('');
    setComposerError('');
    setRateLimited(false);
    toast.info('New chat started', 'Your previous questions are cleared from this screen.');
  };

  const configured = status?.configured;
  const showLocalBanner = statusQuery.isSuccess && configured === false;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <Card className="flex h-[calc(100dvh-9rem)] min-h-[440px] flex-col overflow-hidden">
        {/* identity + model chips */}
        <header className="shrink-0 border-b border-white/[0.07] px-4 py-3.5 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet to-cyan text-ink-950 shadow-glow">
                <Sparkles size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-base font-semibold tracking-tight text-text sm:text-lg">HCM Lite Assistant</h1>
                  <Badge tone={statusQuery.isLoading ? 'faint' : statusQuery.isError ? 'faint' : configured ? 'violet' : 'amber'} dot>
                    {statusQuery.isLoading
                      ? 'Checking AI…'
                      : statusQuery.isError
                        ? 'AI status unknown'
                        : configured
                          ? 'AI-generated'
                          : 'Local rules'}
                  </Badge>
                </div>
                <p className="mt-1 text-[12.5px] leading-snug text-text-muted">
                  Answers come from your own records, scoped to your role.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge tone="cyan" className="max-w-full break-all font-mono">
                    {statusQuery.isLoading
                      ? 'loading model…'
                      : `${status?.model || 'model unknown'}${status?.provider ? ` · ${status.provider}` : ''}`}
                  </Badge>
                  <Badge tone="neutral">{roleLabel(role)} scope</Badge>
                  {status ? (
                    <Badge tone="faint" className="font-mono">
                      <Gauge size={10} aria-hidden="true" /> {status.limitPerHour}/hr
                    </Badge>
                  ) : null}
                </div>
              </div>
            </div>

            {messages.length ? (
              <Button
                variant="ghost"
                size="md"
                className="w-11 shrink-0 !px-0"
                aria-label="Start a new chat"
                title="Start a new chat"
                icon={RotateCcw}
                onClick={resetChat}
              />
            ) : null}
          </div>
        </header>

        {showLocalBanner ? (
          <div
            className="flex shrink-0 items-start gap-2 border-b border-amber/20 bg-amber/[0.06] px-4 py-2.5 text-[12px] leading-snug text-amber sm:px-5"
            role="status"
          >
            <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
            AI key not configured — answering from the local rules engine. The numbers still come from your live records.
          </div>
        ) : null}

        {/* transcript */}
        <div
          ref={scrollRef}
          tabIndex={0}
          role="log"
          aria-live="polite"
          aria-label="Assistant conversation"
          className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-5"
        >
          {messages.length === 0 && !chat.isPending ? (
            <WelcomePanel role={role} disabled={chat.isPending} onPick={(q) => ask(q)} />
          ) : (
            messages.map((message) => <MessageBubble key={message.id} message={message} />)
          )}

          {chat.isPending ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="flex items-start gap-2.5"
            >
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-violet/25 bg-violet/15 text-violet-soft" aria-hidden="true">
                <Bot size={14} />
              </span>
              <div className="glass flex items-center gap-2 rounded-2xl rounded-tl-md px-3.5 py-2.5 text-[12.5px] text-text-muted">
                <Spinner size={13} />
                Pulling your numbers…
              </div>
            </motion.div>
          ) : null}
        </div>

        {/* inline error (429 included) */}
        {composerError ? (
          <div className="shrink-0 px-3 pt-2 sm:px-4">
            <div
              role="alert"
              className={cn(
                'flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[12.5px] leading-snug',
                rateLimited ? 'border-amber/30 bg-amber/10 text-amber' : 'border-rose/30 bg-rose/10 text-rose',
              )}
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p>{composerError}</p>
                {rateLimited ? (
                  <p className="mt-0.5 text-[11.5px] opacity-80">
                    Limit: {status?.limitPerHour ?? 20} questions per hour. Try again after the hour resets.
                  </p>
                ) : lastQuestion ? (
                  <p className="mt-0.5 text-[11.5px] opacity-80">Your question is still in the transcript above — retry when you are ready.</p>
                ) : null}
              </div>
              {lastQuestion ? (
                <button
                  type="button"
                  onClick={() => ask(lastQuestion, { appendUser: false })}
                  disabled={chat.isPending}
                  className="min-h-[40px] shrink-0 rounded-lg border border-current/30 px-3 text-[12px] font-medium transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Retry
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* composer */}
        <div className="shrink-0 border-t border-white/[0.07] bg-ink-950/30 p-3 sm:p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
          >
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <label htmlFor="assistant-question" className="sr-only">
                  Ask the assistant a question
                </label>
                <Textarea
                  id="assistant-question"
                  ref={textareaRef}
                  rows={1}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={onKeyDown}
                  maxLength={MAX_QUESTION}
                  placeholder={
                    role === 'employee'
                      ? 'Ask about your leave, payslip or attendance…'
                      : 'Ask about headcount, attendance, leave or payroll…'
                  }
                  aria-describedby="assistant-composer-hint"
                  className="max-h-[132px] min-h-[48px] resize-none py-3 leading-relaxed"
                />
              </div>
              <Button
                type="submit"
                size="lg"
                loading={chat.isPending}
                disabled={question.trim().length < 2}
                aria-label="Send question"
                title="Send question"
                icon={Send}
                className="h-[48px] w-[48px] shrink-0 !px-0"
              />
            </div>
            <div id="assistant-composer-hint" className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[11px] text-text-faint">
              <span>{chat.isPending ? 'Answering from your records…' : 'Enter to send · Shift + Enter for a new line'}</span>
              <span className="font-mono">
                {question.length}/{MAX_QUESTION}
              </span>
            </div>
          </form>
        </div>
      </Card>

      {isStaff ? <SummaryRail summaryQuery={summaryQuery} status={status} /> : null}
    </div>
  );
}
