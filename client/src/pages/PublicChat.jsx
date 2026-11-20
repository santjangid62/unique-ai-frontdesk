import { Tx } from '../components/ui.jsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Send, Sparkles, CalendarPlus } from 'lucide-react';
import api, { errorMessage } from '../lib/api.js';

const VISITOR_KEY = 'uaf_visitor_id';

function getVisitorId() {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = `v_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

export default function PublicChat() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [config, setConfig] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showBooking, setShowBooking] = useState(false);
  const [booking, setBooking] = useState({ name: '', phone: '', course: '', date: '', time: '11:00' });
  const [bookingState, setBookingState] = useState({ busy: false, message: '', error: '' });
  const endRef = useRef(null);
  const visitorId = getVisitorId();

  useEffect(() => {
    let active = true;
    api
      .get(`/public/widget/${slug}/config`)
      .then(({ data }) => {
        if (!active) return;
        setConfig(data.data);
        setMessages([
          {
            id: 'welcome',
            role: 'ai',
            content: data.data.widget.welcomeMessage,
          },
        ]);
      })
      .catch((err) => active && setError(errorMessage(err, 'This chat is unavailable')));
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    api
      .get(`/public/widget/${slug}/messages`, { params: { visitorId } })
      .then(({ data }) => {
        if (data.data.messages?.length) {
          setMessages(data.data.messages.map((message) => ({ ...message, role: message.role === 'customer' ? 'customer' : 'ai' })));
        }
      })
      .catch(() => {});
  }, [slug, visitorId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const send = useCallback(
    async (event) => {
      event.preventDefault();
      const text = input.trim();
      if (!text || busy) return;
      setInput('');
      setError('');
      setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: 'customer', content: text }]);
      setBusy(true);
      try {
        const { data } = await api.post(`/public/widget/${slug}/chat`, { message: text, visitorId });
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            role: 'ai',
            content: data.data.reply || 'Our team will get back to you shortly.',
            escalated: data.data.escalated,
          },
        ]);
        if (data.data.escalated) {
          setMessages((prev) => [
            ...prev,
            {
              id: `sys-${Date.now()}`,
              role: 'system',
              content: 'A team member has been notified and will join this conversation.',
            },
          ]);
        }
      } catch (err) {
        setError(errorMessage(err, 'Message could not be sent'));
      } finally {
        setBusy(false);
      }
    },
    [input, busy, slug, visitorId],
  );

  const bookDemo = async (event) => {
    event.preventDefault();
    setBookingState({ busy: true, message: '', error: '' });
    try {
      const { data } = await api.post(`/public/widget/${slug}/appointments`, { ...booking, visitorId });
      const when = new Date(data.data.appointment.startAt).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      setBookingState({ busy: false, message: `Appointment booked for ${when}.`, error: '' });
      setShowBooking(false);
      setMessages((prev) => [
        ...prev,
        { id: `book-${Date.now()}`, role: 'system', content: `Appointment booked for ${when}. See you there!` },
      ]);
    } catch (err) {
      setBookingState({ busy: false, message: '', error: errorMessage(err, 'Could not book this slot') });
    }
  };

  // Opened from the site: go back to the previous page. Opened directly in a
  // new tab there is no in-app history, so fall back to the landing page.
  const goBack = () => {
    if (window.history.state?.idx > 0) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  const accent = config?.widget?.primaryColor || '#4f46e5';

  if (error && !config) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100 p-6">
        <div className="card max-w-sm p-6 text-center">
          <p className="text-sm font-semibold text-slate-800"><Tx>Chat unavailable</Tx></p>
          <p className="mt-1 text-sm text-slate-500">{error}</p>
          <button type="button" className="btn-secondary mx-auto mt-4" onClick={goBack}>
            <ArrowLeft size={15} /> <Tx>Back</Tx>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col bg-white shadow-xl sm:my-6 sm:min-h-[720px] sm:rounded-3xl sm:shadow-pop">
        <header className="flex items-center gap-3 rounded-t-none border-b border-slate-100 px-5 py-4 sm:rounded-t-3xl" style={{ backgroundColor: `${accent}0d` }}>
          <button
            type="button"
            onClick={goBack}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            aria-label="Back"
            title="Back"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ backgroundColor: accent }}>
            <Sparkles size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900">{config?.business?.name || 'Loading…'}</p>
            <p className="text-xs text-slate-500">
              {config?.widget?.agentName || 'AI assistant'} · replies instantly
            </p>
          </div>
          {config?.demoAvailable ? (
            <button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={() => setShowBooking((value) => !value)}>
              <CalendarPlus size={14} /> Book appointment
            </button>
          ) : null}
        </header>

        {showBooking ? (
          <form onSubmit={bookDemo} className="space-y-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4">
            {bookingState.error ? <p className="text-xs font-medium text-rose-600">{bookingState.error}</p> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className="input"
                placeholder="Your name"
                required
                value={booking.name}
                onChange={(event) => setBooking({ ...booking, name: event.target.value })}
              />
              <input
                className="input"
                placeholder="Phone number"
                required
                value={booking.phone}
                onChange={(event) => setBooking({ ...booking, phone: event.target.value })}
              />
              <input
                className="input"
                placeholder="Service / interest"
                value={booking.course}
                onChange={(event) => setBooking({ ...booking, course: event.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="input"
                  type="date"
                  required
                  value={booking.date}
                  onChange={(event) => setBooking({ ...booking, date: event.target.value })}
                />
                <input
                  className="input"
                  type="time"
                  required
                  value={booking.time}
                  onChange={(event) => setBooking({ ...booking, time: event.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1" style={{ backgroundColor: accent }} disabled={bookingState.busy}>
                {bookingState.busy ? 'Booking…' : 'Confirm appointment'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowBooking(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        <div className="scroll-thin flex-1 space-y-3 overflow-y-auto px-4 py-5">
          {messages.map((message) => {
            if (message.role === 'system') {
              return (
                <p key={message.id} className="mx-auto w-fit rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-500">
                  {message.content}
                </p>
              );
            }
            const mine = message.role === 'customer';
            return (
              <div
                key={message.id}
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  mine ? 'ml-auto text-white' : 'bg-slate-100 text-slate-700'
                }`}
                style={mine ? { backgroundColor: accent } : undefined}
              >
                {message.content}
              </div>
            );
          })}
          {busy ? (
            <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2.5 text-sm text-slate-500">
              <Loader2 size={14} className="animate-spin" /> thinking…
            </div>
          ) : null}
          {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}
          {bookingState.message ? (
            <p className="mx-auto w-fit rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
              {bookingState.message}
            </p>
          ) : null}
          <div ref={endRef} />
        </div>

        <form onSubmit={send} className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">
          <input
            className="input flex-1"
            placeholder="Ask about services, prices or an appointment…"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={!config}
          />
          <button
            type="submit"
            className="grid h-11 w-11 place-items-center rounded-xl text-white disabled:opacity-50"
            style={{ backgroundColor: accent }}
            disabled={busy || !input.trim()}
            aria-label="Send message"
          >
            <Send size={17} />
          </button>
        </form>
        {config?.widget?.showBranding ? (
          <p className="pb-3 text-center text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Powered by Unique AI Frontdesk ·{' '}
            <a
              href="https://uniqueitsolutionsjaipur.com"
              target="_blank"
              rel="noreferrer"
              className="hover:text-slate-600"
            >
              uniqueitsolutionsjaipur.com
            </a>
          </p>
        ) : null}
      </div>
    </div>
  );
}
