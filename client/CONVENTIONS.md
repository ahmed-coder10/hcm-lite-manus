# HCM Lite — frontend conventions (read me before adding a screen)

Stack: React 18 + Vite + Tailwind 3 + framer-motion + @tanstack/react-query + recharts + lucide-react.
Everything is dark ("Aurora Glass"): ink background, glass cards, violet→cyan accents.

## Must-use building blocks

- `src/components/ui.jsx` — `Button, IconButton, Card, CardHeader, Badge, Avatar, Input, Textarea, Select, Field, Modal, ConfirmDialog, Spinner, Skeleton, EmptyState, ErrorState, StatCard, PageHeader, Tabs, Progress, Table, Th, Td, Tr, cn`.
- `src/lib/api.js` — `api(path, {method, body})`, `get/post/patch/del`, `downloadFile(path, filename)`, `ApiError` with `.details` (field → message).
- `src/lib/format.js` — `PKR, number, pct, hoursFromMinutes, dateLabel, monthLabel, timeLabel, relativeTime, initials, titleCase, todayKey, currentMonth, STATUS_TONE, statusLabel`.
- `src/context/AuthContext.jsx` — `useAuth()` → `{ user, employee, role, isStaff, hasRole(...), settings, refreshSession }`.
- `src/context/ToastContext.jsx` — `const toast = useToast()` → `toast.success(title, description)`, `.error`, `.info`, `.warning`.
- Data: `useQuery({ queryKey, queryFn })` and `useMutation` from @tanstack/react-query; `queryClient.invalidateQueries`.

## Rules (judged on UI/UX)

1. One icon family (lucide-react). Never emoji as icons.
2. Every async button gets a loading state; disable while pending.
3. Every list has: skeleton while loading, `EmptyState` when empty, `ErrorState` with retry on failure.
4. Real `<label>` on every input (`Field` does this). Show errors next to the field using `error`.
5. Buttons are at least 40px tall (`size="md"` = 44px). Touch targets matter.
6. Mobile first: works at 375, 768, 1024, 1440. Tables scroll horizontally (`Table`), never break the page width.
7. Only animate `transform`/`opacity`, 150–300ms in the app shell (the landing page may be showier). Respect reduced motion.
8. Text contrast: use `text-text`, `text-text-muted`, `text-text-faint` on dark glass — never arbitrary grays.
9. Money through `PKR()`, dates through `dateLabel()`, times through `timeLabel()`.
10. Pages are `export default function XPage()`, wrapped in `<div className="space-y-6">`, and start with `<PageHeader ... />`.

## Page skeleton

```jsx
import { useQuery } from '@tanstack/react-query';
import { PageHeader, Card, Spinner, EmptyState } from '../../components/ui';
import { get } from '../../lib/api';

export default function ThingPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['thing'],
    queryFn: () => get('/thing'),
  });
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Module" title="Thing" description="..." />
      {isLoading ? <Skeleton className="h-40" /> : null}
      ...
    </div>
  );
}
```

API responses arrive already unwrapped: `get('/employees')` returns the data object itself (e.g. `{ items, total, page }`).
Errors: catch `err.message` (human readable) and `err.details` (field errors).
