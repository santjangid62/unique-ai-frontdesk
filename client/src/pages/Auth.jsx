import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Sparkles, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import api, { errorMessage, fieldErrors } from '../lib/api.js';
import { Alert, Field } from '../components/ui.jsx';

function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <Link to="/" className="relative flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500">
            <Sparkles size={20} />
          </span>
          <span className="text-lg font-bold">Unique AI Frontdesk</span>
        </Link>
        <div className="relative max-w-md">
          <h2 className="text-4xl font-bold leading-tight">Your Business Never Misses a Customer.</h2>
          <p className="mt-4 text-slate-300">
            One AI receptionist for website chat, WhatsApp and phone calls — capturing leads, booking demo classes and
            handing off to your team when it matters.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-slate-300">
            <li>• Grounded answers from your own knowledge base</li>
            <li>• Leads and appointments saved automatically</li>
            <li>• Built for coaching institutes, ready for any industry</li>
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">© {new Date().getFullYear()} Unique IT Solutions</p>
      </div>

      <div className="flex flex-col justify-center bg-white px-5 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-md">
          <Link to="/" className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800">
            <ArrowLeft size={16} /> Back to website
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-7">{children}</div>
          {footer ? <div className="mt-6 text-sm text-slate-500">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const { register, handleSubmit, formState } = useForm({ defaultValues: { email: '', password: '' } });

  useEffect(() => {
    if (user) navigate('/app', { replace: true });
  }, [user, navigate]);

  const onSubmit = async (values) => {
    setError('');
    try {
      await login(values.email, values.password);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Unable to sign in'));
    }
  };

  return (
    <AuthShell
      title="Sign in to your workspace"
      subtitle="Manage your AI receptionist, leads and appointments."
      footer={
        <>
          New business?{' '}
          <Link to="/register" className="link">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <Field label="Work email">
          <input className="input" type="email" autoComplete="email" {...register('email', { required: 'Email is required' })} />
          {formState.errors.email ? <p className="mt-1 text-xs text-rose-600">{formState.errors.email.message}</p> : null}
        </Field>
        <Field label="Password">
          <input className="input" type="password" autoComplete="current-password" {...register('password', { required: 'Password is required' })} />
          {formState.errors.password ? <p className="mt-1 text-xs text-rose-600">{formState.errors.password.message}</p> : null}
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
            Forgot password?
          </Link>
        </div>
        <button type="submit" className="btn-primary w-full" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        <p className="font-semibold text-slate-700">Demo accounts</p>
        <p>Business admin · owner@uniquecomputers.in / Owner@12345</p>
        <p>Staff · staff@uniquecomputers.in / Staff@12345</p>
        <p>Super admin · admin@uniqueit.in / Admin@12345</p>
      </div>
    </AuthShell>
  );
}

export function Register() {
  const { register: registerAccount, user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [details, setDetails] = useState({});
  const { register, handleSubmit, formState } = useForm({
    defaultValues: { businessName: '', ownerName: '', email: '', phone: '', password: '', industry: 'coaching' },
  });

  useEffect(() => {
    if (user) navigate('/app', { replace: true });
  }, [user, navigate]);

  const onSubmit = async (values) => {
    setError('');
    setDetails({});
    try {
      await registerAccount(values);
      navigate('/app', { replace: true });
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
          Already have an account?{' '}
          <Link to="/login" className="link">
            Sign in
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
              <option value="coaching">Coaching / Institute</option>
              <option value="healthcare">Healthcare</option>
              <option value="hotels">Hotels</option>
              <option value="real_estate">Real Estate</option>
              <option value="salon">Salon</option>
              <option value="other">Other</option>
            </select>
          </Field>
        </div>
        <Field label="Work email" error={details.email}>
          <input className="input" type="email" autoComplete="email" {...register('email', { required: 'Email is required' })} />
        </Field>
        <Field label="Phone" error={details.phone}>
          <input className="input" placeholder="+91 98290 11223" {...register('phone')} />
        </Field>
        <Field label="Password" hint="At least 8 characters with a letter and a number." error={details.password}>
          <input className="input" type="password" autoComplete="new-password" {...register('password', { required: 'Password is required' })} />
        </Field>
        <button type="submit" className="btn-primary w-full" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? 'Creating workspace…' : 'Create workspace'}
        </button>
      </form>
    </AuthShell>
  );
}

export function ForgotPassword() {
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
          Back to sign in
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
          {busy ? 'Generating…' : 'Send reset link'}
        </button>
        {token ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <p className="font-semibold">Development shortcut</p>
            <p className="mt-1 break-all">Reset token: {token}</p>
            <Link to={`/reset-password?token=${token}`} className="mt-2 inline-block font-semibold underline">
              Open reset form
            </Link>
          </div>
        ) : null}
      </form>
    </AuthShell>
  );
}

export function ResetPassword() {
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
        {done ? <Alert tone="success">Password updated. Redirecting to sign in…</Alert> : null}
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
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </AuthShell>
  );
}
