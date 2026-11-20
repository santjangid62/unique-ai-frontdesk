import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Sparkles, ArrowLeft, Building2, ShieldCheck, UserCog, MailCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import api, { errorMessage, fieldErrors } from '../lib/api.js';
import { Alert, Field, PhoneInput } from '../components/ui.jsx';
import { LanguageSwitcher, useI18n } from '../i18n/index.jsx';

const PORTALS = {
  business: {
    label: 'Business Admin',
    title: 'Business Admin sign in',
    subtitle: 'Your workspace: AI, leads, staff and billing.',
    icon: Building2,
    demo: { email: 'owner@uniquecomputers.in', password: 'Owner@12345' },
  },
  staff: {
    label: 'Staff',
    title: 'Staff sign in',
    subtitle: 'Assigned leads, conversations and appointments.',
    icon: UserCog,
    demo: { email: 'staff@uniquecomputers.in', password: 'Staff@12345' },
  },
  'super-admin': {
    label: 'Super Admin',
    title: 'Super Admin sign in',
    subtitle: 'Platform console, businesses, plans and audit logs.',
    icon: ShieldCheck,
    demo: { email: 'admin@uniqueit.in', password: 'Admin@12345' },
  },
};

function AuthShell({ title, subtitle, children, footer }) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <Link to="/" className="relative flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500">
            <Sparkles size={20} />
          </span>
          <span className="text-lg font-bold">{t('Unique AI Frontdesk')}</span>
        </Link>
        <div className="relative max-w-md">
          <h2 className="text-4xl font-bold leading-tight">{t('Your Business Never Misses a Customer.')}</h2>
          <p className="mt-4 text-slate-300">
            {t(
              'One AI receptionist for website chat, WhatsApp and phone calls — capturing leads, booking appointments and handing off to your team when it matters.',
            )}
          </p>
          <ul className="mt-8 space-y-3 text-sm text-slate-300">
            <li>• {t('Grounded answers from your own knowledge base')}</li>
            <li>• {t('Leads and appointments saved automatically')}</li>
            <li>• {t('Built for any industry — coaching, clinics, salons, retail and more')}</li>
          </ul>
        </div>
        <div className="relative text-xs leading-relaxed text-slate-500">
          <p>
            © {new Date().getFullYear()} Unique IT Solutions — {t('A Unit of Unique Computers, The Best One.')}{' '}
            {t('All rights reserved.')}
          </p>
          <a
            href="https://uniqueitsolutionsjaipur.com"
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block font-medium text-slate-400 hover:text-slate-200"
          >
            uniqueitsolutionsjaipur.com
          </a>
        </div>
      </div>

      <div className="flex flex-col justify-center bg-white px-5 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center justify-between gap-3">
            <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800">
              <ArrowLeft size={16} /> {t('Back to website')}
            </Link>
            <LanguageSwitcher />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t(title)}</h1>
          <p className="mt-1 text-sm text-slate-500">{t(subtitle)}</p>
          <div className="mt-7">{children}</div>
          {footer ? <div className="mt-6 text-sm text-slate-500">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}

/** Landing page for sign-in: the three portals are separate URLs. */
export function LoginPortal() {
  const { t } = useI18n();
  return (
    <AuthShell title="Choose how you want to sign in" subtitle="Three separate sign-in portals keep platform, business and staff access apart.">
      <div className="space-y-3">
        {Object.entries(PORTALS).map(([key, portal]) => (
          <Link
            key={key}
            to={`/login/${key}`}
            className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-brand-400 hover:bg-brand-50/40"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <portal.icon size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900">{t(portal.label)}</span>
              <span className="block text-xs text-slate-500">{t(portal.subtitle)}</span>
            </span>
            <span className="text-slate-400">→</span>
          </Link>
        ))}
      </div>
      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        <p className="font-semibold text-slate-700">{t('New business?')}</p>
        <p>
          <Link to="/register" className="link">
            {t('Create an account')}
          </Link>{' '}
          · {t('Start your 14-day trial')}
        </p>
      </div>
    </AuthShell>
  );
}

export function Login() {
  const { portal: portalKey = 'business' } = useParams();
  const portal = PORTALS[portalKey] || PORTALS.business;
  const { login, user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [unverified, setUnverified] = useState('');
  const { register, handleSubmit, formState, setValue } = useForm({ defaultValues: { email: '', password: '' } });

  useEffect(() => {
    if (user) navigate('/app', { replace: true });
  }, [user, navigate]);

  const onSubmit = async (values) => {
    setError('');
    setUnverified('');
    try {
      await login(values.email, values.password, portalKey);
      navigate('/app', { replace: true });
    } catch (err) {
      const code = err?.response?.data?.error?.code;
      if (code === 'EMAIL_NOT_VERIFIED') {
        const email = err?.response?.data?.error?.details?.email || values.email;
        setUnverified(email);
        setError(errorMessage(err, 'Verify your business email before signing in.'));
      } else {
        setError(errorMessage(err, 'Unable to sign in'));
      }
    }
  };

  return (
    <AuthShell
      title={portal.title}
      subtitle={portal.subtitle}
      footer={
        <>
          <Link to="/login" className="link">
            {t('Back to portal selection')}
          </Link>
          {portalKey === 'business' ? (
            <>
              {' · '}
              {t('New business?')}{' '}
              <Link to="/register" className="link">
                {t('Create an account')}
              </Link>
            </>
          ) : null}
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error ? (
          <Alert tone={unverified ? 'warning' : 'error'}>
            <span>{error}</span>
            {unverified ? (
              <span className="mt-2 block">
                <Link to={`/verify-email?email=${encodeURIComponent(unverified)}`} className="font-semibold underline">
                  {t('Enter your verification code')}
                </Link>
              </span>
            ) : null}
          </Alert>
        ) : null}
        <Field label="Work email">
          <input
            className="input"
            type="email"
            autoComplete="email"
            {...register('email', { required: 'Email is required' })}
          />
          {formState.errors.email ? <p className="mt-1 text-xs text-rose-600">{formState.errors.email.message}</p> : null}
        </Field>
        <Field label="Password">
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            {...register('password', { required: 'Password is required' })}
          />
          {formState.errors.password ? (
            <p className="mt-1 text-xs text-rose-600">{formState.errors.password.message}</p>
          ) : null}
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
            {t('Forgot password?')}
          </Link>
        </div>
        <button type="submit" className="btn-primary w-full" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? t('Signing in…') : t('Sign in')}
        </button>
      </form>
      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        <p className="font-semibold text-slate-700">{t('Demo accounts')}</p>
        <p className="flex items-center justify-between gap-2">
          <span>
            {t(portal.label)} · {portal.demo.email} / {portal.demo.password}
          </span>
          <button
            type="button"
            className="font-semibold text-brand-600"
            onClick={() => {
              setValue('email', portal.demo.email);
              setValue('password', portal.demo.password);
            }}
          >
            {t('Use')}
          </button>
        </p>
      </div>
    </AuthShell>
  );
}

export function Register() {
  const { register: registerAccount, user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [details, setDetails] = useState({});
  const { register, handleSubmit, formState, setValue, watch } = useForm({
    defaultValues: { businessName: '', ownerName: '', email: '', phone: '', password: '', industry: 'coaching' },
  });
  const phone = watch('phone');

  useEffect(() => {
    if (user) navigate('/app', { replace: true });
  }, [user, navigate]);

  const onSubmit = async (values) => {
    setError('');
    setDetails({});
    try {
      const result = await registerAccount(values);
      const query = new URLSearchParams({ email: values.email });
      if (result?.devCode) query.set('dev', result.devCode);
      navigate(`/verify-email?${query.toString()}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Unable to create your account'));
      setDetails(fieldErrors(err));
    }
  };

  return (
    <AuthShell
      title="Start your 14-day trial"
      subtitle="Create your business workspace — no credit card required."
      footer={
        <>
          {t('Already have an account?')}{' '}
          <Link to="/login" className="link">
            {t('Sign in')}
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <Field label="Business name" error={details.businessName}>
          <input className="input" {...register('businessName', { required: 'Business name is required' })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" error={details.ownerName}>
            <input className="input" {...register('ownerName', { required: 'Your name is required' })} />
          </Field>
          <Field label="Industry">
            <select className="input" {...register('industry')}>
              <option value="coaching">{t('Coaching / Institute')}</option>
              <option value="healthcare">{t('Healthcare')}</option>
              <option value="hotels">{t('Hotels')}</option>
              <option value="real_estate">{t('Real Estate')}</option>
              <option value="salon">{t('Salon')}</option>
              <option value="other">{t('Other')}</option>
            </select>
          </Field>
        </div>
        <Field label="Work email" error={details.email} hint="We will email a 6-digit verification code.">
          <input className="input" type="email" autoComplete="email" {...register('email', { required: 'Email is required' })} />
        </Field>
        <Field label="Mobile number" error={details.phone} hint="10-digit Indian number — no +91 needed.">
          <PhoneInput
            value={phone}
            onChange={(value) => setValue('phone', value, { shouldValidate: false })}
            placeholder="98290 11223"
          />
        </Field>
        <Field label="Password" hint="At least 8 characters with a letter and a number." error={details.password}>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            {...register('password', { required: 'Password is required' })}
          />
        </Field>
        <button type="submit" className="btn-primary w-full" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? t('Creating…') : t('Create workspace')}
        </button>
      </form>
    </AuthShell>
  );
}

export function VerifyEmail() {
  const [params] = useSearchParams();
  const { verifyEmail } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const email = params.get('email') || '';
  const devCode = params.get('dev') || '';
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [resending, setResending] = useState(false);

  const masked = useMemo(() => email, [email]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await verifyEmail(email, code);
      setDone(true);
      setTimeout(() => navigate('/app', { replace: true }), 900);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const resend = useCallback(async () => {
    setResending(true);
    setError('');
    setNotice('');
    try {
      const { data } = await api.post('/auth/resend-verification', { email });
      setNotice(t('Code sent again. Check your inbox.'));
      if (data?.data?.devCode) setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setResending(false);
    }
  }, [email, t]);

  return (
    <AuthShell
      title="Verify your business email"
      subtitle="Enter the code to activate your workspace and sign in."
      footer={
        <Link to="/login" className="link">
          {t('Back to sign in')}
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {!email ? <Alert>{t('Open the verification link from your email, or register again.')}</Alert> : null}
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Alert tone="success">{notice}</Alert> : null}
        {done ? (
          <Alert tone="success">
            <MailCheck className="mr-1 inline" size={16} /> {t('Email verified. Opening your workspace…')}
          </Alert>
        ) : null}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <p>
            {t('We sent a 6-digit code to')} <span className="font-semibold">{masked || '—'}</span>
          </p>
          <p className="mt-1">{t('The code expires in 15 minutes.')}</p>
        </div>
        <Field label="Verification code">
          <input
            className="input text-center text-lg font-bold tracking-[0.4em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        </Field>
        {devCode ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <p className="font-semibold">{t('Development shortcut')}</p>
            <p className="mt-1">
              {t('Email delivery is not configured, so the code is shown here:')}{' '}
              <span className="font-mono font-bold">{devCode}</span>
            </p>
          </div>
        ) : null}
        <button type="submit" className="btn-primary w-full" disabled={busy || done || code.length !== 6}>
          {busy ? t('Verifying…') : t('Verify and sign in')}
        </button>
        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            className="font-semibold text-brand-600 disabled:text-slate-400"
            onClick={resend}
            disabled={resending || !email}
          >
            {resending ? t('Sending…') : t('Resend code')}
          </button>
          <Link to="/register" className="text-slate-500 hover:text-slate-800">
            {t('Register again')}
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}

export function ForgotPassword() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setMessage(data.data.message);
      if (data.data.resetToken) setToken(data.data.resetToken);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We will generate a secure reset link for your account."
      footer={
        <Link to="/login" className="link">
          {t('Back to sign in')}
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        {message ? <Alert tone="success">{message}</Alert> : null}
        <Field label="Work email">
          <input className="input" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? t('Sending…') : t('Send reset link')}
        </button>
        {token ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <p className="font-semibold">{t('Development shortcut')}</p>
            <p className="mt-1 break-all">{t('Reset token')}: {token}</p>
            <Link to={`/reset-password?token=${token}`} className="mt-2 inline-block font-semibold underline">
              {t('Open reset form')}
            </Link>
          </div>
        ) : null}
      </form>
    </AuthShell>
  );
}

export function ResetPassword() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [values, setValues] = useState({ token: params.get('token') || '', password: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/reset-password', values);
      setDone(true);
      setTimeout(() => navigate('/login'), 1800);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Choose a new password" subtitle="Your reset link is valid for one hour and can be used once.">
      <form onSubmit={onSubmit} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        {done ? <Alert tone="success">{t('Password updated. Redirecting to sign in…')}</Alert> : null}
        <Field label="Reset token">
          <input
            className="input font-mono text-xs"
            required
            value={values.token}
            onChange={(event) => setValues((prev) => ({ ...prev, token: event.target.value }))}
          />
        </Field>
        <Field label="New password" hint="At least 8 characters with a letter and a number.">
          <input
            className="input"
            type="password"
            required
            value={values.password}
            onChange={(event) => setValues((prev) => ({ ...prev, password: event.target.value }))}
          />
        </Field>
        <button type="submit" className="btn-primary w-full" disabled={busy || done}>
          {busy ? t('Updating…') : t('Update password')}
        </button>
      </form>
    </AuthShell>
  );
}
