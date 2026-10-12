import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../App';
import { money } from '../format';
import { ActiveBadge, Alert, Badge, Card, Confirm, Empty, ErrorAlert, Field, Loading, Modal, PageHead, useLoad, useToast } from '../components/ui';

const FREQUENCIES = {
  WEEKLY: 'Weekly',
  PER_VDP_CYCLE: 'Per VDP cycle',
  NONE: 'No lease',
};

function LeaseOptionModal({ option, divisions, onClose, onSaved }) {
  const [form, setForm] = useState({
    divisionId: option?.divisionId || divisions[0]?._id || '',
    name: option?.name || '',
    frequency: option?.frequency || 'WEEKLY',
    amount: option?.amount || '',
    status: option?.status || 'ACTIVE',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (option) await api.put(`/lift-leases/options/${option._id}`, form);
      else await api.post('/lift-leases/options', form);
      onSaved();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };
  return (
    <Modal title={option ? `Edit ${option.name}` : 'Add lift lease option'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !form.divisionId || !form.name.trim() || (form.frequency !== 'NONE' && !form.amount)} onClick={save}>{busy ? 'Saving…' : option ? 'Save option' : 'Add option'}</button></>}>
      <div className="stack">
        <Alert tone="info">Saving an option makes it available in provider operator profiles. It does not assign or change any operator by itself.</Alert>
        <div className="form-grid">
          <Field label="Division" htmlFor="lease-option-division">
            <select id="lease-option-division" value={form.divisionId} onChange={(e) => setForm({ ...form, divisionId: e.target.value })}>
              <option value="">Choose…</option>
              {divisions.map((division) => <option key={division._id} value={division._id}>DIV {division.divisionNumber} – {division.name}</option>)}
            </select>
          </Field>
          <Field label="Option name" htmlFor="lease-option-name"><input id="lease-option-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Standard weekly lease" /></Field>
          <Field label="Frequency" htmlFor="lease-option-frequency">
            <select id="lease-option-frequency" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
              {Object.entries(FREQUENCIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          {form.frequency !== 'NONE' && <Field label="Amount ($)" htmlFor="lease-option-amount"><input id="lease-option-amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="decimal" placeholder="197.50" /></Field>}
          {option && <Field label="Status" htmlFor="lease-option-status">
            <select id="lease-option-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
          </Field>}
        </div>
        {option?.assignedOperatorCount > 0 && <p className="muted small">This option is assigned to {option.assignedOperatorCount} operator{option.assignedOperatorCount === 1 ? '' : 's'}. Rate changes update those assignments and mark open VDPs for recalculation.</p>}
        <ErrorAlert error={error} />
      </div>
    </Modal>
  );
}

function LeaseRow({ division, canEdit, onSaved }) {
  const toast = useToast();
  const [frequency, setFrequency] = useState(division.liftLease?.configured ? division.liftLease.frequency : 'WEEKLY');
  const [amount, setAmount] = useState(division.liftLease?.amount || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFrequency(division.liftLease?.configured ? division.liftLease.frequency : 'WEEKLY');
    setAmount(division.liftLease?.amount || '');
  }, [division]);

  const save = async () => {
    setSaving(true);
    try {
      const result = await api.put(`/lift-leases/${division.divisionId}`, { frequency, amount });
      const kept = result.preservedOptionCount ? `; kept ${result.preservedOptionCount} explicit option assignment${result.preservedOptionCount === 1 ? '' : 's'}` : '';
      toast(`Default applied to ${result.applied.operators} operators in DIV ${division.divisionNumber}${kept}`);
      onSaved();
    } catch (error) { toast(error.message, 'bad'); }
    setSaving(false);
  };

  return (
    <tr>
      <td>
        <div className="strong">DIV {division.divisionNumber} – {division.name}</div>
        <div className="muted small">{division.liftLease?.configured ? <Badge tone="ok">Default set</Badge> : <Badge tone="warn">No default</Badge>}</div>
      </td>
      <td>{division.activeProviderCount} <span className="muted small">active</span></td>
      <td>{division.activeOperatorCount} <span className="muted small">active</span></td>
      <td>{division.payUnitCount}</td>
      <td>
        <select aria-label={`Lease frequency for DIV ${division.divisionNumber}`} value={frequency} onChange={(event) => setFrequency(event.target.value)} disabled={!canEdit || saving}>
          {Object.entries(FREQUENCIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </td>
      <td>{frequency === 'NONE' ? <span className="muted">—</span> : <input aria-label={`Lease price for DIV ${division.divisionNumber}`} value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="197.50" disabled={!canEdit || saving} style={{ width: 110 }} />}</td>
      <td className="num">{canEdit && <button className="btn btn-sm btn-primary" onClick={save} disabled={saving || (frequency !== 'NONE' && !amount)}>{saving ? 'Applying…' : 'Apply default'}</button>}</td>
    </tr>
  );
}

export default function LiftLeases() {
  const { user } = useAuth();
  const toast = useToast();
  const canEdit = user.role === 'ADMIN';
  const leases = useLoad(() => api.get('/lift-leases'), []);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  // useLoad starts with an array, and a still-running pre-change API also returns
  // the old array shape. Normalize both so the page can render during rollout.
  const data = Array.isArray(leases.data)
    ? { divisions: [], options: [], defaults: leases.data }
    : { divisions: [], options: [], defaults: [], ...(leases.data || {}) };
  const closeSaved = () => { setEditing(null); leases.reload(); };

  return (
    <div className="page">
      <PageHead title="Lift Leases" sub="Create as many reusable lease options as needed and attach each one to a division."
        actions={canEdit && <button className="btn btn-primary" onClick={() => setEditing({ create: true })}>Add lease option</button>} />
      <div className="stack">
        <Alert tone="info">Adding an option does not assign it. Open a provider and choose the option for the appropriate operator. Compass division defaults continue to apply only where no explicit option is selected.</Alert>
        <ErrorAlert error={leases.error} />
        {leases.loading ? <Loading /> : (
          <>
            <Card title="Lease options" hint="Reusable choices available to operators in the selected division." body={false}>
              {!data.options.length ? <Empty title="No lease options yet">Add an option and assign it to an existing division.</Empty> : <div className="table-wrap">
                <table>
                  <thead><tr><th>Option</th><th>Division</th><th>Frequency</th><th>Amount</th><th>Assigned operators</th><th>Status</th><th /></tr></thead>
                  <tbody>{data.options.map((option) => <tr key={option._id}>
                    <td className="strong">{option.name}</td>
                    <td>DIV {option.division?.divisionNumber} – {option.division?.name}</td>
                    <td>{FREQUENCIES[option.frequency]}</td>
                    <td>{option.frequency === 'NONE' ? '—' : money(option.amount)}</td>
                    <td>{option.assignedOperatorCount}</td>
                    <td><ActiveBadge status={option.status} /></td>
                    <td className="num">{canEdit && <div className="actions" style={{ justifyContent: 'flex-end' }}><button className="btn btn-sm" onClick={() => setEditing(option)}>Edit</button>{option.assignedOperatorCount === 0 && <button className="btn btn-sm btn-danger" onClick={() => setDeleting(option)}>Delete</button>}</div>}</td>
                  </tr>)}</tbody>
                </table>
              </div>}
            </Card>
            <Card title="Compass division defaults" hint="Fallback for current and future Compass operators that do not have an explicit saved option." body={false}>
              {!data.defaults.length ? <Empty title="No Compass divisions">Refresh the Compass roster first.</Empty> : <div className="table-wrap">
                <table>
                  <thead><tr><th>Division</th><th>Providers</th><th>Operators</th><th>Pay units</th><th>Frequency</th><th>Price ($)</th><th /></tr></thead>
                  <tbody>{data.defaults.map((division) => <LeaseRow key={division.divisionId} division={division} canEdit={canEdit} onSaved={leases.reload} />)}</tbody>
                </table>
              </div>}
            </Card>
          </>
        )}
      </div>
      {editing && <LeaseOptionModal option={editing.create ? null : editing} divisions={data.divisions} onClose={() => setEditing(null)} onSaved={closeSaved} />}
      {deleting && <Confirm title={`Delete ${deleting.name}?`} message="This permanently removes the unused lease option." confirmLabel="Delete option" tone="danger" reason="Reason" onClose={() => setDeleting(null)} onConfirm={async (reason) => {
        await api.post(`/records/lift-lease/${deleting._id}/purge`, { reason, confirmation: 'PURGE' });
        leases.reload();
        toast('Lease option deleted');
      }} />}
    </div>
  );
}
