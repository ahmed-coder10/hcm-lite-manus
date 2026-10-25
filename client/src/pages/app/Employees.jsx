import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle, Briefcase, Check, CheckCircle2, ChevronLeft, ChevronRight, Copy, Download, Eye,
  FileSpreadsheet, Landmark, Pencil, PhoneCall, Plus, Search, ShieldAlert, Upload, UploadCloud,
  UserPlus, UserRound, Users, Wallet, X,
} from 'lucide-react';
import {
  Avatar, Badge, Button, Card, cn, EmptyState, ErrorState, Field, IconButton, Input, Modal,
  PageHeader, Select, Skeleton, Table, Tabs, Td, Textarea, Th, Tr,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { downloadFile, get, patch, post } from '../../lib/api';
import { PKR, STATUS_TONE, dateLabel, number, statusLabel, titleCase, todayKey } from '../../lib/format';

/* -------------------------------------------------------------------------- */
/*                                   Config                                   */
/* -------------------------------------------------------------------------- */

const STATUS_FILTERS = [
  { value: '', label: 'Active & probation' },
  { value: 'active', label: 'Active' },
  { value: 'probation', label: 'Probation' },
  { value: 'all', label: 'All statuses' },
  { value: 'resigned', label: 'Resigned' },
  { value: 'terminated', label: 'Terminated' },
];

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full time' },
  { value: 'part_time', label: 'Part time' },
  { value: 'contract', label: 'Contract' },
  { value: 'intern', label: 'Intern' },
];

const STATUS_VALUES = [
  { value: 'active', label: 'Active' },
  { value: 'probation', label: 'Probation' },
  { value: 'resigned', label: 'Resigned' },
  { value: 'terminated', label: 'Terminated' },
];

const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'undisclosed', label: 'Prefer not to say' },
];

const employmentLabel = (value) =>
  EMPLOYMENT_TYPES.find((item) => item.value === value)?.label || titleCase(value || '—');

const toInputDate = (value) => (value ? String(value).slice(0, 10) : '');

const emptyEmployeeForm = () => ({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  city: '',
  gender: 'undisclosed',
  dateOfBirth: '',
  cnic: '',
  address: '',
  joinDate: todayKey(),
  status: 'active',
  employmentType: 'full_time',
  departmentId: '',
  designationId: '',
  managerId: '',
  basic: '',
  houseRentPct: '40',
  medicalPct: '10',
  otherAllowances: '',
  bankName: '',
  accountTitle: '',
  accountNumber: '',
  emergencyName: '',
  emergencyPhone: '',
  emergencyRelation: '',
  notes: '',
});

const formFromEmployee = (employee) => {
  if (!employee) return emptyEmployeeForm();
  const salary = employee.salary || {};
  const emergency = employee.emergencyContact || {};
  return {
    firstName: employee.firstName || '',
    lastName: employee.lastName || '',
    email: employee.email || '',
    phone: employee.phone || '',
    city: employee.city || '',
    gender: employee.gender || 'undisclosed',
    dateOfBirth: toInputDate(employee.dateOfBirth),
    cnic: employee.cnic || '',
    address: employee.address || '',
    joinDate: toInputDate(employee.joinDate) || todayKey(),
    status: employee.status || 'active',
    employmentType: employee.employmentType || 'full_time',
    departmentId: employee.departmentId || '',
    designationId: employee.designationId || '',
    managerId: employee.managerId || '',
    basic: salary.basic == null ? '' : String(salary.basic),
    houseRentPct: salary.houseRentPct == null ? '40' : String(salary.houseRentPct),
    medicalPct: salary.medicalPct == null ? '10' : String(salary.medicalPct),
    otherAllowances: salary.otherAllowances == null ? '' : String(salary.otherAllowances),
    bankName: salary.bankName || '',
    accountTitle: salary.accountTitle || '',
    accountNumber: salary.accountNumber || '',
    emergencyName: emergency.name || '',
    emergencyPhone: emergency.phone || '',
    emergencyRelation: emergency.relation || '',
    notes: employee.notes || '',
  };
};

const validateEmployeeForm = (form) => {
  const errors = {};
  if (!form.firstName.trim()) errors.firstName = 'First name is required';
  if (!form.lastName.trim()) errors.lastName = 'Last name is required';
  if (!form.email.trim()) errors.email = 'Email is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email address';

  if (!form.joinDate) errors.joinDate = 'Join date is required';

  const basic = Number(form.basic);
  if (form.basic === '' || !Number.isFinite(basic) || basic <= 0) {
    errors.basic = 'Basic salary must be greater than 0';
  }

  const rent = Number(form.houseRentPct);
  if (form.houseRentPct !== '' && (!Number.isFinite(rent) || rent < 0 || rent > 100)) {
    errors.houseRentPct = 'Use a value from 0 to 100';
  }
  const medical = Number(form.medicalPct);
  if (form.medicalPct !== '' && (!Number.isFinite(medical) || medical < 0 || medical > 100)) {
    errors.medicalPct = 'Use a value from 0 to 100';
  }
  const other = Number(form.otherAllowances);
  if (form.otherAllowances !== '' && (!Number.isFinite(other) || other < 0)) {
    errors.otherAllowances = 'Cannot be negative';
  }
  return errors;
};

const toEmployeePayload = (form, employee) => {
  const payload = {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    email: form.email.trim(),
    phone: form.phone.trim(),
    address: form.address.trim(),
    city: form.city.trim(),
    gender: form.gender,
    dateOfBirth: form.dateOfBirth || null,
    cnic: form.cnic.trim(),
    joinDate: form.joinDate,
    status: form.status,
    employmentType: form.employmentType,
    departmentId: form.departmentId || null,
    designationId: form.designationId || null,
    managerId: form.managerId || null,
    basic: Number(form.basic) || 0,
    houseRentPct: Number(form.houseRentPct) || 0,
    medicalPct: Number(form.medicalPct) || 0,
    otherAllowances: Number(form.otherAllowances) || 0,
    bankName: form.bankName.trim(),
    accountTitle: form.accountTitle.trim(),
    accountNumber: form.accountNumber.trim(),
    emergencyName: form.emergencyName.trim(),
    emergencyPhone: form.emergencyPhone.trim(),
    emergencyRelation: form.emergencyRelation.trim(),
    notes: form.notes.trim(),
  };
  // Keep the exit date in sync when the status changes through the form. The
  // dedicated status action does the same thing server-side.
  if (!employee || employee.status !== form.status) {
    payload.exitDate = ['resigned', 'terminated'].includes(form.status) ? todayKey() : null;
  }
  return payload;
};

const grossPreview = (form) => {
  const basic = Number(form.basic) || 0;
  const hra = Math.round(basic * ((Number(form.houseRentPct) || 0) / 100));
  const medical = Math.round(basic * ((Number(form.medicalPct) || 0) / 100));
  const other = Number(form.otherAllowances) || 0;
  return { basic, hra, medical, other, gross: basic + hra + medical + other };
};

/* -------------------------------------------------------------------------- */
/*                               Small helpers                                */
/* -------------------------------------------------------------------------- */

function SectionTitle({ icon: Icon, children }) {
  return (
    <h4 className="mb-3 flex items-center gap-2 font-display text-[13px] font-semibold text-text">
      {Icon ? <Icon size={14} className="text-text-faint" aria-hidden="true" /> : null}
      {children}
    </h4>
  );
}

function SummaryStat({ label, value, tone = 'neutral' }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-text-faint">{label}</p>
      <p
        className={cn(
          'mt-0.5 font-display text-lg font-semibold',
          tone === 'mint' ? 'text-mint' : tone === 'rose' ? 'text-rose' : 'text-text',
        )}
      >
        {value}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Add / edit employee                            */
/* -------------------------------------------------------------------------- */

export function EmployeeFormModal({ open, onClose, employee = null, onSaved }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const isEdit = Boolean(employee?.id);

  const [form, setForm] = useState(emptyEmployeeForm);
  const [errors, setErrors] = useState({});
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);

  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: () => get('/org/departments'),
    enabled: open,
    staleTime: 60_000,
  });
  const designations = useQuery({
    queryKey: ['designations'],
    queryFn: () => get('/org/designations'),
    enabled: open,
    staleTime: 60_000,
  });
  const managers = useQuery({
    queryKey: ['employee-options'],
    queryFn: () => get('/employees/options'),
    enabled: open,
    staleTime: 60_000,
  });

  const employeeId = employee?.id;
  useEffect(() => {
    if (!open) return;
    setForm(formFromEmployee(employee));
    setErrors({});
    setCreated(null);
    setCopied(false);
    // employeeId is used on purpose: background refetches of the same employee
    // must not wipe what the user has typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employeeId]);

  const save = useMutation({
    mutationFn: async (payload) => {
      if (!isEdit) return post('/employees', payload);
      const updated = await patch(`/employees/${employee.id}`, payload);
      // The dedicated status endpoint also syncs the login's active flag and
      // the exit date, so route status changes through it as well.
      if (employee.status !== payload.status) {
        return patch(`/employees/${employee.id}/status`, { status: payload.status });
      }
      return updated;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employee'] });
      queryClient.invalidateQueries({ queryKey: ['employee-options'] });
      if (isEdit) {
        toast.success('Employee updated', `${data.fullName} has been saved.`);
        onSaved?.(data);
        onClose?.();
      } else {
        setCreated(data);
        setCopied(false);
        toast.success('Employee created', 'Copy the temporary password before closing this window.');
      }
    },
    onError: (err) => {
      const details = err.details || {};
      setErrors(Object.keys(details).length ? { ...details } : { form: err.message });
      toast.error(isEdit ? 'Could not update employee' : 'Could not create employee', err.message);
    },
  });

  const saving = save.isPending;

  const set = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key] && !current.form) return current;
      const next = { ...current };
      delete next[key];
      delete next.form;
      return next;
    });
  };

  const submit = (event) => {
    event.preventDefault();
    if (saving) return;
    const nextErrors = validateEmployeeForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    save.mutate(toEmployeePayload(form, isEdit ? employee : null));
  };

  const close = useCallback(() => {
    if (saving) return;
    setCreated(null);
    setErrors({});
    setCopied(false);
    onClose?.();
  }, [onClose, saving]);

  const addAnother = () => {
    setCreated(null);
    setForm(emptyEmployeeForm());
    setErrors({});
    setCopied(false);
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(created.tempPassword);
      setCopied(true);
      toast.success('Temporary password copied', 'Share it with the employee over a secure channel.');
    } catch {
      toast.error('Could not copy', 'Select the password and copy it manually.');
    }
  };

  const gross = grossPreview(form);
  const departmentOptions = departments.data || [];
  const designationOptions = designations.data || [];
  const managerOptions = (managers.data || []).filter((item) => item.id !== employee?.id);

  return (
    <Modal
      open={open}
      onClose={close}
      size="xl"
      title={created ? 'Login created' : isEdit ? 'Edit employee' : 'Add employee'}
      description={
        created
          ? 'The profile and first login are ready. Share the temporary password securely.'
          : isEdit
            ? `Update ${employee?.fullName || 'this employee'} — personal, job, salary and bank details.`
            : 'Creates the employee profile plus a first login that must change its password on sign-in.'
      }
      footer={
        created ? (
          <>
            <Button variant="ghost" onClick={addAnother} icon={UserPlus}>
              Add another
            </Button>
            <Button onClick={close} icon={Check}>
              Done
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={close} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="employee-form"
              loading={saving}
              icon={isEdit ? Check : UserPlus}
            >
              {isEdit ? 'Save changes' : 'Create employee'}
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div className="space-y-5">
          <div className="rounded-xl border border-mint/25 bg-mint/[0.07] p-4">
            <div className="flex items-start gap-3">
              <span className="rounded-lg border border-mint/30 bg-mint/10 p-2 text-mint">
                <CheckCircle2 size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="font-display text-sm font-semibold text-text">Login created</p>
                <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
                  <span className="text-text">{created.employee.fullName}</span> can sign in with{' '}
                  <span className="break-all font-mono text-[12px] text-text">{created.employee.email}</span>
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-white/10 bg-ink-950/50 p-3">
              <p className="label-mono mb-1.5">Temporary password</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 break-all font-mono text-lg tracking-wide text-text">
                  {created.tempPassword}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  className="!h-10"
                  icon={copied ? Check : Copy}
                  onClick={copyPassword}
                >
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-relaxed text-amber">
              <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              Must be changed on first sign-in. It is shown once and cannot be retrieved again.
            </p>
          </div>

          <dl className="grid gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 text-[12.5px] sm:grid-cols-3">
            <div>
              <dt className="text-text-faint">Employee code</dt>
              <dd className="mt-0.5 font-mono text-text">{created.employee.employeeCode}</dd>
            </div>
            <div>
              <dt className="text-text-faint">Department</dt>
              <dd className="mt-0.5 text-text">{created.employee.departmentName || 'Unassigned'}</dd>
            </div>
            <div>
              <dt className="text-text-faint">Gross salary</dt>
              <dd className="mt-0.5 text-text">{PKR(created.employee.salary?.gross)}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <form id="employee-form" onSubmit={submit} className="space-y-7" noValidate>
          {errors.form ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-rose/30 bg-rose/10 px-3.5 py-3 text-[13px] text-rose"
            >
              <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              {errors.form}
            </div>
          ) : null}

          <section>
            <SectionTitle icon={UserRound}>Personal</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" error={errors.firstName} required>
                {(props) => (
                  <Input
                    {...props}
                    value={form.firstName}
                    onChange={(event) => set('firstName', event.target.value)}
                    autoComplete="given-name"
                    placeholder="Ayesha"
                  />
                )}
              </Field>
              <Field label="Last name" error={errors.lastName} required>
                {(props) => (
                  <Input
                    {...props}
                    value={form.lastName}
                    onChange={(event) => set('lastName', event.target.value)}
                    autoComplete="family-name"
                    placeholder="Khan"
                  />
                )}
              </Field>
              <Field label="Work email" error={errors.email} hint="Used as the login email" required>
                {(props) => (
                  <Input
                    {...props}
                    type="email"
                    value={form.email}
                    onChange={(event) => set('email', event.target.value)}
                    autoComplete="email"
                    placeholder="ayesha@company.com"
                  />
                )}
              </Field>
              <Field label="Phone" error={errors.phone}>
                {(props) => (
                  <Input
                    {...props}
                    value={form.phone}
                    onChange={(event) => set('phone', event.target.value)}
                    autoComplete="tel"
                    placeholder="0300 1234567"
                  />
                )}
              </Field>
              <Field label="Gender" error={errors.gender}>
                {(props) => (
                  <Select {...props} value={form.gender} onChange={(event) => set('gender', event.target.value)}>
                    {GENDERS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="City" error={errors.city}>
                {(props) => (
                  <Input
                    {...props}
                    value={form.city}
                    onChange={(event) => set('city', event.target.value)}
                    placeholder="Karachi"
                  />
                )}
              </Field>
              <Field label="Date of birth" error={errors.dateOfBirth}>
                {(props) => (
                  <Input
                    {...props}
                    type="date"
                    value={form.dateOfBirth}
                    onChange={(event) => set('dateOfBirth', event.target.value)}
                  />
                )}
              </Field>
              <Field label="CNIC" error={errors.cnic} hint="Format: 42101-1234567-8">
                {(props) => (
                  <Input
                    {...props}
                    value={form.cnic}
                    onChange={(event) => set('cnic', event.target.value)}
                    placeholder="42101-1234567-8"
                  />
                )}
              </Field>
              <Field label="Address" error={errors.address} className="sm:col-span-2">
                {(props) => (
                  <Textarea
                    {...props}
                    rows={2}
                    value={form.address}
                    onChange={(event) => set('address', event.target.value)}
                    placeholder="House, street, area"
                  />
                )}
              </Field>
            </div>
          </section>

          <section>
            <SectionTitle icon={Briefcase}>Job</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Join date" error={errors.joinDate} required>
                {(props) => (
                  <Input
                    {...props}
                    type="date"
                    value={form.joinDate}
                    onChange={(event) => set('joinDate', event.target.value)}
                  />
                )}
              </Field>
              <Field label="Status" error={errors.status}>
                {(props) => (
                  <Select {...props} value={form.status} onChange={(event) => set('status', event.target.value)}>
                    {STATUS_VALUES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Employment type" error={errors.employmentType}>
                {(props) => (
                  <Select
                    {...props}
                    value={form.employmentType}
                    onChange={(event) => set('employmentType', event.target.value)}
                  >
                    {EMPLOYMENT_TYPES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Department" error={errors.departmentId}>
                {(props) => (
                  <Select
                    {...props}
                    value={form.departmentId}
                    onChange={(event) => set('departmentId', event.target.value)}
                  >
                    <option value="">No department</option>
                    {form.departmentId && !departmentOptions.some((item) => item.id === form.departmentId) ? (
                      <option value={form.departmentId}>{employee?.departmentName || 'Current department'}</option>
                    ) : null}
                    {departmentOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Designation" error={errors.designationId}>
                {(props) => (
                  <Select
                    {...props}
                    value={form.designationId}
                    onChange={(event) => set('designationId', event.target.value)}
                  >
                    <option value="">No designation</option>
                    {form.designationId && !designationOptions.some((item) => item.id === form.designationId) ? (
                      <option value={form.designationId}>{employee?.designationTitle || 'Current designation'}</option>
                    ) : null}
                    {designationOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Manager" error={errors.managerId}>
                {(props) => (
                  <Select
                    {...props}
                    value={form.managerId}
                    onChange={(event) => set('managerId', event.target.value)}
                  >
                    <option value="">No manager</option>
                    {form.managerId && !managerOptions.some((item) => item.id === form.managerId) ? (
                      <option value={form.managerId}>{employee?.managerName || 'Current manager'}</option>
                    ) : null}
                    {managerOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                        {item.department ? ` · ${item.department}` : ''}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Notes" error={errors.notes} className="sm:col-span-2">
                {(props) => (
                  <Textarea
                    {...props}
                    rows={3}
                    value={form.notes}
                    onChange={(event) => set('notes', event.target.value)}
                    placeholder="Anything HR should remember about this record"
                  />
                )}
              </Field>
            </div>
          </section>

          <section>
            <SectionTitle icon={Wallet}>Salary</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Basic salary (PKR)" error={errors.basic} hint="Monthly basic" required>
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    min="1"
                    step="any"
                    inputMode="decimal"
                    value={form.basic}
                    onChange={(event) => set('basic', event.target.value)}
                    placeholder="120000"
                  />
                )}
              </Field>
              <Field label="Other allowances (PKR)" error={errors.otherAllowances} hint="Monthly">
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={form.otherAllowances}
                    onChange={(event) => set('otherAllowances', event.target.value)}
                    placeholder="0"
                  />
                )}
              </Field>
              <Field label="House rent (% of basic)" error={errors.houseRentPct} hint="Default 40%">
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    inputMode="decimal"
                    value={form.houseRentPct}
                    onChange={(event) => set('houseRentPct', event.target.value)}
                  />
                )}
              </Field>
              <Field label="Medical (% of basic)" error={errors.medicalPct} hint="Default 10%">
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    inputMode="decimal"
                    value={form.medicalPct}
                    onChange={(event) => set('medicalPct', event.target.value)}
                  />
                )}
              </Field>
              <div className="rounded-xl border border-violet/20 bg-violet/[0.06] p-3.5 sm:col-span-2">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="label-mono">Live gross preview</p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-text-faint">
                      Basic {PKR(gross.basic)} + HRA {PKR(gross.hra)} + medical {PKR(gross.medical)} + allowances{' '}
                      {PKR(gross.other)}
                    </p>
                  </div>
                  <p className="font-display text-xl font-semibold text-text">
                    {gross.gross > 0 ? PKR(gross.gross) : '—'}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <SectionTitle icon={Landmark}>Bank</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bank name" error={errors.bankName}>
                {(props) => (
                  <Input
                    {...props}
                    value={form.bankName}
                    onChange={(event) => set('bankName', event.target.value)}
                    placeholder="Meezan Bank"
                  />
                )}
              </Field>
              <Field label="Account title" error={errors.accountTitle}>
                {(props) => (
                  <Input
                    {...props}
                    value={form.accountTitle}
                    onChange={(event) => set('accountTitle', event.target.value)}
                    placeholder="Ayesha Khan"
                  />
                )}
              </Field>
              <Field label="Account number" error={errors.accountNumber} className="sm:col-span-2">
                {(props) => (
                  <Input
                    {...props}
                    value={form.accountNumber}
                    onChange={(event) => set('accountNumber', event.target.value)}
                    placeholder="PK00 MEZN 0000 0000 0000 0000"
                  />
                )}
              </Field>
            </div>
          </section>

          <section>
            <SectionTitle icon={PhoneCall}>Emergency contact</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contact name" error={errors.emergencyName}>
                {(props) => (
                  <Input
                    {...props}
                    value={form.emergencyName}
                    onChange={(event) => set('emergencyName', event.target.value)}
                    placeholder="Bilal Khan"
                  />
                )}
              </Field>
              <Field label="Relation" error={errors.emergencyRelation}>
                {(props) => (
                  <Input
                    {...props}
                    value={form.emergencyRelation}
                    onChange={(event) => set('emergencyRelation', event.target.value)}
                    placeholder="Brother"
                  />
                )}
              </Field>
              <Field label="Contact phone" error={errors.emergencyPhone}>
                {(props) => (
                  <Input
                    {...props}
                    value={form.emergencyPhone}
                    onChange={(event) => set('emergencyPhone', event.target.value)}
                    placeholder="0300 7654321"
                  />
                )}
              </Field>
            </div>
          </section>
        </form>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*                                CSV import                                  */
/* -------------------------------------------------------------------------- */

const IMPORT_TABS = [
  { value: 'upload', label: 'Upload file' },
  { value: 'paste', label: 'Paste CSV' },
];

function ImportEmployeesModal({ open, onClose }) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('upload');
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [dry, setDry] = useState(null);
  const [imported, setImported] = useState(null);
  const [message, setMessage] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab('upload');
    setCsv('');
    setFileName('');
    setDry(null);
    setImported(null);
    setMessage('');
    setDownloading(false);
  }, [open]);

  const changeCsv = (value, name = '') => {
    setCsv(value);
    setFileName(name);
    setDry(null);
    setImported(null);
    setMessage('');
  };

  const dryRunMutation = useMutation({
    mutationFn: () => post('/employees/import', { csv, dryRun: true }),
    onSuccess: (result) => {
      setDry(result);
      setMessage('');
    },
    onError: (err) => {
      setDry(null);
      setMessage(err.message);
    },
  });

  const importMutation = useMutation({
    mutationFn: () => post('/employees/import', { csv, dryRun: false }),
    onSuccess: (result) => {
      if (result.dryRun) {
        setDry(result);
        setMessage('The import was stopped because the file still has errors.');
        toast.warning('Nothing imported', 'Fix the listed rows and run the dry run again.');
        return;
      }
      setImported(result);
      setDry(null);
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employee-options'] });
      toast.success(
        'Employees imported',
        `${number(result.imported)} profile${result.imported === 1 ? '' : 's'} created from the CSV.`,
      );
    },
    onError: (err) => setMessage(err.message),
  });

  const busy = dryRunMutation.isPending || importMutation.isPending;

  const close = useCallback(() => {
    if (busy) return;
    onClose();
  }, [busy, onClose]);

  const onFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => changeCsv(String(reader.result || ''), file.name);
    reader.onerror = () => setMessage('Could not read that file. Try choosing it again.');
    reader.readAsText(file);
  };

  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      await downloadFile('/employees/import/template', 'template.csv');
      toast.success('Template downloaded', 'Fill it in, then run a dry run here.');
    } catch (err) {
      toast.error('Could not download the template', err.message);
    } finally {
      setDownloading(false);
    }
  };

  const hasErrors = Boolean(dry?.errors?.length);
  const canImport =
    Boolean(dry && !hasErrors && dry.validRows > 0) &&
    !importMutation.isPending &&
    !dryRunMutation.isPending;
  const preview = dry?.preview || [];

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title={imported ? 'Import complete' : 'Import employees'}
      description={
        imported
          ? 'The directory has been updated.'
          : 'Upload or paste a CSV, run a dry run, then import only when every row is clean.'
      }
      footer={
        imported ? (
          <Button onClick={close} icon={Check}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={() => importMutation.mutate()}
              loading={importMutation.isPending}
              disabled={!canImport}
              icon={Upload}
            >
              {dry ? `Import ${dry.validRows} row${dry.validRows === 1 ? '' : 's'}` : 'Import rows'}
            </Button>
          </>
        )
      }
    >
      {imported ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-mint/25 bg-mint/[0.07] p-4">
            <div className="flex items-start gap-3">
              <span className="rounded-lg border border-mint/30 bg-mint/10 p-2 text-mint">
                <CheckCircle2 size={18} aria-hidden="true" />
              </span>
              <div>
                <p className="font-display text-sm font-semibold text-text">Import complete</p>
                <p className="mt-1 text-[13px] text-text-muted">
                  <span className="font-medium text-text">{number(imported.imported)}</span>{' '}
                  employee profile{imported.imported === 1 ? '' : 's'} created.
                </p>
              </div>
            </div>
          </div>

          {imported.created?.length ? (
            <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02]">
              <div className="max-h-64 overflow-y-auto">
                <ul className="divide-y divide-white/[0.05]">
                  {imported.created.slice(0, 20).map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <span className="min-w-0 truncate text-[12.5px] text-text-muted">{row.email}</span>
                      <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-text-faint">
                        {row.code}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              {imported.created.length > 20 ? (
                <p className="border-t border-white/[0.06] px-3.5 py-2 text-[11.5px] text-text-faint">
                  +{number(imported.created.length - 20)} more
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Tabs tabs={IMPORT_TABS} value={tab} onChange={setTab} className="[&_button]:min-h-[40px]" />
            <Button
              variant="ghost"
              size="sm"
              className="!h-10"
              icon={Download}
              loading={downloading}
              onClick={downloadTemplate}
            >
              Download template
            </Button>
          </div>

          {message ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-rose/30 bg-rose/10 px-3.5 py-3 text-[13px] text-rose"
            >
              <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              {message}
            </div>
          ) : null}

          {tab === 'upload' ? (
            <div className="space-y-3">
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-7 text-center transition hover:border-violet/40 hover:bg-white/[0.04] focus-within:border-cyan/60 focus-within:ring-2 focus-within:ring-cyan/30">
                <span className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-text-faint">
                  <UploadCloud size={20} aria-hidden="true" />
                </span>
                <span className="text-[13px] font-medium text-text">Choose a CSV file</span>
                <span className="max-w-xs text-[12px] leading-relaxed text-text-faint">
                  UTF-8 CSV with a header row. Use the template for the exact columns.
                </span>
                <input type="file" accept=".csv,text/csv" className="sr-only" disabled={busy} onChange={onFile} />
              </label>

              {fileName ? (
                <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
                  <FileSpreadsheet size={15} className="shrink-0 text-cyan" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-text">{fileName}</span>
                  <span className="text-[11.5px] text-text-faint">File loaded</span>
                  <IconButton
                    label="Remove file"
                    icon={X}
                    className="!h-10 !w-10"
                    disabled={busy}
                    onClick={() => changeCsv('', '')}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <Field label="Paste CSV" hint="Include the header row; one record per line.">
              {(props) => (
                <Textarea
                  {...props}
                  rows={9}
                  value={csv}
                  disabled={busy}
                  onChange={(event) => changeCsv(event.target.value)}
                  placeholder={'employeeCode,firstName,lastName,email,phone,department,designation,joinDate,basic,status,employmentType,gender,city,address,cnic'}
                  className="font-mono text-[12px] leading-relaxed"
                />
              )}
            </Field>
          )}

          <Button
            variant="secondary"
            className="w-full"
            icon={FileSpreadsheet}
            loading={dryRunMutation.isPending}
            disabled={!csv.trim() || importMutation.isPending}
            onClick={() => {
              setMessage('');
              dryRunMutation.mutate();
            }}
          >
            {dryRunMutation.isPending ? 'Checking rows…' : 'Run dry run'}
          </Button>

          {dry ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <SummaryStat label="Rows found" value={number(dry.totalRows)} />
                <SummaryStat label="Ready" value={number(dry.validRows)} tone={dry.validRows > 0 ? 'mint' : 'neutral'} />
                <SummaryStat label="Problems" value={number(dry.errors?.length || 0)} tone={hasErrors ? 'rose' : 'mint'} />
              </div>

              {hasErrors ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 rounded-xl border border-amber/30 bg-amber/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                    Fix every problem below before importing. Nothing is written until the dry run is clean.
                  </div>
                  <div className="max-h-64 overflow-y-auto rounded-xl border border-rose/20">
                    <Table caption="CSV import errors" className="min-w-[520px]">
                      <thead>
                        <tr>
                          <Th>Row</Th>
                          <Th>Field</Th>
                          <Th>Problem</Th>
                          <Th>Email</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {dry.errors.map((item, index) => (
                          <Tr key={`${item.row}-${item.field}-${index}`} className="bg-rose/[0.04]">
                            <Td className="w-16">
                              <Badge tone="rose">{item.row}</Badge>
                            </Td>
                            <Td className="font-mono text-[12px] text-text">{item.field}</Td>
                            <Td className="text-rose/90">{item.reason}</Td>
                            <Td className="max-w-[180px] truncate text-[12px]">{item.email || '—'}</Td>
                          </Tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="flex items-center gap-1.5 text-[12.5px] text-mint">
                    <CheckCircle2 size={14} aria-hidden="true" /> No errors. This file is ready to import.
                  </p>
                  {preview.length ? (
                    <div className="overflow-hidden rounded-xl border border-white/[0.08]">
                      <div className="max-h-56 overflow-y-auto">
                        <Table caption="Import preview" className="min-w-[520px]">
                          <thead>
                            <tr>
                              <Th>Name</Th>
                              <Th>Email</Th>
                              <Th>Department</Th>
                              <Th>Basic</Th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.map((row, index) => (
                              <Tr key={`${row.email}-${index}`}>
                                <Td className="text-text">{row.name || '—'}</Td>
                                <Td className="max-w-[180px] truncate">{row.email || '—'}</Td>
                                <Td>{row.department || '—'}</Td>
                                <Td className="whitespace-nowrap">{PKR(row.basic)}</Td>
                              </Tr>
                            ))}
                          </tbody>
                        </Table>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Page                                      */
/* -------------------------------------------------------------------------- */

export default function Employees() {
  const navigate = useNavigate();
  const toast = useToast();
  const reduceMotion = useReducedMotion();

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [formModal, setFormModal] = useState({ open: false, employee: null });
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: () => get('/org/departments'),
    staleTime: 60_000,
  });

  const params = useMemo(
    () => ({ q: debouncedQ, departmentId, status, employmentType, page, limit }),
    [debouncedQ, departmentId, status, employmentType, page, limit],
  );

  const listQuery = useQuery({
    queryKey: ['employees', params],
    queryFn: () => {
      const search = new URLSearchParams();
      if (params.q) search.set('q', params.q);
      if (params.departmentId) search.set('departmentId', params.departmentId);
      if (params.status) search.set('status', params.status);
      if (params.employmentType) search.set('employmentType', params.employmentType);
      search.set('page', String(params.page));
      search.set('limit', String(params.limit));
      return get(`/employees?${search.toString()}`);
    },
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (listQuery.data && page > listQuery.data.pages) setPage(listQuery.data.pages);
  }, [listQuery.data, page]);

  const data = listQuery.data;
  const rows = data?.items || [];
  const filtersActive = Boolean(q || departmentId || status || employmentType);

  const clearFilters = () => {
    setQ('');
    setDebouncedQ('');
    setDepartmentId('');
    setStatus('');
    setEmploymentType('');
    setPage(1);
  };

  const openAdd = () => setFormModal({ open: true, employee: null });
  const openEdit = (employee) => setFormModal({ open: true, employee });
  const closeForm = useCallback(() => setFormModal({ open: false, employee: null }), []);
  const closeImport = useCallback(() => setImportOpen(false), []);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadFile('/employees/export', 'employees.csv');
      toast.success('Export ready', 'employees.csv has been downloaded.');
    } catch (err) {
      toast.error('Could not export employees', err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <motion.div
      className="space-y-6"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.2 }}
    >
      <PageHeader
        eyebrow="Module 3 · Employee directory"
        title="Employees"
        description="Every profile, job record and salary in one place. Add people one at a time with a first login, or import a whole team from CSV."
        actions={
          <>
            <Button variant="secondary" icon={Upload} onClick={() => setImportOpen(true)}>
              Import CSV
            </Button>
            <Button variant="secondary" icon={Download} loading={exporting} onClick={exportCsv}>
              Export
            </Button>
            <Button icon={Plus} onClick={openAdd}>
              Add employee
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden" aria-busy={listQuery.isFetching || undefined}>
        <div className="border-b border-white/[0.06] p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_auto]">
            <Field label="Search" className="sm:col-span-2 xl:col-span-1">
              {(props) => (
                <div className="relative">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-faint"
                    aria-hidden="true"
                  />
                  <Input
                    {...props}
                    type="search"
                    className="pl-9"
                    placeholder="Name, code or email"
                    value={q}
                    onChange={(event) => setQ(event.target.value)}
                  />
                </div>
              )}
            </Field>

            <Field label="Department">
              {(props) => (
                <Select
                  {...props}
                  value={departmentId}
                  onChange={(event) => {
                    setDepartmentId(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All departments</option>
                  {(departments.data || []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Status">
              {(props) => (
                <Select
                  {...props}
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value);
                    setPage(1);
                  }}
                >
                  {STATUS_FILTERS.map((item) => (
                    <option key={item.value || 'default'} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Employment type">
              {(props) => (
                <Select
                  {...props}
                  value={employmentType}
                  onChange={(event) => {
                    setEmploymentType(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All types</option>
                  {EMPLOYMENT_TYPES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            {filtersActive ? (
              <div className="flex items-end">
                <Button variant="ghost" icon={X} className="w-full xl:w-auto" onClick={clearFilters}>
                  Clear
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-2.5">
          <p className="text-[12.5px] text-text-muted" aria-live="polite">
            {listQuery.isLoading
              ? 'Loading employees…'
              : data
                ? `${number(data.total)} ${data.total === 1 ? 'employee' : 'employees'}`
                : '—'}
          </p>
          {filtersActive ? <span className="text-[11.5px] text-text-faint">Filtered view</span> : null}
        </div>

        {!listQuery.isLoading && listQuery.isError ? (
          <ErrorState message={listQuery.error?.message} onRetry={() => listQuery.refetch()} />
        ) : null}

        {!listQuery.isLoading && !listQuery.isError && rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={filtersActive ? 'No employees match these filters' : 'No employees yet'}
            description={
              filtersActive
                ? 'Try a different search, or clear the filters to see the whole directory.'
                : 'Add your first employee to start the directory, or import a CSV to create many at once.'
            }
            action={
              filtersActive ? (
                <Button variant="secondary" onClick={clearFilters} icon={X}>
                  Clear filters
                </Button>
              ) : (
                <Button onClick={openAdd} icon={Plus}>
                  Add your first employee
                </Button>
              )
            }
          />
        ) : null}

        {listQuery.isLoading || (!listQuery.isError && rows.length > 0) ? (
        <Table caption="Employees">
          <thead>
            <tr>
              <Th>Employee</Th>
              <Th>Code</Th>
              <Th>Department</Th>
              <Th>Designation</Th>
              <Th>Joined</Th>
              <Th>Gross</Th>
              <Th>Status</Th>
              <Th>
                <span className="block text-right">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {listQuery.isLoading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <Tr key={`skeleton-${index}`}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-3.5 w-32" />
                          <Skeleton className="h-3 w-44" />
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <Skeleton className="h-3.5 w-16" />
                    </Td>
                    <Td>
                      <Skeleton className="h-3.5 w-24" />
                    </Td>
                    <Td>
                      <Skeleton className="h-3.5 w-28" />
                    </Td>
                    <Td>
                      <Skeleton className="h-3.5 w-20" />
                    </Td>
                    <Td>
                      <Skeleton className="h-3.5 w-20" />
                    </Td>
                    <Td>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </Td>
                    <Td>
                      <Skeleton className="ml-auto h-8 w-16" />
                    </Td>
                  </Tr>
                ))
              : null}

            {!listQuery.isLoading && !listQuery.isError
              ? rows.map((employee) => (
                  <Tr
                    key={employee.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/app/employees/${employee.id}`)}
                  >
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={employee.fullName} size={34} src={employee.photoUrl || undefined} />
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-medium text-text">{employee.fullName}</p>
                          <p className="max-w-[220px] truncate text-[12px] text-text-faint">{employee.email}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <span className="font-mono text-[11.5px] uppercase tracking-[0.06em] text-text-muted">
                        {employee.employeeCode}
                      </span>
                    </Td>
                    <Td>{employee.departmentName || '—'}</Td>
                    <Td>{employee.designationTitle || '—'}</Td>
                    <Td className="whitespace-nowrap">{dateLabel(employee.joinDate)}</Td>
                    <Td className="whitespace-nowrap font-medium text-text">{PKR(employee.salary?.gross)}</Td>
                    <Td>
                      <Badge tone={STATUS_TONE[employee.status] || 'neutral'} dot>
                        {statusLabel(employee.status)}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <IconButton
                          label={`View ${employee.fullName}`}
                          icon={Eye}
                          className="!h-10 !w-10"
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(`/app/employees/${employee.id}`);
                          }}
                        />
                        <IconButton
                          label={`Edit ${employee.fullName}`}
                          icon={Pencil}
                          className="!h-10 !w-10"
                          onClick={(event) => {
                            event.stopPropagation();
                            openEdit(employee);
                          }}
                        />
                      </div>
                    </Td>
                  </Tr>
                ))
              : null}
          </tbody>
        </Table>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-white/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <label htmlFor="employees-page-size" className="text-[12px] text-text-faint">
              Rows per page
            </label>
            <div className="w-20">
              <Select
                id="employees-page-size"
                value={limit}
                onChange={(event) => {
                  setLimit(Number(event.target.value));
                  setPage(1);
                }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <Button
              variant="secondary"
              size="sm"
              className="!h-10"
              icon={ChevronLeft}
              disabled={page <= 1 || listQuery.isFetching}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <p className="whitespace-nowrap text-[12.5px] text-text-muted">
              Page <span className="text-text">{data?.page ?? page}</span> of{' '}
              <span className="text-text">{data?.pages ?? 1}</span>
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="!h-10"
              disabled={!data || page >= data.pages || listQuery.isFetching}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
              <ChevronRight size={15} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </Card>

      <EmployeeFormModal
        open={formModal.open}
        employee={formModal.employee}
        onClose={closeForm}
      />
      <ImportEmployeesModal open={importOpen} onClose={closeImport} />
    </motion.div>
  );
}
