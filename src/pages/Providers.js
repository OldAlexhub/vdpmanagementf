import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { rate, num, money, date, todayLocal, cycleLabel, METRIC_LABELS, PAYMENT_TYPE_LABELS, LEASE_LABELS } from '../format';
import { ActiveBadge, Alert, Badge, Card, Empty, ErrorAlert, Field, Loading, Modal, PageHead, StatusBadge, useLoad, useToast } from '../components/ui';
import { TierTable, planSummary, fuelMethodOf } from './Plans';
import PortalAccess from '../components/PortalAccess';
import BulkImport from '../components/BulkImport';

const leaseText = (l) => (!l || l.frequency === 'NONE' || !l.amount ? 'None' : `${money(l.amount)} / ${LEASE_LABELS[l.frequency]}`);

// List rows carry the raw provider; older providers keep their lease on the provider itself.
function leaseSummary(p) {
  const ops = p.operators?.length ? p.operators.filter((o) => o.status === 'ACTIVE' && !o.transferredTo) : [{ liftLease: p.liftLease }];
  const leased = ops.filter((o) => o.liftLease && o.liftLease.frequency !== 'NONE' && o.liftLease.amount);
  if (ops.length === 1) return leaseText(ops[0].liftLease);
  return leased.length ? `${leased.length} of ${ops.length} operators` : 'None';
}

export function ProviderList() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') || '');
  const divisionId = params.get('divisionId') || '';
  const status = params.get('status') ?? 'ACTIVE';
  const [importing, setImporting] = useState(false);
  const divisions = useLoad(() => api.get('/divisions'), []);
  const { data, loading, error, reload } = useLoad(
    () => api.get('/providers', { divisionId, status, search: params.get('search') || '' }),
    [divisionId, status, params.get('search')],
  );
  useEffect(() => {
    const t = setTimeout(() => {
      const next = Object.fromEntries(params);
      if (search) next.search = search; else delete next.search;
      if ((params.get('search') || '') !== search) setParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  const setParam = (k, v) => { const next = Object.fromEntries(params); if (v === '' && k !== 'status') delete next[k]; else next[k] = v; setParams(next); };

  return (
    <div className="page">
      <PageHead title="Providers" sub="Who they are, which route they run, and how they are paid."
        actions={<><button className="btn" onClick={() => setImporting(true)}>Bulk import</button><button className="btn btn-primary" onClick={() => navigate('/providers/new')}>New provider</button></>} />
      {importing && <BulkImport kind="providers" title="Providers" onClose={() => setImporting(false)} onDone={reload} />}
      <div className="filters" style={{ marginBottom: 16 }}>
        <Field label="Search" htmlFor="pv-search"><input id="pv-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, operator, route, number" /></Field>
        <Field label="Division" htmlFor="pv-div">
          <select id="pv-div" value={divisionId} onChange={(e) => setParam('divisionId', e.target.value)}>
            <option value="">All divisions</option>
            {(divisions.data || []).map((d) => <option key={d._id} value={d._id}>DIV {d.divisionNumber} – {d.name}</option>)}
          </select>
        </Field>
        <Field label="Status" htmlFor="pv-status">
          <select id="pv-status" value={status} onChange={(e) => setParam('status', e.target.value)}>
            <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="">All</option>
          </select>
        </Field>
      </div>
      <ErrorAlert error={error} />
      {loading ? <Loading /> : (
        <Card body={false}>
          {data.length === 0 ? (
            <Empty title="No providers found" actions={<button className="btn btn-primary" onClick={() => navigate('/providers/new')}>Add a provider</button>}>
              Try a different search or add a provider.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Provider</th><th>Division</th><th>Operator</th><th>Route</th><th>VDP plan</th><th>Lift lease</th><th>Status</th></tr></thead>
                <tbody>
                  {data.map((p) => {
                    const override = p.overrides && (p.overrides.tuiEligibility !== 'INHERIT' || p.overrides.contractedHours || p.overrides.basePay || p.overrides.bonusRate);
                    return (
                      <tr key={p._id} className="clickable" onClick={() => navigate(`/providers/${p._id}`)}>
                        <td><div className="strong">{p.name}</div><div className="muted small">#{p.providerNumber || '—'}</div></td>
                        <td>{p.division ? `DIV ${p.division.divisionNumber}` : '—'}</td>
                        <td>{p.operatorName || '—'}{p.operators?.filter((o) => o.status === 'ACTIVE' && !o.transferredTo).length > 1 && <div className="muted small">{p.operators.filter((o) => o.status === 'ACTIVE' && !o.transferredTo).length} operators</div>}</td>
                        <td className="mono">{p.routes.join(', ') || <span className="muted">—</span>}</td>
                        <td>{p.planName || <Badge tone="bad">No plan</Badge>} {override && <Badge tone="warn">Override</Badge>}</td>
                        <td className="nowrap">{leaseSummary(p)}</td>
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
    </div>
  );
}

function SettingRow({ label, setting, render = (v) => v }) {
  if (!setting) return null;
  const override = setting.source === 'PROVIDER_OVERRIDE';
  return (
    <tr>
      <td className="muted">{label}</td>
      <td className="strong">{setting.value === null || setting.value === undefined ? '—' : render(setting.value)}</td>
      <td className="num">
        {override ? <span className="source-tag source-override">Provider override</span> : <span className="source-tag source-plan">Inherited</span>}
      </td>
    </tr>
  );
}

// Move an operator to another provider from an effective date. Report days before it stay
// with this provider; days from it go to the new one — even inside a cycle.
function MoveOperator({ provider, operator, onClose, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({ toProviderId: '', effectiveDate: todayLocal(), note: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const others = useLoad(() => api.get('/providers', { divisionId: provider.divisionId, status: 'ACTIVE' }), [provider.divisionId]);
  const target = others.data?.find((x) => x._id === form.toProviderId);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/providers/${provider._id}/operators/${operator.id}/transfer`, form);
      toast(`${operator.name} moves to ${target?.name} from ${date(form.effectiveDate)}`);
      onDone();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };
  return (
    <Modal title={`Move ${operator.name} to another provider`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !form.toProviderId || !form.effectiveDate} onClick={submit}>{busy ? 'Moving…' : 'Move operator'}</button></>}>
      <div className="stack">
        <p className="small">
          {operator.name} keeps route <span className="mono">{operator.routes.join(', ') || '—'}</span>, their contracted hours and lift lease.
          Performance before the effective date stays with <strong>{provider.name}</strong>; from that date it is paid to the new provider — even in the middle of a cycle.
          A cycle split by the move charges each lease week to whoever has the operator on the week’s first day.
        </p>
        <Field label="Moving to" htmlFor="mv-to">
          <select id="mv-to" value={form.toProviderId} onChange={(e) => setForm({ ...form, toProviderId: e.target.value })}>
            <option value="">Choose a provider…</option>
            {(others.data || []).filter((x) => x._id !== provider._id).map((x) => <option key={x._id} value={x._id}>{x.name}{x.providerNumber ? ` (#${x.providerNumber})` : ''}</option>)}
          </select>
        </Field>
        <Field label="Effective date (first day with the new provider)" htmlFor="mv-date">
          <input id="mv-date" type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} />
        </Field>
        <Field label="Note (optional)" htmlFor="mv-note">
          <textarea id="mv-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. Operator switched providers at their request" />
        </Field>
        <p className="muted small">Open VDPs for both providers are marked for recalculation. VDPs already approved for dates on or after the move must be reopened first.</p>
        <ErrorAlert error={error} />
      </div>
    </Modal>
  );
}

export function ProviderProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: p, loading, error, reload } = useLoad(() => api.get(`/providers/${id}`), [id]);
  const [moving, setMoving] = useState(null);
  const divisionPlans = useLoad(() => (p?.operators?.some((o) => o.planId) ? api.get('/vdp-plans', { divisionId: p.divisionId }) : Promise.resolve([])), [p?._id, p?.divisionId]);
  const planName = (id) => divisionPlans.data?.find((x) => x._id === id)?.name || '…';
  const division = useLoad(() => (p ? api.get(`/divisions/${p.divisionId}`) : Promise.resolve(null)), [p?.divisionId]);
  const vdps = useLoad(() => (p ? api.get('/vdps', { providerId: p._id }) : Promise.resolve([])), [p?._id]);

  if (loading) return <div className="page"><Loading /></div>;
  if (error) return <div className="page"><ErrorAlert error={error} /></div>;
  const s = p.paymentSettings;
  const perTrip = s?.paymentType.value === 'PER_TRIP';

  return (
    <div className="page">
      <PageHead
        crumbs={<Link to="/providers">Providers</Link>}
        title={<>{p.name} <ActiveBadge status={p.status} /></>}
        sub={division.data ? `DIV ${division.data.divisionNumber} – ${division.data.name}` : ''}
        actions={<button className="btn btn-primary" onClick={() => navigate(`/providers/${id}/edit`)}>Edit provider</button>}
      />
      {p.sharedRoutes?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Alert tone="warn">
            {p.sharedRoutes.map((r) => `Route ${r.route} is also assigned to ${r.provider}.`).join(' ')} Performance for a shared route will be flagged for review instead of guessed.
          </Alert>
        </div>
      )}
      <div className="grid grid-2">
        <Card title="Profile">
          <div className="kv" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <div><div className="k">Provider number</div><div className="v">{p.providerNumber || '—'}</div></div>
            <div><div className="k">Service type</div><div className="v">{p.serviceType || '—'}</div></div>
            <div><div className="k">VDP plan</div><div className="v">{p.plan ? <Link to={`/plans/${p.plan._id}`}>{p.plan.name}</Link> : <Badge tone="bad">No plan assigned</Badge>}</div></div>
            <div><div className="k">Email</div><div className="v">{p.contact?.email || '—'}</div></div>
            <div><div className="k">Phone</div><div className="v">{p.contact?.phone || '—'}</div></div>
          </div>
          {p.notes && <p className="muted small" style={{ marginTop: 12 }}>{p.notes}</p>}
        </Card>

        <Card title="Payment settings" hint={s ? `${s.planName} v${s.versionNumber} · effective ${date(s.effectiveFrom)}${s.effectiveTo ? ` – ${date(s.effectiveTo)}` : ''}` : undefined}>
          {!s ? <Alert tone="bad">No VDP plan (or no current plan version). This provider’s VDP will need review until a plan is assigned.</Alert> : (
            <>
              <table className="table-compact">
                <tbody>
                  <SettingRow label="Payment type" setting={s.paymentType} render={(v) => PAYMENT_TYPE_LABELS[v]} />
                  <SettingRow label={perTrip ? 'Base pay (per trip)' : 'Base pay (per hour)'} setting={s.basePay} render={rate} />
                  <SettingRow label="Contracted hours" setting={s.contractedHours} render={(v) => `${num(v)} / week`} />
                  <SettingRow label="TUI eligible" setting={s.tuiEligible} render={(v) => (v ? <Badge tone="ok">Yes</Badge> : <Badge>No</Badge>)} />
                  <SettingRow label="Bonus rate" setting={s.bonusEnabled.value ? s.bonusRate : { ...s.bonusRate, value: 'None' }} render={(v) => (v === 'None' ? v : `${rate(v)} / hour above contract`)} />
                  {s.fuelMethod?.value === 'SERVICE_MILE_ALLOWANCE' ? (
                    <>
                      <SettingRow label="Fuel" setting={s.fuelMethod} render={() => 'Service mile allowance'} />
                      <SettingRow label="Fuel efficiency" setting={s.fuelMpg} render={(v) => `${num(v)} MPG`} />
                    </>
                  ) : (
                    <SettingRow label="Fuel reimbursement" setting={s.fuelReimbursementEnabled?.value ? s.fuelReimbursementRate : { source: 'PLAN', value: 'None' }} render={(v) => (v === 'None' ? v : `${rate(v)} / trip`)} />
                  )}
                  <SettingRow label="Performance hours" setting={s.performanceHourMetric} render={(v) => METRIC_LABELS[v]} />
                </tbody>
              </table>
              {s.tuiEligible.value && (
                <>
                  <h3 style={{ margin: '14px 0 8px' }}>Incentive tiers <span className="source-tag source-plan">Inherited</span></h3>
                  <TierTable tiers={s.incentiveTiers.value} compact />
                </>
              )}
            </>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 16 }} />
      <Card title="Operators" hint="Each operator is measured against their own contracted hours; the provider is paid the total." body={false}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Operator</th><th>Route / run</th><th>VDP plan</th><th>Contracted hours</th><th>Lift lease</th><th>Status</th><th /></tr></thead>
            <tbody>
              {(p.operators || []).map((o) => (
                <tr key={o.id || o.name} className={o.transferredTo ? 'muted' : ''}>
                  <td>
                    <div className="strong">{o.name}</div>
                    {o.transferredFrom && <div className="muted small">From {date(o.transferredFrom.effectiveDate)} · moved from <Link to={`/providers/${o.transferredFrom.providerId}`}>{o.transferredFrom.providerName}</Link></div>}
                    {o.transferredTo && <div className="muted small">Until {date(o.endDate)} · moved to <Link to={`/providers/${o.transferredTo.providerId}`}>{o.transferredTo.providerName}</Link></div>}
                  </td>
                  <td className="mono">{o.routes.join(', ') || <Badge tone="warn">No route</Badge>}</td>
                  <td>{o.planId
                    ? <><Link to={`/plans/${o.planId}`}>{planName(o.planId)}</Link> <span className="source-tag source-override">Operator</span></>
                    : <>{p.plan?.name || '—'} <span className="source-tag source-plan">Provider</span></>}</td>
                  <td>{o.contractedHours ? <>{num(o.contractedHours)} / week <span className="source-tag source-override">Operator</span></> : s?.contractedHours.value ? <>{num(s.contractedHours.value)} / week <span className="source-tag source-plan">{s.contractedHours.source === 'PLAN' ? 'Plan' : 'Provider'}</span></> : '—'}</td>
                  <td className="nowrap">{leaseText(o.liftLease)}</td>
                  <td>{o.transferredTo ? <Badge>Moved</Badge> : <ActiveBadge status={o.status} />}</td>
                  <td className="num">
                    {o.status === 'ACTIVE' && !o.transferredTo && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setMoving(o)}>Move to another provider</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {moving && <MoveOperator provider={p} operator={moving} onClose={() => setMoving(null)} onDone={() => { setMoving(null); reload(); }} />}
      <div style={{ marginTop: 16 }} />
      <PortalAccess provider={p} />
      <div style={{ marginTop: 16 }} />
      <Card title="VDP history" body={false}>
        {vdps.loading ? <Loading /> : !vdps.data?.length ? <Empty title="No VDPs yet">VDPs appear here after a cycle is processed.</Empty> : (
          <table>
            <thead><tr><th>Cycle</th><th>Status</th><th className="num">Gross</th><th className="num">Net</th></tr></thead>
            <tbody>
              {vdps.data.map((v) => (
                <tr key={v._id} className="clickable" onClick={() => navigate(`/vdps/${v._id}`)}>
                  <td>{cycleLabel(v.cycle)}</td><td><StatusBadge status={v.status} /></td><td className="num">{money(v.gross)}</td><td className="num strong">{money(v.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

const blankOperator = () => ({ name: '', routes: '', status: 'ACTIVE', contractedHours: '', planId: '', liftLease: { amount: '', frequency: 'WEEKLY' } });

const emptyProvider = {
  name: '', providerNumber: '', divisionId: '', status: 'ACTIVE', serviceType: '', planId: '',
  operators: [blankOperator()],
  overrides: { contractedHours: '', basePay: '', bonusRate: '', tuiEligibility: 'INHERIT', fuelMpg: '' },
  contact: { email: '', phone: '', address: '' }, notes: '',
};

// Operators as edited on the form. A provider saved before operators existed arrives with
// one operator whose id is "default" — it becomes a real operator when saved.
const operatorForm = (o) => ({
  _id: o.id && o.id !== 'default' ? o.id : undefined,
  name: o.name || '',
  routes: (o.routes || []).join(', '),
  status: o.status || 'ACTIVE',
  contractedHours: o.contractedHours || '',
  planId: o.planId || '',
  liftLease: { amount: o.liftLease?.amount || '', frequency: o.liftLease?.frequency || 'NONE' },
  transferredFrom: o.transferredFrom || null, // shown only; dates are set by "Move to another provider"
});

function OperatorsEditor({ operators, onChange, planHours, plans = [], providerPlanId }) {
  const planChoices = plans.filter((p) => p._id !== providerPlanId && (p.status === 'ACTIVE' || operators.some((o) => o.planId === p._id)));
  const update = (i, patch) => onChange(operators.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const lease = (i, k, v) => update(i, { liftLease: { ...operators[i].liftLease, [k]: v } });
  return (
    <div className="stack">
      <div className="table-wrap">
        <table className="table-compact">
          <thead>
            <tr><th>Operator</th><th>Route / run</th><th>VDP plan</th><th>Contracted h/week</th><th>Lift lease</th><th>Lease amount ($)</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {operators.map((o, i) => (
              <tr key={i}>
                <td>
                  <input aria-label={`Operator ${i + 1} name`} value={o.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Lisa Moore" />
                  {o.transferredFrom && <div className="muted small">From {date(o.transferredFrom.effectiveDate)} (moved from {o.transferredFrom.providerName})</div>}
                </td>
                <td><input aria-label={`Operator ${i + 1} routes`} value={o.routes} onChange={(e) => update(i, { routes: e.target.value })} placeholder="918" style={{ width: 90 }} /></td>
                <td>
                  <select aria-label={`Operator ${i + 1} VDP plan`} value={o.planId} onChange={(e) => update(i, { planId: e.target.value })}>
                    <option value="">Provider’s plan</option>
                    {planChoices.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                  </select>
                </td>
                <td><input aria-label={`Operator ${i + 1} contracted hours`} value={o.contractedHours} onChange={(e) => update(i, { contractedHours: e.target.value })} placeholder={planHours ? `Plan: ${num(planHours)}` : 'Plan'} style={{ width: 90 }} /></td>
                <td>
                  <select aria-label={`Operator ${i + 1} lease frequency`} value={o.liftLease.frequency} onChange={(e) => lease(i, 'frequency', e.target.value)}>
                    <option value="WEEKLY">Weekly</option><option value="PER_VDP_CYCLE">Per VDP cycle</option><option value="NONE">No lease</option>
                  </select>
                </td>
                <td>{o.liftLease.frequency !== 'NONE' && <input aria-label={`Operator ${i + 1} lease amount`} value={o.liftLease.amount} onChange={(e) => lease(i, 'amount', e.target.value)} placeholder="197.50" style={{ width: 90 }} />}</td>
                <td>
                  <select aria-label={`Operator ${i + 1} status`} value={o.status} onChange={(e) => update(i, { status: e.target.value })}>
                    <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
                  </select>
                </td>
                <td className="num">{operators.length > 1 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(operators.filter((_, j) => j !== i))}>Remove</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="actions"><button type="button" className="btn btn-sm" onClick={() => onChange([...operators, blankOperator()])}>Add operator</button></div>
      <p className="help muted small">
        Routes as shown in the Performance Report “Run/Route” column; separate several with commas. A route belongs to one operator.
        Each operator’s hours are measured against their own contracted hours (blank = plan), and their lift lease is charged separately.
        An operator on a different VDP plan is paid entirely under that plan (rates, TUI, hours column, fuel); the provider’s overrides stay with the provider’s plan.
        The provider receives one VDP with the total.
      </p>
    </div>
  );
}

export function ProviderEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const divisions = useLoad(() => api.get('/divisions'), []);
  const plans = useLoad(() => (form?.divisionId ? api.get('/vdp-plans', { divisionId: form.divisionId }) : Promise.resolve([])), [form?.divisionId]);

  useEffect(() => {
    if (!id) { setForm(emptyProvider); return; }
    api.get(`/providers/${id}`).then((p) => {
      // Operators who moved to another provider are kept by the server and not edited here.
      const current = (p.operators || []).filter((o) => !o.transferredTo);
      setForm({
        ...emptyProvider, ...p,
        planId: p.planId || '',
        movedAway: (p.operators || []).filter((o) => o.transferredTo),
        operators: current.length ? current.map(operatorForm) : [blankOperator()],
        overrides: {
          contractedHours: p.overrides?.contractedHours || '', basePay: p.overrides?.basePay || '',
          bonusRate: p.overrides?.bonusRate || '', tuiEligibility: p.overrides?.tuiEligibility || 'INHERIT',
          fuelMpg: p.overrides?.fuelMpg || '',
        },
        contact: { ...emptyProvider.contact, ...(p.contact || {}) },
      });
    }).catch(setError);
  }, [id]);

  useEffect(() => {
    if (form && !form.divisionId && divisions.data?.length === 1) setForm((f) => ({ ...f, divisionId: divisions.data[0]._id }));
  }, [divisions.data, form]);

  if (!form) return <div className="page">{error ? <ErrorAlert error={error} /> : <Loading />}</div>;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setIn = (group, k) => (e) => setForm({ ...form, [group]: { ...form[group], [k]: e.target.value } });
  const plan = plans.data?.find((p) => p._id === form.planId);
  const cur = plan?.versions.find((v) => v._id === plan.currentVersionId);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const { routes, operatorName, liftLease, movedAway, ...body } = form;
      body.operators = form.operators.filter((o) => o.name.trim() || o.routes.trim())
        .map(({ transferredFrom, ...o }) => ({ ...o, planId: o.planId && o.planId !== form.planId ? o.planId : null }));
      const saved = id ? await api.put(`/providers/${id}`, body) : await api.post('/providers', body);
      toast('Provider saved');
      navigate(`/providers/${saved._id}`);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  const inheritHint = (value, suffix = '') => (cur && value ? `Plan: ${value}${suffix}. Leave blank to inherit.` : 'Leave blank to inherit from the plan.');

  return (
    <div className="page">
      <PageHead crumbs={<><Link to="/providers">Providers</Link>{id && <> / <Link to={`/providers/${id}`}>{form.name}</Link></>}</>}
        title={id ? `Edit ${form.name}` : 'New provider'}
        actions={<><button className="btn" onClick={() => navigate(-1)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>Save provider</button></>} />
      <div className="stack">
        <ErrorAlert error={error} />
        <Card title="Provider">
          <div className="form-grid">
            <Field label="Provider name" htmlFor="f-name"><input id="f-name" value={form.name} onChange={set('name')} placeholder="Rimo Transit LLC" /></Field>
            <Field label="Provider number" htmlFor="f-num"><input id="f-num" value={form.providerNumber || ''} onChange={set('providerNumber')} /></Field>
            <Field label="Division" htmlFor="f-div">
              <select id="f-div" value={form.divisionId} onChange={(e) => setForm({ ...form, divisionId: e.target.value, planId: '' })}>
                <option value="">Choose…</option>
                {(divisions.data || []).map((d) => <option key={d._id} value={d._id}>DIV {d.divisionNumber} – {d.name}</option>)}
              </select>
            </Field>
            <Field label="Status" htmlFor="f-status">
              <select id="f-status" value={form.status} onChange={set('status')}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
            </Field>
            <Field label="Service type" htmlFor="f-svc"><input id="f-svc" value={form.serviceType || ''} onChange={set('serviceType')} placeholder="TDEV Night" /></Field>
          </div>
        </Card>

        <Card title="Operators" hint="The provider is the one who gets paid. Add each operator (driver) who works for them.">
          <OperatorsEditor operators={form.operators} onChange={(operators) => setForm({ ...form, operators })} planHours={cur?.contractedHours} plans={plans.data || []} providerPlanId={form.planId} />
          {form.movedAway?.length > 0 && (
            <p className="muted small" style={{ marginTop: 8 }}>
              Moved to another provider (kept for earlier cycles): {form.movedAway.map((o) => `${o.name} → ${o.transferredTo.providerName} from ${date(o.transferredTo.effectiveDate)}`).join('; ')}.
            </p>
          )}
        </Card>

        <Card title="How they are paid">
          <div className="stack">
            <div className="form-grid">
              <Field label="VDP plan" htmlFor="f-plan" help={cur ? planSummary(cur) : 'The provider inherits every payment rule from this plan.'}>
                <select id="f-plan" value={form.planId} onChange={set('planId')} disabled={!form.divisionId}>
                  <option value="">No plan</option>
                  {(plans.data || []).filter((p) => p.status === 'ACTIVE' || p._id === form.planId).map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="TUI eligibility" htmlFor="f-tui" help={cur ? `Plan default: ${cur.incentiveEnabled ? 'eligible' : 'not eligible'}.` : undefined}>
                <select id="f-tui" value={form.overrides.tuiEligibility} onChange={setIn('overrides', 'tuiEligibility')}>
                  <option value="INHERIT">Inherit from plan</option>
                  <option value="ON">Eligible (override)</option>
                  <option value="OFF">Not eligible (override)</option>
                </select>
              </Field>
              <Field label="Contracted hours override (all operators)" htmlFor="f-hours" help={`${inheritHint(cur?.contractedHours, ' h/week')} An operator’s own contracted hours take priority.`}>
                <input id="f-hours" value={form.overrides.contractedHours} onChange={setIn('overrides', 'contractedHours')} />
              </Field>
              <Field label="Base pay override" htmlFor="f-base" help={inheritHint(cur?.basePay && rate(cur.basePay))}>
                <input id="f-base" value={form.overrides.basePay} onChange={setIn('overrides', 'basePay')} />
              </Field>
              {(fuelMethodOf(cur) === 'SERVICE_MILE_ALLOWANCE' || form.overrides.fuelMpg) && (
                <Field label="Fuel MPG override" htmlFor="f-mpg" help={`${inheritHint(cur?.fuelMpg, ' MPG')} Only when this provider’s vehicle is on a different fuel efficiency.`}>
                  <input id="f-mpg" value={form.overrides.fuelMpg} onChange={setIn('overrides', 'fuelMpg')} />
                </Field>
              )}
              {cur?.bonusEnabled && (
                <Field label="Bonus rate override" htmlFor="f-bonus" help={inheritHint(rate(cur.bonusRate))}>
                  <input id="f-bonus" value={form.overrides.bonusRate} onChange={setIn('overrides', 'bonusRate')} />
                </Field>
              )}
            </div>
          </div>
        </Card>

        <Card title="Contact & notes">
          <div className="form-grid">
            <Field label="Email" htmlFor="f-email"><input id="f-email" value={form.contact.email || ''} onChange={setIn('contact', 'email')} /></Field>
            <Field label="Phone" htmlFor="f-phone"><input id="f-phone" value={form.contact.phone || ''} onChange={setIn('contact', 'phone')} /></Field>
            <Field label="Address" htmlFor="f-addr" full><input id="f-addr" value={form.contact.address || ''} onChange={setIn('contact', 'address')} /></Field>
            <Field label="Notes" htmlFor="f-notes" full><textarea id="f-notes" value={form.notes || ''} onChange={set('notes')} /></Field>
          </div>
        </Card>
      </div>
    </div>
  );
}
