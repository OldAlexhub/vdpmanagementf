import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App';
import { isoDate, date } from '../format';
import { ActiveBadge, Card, Confirm, Empty, ErrorAlert, Field, Loading, Modal, PageHead, useLoad, useToast } from '../components/ui';

const TIMEZONES = ['America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York', 'America/Detroit', 'America/Phoenix'];

function DivisionForm({ division, onClose, onSaved }) {
  const [form, setForm] = useState({
    divisionNumber: division?.divisionNumber || '',
    name: division?.name || '',
    location: division?.location || '',
    timezone: division?.timezone || 'America/Los_Angeles',
    notes: division?.notes || '',
    cycleSettings: {
      anchorDate: isoDate(division?.cycleSettings?.anchorDate) || '2026-08-24',
      submissionOffsetDays: division?.cycleSettings?.submissionOffsetDays ?? 15,
      paymentOffsetDays: division?.cycleSettings?.paymentOffsetDays ?? 4,
    },
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setCycle = (k) => (e) => setForm({ ...form, cycleSettings: { ...form.cycleSettings, [k]: e.target.value } });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = division ? await api.put(`/divisions/${division._id}`, form) : await api.post('/divisions', form);
      onSaved(saved);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={division ? `Edit DIV ${division.divisionNumber}` : 'New division'}
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={busy}>Save division</button></>}
    >
      <div className="stack">
        <div className="form-grid">
          <Field label="Division number" htmlFor="d-num"><input id="d-num" value={form.divisionNumber} onChange={set('divisionNumber')} placeholder="10" /></Field>
          <Field label="Name" htmlFor="d-name"><input id="d-name" value={form.name} onChange={set('name')} placeholder="Portland" /></Field>
          <Field label="Location" htmlFor="d-loc"><input id="d-loc" value={form.location} onChange={set('location')} placeholder="Portland, OR" /></Field>
          <Field label="Time zone" htmlFor="d-tz">
            <select id="d-tz" value={form.timezone} onChange={set('timezone')}>
              {TIMEZONES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        <div>
          <h3 style={{ marginBottom: 8 }}>VDP cycle schedule</h3>
          <div className="form-grid">
            <Field label="A known cycle start (Monday)" htmlFor="d-anchor" help="Cycles are 14 days, Monday to Sunday, aligned to this date.">
              <input id="d-anchor" type="date" value={form.cycleSettings.anchorDate} onChange={setCycle('anchorDate')} />
            </Field>
            <div />
            <Field label="Submission closes (days after cycle end)" htmlFor="d-sub">
              <input id="d-sub" type="number" min="0" value={form.cycleSettings.submissionOffsetDays} onChange={setCycle('submissionOffsetDays')} />
            </Field>
            <Field label="Payment date (days after submission)" htmlFor="d-pay">
              <input id="d-pay" type="number" min="0" value={form.cycleSettings.paymentOffsetDays} onChange={setCycle('paymentOffsetDays')} />
            </Field>
          </div>
        </div>
        <Field label="Notes" htmlFor="d-notes"><textarea id="d-notes" value={form.notes} onChange={set('notes')} /></Field>
        <ErrorAlert error={error} />
      </div>
    </Modal>
  );
}

export default function Divisions() {
  const { user } = useAuth();
  const isAdmin = user.role === 'ADMIN';
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get('/divisions'), []);
  const [editing, setEditing] = useState(null);
  const [toggling, setToggling] = useState(null);

  return (
    <div className="page">
      <PageHead
        title="Divisions"
        sub="Each division has its own providers, VDP plans and cycle schedule."
        actions={isAdmin && <button className="btn btn-primary" onClick={() => setEditing({})}>New division</button>}
      />
      <ErrorAlert error={error} />
      {loading ? <Loading /> : (
        <Card body={false}>
          {data.length === 0 ? (
            <Empty title="No divisions yet" actions={isAdmin && <button className="btn btn-primary" onClick={() => setEditing({})}>Create the first division</button>}>
              Create a division to start adding providers and VDP plans.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Division</th><th>Location</th><th>Time zone</th><th className="num">Active providers</th><th className="num">Active plans</th><th>Cycle anchor</th><th>Status</th><th /></tr>
                </thead>
                <tbody>
                  {data.map((d) => (
                    <tr key={d._id}>
                      <td><div className="strong">DIV {d.divisionNumber} – {d.name}</div>{d.notes && <div className="muted small">{d.notes}</div>}</td>
                      <td>{d.location || '—'}</td>
                      <td className="small">{d.timezone}</td>
                      <td className="num"><Link to={`/providers?divisionId=${d._id}`}>{d.activeProviders}</Link></td>
                      <td className="num"><Link to={`/plans?divisionId=${d._id}`}>{d.activePlans}</Link></td>
                      <td className="small">{date(d.cycleSettings?.anchorDate)} · +{d.cycleSettings?.submissionOffsetDays}d / +{d.cycleSettings?.paymentOffsetDays}d</td>
                      <td><ActiveBadge status={d.status} /></td>
                      <td className="num">
                        {isAdmin && (
                          <div className="actions" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn btn-sm" onClick={() => setEditing(d)}>Edit</button>
                            <button className={`btn btn-sm ${d.status === 'ACTIVE' ? 'btn-danger' : ''}`} onClick={() => setToggling(d)}>
                              {d.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {editing && (
        <DivisionForm
          division={editing._id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); toast('Division saved'); reload(); }}
        />
      )}
      {toggling && (
        <Confirm
          title={`${toggling.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} DIV ${toggling.divisionNumber}?`}
          message={toggling.status === 'ACTIVE'
            ? 'The division will be hidden from processing and the dashboard. Its history is kept.'
            : 'The division will be available for processing again.'}
          confirmLabel={toggling.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
          tone={toggling.status === 'ACTIVE' ? 'danger' : 'primary'}
          onConfirm={async () => {
            await api.patch(`/divisions/${toggling._id}/status`, { status: toggling.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
            reload();
          }}
          onClose={() => setToggling(null)}
        />
      )}
    </div>
  );
}
