import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../App';
import { Alert, Badge, Card, Empty, ErrorAlert, Loading, PageHead, useLoad, useToast } from '../components/ui';

const FREQUENCIES = {
  WEEKLY: 'Weekly',
  PER_VDP_CYCLE: 'Per VDP cycle',
  NONE: 'No lease',
};

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
      toast(`Lift lease applied to ${result.applied.operators} operators in DIV ${division.divisionNumber}`);
      onSaved();
    } catch (error) { toast(error.message, 'bad'); }
    setSaving(false);
  };

  return (
    <tr>
      <td>
        <div className="strong">DIV {division.divisionNumber} – {division.name}</div>
        <div className="muted small">{division.liftLease?.configured ? <Badge tone="ok">Assigned</Badge> : <Badge tone="warn">Not assigned</Badge>}</div>
      </td>
      <td>{division.activeProviderCount} <span className="muted small">active</span></td>
      <td>{division.activeOperatorCount} <span className="muted small">active</span></td>
      <td>{division.payUnitCount}</td>
      <td>
        <select aria-label={`Lease frequency for DIV ${division.divisionNumber}`} value={frequency} onChange={(event) => setFrequency(event.target.value)} disabled={!canEdit || saving}>
          {Object.entries(FREQUENCIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </td>
      <td>
        {frequency === 'NONE' ? <span className="muted">—</span> : <input aria-label={`Lease price for DIV ${division.divisionNumber}`} value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="197.50" disabled={!canEdit || saving} style={{ width: 110 }} />}
      </td>
      <td className="num">
        {canEdit && <button className="btn btn-sm btn-primary" onClick={save} disabled={saving || (frequency !== 'NONE' && !amount)}>{saving ? 'Applying…' : 'Apply to division'}</button>}
      </td>
    </tr>
  );
}

export default function LiftLeases() {
  const { user } = useAuth();
  const canEdit = user.role === 'ADMIN';
  const leases = useLoad(() => api.get('/lift-leases'), []);

  return (
    <div className="page">
      <PageHead title="Lift Leases" sub="Set one lease price for every operator/pay unit in each Compass division." />
      <div style={{ marginBottom: 16 }}>
        <Alert tone="info">Applying a price updates every current operator in that division and becomes the default for operators added by future Compass refreshes. Open VDPs are marked for recalculation; approved and paid statements remain unchanged.</Alert>
      </div>
      <ErrorAlert error={leases.error} />
      {leases.loading ? <Loading /> : (
        <Card body={false}>
          {!leases.data?.length ? <Empty title="No Compass divisions">Refresh the Compass roster first.</Empty> : <div className="table-wrap">
            <table>
              <thead><tr><th>Division</th><th>Providers</th><th>Operators</th><th>Pay units</th><th>Frequency</th><th>Price ($)</th><th /></tr></thead>
              <tbody>{leases.data.map((division) => <LeaseRow key={division.divisionId} division={division} canEdit={canEdit} onSaved={leases.reload} />)}</tbody>
            </table>
          </div>}
        </Card>
      )}
    </div>
  );
}
