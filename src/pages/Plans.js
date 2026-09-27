import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App';
import { date, isoDate, rate, num, METRIC_LABELS, PAYMENT_TYPE_LABELS } from '../format';
import { ActiveBadge, Alert, Badge, Card, Empty, ErrorAlert, Field, Loading, Modal, PageHead, useLoad, useToast } from '../components/ui';

const blankTier = () => ({ minimumPercentage: '', maximumPercentage: '', rate: '' });
const DEFAULT_TIERS = [
  { minimumPercentage: '0', maximumPercentage: '79.99', rate: '' },
  { minimumPercentage: '80', maximumPercentage: '86.99', rate: '' },
  { minimumPercentage: '87', maximumPercentage: '94.99', rate: '' },
  { minimumPercentage: '95', maximumPercentage: '99.99', rate: '' },
  { minimumPercentage: '100', maximumPercentage: '', rate: '' },
];

export function TierTable({ tiers, compact }) {
  if (!tiers?.length) return <p className="muted">No incentive tiers.</p>;
  return (
    <table className={compact ? 'table-compact' : ''}>
      <thead><tr><th>Performance (% of contracted hours)</th><th className="num">Rate</th></tr></thead>
      <tbody>
        {tiers.map((t) => (
          <tr key={t.minimumPercentage}>
            <td>{t.maximumPercentage ? `${num(t.minimumPercentage)}% – ${num(t.maximumPercentage)}%` : `${num(t.minimumPercentage)}% and above`}</td>
            <td className="num strong">{rate(t.rate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TierEditor({ tiers, onChange }) {
  const update = (i, k, v) => onChange(tiers.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
  return (
    <div className="stack">
      <table className="table-compact">
        <thead><tr><th>From %</th><th>To %</th><th>Rate ($)</th><th /></tr></thead>
        <tbody>
          {tiers.map((t, i) => (
            <tr key={i}>
              <td><input aria-label={`Tier ${i + 1} from`} value={t.minimumPercentage} onChange={(e) => update(i, 'minimumPercentage', e.target.value)} /></td>
              <td><input aria-label={`Tier ${i + 1} to`} value={t.maximumPercentage ?? ''} placeholder={i === tiers.length - 1 ? 'and above' : ''} onChange={(e) => update(i, 'maximumPercentage', e.target.value)} /></td>
              <td><input aria-label={`Tier ${i + 1} rate`} value={t.rate} onChange={(e) => update(i, 'rate', e.target.value)} /></td>
              <td className="num"><button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(tiers.filter((_, j) => j !== i))}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="actions">
        <button type="button" className="btn btn-sm" onClick={() => onChange([...tiers, blankTier()])}>Add tier</button>
        {!tiers.length && <button type="button" className="btn btn-sm" onClick={() => onChange(DEFAULT_TIERS)}>Start from 80/87/95/100% layout</button>}
      </div>
      <p className="help muted small">
        Tiers are chosen by range: the highest tier whose “From %” is at or below the result. Leave “To %” blank on the last tier.
        Rates keep the precision you enter (up to 4 decimals).
      </p>
    </div>
  );
}

const versionForm = (v) => ({
  paymentType: v?.paymentType || 'HOURLY',
  basePay: v?.basePay || '',
  contractedHours: v?.contractedHours || '',
  incentiveEnabled: v?.incentiveEnabled ?? false,
  incentiveTiers: (v?.incentiveTiers || []).map((t) => ({ ...t, maximumPercentage: t.maximumPercentage ?? '' })),
  bonusEnabled: v?.bonusEnabled ?? false,
  bonusRate: v?.bonusRate || '',
  performanceHourMetric: v?.performanceHourMetric || 'TOTAL_HOURS',
  performanceHourColumn: v?.performanceHourColumn || '',
  effectiveFrom: isoDate(v?.effectiveFrom) || '',
  effectiveTo: isoDate(v?.effectiveTo) || '',
  notes: v?.notes || '',
});

function VersionFields({ form, setForm, showDates = true }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const hourly = form.paymentType === 'HOURLY';
  return (
    <div className="stack">
      <div className="form-grid">
        <Field label="Payment type" htmlFor="v-type">
          <select id="v-type" value={form.paymentType} onChange={(e) => setForm({ ...form, paymentType: e.target.value, bonusEnabled: e.target.value === 'HOURLY' && form.bonusEnabled })}>
            <option value="HOURLY">Hourly — paid on hours performed</option>
            <option value="PER_TRIP">Per trip — paid on trips provided</option>
          </select>
        </Field>
        <Field label={hourly ? 'Base pay ($/hour)' : 'Base pay ($/trip)'} htmlFor="v-base" help="Paid when TUI does not apply.">
          <input id="v-base" value={form.basePay} onChange={set('basePay')} placeholder={hourly ? '25.97' : '21.50'} />
        </Field>
        <Field label="Contracted hours per week" htmlFor="v-hours" help={hourly ? 'Required for hourly plans.' : 'Optional for per-trip plans (needed only for TUI).'}>
          <input id="v-hours" value={form.contractedHours} onChange={set('contractedHours')} placeholder="40" />
        </Field>
        <Field label="Performance hours come from" htmlFor="v-metric" help="Which Performance Report column counts as hours worked.">
          <select id="v-metric" value={form.performanceHourMetric} onChange={set('performanceHourMetric')}>
            {Object.entries(METRIC_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        {form.performanceHourMetric === 'OTHER' && (
          <Field label="Report column name (Hours section)" htmlFor="v-col" full>
            <input id="v-col" value={form.performanceHourColumn} onChange={set('performanceHourColumn')} placeholder="e.g. Slk Time (mins)" />
          </Field>
        )}
        {showDates && (
          <>
            <Field label="Effective from" htmlFor="v-from"><input id="v-from" type="date" value={form.effectiveFrom} onChange={set('effectiveFrom')} /></Field>
            <Field label="Effective to" htmlFor="v-to" help="Leave blank if open-ended."><input id="v-to" type="date" value={form.effectiveTo} onChange={set('effectiveTo')} /></Field>
          </>
        )}
      </div>

      <div className="card card-body">
        <label className="check"><input type="checkbox" checked={form.incentiveEnabled} onChange={set('incentiveEnabled')} /> TUI (Top-Up Incentive) eligible</label>
        <p className="muted small" style={{ margin: '4px 0 10px 24px' }}>
          When on, the weekly rate comes from the incentive tiers below. When off, everyone on this plan is paid the base pay.
          Individual providers can still be switched on or off on their profile.
        </p>
        {(form.incentiveEnabled || form.incentiveTiers.length > 0) && (
          <TierEditor tiers={form.incentiveTiers} onChange={(incentiveTiers) => setForm({ ...form, incentiveTiers })} />
        )}
      </div>

      {hourly && (
        <div className="card card-body">
          <label className="check"><input type="checkbox" checked={form.bonusEnabled} onChange={set('bonusEnabled')} /> Pay bonus rate for hours above contracted hours</label>
          {form.bonusEnabled && (
            <div className="form-grid" style={{ marginTop: 10 }}>
              <Field label="Bonus rate ($/hour)" htmlFor="v-bonus" help="Separate from the incentive tiers.">
                <input id="v-bonus" value={form.bonusRate} onChange={set('bonusRate')} placeholder="34.62" />
              </Field>
            </div>
          )}
        </div>
      )}
      <Field label="Notes" htmlFor="v-notes"><textarea id="v-notes" value={form.notes} onChange={set('notes')} /></Field>
    </div>
  );
}

function VersionModal({ plan, version, mode, onClose, onSaved }) {
  // mode: 'create-plan' | 'add' | 'edit'
  const [form, setForm] = useState(() => {
    const f = versionForm(version);
    if (mode === 'add') { f.effectiveFrom = ''; f.effectiveTo = ''; f.notes = ''; }
    return f;
  });
  const [meta, setMeta] = useState({ name: '', divisionId: plan?.divisionId || '', notes: '' });
  const divisions = useLoad(() => (mode === 'create-plan' ? api.get('/divisions') : Promise.resolve([])), [mode]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      let saved;
      if (mode === 'create-plan') saved = await api.post('/vdp-plans', { ...meta, version: form });
      else if (mode === 'add') saved = await api.post(`/vdp-plans/${plan._id}/versions`, form);
      else saved = await api.put(`/vdp-plans/${plan._id}/versions/${version._id}`, form);
      onSaved(saved);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  const title = mode === 'create-plan' ? 'New VDP plan' : mode === 'add' ? `New version of ${plan.name}` : `Edit ${plan.name} v${version.versionNumber}`;
  return (
    <Modal wide title={title} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>{mode === 'create-plan' ? 'Create plan' : 'Save version'}</button></>}>
      <div className="stack">
        {mode === 'add' && <Alert tone="info">The new version starts on its effective date. The current version will automatically end the day before. VDPs already approved keep the rules they were calculated with.</Alert>}
        {mode === 'edit' && <Alert tone="warn">Editing corrects this version in place. It is only allowed because no approved VDP uses it yet.</Alert>}
        {mode === 'create-plan' && (
          <div className="form-grid">
            <Field label="Division" htmlFor="p-div">
              <select id="p-div" value={meta.divisionId} onChange={(e) => setMeta({ ...meta, divisionId: e.target.value })}>
                <option value="">Choose…</option>
                {(divisions.data || []).map((d) => <option key={d._id} value={d._id}>DIV {d.divisionNumber} – {d.name}</option>)}
              </select>
            </Field>
            <Field label="Plan name" htmlFor="p-name"><input id="p-name" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} placeholder="Night Service" /></Field>
          </div>
        )}
        <VersionFields form={form} setForm={setForm} />
        <ErrorAlert error={error} />
      </div>
    </Modal>
  );
}

export function planSummary(v) {
  if (!v) return 'No version';
  const unit = v.paymentType === 'HOURLY' ? '/hr' : '/trip';
  const parts = [`${rate(v.basePay)}${unit} base`];
  if (v.contractedHours) parts.push(`${num(v.contractedHours)} h/week`);
  parts.push(v.incentiveEnabled ? `TUI ${v.incentiveTiers.length} tiers` : 'no TUI');
  if (v.bonusEnabled) parts.push(`bonus ${rate(v.bonusRate)}`);
  return parts.join(' · ');
}

export function PlanList() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const divisionId = params.get('divisionId') || '';
  const navigate = useNavigate();
  const toast = useToast();
  const divisions = useLoad(() => api.get('/divisions'), []);
  const { data, loading, error, reload } = useLoad(() => api.get('/vdp-plans', { divisionId }), [divisionId]);
  const [creating, setCreating] = useState(false);
  const divName = (id) => { const d = divisions.data?.find((x) => x._id === id); return d ? `DIV ${d.divisionNumber} – ${d.name}` : ''; };

  return (
    <div className="page">
      <PageHead title="VDP Plans" sub="How providers are paid. Providers inherit these rules unless their profile overrides them."
        actions={user.role === 'ADMIN' && <button className="btn btn-primary" onClick={() => setCreating(true)}>New plan</button>} />
      <div className="filters" style={{ marginBottom: 16 }}>
        <Field label="Division" htmlFor="pl-div">
          <select id="pl-div" value={divisionId} onChange={(e) => setParams(e.target.value ? { divisionId: e.target.value } : {})}>
            <option value="">All divisions</option>
            {(divisions.data || []).map((d) => <option key={d._id} value={d._id}>DIV {d.divisionNumber} – {d.name}</option>)}
          </select>
        </Field>
      </div>
      <ErrorAlert error={error} />
      {loading ? <Loading /> : (
        <Card body={false}>
          {data.length === 0 ? <Empty title="No VDP plans">Create a plan to define how providers in a division are paid.</Empty> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Plan</th><th>Division</th><th>Type</th><th>Current rules</th><th className="num">Providers</th><th>Versions</th><th>Status</th></tr></thead>
                <tbody>
                  {data.map((p) => {
                    const cur = p.versions.find((v) => v._id === p.currentVersionId);
                    return (
                      <tr key={p._id} className="clickable" onClick={() => navigate(`/plans/${p._id}`)}>
                        <td className="strong">{p.name}</td>
                        <td>{divName(p.divisionId)}</td>
                        <td>{PAYMENT_TYPE_LABELS[cur?.paymentType]}</td>
                        <td className="small">{planSummary(cur)}</td>
                        <td className="num">{p.providerCount}</td>
                        <td>{p.versions.length}</td>
                        <td><ActiveBadge status={p.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {creating && <VersionModal mode="create-plan" plan={{ divisionId }} onClose={() => setCreating(false)}
        onSaved={(p) => { setCreating(false); toast('Plan created'); reload(); navigate(`/plans/${p._id}`); }} />}
    </div>
  );
}

export function PlanDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const isAdmin = user.role === 'ADMIN';
  const toast = useToast();
  const { data: plan, loading, error, reload, setData } = useLoad(() => api.get(`/vdp-plans/${id}`), [id]);
  const providers = useLoad(() => api.get('/providers', { planId: id }), [id]);
  const [modal, setModal] = useState(null);
  const [editMeta, setEditMeta] = useState(null);

  if (loading) return <div className="page"><Loading /></div>;
  if (error) return <div className="page"><ErrorAlert error={error} /></div>;
  const current = plan.versions.find((v) => v._id === plan.currentVersionId);

  return (
    <div className="page">
      <PageHead
        crumbs={<Link to="/plans">VDP Plans</Link>}
        title={<>{plan.name} <ActiveBadge status={plan.status} /></>}
        sub={plan.notes}
        actions={isAdmin && (
          <>
            <button className="btn" onClick={() => setEditMeta({ name: plan.name, notes: plan.notes || '', status: plan.status })}>Edit plan</button>
            <button className="btn btn-primary" onClick={() => setModal({ mode: 'add', version: current })}>New version (rate change)</button>
          </>
        )}
      />
      <div className="split">
        <div className="stack">
          {plan.versions.map((v) => (
            <Card key={v._id}
              title={<>Version {v.versionNumber} {v._id === plan.currentVersionId && <Badge tone="ok">Current</Badge>} {v.locked && <Badge tone="outline">Used by approved VDPs</Badge>}</>}
              hint={`Effective ${date(v.effectiveFrom)} – ${v.effectiveTo ? date(v.effectiveTo) : 'open'}`}
              actions={isAdmin && !v.locked && <button className="btn btn-sm" onClick={() => setModal({ mode: 'edit', version: v })}>Edit</button>}>
              <div className="kv" style={{ marginBottom: 14 }}>
                <div><div className="k">Payment type</div><div className="v">{PAYMENT_TYPE_LABELS[v.paymentType]}</div></div>
                <div><div className="k">Base pay</div><div className="v">{rate(v.basePay)}{v.paymentType === 'HOURLY' ? '/hour' : '/trip'}</div></div>
                <div><div className="k">Contracted hours</div><div className="v">{v.contractedHours ? `${num(v.contractedHours)} / week` : '—'}</div></div>
                <div><div className="k">Performance hours</div><div className="v">{METRIC_LABELS[v.performanceHourMetric]}{v.performanceHourColumn ? ` (${v.performanceHourColumn})` : ''}</div></div>
                <div><div className="k">TUI eligible</div><div className="v">{v.incentiveEnabled ? <Badge tone="ok">On</Badge> : <Badge>Off</Badge>}</div></div>
                <div><div className="k">Bonus rate</div><div className="v">{v.bonusEnabled ? `${rate(v.bonusRate)}/hour above contract` : 'None'}</div></div>
              </div>
              {(v.incentiveEnabled || v.incentiveTiers.length > 0) && (
                <>
                  <h3 style={{ margin: '4px 0 8px' }}>Incentive tiers {!v.incentiveEnabled && <span className="muted small">(kept, TUI off)</span>}</h3>
                  <TierTable tiers={v.incentiveTiers} compact />
                </>
              )}
              {v.notes && <p className="muted small" style={{ marginTop: 10 }}>{v.notes}</p>}
            </Card>
          ))}
        </div>
        <Card title="Providers on this plan" body={false}>
          {providers.loading ? <Loading /> : providers.data.length === 0 ? <Empty title="No providers">Assign this plan on a provider profile.</Empty> : (
            <table className="table-compact">
              <tbody>
                {providers.data.map((p) => (
                  <tr key={p._id}>
                    <td><Link to={`/providers/${p._id}`}>{p.name}</Link><div className="muted small">{p.operatorName} · route {p.routes.join(', ') || '—'}</div></td>
                    <td className="num">{p.overrides?.tuiEligibility !== 'INHERIT' || p.overrides?.contractedHours || p.overrides?.basePay || p.overrides?.bonusRate
                      ? <Badge tone="warn">Override</Badge> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
      {modal && <VersionModal plan={plan} mode={modal.mode} version={modal.version} onClose={() => setModal(null)}
        onSaved={(p) => { setModal(null); setData(p); toast('Plan version saved'); }} />}
      {editMeta && (
        <Modal title="Edit plan" onClose={() => setEditMeta(null)}
          footer={<><button className="btn" onClick={() => setEditMeta(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={async () => { await api.put(`/vdp-plans/${plan._id}`, editMeta); setEditMeta(null); reload(); toast('Plan saved'); }}>Save</button></>}>
          <div className="stack">
            <Field label="Name" htmlFor="pm-name"><input id="pm-name" value={editMeta.name} onChange={(e) => setEditMeta({ ...editMeta, name: e.target.value })} /></Field>
            <Field label="Status" htmlFor="pm-status">
              <select id="pm-status" value={editMeta.status} onChange={(e) => setEditMeta({ ...editMeta, status: e.target.value })}>
                <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
              </select>
            </Field>
            <Field label="Notes" htmlFor="pm-notes"><textarea id="pm-notes" value={editMeta.notes} onChange={(e) => setEditMeta({ ...editMeta, notes: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
