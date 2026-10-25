import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell, BellOff, CheckCheck, ChevronDown, ChevronUp, Info, Megaphone, Pin, Plus, ShieldCheck, Trash2,
} from 'lucide-react';
import {
  Avatar, Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Field, Input, Modal,
  PageHeader, Select, Skeleton, Textarea, cn,
} from '../../components/ui';
import { del, get, patch, post } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { relativeTime, titleCase } from '../../lib/format';

const AUDIENCE = {
  all: { label: 'Everyone', tone: 'violet' },
  hr: { label: 'HR & Admin', tone: 'cyan' },
  employee: { label: 'Employees', tone: 'neutral' },
};

const ROLE_TONE = { admin: 'rose', hr: 'cyan', employee: 'violet' };

const EMPTY_FORM = { title: '', body: '', audience: 'all', pinned: false };

const isLongBody = (body = '') => body.length > 130 || body.includes('\n');

const roleLabel = (value) => (String(value || '').toLowerCase() === 'hr' ? 'HR' : titleCase(value || 'system'));

export default function Announcements() {
  const { role, user, isStaff, setUnread } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [composeOpen, setComposeOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [expanded, setExpanded] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);

  const announcementsQuery = useQuery({ queryKey: ['announcements'], queryFn: () => get('/announcements') });
  const notificationsQuery = useQuery({ queryKey: ['notifications'], queryFn: () => get('/notifications') });

  const announcements = useMemo(() => {
    const rows = Array.isArray(announcementsQuery.data) ? [...announcementsQuery.data] : [];
    return rows.sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });
  }, [announcementsQuery.data]);

  const notifications = Array.isArray(notificationsQuery.data?.items) ? notificationsQuery.data.items : [];
  const unread = Number(notificationsQuery.data?.unread) || 0;

  /* ------------------------------- mutations ------------------------------ */

  const create = useMutation({
    mutationFn: (payload) => post('/announcements', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('Announcement published', 'Everyone in the audience has been notified in-app.');
      setComposeOpen(false);
      setForm(EMPTY_FORM);
      setErrors({});
    },
    onError: (err) => {
      const details = err.details || {};
      setErrors(Object.keys(details).length ? details : { form: err.message });
      toast.error('Could not publish', err.message);
    },
  });

  const remove = useMutation({
    mutationFn: (id) => del(`/announcements/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      toast.success('Announcement deleted', 'It has been removed from the feed.');
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast.error('Could not delete', err.message);
      setDeleteTarget(null);
    },
  });

  const markAll = useMutation({
    mutationFn: () => patch('/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setUnread(0);
      toast.success('All caught up', 'Every notification is marked as read.');
    },
    onError: (err) => toast.error('Could not mark all read', err.message),
  });

  const readOne = useMutation({
    mutationFn: (n) => patch(`/notifications/${n.id}/read`),
    onSuccess: (data, n) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      if (typeof data?.unread === 'number') setUnread(data.unread);
      if (n?.link) navigate(n.link);
    },
    onError: (err) => toast.error('Could not open notification', err.message),
  });

  /* -------------------------------- handlers ------------------------------ */

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const openCompose = () => {
    setForm(EMPTY_FORM);
    setErrors({});
    setComposeOpen(true);
  };

  const closeCompose = () => {
    if (create.isPending) return;
    setComposeOpen(false);
    setErrors({});
  };

  const submitCompose = () => {
    const next = {};
    if (form.title.trim().length < 3) next.title = 'Add a title of at least 3 characters';
    if (form.body.trim().length < 5) next.body = 'Add a message of at least 5 characters';
    setErrors(next);
    if (Object.keys(next).length) return;
    create.mutate({
      title: form.title.trim(),
      body: form.body.trim(),
      audience: form.audience,
      pinned: Boolean(form.pinned),
    });
  };

  const toggleExpanded = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const canDelete = (item) => isStaff && (role === 'admin' || item.authorName === user?.name);

  const openNotification = (n) => {
    if (n.read) {
      if (n.link) navigate(n.link);
      return;
    }
    readOne.mutate(n);
  };

  /* --------------------------------- render ------------------------------- */

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Announcements"
        description={
          isStaff
            ? 'Post an update to the whole company or one audience. Every post notifies its audience in-app and is written to the audit log.'
            : 'Company updates from HR and Admin. This list is read-only for your account.'
        }
        actions={isStaff ? <Button icon={Plus} onClick={openCompose}>New announcement</Button> : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        {/* ------------------------------- feed ------------------------------- */}
        <section aria-label="Announcements feed" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="label-mono">Feed</p>
            <p className="text-[11.5px] text-text-faint">
              {announcementsQuery.isLoading ? 'Loading posts…' : `${announcements.length} post${announcements.length === 1 ? '' : 's'}`}
            </p>
          </div>

          {announcementsQuery.isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Card key={i} className="p-4 sm:p-5">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="mt-3 h-4 w-2/3" />
                  <Skeleton className="mt-3 h-3 w-full" />
                  <Skeleton className="mt-2 h-3 w-5/6" />
                  <Skeleton className="mt-4 h-3 w-1/3" />
                </Card>
              ))}
            </div>
          ) : announcementsQuery.isError ? (
            <Card>
              <ErrorState message={announcementsQuery.error?.message} onRetry={() => announcementsQuery.refetch()} />
            </Card>
          ) : announcements.length === 0 ? (
            <Card>
              <EmptyState
                icon={Megaphone}
                title="No announcements yet"
                description={
                  isStaff
                    ? 'Write the first update — everyone in the audience gets an in-app notification.'
                    : 'Company updates from HR and Admin will appear here.'
                }
                action={isStaff ? <Button icon={Plus} onClick={openCompose}>New announcement</Button> : null}
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {announcements.map((item) => {
                const meta = AUDIENCE[item.audience] || { label: titleCase(item.audience), tone: 'neutral' };
                const open = Boolean(expanded[item.id]);
                const long = isLongBody(item.body);
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Card as="article" className={cn('overflow-hidden', item.pinned ? 'border-violet/25' : undefined)}>
                      <div className="p-4 sm:p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                              {item.pinned ? (
                                <Badge tone="amber">
                                  <Pin size={10} aria-hidden="true" /> Pinned
                                </Badge>
                              ) : null}
                              <Badge tone={meta.tone}>{meta.label}</Badge>
                            </div>
                            <h2 className="font-display text-[15px] font-semibold leading-snug text-text sm:text-base">
                              {item.title}
                            </h2>
                          </div>

                          {canDelete(item) ? (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(item)}
                              aria-label={`Delete announcement: ${item.title}`}
                              title="Delete announcement"
                              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 text-text-faint transition hover:border-rose/30 hover:bg-rose/10 hover:text-rose"
                            >
                              <Trash2 size={15} aria-hidden="true" />
                            </button>
                          ) : null}
                        </div>

                        <p
                          className={cn(
                            'mt-2 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-text-muted',
                            long && !open ? 'line-clamp-3' : undefined,
                          )}
                        >
                          {item.body}
                        </p>

                        {long ? (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(item.id)}
                            aria-expanded={open}
                            className="mt-1 inline-flex min-h-[40px] items-center gap-1 text-[12.5px] font-medium text-violet-soft transition hover:text-text"
                          >
                            {open ? 'Show less' : 'Read more'}
                            {open ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
                          </button>
                        ) : null}
                      </div>

                      <footer className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-white/[0.06] px-4 py-2.5 sm:px-5">
                        <div className="flex min-w-0 items-center gap-2">
                          <Avatar name={item.authorName || 'HCM Lite'} size={22} />
                          <span className="min-w-0 truncate text-[12.5px] text-text-muted">{item.authorName || 'HCM Lite'}</span>
                          <Badge tone={ROLE_TONE[item.authorRole] || 'neutral'}>{roleLabel(item.authorRole)}</Badge>
                        </div>
                        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
                          {relativeTime(item.publishedAt)}
                        </span>
                      </footer>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>

        {/* ---------------------------- right rail ---------------------------- */}
        <aside className="space-y-4 lg:sticky lg:top-20">
          <Card className="overflow-hidden">
            <CardHeader
              icon={Bell}
              title="Notifications"
              subtitle={unread ? `${unread} unread` : 'You are all caught up'}
              action={
                unread > 0 ? (
                  <Button
                    variant="ghost"
                    size="md"
                    icon={CheckCheck}
                    loading={markAll.isPending}
                    onClick={() => markAll.mutate()}
                    className="px-2.5 text-[12px]"
                  >
                    Mark all read
                  </Button>
                ) : null
              }
            />

            {notificationsQuery.isLoading ? (
              <div className="space-y-3 px-4 py-4" aria-hidden="true">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ) : notificationsQuery.isError ? (
              <div className="px-2 py-2">
                <ErrorState message={notificationsQuery.error?.message} onRetry={() => notificationsQuery.refetch()} />
              </div>
            ) : notifications.length === 0 ? (
              <EmptyState
                icon={BellOff}
                title="No notifications yet"
                description="Publishing an announcement or an approval will land here."
                className="py-8"
              />
            ) : (
              <ul className="max-h-[420px] overflow-y-auto">
                {notifications.slice(0, 8).map((n) => (
                  <li key={n.id} className="border-b border-white/[0.04] last:border-b-0">
                    <button
                      type="button"
                      onClick={() => openNotification(n)}
                      className="flex w-full items-start gap-2.5 px-4 py-3 text-left transition hover:bg-white/[0.03]"
                    >
                      <span
                        className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', n.read ? 'bg-white/15' : 'bg-cyan')}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-[12.5px]', n.read ? 'text-text-muted' : 'font-medium text-text')}>
                          {n.title}
                          {!n.read ? <span className="sr-only"> (unread)</span> : null}
                        </span>
                        {n.body ? (
                          <span className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-text-faint">{n.body}</span>
                        ) : null}
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-text-faint">
                          <span>{relativeTime(n.createdAt)}</span>
                          {n.type ? <span>· {titleCase(n.type)}</span> : null}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <p className="mb-2.5 flex items-center gap-1.5">
              <Info size={13} className="text-cyan-soft" aria-hidden="true" />
              <span className="label-mono">Who sees what</span>
            </p>
            <ul className="space-y-2 text-[12px] leading-relaxed text-text-muted">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet" aria-hidden="true" />
                <span><span className="text-text">Everyone</span> — all active logins.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan" aria-hidden="true" />
                <span><span className="text-text">HR &amp; Admin</span> — staff only, hidden from employees.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/40" aria-hidden="true" />
                <span><span className="text-text">Employees</span> — employee logins only.</span>
              </li>
            </ul>
            <p className="mt-3 flex items-start gap-1.5 border-t border-white/[0.06] pt-3 text-[11.5px] leading-relaxed text-text-faint">
              <ShieldCheck size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
              Audience filtering and delete permissions are enforced by the server, not this screen.
            </p>
          </Card>
        </aside>
      </div>

      {/* ------------------------------ compose ------------------------------ */}
      <Modal
        open={composeOpen}
        onClose={closeCompose}
        title="New announcement"
        description="Everyone in the chosen audience receives an in-app notification."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={closeCompose} disabled={create.isPending}>Cancel</Button>
            <Button icon={Megaphone} loading={create.isPending} onClick={submitCompose}>
              Publish
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitCompose();
          }}
          className="space-y-4"
          noValidate
        >
          {errors.form ? (
            <div role="alert" className="rounded-xl border border-rose/30 bg-rose/10 px-3.5 py-3 text-[13px] text-rose">
              {errors.form}
            </div>
          ) : null}

          <Field label="Title" error={errors.title} required>
            {(props) => (
              <Input
                {...props}
                value={form.title}
                onChange={(e) => setField('title', e.target.value)}
                maxLength={120}
                placeholder="Office timing change from Monday"
              />
            )}
          </Field>

          <Field label="Message" error={errors.body} hint={`${form.body.length}/1000 characters`} required>
            {(props) => (
              <Textarea
                {...props}
                rows={6}
                value={form.body}
                onChange={(e) => setField('body', e.target.value)}
                maxLength={1000}
                placeholder="Give people the details: what changes, from when, and what they need to do."
              />
            )}
          </Field>

          <Field label="Audience">
            {(props) => (
              <Select {...props} value={form.audience} onChange={(e) => setField('audience', e.target.value)}>
                <option value="all">Everyone</option>
                <option value="hr">HR &amp; Admin only</option>
                <option value="employee">Employees only</option>
              </Select>
            )}
          </Field>

          <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 transition hover:border-white/20">
            <input
              type="checkbox"
              checked={form.pinned}
              onChange={(e) => setField('pinned', e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-white/20 bg-ink-900 accent-violet"
            />
            <span>
              <span className="block text-[13px] font-medium text-text">Pin to the top</span>
              <span className="block text-[11.5px] leading-snug text-text-faint">
                Pinned posts stay at the top of the feed.
              </span>
            </span>
          </label>

          <p className="flex items-center gap-1.5 text-[11.5px] text-text-faint">
            <ShieldCheck size={12} aria-hidden="true" />
            Publishing is recorded in the audit log.
          </p>

          <button type="submit" tabIndex={-1} className="sr-only">Publish announcement</button>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => (remove.isPending ? null : setDeleteTarget(null))}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
        title="Delete announcement?"
        description={
          deleteTarget
            ? `“${deleteTarget.title}” will be removed from the feed for everyone who can see it.`
            : undefined
        }
        confirmLabel="Delete announcement"
        loading={remove.isPending}
      />
    </div>
  );
}
