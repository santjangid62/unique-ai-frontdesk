import { useMemo, useState } from 'react';
import { CalendarPlus, Check, Clock, X } from 'lucide-react';
import api, { errorMessage } from '../lib/api.js';
import useFetch from '../lib/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useBusinessCategory } from '../lib/useBusinessCategory.js';
import { useI18n } from '../i18n/index.jsx';
import { Alert, Badge, Card, EmptyState, Field, Modal, PageHeader, Spinner, Tabs, Tx } from '../components/ui.jsx';
import { dateTime, dayLabel, timeLabel, titleCase } from '../lib/format.js';

const TYPES = ['demo', 'counselling', 'admission', 'general'];
const STATUSES = ['scheduled', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show'];

export default function Appointments() {
  const { isBusinessAdmin, user } = useAuth();
  const { t } = useI18n();
  const category = useBusinessCategory();
  const [view, setView] = useState('upcoming');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    type: 'demo',
    course: '',
    date: new Date().toISOString().slice(0, 10),
    time: '11:00',
    durationMinutes: 45,
    staffId: '',
    notes: '',
  });

  const query =
    view === 'upcoming'
      ? '?upcoming=true&limit=100'
      : view === 'today'
        ? `?from=${new Date().toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}&limit=100`
        : '?limit=100';

  const { data, loading, error: loadError, reload } = useFetch(`/appointments${query}`, [query]);
  const { data: team } = useFetch(isBusinessAdmin ? '/users/meta/assignable' : null, [], { enabled: isBusinessAdmin });

  const grouped = useMemo(() => {
    const map = new Map();
    (data || []).forEach((appointment) => {
      const key = new Date(appointment.startAt).toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(appointment);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/appointments', {
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        customerEmail: form.customerEmail,
        type: form.type,
        course: form.course,
        startAt: new Date(`${form.date}T${form.time}:00`),
        durationMinutes: Number(form.durationMinutes),
        staffId: form.staffId || null,
        notes: form.notes,
      });
      setOpen(false);
      setForm((prev) => ({ ...prev, customerName: '', customerPhone: '', customerEmail: '', course: '', notes: '' }));
      reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (appointment, status) => {
    try {
      await api.patch(`/appointments/${appointment.id}/status`, { status });
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Calendar"
        title="Appointments"
        subtitle="Consultations and service slots. Double bookings are blocked automatically."
        actions={
          <>
            <Tabs
              tabs={[
                { value: 'upcoming', label: 'Upcoming' },
                { value: 'today', label: 'Today' },
                { value: 'all', label: 'All' },
              ]}
              value={view}
              onChange={setView}
            />
            <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
              <CalendarPlus size={16} /> New appointment
            </button>
          </>
        }
      />

      {error || loadError ? (
        <div className="mb-4">
          <Alert>{error || loadError}</Alert>
        </div>
      ) : null}

      {loading ? (
        <Spinner label="Loading appointments…" />
      ) : !grouped.length ? (
        <Card>
          <EmptyState
            title="No appointments in this view"
            description="Book an appointment manually, or let the AI receptionist book it during a conversation."
            action={
              <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
                <CalendarPlus size={16} /> New appointment
              </button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([date, items]) => (
            <div key={date}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-800">
                  {new Date(date).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short' })}
                </h2>
                <span className="text-xs text-slate-400">{items.length} booking(s)</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {items.map((appointment) => (
                  <Card key={appointment.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{appointment.customerName}</p>
                        <p className="text-xs text-slate-500">{appointment.customerPhone || 'No phone'}</p>
                      </div>
                      <Badge status={appointment.status} />
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-slate-600">
                      <p className="flex items-center gap-1.5">
                        <Clock size={13} /> {timeLabel(appointment.startAt)} – {timeLabel(appointment.endAt)} ·{' '}
                        {dayLabel(appointment.startAt)}
                      </p>
                      <p>{titleCase(appointment.type)} · {appointment.course || 'General'}</p>
                      <p className="text-slate-400">
                        {appointment.staffId?.name ? `With ${appointment.staffId.name}` : 'Unassigned staff'} · via{' '}
                        {titleCase(appointment.channel)}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {appointment.status === 'scheduled' ? (
                        <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => setStatus(appointment, 'confirmed')}>
                          <Check size={13} /> <Tx>Confirm</Tx>
                        </button>
                      ) : null}
                      {['scheduled', 'confirmed'].includes(appointment.status) ? (
                        <>
                          <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => setStatus(appointment, 'completed')}>
                            <Tx>Complete</Tx>
                          </button>
                          <button type="button" className="btn-danger px-2 py-1 text-xs" onClick={() => setStatus(appointment, 'cancelled')}>
                            <X size={13} /> Cancel
                          </button>
                        </>
                      ) : null}
                      {appointment.status === 'confirmed' ? (
                        <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => setStatus(appointment, 'no_show')}>
                          <Tx>No show</Tx>
                        </button>
                      ) : null}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New appointment"
        description="The slot is validated against working hours, holidays and existing bookings."
        size="lg"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="appointment-form" className="btn-primary" disabled={busy}>
              {busy ? 'Booking…' : 'Book appointment'}
            </button>
          </>
        }
      >
        {error && open ? (
          <div className="mb-3">
            <Alert>{error}</Alert>
          </div>
        ) : null}
        <form id="appointment-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer name">
            <input className="input" required value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} />
          </Field>
          <Field label="Phone">
            <input className="input" value={form.customerPhone} onChange={(event) => setForm({ ...form, customerPhone: event.target.value })} />
          </Field>
          <Field label="Email">
            <input className="input" type="email" value={form.customerEmail} onChange={(event) => setForm({ ...form, customerEmail: event.target.value })} />
          </Field>
          <Field label={t(category.interestLabel)} hint={`What the customer is coming in for (${category.offerings.toLowerCase()}).`}>
            <input className="input" value={form.course} onChange={(event) => setForm({ ...form, course: event.target.value })} />
          </Field>
          <Field label="Type" hint="What kind of visit this is.">
            <select className="input" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
              {TYPES.map((type) => (
                <option key={type} value={type}>
                  {titleCase(type)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assign staff">
            <select className="input" value={form.staffId} onChange={(event) => setForm({ ...form, staffId: event.target.value })} disabled={!isBusinessAdmin}>
              <option value="">{isBusinessAdmin ? 'Unassigned' : `Me (${user?.name})`}</option>
              {(team || []).map((member) => (
                <option key={member._id} value={member._id}>
                  {member.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input className="input" type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
          </Field>
          <Field label="Start time">
            <input className="input" type="time" required value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} />
          </Field>
          <Field label="Duration (minutes)" hint="How long the slot stays blocked in the calendar.">
            <select className="input" value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })}>
              {[30, 45, 60, 90].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minutes
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes" className="sm:col-span-2" hint="Only your team sees these notes.">
            <textarea className="input" rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
