import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { rate, num, money, date, cycleLabel, METRIC_LABELS, PAYMENT_TYPE_LABELS, LEASE_LABELS } from '../format';
import { ActiveBadge, Alert, Badge, Card, Empty, ErrorAlert, Field, Loading, PageHead, StatusBadge, useLoad, useToast } from '../components/ui';
import { TierTable, planSummary } from './Plans';
import PortalAccess from '../components/PortalAccess';

const leaseText = (l) => (!l || l.frequency === 'NONE' || !l.amount ? 'None' : `${money(l.amount)} / ${LEASE_LABELS[l.frequency]}`);

export function ProviderList() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') || '');
  const divisionId = params.get('divisionId') || '';
  const status = params.get('status') ?? 'ACTIVE';
  const divisions = useLoad(() => api.get('/divisions'), []);
  const { data, loading, error } = useLoad(
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
        actions={<button className="btn btn-primary" onClick={() => navigate('/providers/new')}>New provider</button>} />
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
                        <td>{p.operatorName || '—'}</td>
                        <td className="mono">{p.routes.join(', ') || <span className="muted">—</span>}</td>
                        <td>{p.planName || <Badge tone="bad">No plan</Badge>} {override && <Badge tone="warn">Override</Badge>}</td>
                        <td className="nowrap">{leaseText(p.liftLease)}</td>
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

export function ProviderProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: p, loading, error } = useLoad(() => api.get(`/providers/${id}`), [id]);
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
            <div><div className="k">Operator</div><div className="v">{p.operatorName || '—'}</div></div>
            <div><div className="k">Route / run</div><div className="v mono">{p.routes.join(', ') || '—'}</div></div>
            <div><div className="k">Service type</div><div className="v">{p.serviceType || '—'}</div></div>
            <div><div className="k">VDP plan</div><div className="v">{p.plan ? <Link to={`/plans/${p.plan._id}`}>{p.plan.name}</Link> : <Badge tone="bad">No plan assigned</Badge>}</div></div>
            <div><div className="k">Lift lease</div><div className="v">{leaseText(p.liftLease)}</div></div>
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

const emptyProvider = {
  name: '', providerNumber: '', divisionId: '', status: 'ACTIVE', operatorName: '', routes: '', serviceType: '', planId: '',
  liftLease: { amount: '', frequency: 'WEEKLY' },
  overrides: { contractedHours: '', basePay: '', bonusRate: '', tuiEligibility: 'INHERIT' },
  contact: { email: '', phone: '', address: '' }, notes: '',
};

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
    api.get(`/providers/${id}`).then((p) => setForm({
      ...emptyProvider, ...p,
      routes: p.routes.join(', '),
      planId: p.planId || '',
      liftLease: { amount: p.liftLease?.amount || '', frequency: p.liftLease?.frequency || 'NONE' },
      overrides: {
        contractedHours: p.overrides?.contractedHours || '', basePay: p.overrides?.basePay || '',
        bonusRate: p.overrides?.bonusRate || '', tuiEligibility: p.overrides?.tuiEligibility || 'INHERIT',
      },
      contact: { ...emptyProvider.contact, ...(p.contact || {}) },
    })).catch(setError);
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
      const saved = id ? await api.put(`/providers/${id}`, form) : await api.post('/providers', form);
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
            <Field label="Operator" htmlFor="f-op"><input id="f-op" value={form.operatorName || ''} onChange={set('operatorName')} placeholder="Lisa Moore" /></Field>
            <Field label="Route / run" htmlFor="f-routes" help="As shown in the Performance Report “Run/Route” column. Separate several with commas.">
              <input id="f-routes" value={form.routes} onChange={set('routes')} placeholder="918" />
            </Field>
            <Field label="Service type" htmlFor="f-svc"><input id="f-svc" value={form.serviceType || ''} onChange={set('serviceType')} placeholder="TDEV Night" /></Field>
          </div>
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
              <Field label="Contracted hours override" htmlFor="f-hours" help={inheritHint(cur?.contractedHours, ' h/week')}>
                <input id="f-hours" value={form.overrides.contractedHours} onChange={setIn('overrides', 'contractedHours')} />
              </Field>
              <Field label="Base pay override" htmlFor="f-base" help={inheritHint(cur?.basePay && rate(cur.basePay))}>
                <input id="f-base" value={form.overrides.basePay} onChange={setIn('overrides', 'basePay')} />
              </Field>
              {cur?.bonusEnabled && (
                <Field label="Bonus rate override" htmlFor="f-bonus" help={inheritHint(rate(cur.bonusRate))}>
                  <input id="f-bonus" value={form.overrides.bonusRate} onChange={setIn('overrides', 'bonusRate')} />
                </Field>
              )}
            </div>
            <div className="form-grid">
              <Field label="Lift lease frequency" htmlFor="f-lfreq">
                <select id="f-lfreq" value={form.liftLease.frequency} onChange={setIn('liftLease', 'frequency')}>
                  <option value="WEEKLY">Weekly</option><option value="PER_VDP_CYCLE">Per VDP cycle</option><option value="NONE">No lease</option>
                </select>
              </Field>
              {form.liftLease.frequency !== 'NONE' && (
                <Field label="Lift lease amount ($)" htmlFor="f-lamt" help={form.liftLease.frequency === 'WEEKLY' ? 'Charged for each week in the cycle (×2).' : 'Charged once per cycle.'}>
                  <input id="f-lamt" value={form.liftLease.amount} onChange={setIn('liftLease', 'amount')} placeholder="197.50" />
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
