import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App';
import { Alert, Badge, Card, Empty, ErrorAlert, Loading, PageHead, useLoad, useToast } from '../components/ui';

function AssignmentRow({ division, canEdit, onSaved }) {
  const toast = useToast();
  const [planId, setPlanId] = useState(division.defaultPlanId || '');
  const [saving, setSaving] = useState(false);
  const choices = division.plans.filter((plan) => plan.status === 'ACTIVE' || plan._id === division.defaultPlanId);

  useEffect(() => { setPlanId(division.defaultPlanId || ''); }, [division.defaultPlanId]);

  const apply = async () => {
    const plan = division.plans.find((item) => item._id === planId);
    const warning = division.overrideCount
      ? `This will replace ${division.overrideCount} provider plan exception${division.overrideCount === 1 ? '' : 's'} in DIV ${division.divisionNumber} with ${plan?.name}. Continue?`
      : `Apply ${plan?.name} to all ${division.providerCount} providers in DIV ${division.divisionNumber}?`;
    if (!window.confirm(warning)) return;
    setSaving(true);
    try {
      const result = await api.put(`/plan-assignments/${division.divisionId}`, { planId });
      toast(`${plan?.name} applied to ${result.applied.providers} providers in DIV ${division.divisionNumber}`);
      onSaved();
    } catch (error) { toast(error.message, 'bad'); }
    setSaving(false);
  };

  return (
    <tr>
      <td>
        <div className="strong">DIV {division.divisionNumber} – {division.name}</div>
        <div className="muted small">{division.defaultPlanId ? <Badge tone="ok">Default set</Badge> : <Badge tone="warn">No default</Badge>}</div>
      </td>
      <td>{division.activeProviderCount} <span className="muted small">active</span></td>
      <td>
        {choices.length ? (
          <select aria-label={`VDP plan for DIV ${division.divisionNumber}`} value={planId} onChange={(event) => setPlanId(event.target.value)} disabled={!canEdit || saving}>
            <option value="">Choose a plan…</option>
            {choices.map((plan) => <option key={plan._id} value={plan._id}>{plan.name}{plan.status !== 'ACTIVE' ? ' (inactive)' : ''}</option>)}
          </select>
        ) : <span className="muted">No active plans</span>}
      </td>
      <td>{division.assignedToDefaultCount}</td>
      <td>{division.overrideCount ? <Badge tone="warn">{division.overrideCount}</Badge> : '0'}</td>
      <td>{division.unassignedCount ? <Badge tone="bad">{division.unassignedCount}</Badge> : '0'}</td>
      <td className="num">
        {canEdit && choices.length > 0 && <button className="btn btn-sm btn-primary" onClick={apply} disabled={saving || !planId}>{saving ? 'Applying…' : 'Apply to all providers'}</button>}
      </td>
    </tr>
  );
}

export default function PlanAssignments() {
  const { user } = useAuth();
  const canEdit = user.role === 'ADMIN';
  const assignments = useLoad(() => api.get('/plan-assignments'), []);

  return (
    <div className="page">
      <PageHead title="Plan Assignments" sub="Assign one VDP plan to every provider in a division." />
      <div style={{ marginBottom: 16 }}>
        <Alert tone="info">
          Applying a plan updates every current provider in the division and becomes the default for providers added by future Compass refreshes. You can open an individual provider afterward and choose a different plan as an exception. Applying the division plan again replaces those exceptions. Open VDPs are marked for recalculation; approved and paid statements remain unchanged.
        </Alert>
      </div>
      <ErrorAlert error={assignments.error} />
      {assignments.loading ? <Loading /> : (
        <Card body={false}>
          {!assignments.data?.length ? <Empty title="No divisions">Refresh the Compass roster or add a division first.</Empty> : <div className="table-wrap">
            <table>
              <thead><tr><th>Division</th><th>Providers</th><th>Division plan</th><th>Using default</th><th>Exceptions</th><th>No plan</th><th /></tr></thead>
              <tbody>{assignments.data.map((division) => <AssignmentRow key={division.divisionId} division={division} canEdit={canEdit} onSaved={assignments.reload} />)}</tbody>
            </table>
          </div>}
          {assignments.data?.some((division) => !division.plans.some((plan) => plan.status === 'ACTIVE')) && (
            <div style={{ padding: 16 }} className="muted small">A division without an active choice needs a plan first. <Link to="/plans">Create or activate a VDP plan</Link>.</div>
          )}
        </Card>
      )}
    </div>
  );
}
