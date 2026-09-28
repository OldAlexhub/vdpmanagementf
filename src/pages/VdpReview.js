import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, downloadFile } from '../api';
import ExplainCalculation from '../components/Explain';
import { IssueList } from '../components/Issues';
import { cycleLabel, deadlineLabel, todayLocal, date, dateTime, isNegative, money, num, pct, rate, METRIC_LABELS, PAYMENT_TYPE_LABELS, LEASE_LABELS } from '../format';
import { Alert, Badge, Card, Confirm, Empty, ErrorAlert, Field, Loading, Modal, PageHead, StatusBadge, useLoad, useToast } from '../components/ui';

const EDITABLE = ['DRAFT', 'NEEDS_REVIEW', 'READY'];
const HISTORY_LABELS = {
  PROCESSED: 'Calculated', RECALCULATED: 'Recalculated', APPROVED: 'Approved by Big Star', REOPENED: 'Reopened', PAID: 'Marked paid',
  PROVIDER_APPROVED: 'Approved by provider', AUTO_APPROVED: 'Auto-approved',
  ISSUE_RAISED: 'Provider reported an issue', ISSUE_ANSWERED: 'Issue answered (no change)',
  ADJUSTMENT_ADDED: 'Adjustment added', ADJUSTMENT_REMOVED: 'Adjustment removed', LEASE_CHANGED: 'Lift lease changed',
  EXCEPTION_ACKNOWLEDGED: 'Issue acknowledged', FUEL_EXPENSE_SET: 'Fuel expense entered',
};

// Cents as integers so the live overspend preview never drifts; the server recalculates on save.
const toCents = (v) => (v === null || v === undefined || v === '' ? null : Math.round(Number(String(v).replace(/[$,]/g, '')) * 100));
const fromCents = (c) => (c / 100).toFixed(2);

function Row({ label, values, strong, muted, render = (x) => x }) {
  return (
    <tr>
      <td className={muted ? 'muted' : ''}>{label}</td>
      {values.map((v, i) => <td key={i} className={`num ${strong ? 'strong' : ''}`}>{render(v)}</td>)}
    </tr>
  );
}

export function PerformanceCard({ view }) {
  const weeks = view.calculation?.weeks || view.performance?.weeks || [];
  const perTrip = view.settings?.paymentType?.value === 'PER_TRIP';
  const metric = METRIC_LABELS[view.settings?.performanceHourMetric?.value] || 'Hours';
  const w = (k) => weeks.map((x) => x[k]);
  const [showDays, setShowDays] = useState(false);
  if (!weeks.length) return null;
  return (
    <Card title="Performance" hint={`Trips = Total Prov · Hours = ${metric} (Performance Report)`} body={false}
      actions={view.performance?.days?.length > 0 && <button className="btn btn-sm no-print" onClick={() => setShowDays(!showDays)}>{showDays ? 'Hide' : 'Show'} daily detail</button>}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th />{weeks.map((x) => <th key={x.weekNumber} className="num">Week {x.weekNumber}<div className="muted" style={{ textTransform: 'none', fontWeight: 400 }}>{date(x.start, 'md')} – {date(x.end, 'md')}</div></th>)}</tr>
          </thead>
          <tbody>
            <Row label="Trips" values={w('trips')} render={num} />
            <Row label={`Actual hours (${metric})`} values={w('actualHours')} render={num} strong />
            {view.calculation && (
              <>
                <Row label="Contracted hours" values={w('contractedHours')} render={num} />
                <Row label="Performance %" values={w('performancePercentage')} render={pct} />
                <Row label="Incentive tier" values={w('tierLabel')} muted />
                <Row label={perTrip ? 'Rate per trip' : 'Incentive rate'} values={w('incentiveRate')} render={rate} strong />
                {!perTrip && <Row label="Core hours" values={w('corePaidHours')} render={num} />}
                {!perTrip && <Row label="Bonus hours" values={w('bonusHours')} render={num} />}
              </>
            )}
          </tbody>
        </table>
      </div>
      {showDays && (
        <div className="table-wrap" style={{ borderTop: '1px solid var(--border)' }}>
          <table className="table-compact">
            <thead><tr><th>Date</th><th>Route</th><th>Week</th><th className="num">Trips</th><th className="num">{metric}</th></tr></thead>
            <tbody>
              {view.performance.days.map((d) => (
                <tr key={d.date + d.route}><td>{date(d.date)}</td><td className="mono">{d.route}</td><td>{d.week}</td><td className="num">{num(d.trips)}</td><td className="num">{num(d.hours)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// Several operators: each is measured against their own contract; the provider is paid the total.
export function OperatorsCard({ calc, perTrip, settings }) {
  const ops = calc?.operators || [];
  if (ops.length < 2) return null;
  const weekNumbers = ops[0].weeks.map((w) => w.weekNumber);
  // Some operators are paid under a different VDP plan than the provider.
  const mixed = ops.some((o) => o.plan);
  return (
    <Card title="By operator" hint="Each operator’s hours are measured against their own contracted hours." body={false}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Operator</th><th>Route</th>{mixed && <th>VDP plan</th>}{weekNumbers.map((n) => <th key={n} className="num">Week {n}</th>)}<th className="num">Earned</th><th className="num">Lift lease</th></tr>
          </thead>
          <tbody>
            {ops.map((o) => (
              <tr key={o.name}>
                <td className="strong">{o.name}</td>
                <td className="mono">{o.routes.join(', ') || '—'}</td>
                {mixed && <td className="small">{o.plan ? <>{o.plan.name} <span className="source-tag source-override">Operator</span></> : <>{settings?.planName} <span className="source-tag source-plan">Provider</span></>}</td>}
                {o.weeks.map((w) => (
                  <td key={w.weekNumber} className="num">
                    <div className="strong">{money(w.weeklyEarnings)}</div>
                    <div className="muted small">
                      {(o.paymentType ? o.paymentType === 'PER_TRIP' : perTrip)
                        ? `${num(w.trips)} trips × ${rate(w.incentiveRate)}`
                        : <>{num(w.actualHours)} of {num(w.contractedHours)} h · {pct(w.performancePercentage)}<br />{w.tierLabel} · {rate(w.incentiveRate)}{Number(w.bonusHours) > 0 ? ` · ${num(w.bonusHours)} bonus h` : ''}</>}
                    </div>
                  </td>
                ))}
                <td className="num strong">{money(o.earnings)}</td>
                <td className="num minus">{o.lease !== '0.00' ? `−${money(o.lease)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function EarningsCard({ calc, perTrip }) {
  if (!calc) return null;
  const weeks = calc.weeks;
  return (
    <Card title="Earnings" body={false}>
      <table>
        <thead><tr><th />{weeks.map((x) => <th key={x.weekNumber} className="num">Week {x.weekNumber}</th>)}</tr></thead>
        <tbody>
          <Row label={perTrip ? 'Trip earnings' : 'Core earnings'} values={weeks.map((x) => x.coreEarnings)} render={money} />
          {!perTrip && <Row label="Bonus earnings" values={weeks.map((x) => x.bonusEarnings)} render={money} />}
          <Row label="Week total" values={weeks.map((x) => x.weeklyEarnings)} render={money} strong />
        </tbody>
        <tfoot>
          <tr><td>Gross VDP</td><td colSpan={weeks.length} className="num" style={{ fontSize: 16 }}>{money(calc.gross)}</td></tr>
        </tfoot>
      </table>
    </Card>
  );
}

// Service mile fuel allowance: everything is calculated except the actual expense Accounting enters.
export function FuelCard({ vdp, editable, onChanged }) {
  const v = vdp.view;
  const a = v.calculation?.fuelAllowance;
  const saved = v.fuelExpense?.amount ?? a?.actualExpense ?? null;
  const [value, setValue] = useState(saved ? fromCents(toCents(saved)) : '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const opAllowance = (v.settings?.operatorPlans || []).filter((o) => o.fuelMethod === 'SERVICE_MILE_ALLOWANCE');
  if (v.settings?.fuelMethod?.value !== 'SERVICE_MILE_ALLOWANCE' && !opAllowance.length) return null;
  const mpg = a ? (a.mpg ?? a.mpgs.join(' / ')) : (v.settings.operatorPlans ? opAllowance.map((o) => o.fuelMpg).join(' / ') : v.settings.fuelMpg?.value);
  const weeks = v.settings.operatorPlans ? [] : v.performance?.weeks || [];
  const miles = a ? a.weekMiles : weeks.map((w) => w.serviceMiles);
  const total = a?.serviceMiles ?? (miles.length && miles.every((m) => m !== null && m !== undefined) ? miles.reduce((t, m) => t + Number(m), 0) : null);
  const clean = value.trim().replace(/[$,]/g, '');
  const typed = /^\d+(\.\d{0,2})?$/.test(clean) ? toCents(clean) : null;
  const allowedCents = a ? toCents(a.maxAllowed) : null;
  const overCents = typed !== null && allowedCents !== null ? Math.max(typed - allowedCents, 0) : null;
  const dirty = typed !== toCents(saved);
  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try { onChanged(await api.patch(`/vdps/${vdp._id}/fuel-expense`, { amount: value })); } catch (err) { setError(err); }
    setBusy(false);
  };
  const row = (label, val, cls = '') => <tr key={label}><td className="muted">{label}</td><td className={`num ${cls}`}>{val}</td></tr>;
  return (
    <Card title="Fuel" hint={`Service mile allowance · maximum = service miles ÷ ${num(mpg)}${v.settings.fuelMpg?.source === 'PROVIDER_OVERRIDE' ? ' (provider override)' : ''}${v.settings.operatorPlans ? ` · operators on this allowance: ${opAllowance.map((o) => o.name).join(', ')}` : ''}`}>
      <div className="grid grid-2">
        <table className="table-compact">
          <tbody>
            {miles.map((m, i) => row(`Week ${i + 1} service miles`, m === null || m === undefined ? <Badge tone="bad">Missing</Badge> : num(m)))}
            {row('Total service miles', total === null ? '—' : num(total), 'strong')}
            {row('Fuel efficiency', `${num(mpg)} MPG`)}
            {row('Maximum allowed fuel', a ? money(a.maxAllowed) : '—', 'strong')}
          </tbody>
        </table>
        <div className="stack">
          <form onSubmit={save}>
            <Field label="Actual fuel expense ($)" htmlFor="fuel-actual" help="Total the provider spent on fuel this cycle. Only the amount above the maximum is deducted.">
              <div className="actions">
                <input id="fuel-actual" value={value} onChange={(e) => setValue(e.target.value)} placeholder="507.89" disabled={!editable} style={{ width: 130 }} />
                {editable && <button className="btn btn-primary" type="submit" disabled={busy || !dirty || (clean !== '' && typed === null)}>{saved ? 'Update' : 'Save'}</button>}
              </div>
            </Field>
          </form>
          <table className="table-compact">
            <tbody>
              {row('Fuel overspend', overCents === null ? '—' : money(fromCents(overCents)), overCents > 0 ? 'minus strong' : '')}
              {row('VDP deduction', overCents === null ? '—' : overCents > 0 ? `−${money(fromCents(overCents))}` : money(0), overCents > 0 ? 'minus strong' : '')}
              {overCents === 0 && typed !== null && row('Unused allowance (not paid)', money(fromCents(allowedCents - typed)), 'muted')}
            </tbody>
          </table>
          {dirty && typed !== null && <p className="muted small">Not saved yet. Save to update the VDP.</p>}
          {!a && <p className="muted small">The allowance appears once the issues above are resolved.</p>}
          {v.fuelExpense?.enteredBy && !dirty && <p className="muted small">Entered by {v.fuelExpense.enteredBy.name} · {dateTime(v.fuelExpense.enteredAt)}</p>}
          <ErrorAlert error={error} />
        </div>
      </div>
    </Card>
  );
}

function AdjustmentsCard({ vdp, types, editable, onChanged }) {
  const [form, setForm] = useState({ type: 'FARES', amount: '', description: '', date: todayLocal() });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [lease, setLease] = useState(null);
  const view = vdp.view;
  const typeInfo = (k) => types.find((t) => t.key === k) || { label: k, direction: 'DEDUCTION' };
  // On a service mile allowance plan fuel is deducted from the actual expense, never entered here.
  const allowance = view.settings?.fuelMethod?.value === 'SERVICE_MILE_ALLOWANCE';
  const choices = types.filter((t) => !(allowance && t.key === 'FUEL'));
  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onChanged(await api.post(`/vdps/${vdp._id}/adjustments`, form));
      setForm({ ...form, amount: '', description: '' });
    } catch (err) { setError(err); }
    setBusy(false);
  };
  const leaseAmt = view.calculation?.lease;
  const l = view.lease || {};
  return (
    <Card title="Adjustments" hint="Lift lease is automatic. Enter fares collected and anything else automation cannot know." body={false}>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Item</th><th>Description</th><th>Entered</th><th className="num">Amount</th><th /></tr></thead>
          <tbody>
            <tr>
              <td className="strong">Lift lease <Badge tone="outline">Automatic</Badge></td>
              <td className="small">
                {l.operators?.length > 1
                  ? l.operators.map((o) => <div key={o.name}>{o.name}: {o.frequency === 'NONE' || !o.amount ? 'no lease' : `${money(o.amount)} / ${LEASE_LABELS[o.frequency]}`}{o.weeksCharged && !l.weeksCharged && ` · ${num(o.weeksCharged)} week(s)`}</div>)
                  : l.frequency === 'NONE' || !l.amount ? 'No lift lease on profile' : `${money(l.amount)} / ${LEASE_LABELS[l.frequency]}`}
                {l.weeksCharged && ` · ${num(l.weeksCharged)} week(s) charged`}
                {l.note && <div className="muted">{l.note}</div>}
              </td>
              <td className="small muted">From provider profile</td>
              <td className="num minus">{leaseAmt ? `−${money(leaseAmt)}` : '—'}</td>
              <td className="num">{editable && l.frequency !== 'NONE' && <button className="btn btn-ghost btn-sm no-print" onClick={() => setLease({ weeksCharged: l.weeksCharged || '', note: '' })}>Change</button>}</td>
            </tr>
            {view.calculation?.fuelAllowance && (
              <tr>
                <td className="strong">Fuel overspend <Badge tone="outline">Automatic</Badge></td>
                <td className="small">
                  {view.calculation.fuelAllowance.actualExpense === null
                    ? 'Waiting for the actual fuel expense'
                    : `${money(view.calculation.fuelAllowance.actualExpense)} actual − ${money(view.calculation.fuelAllowance.maxAllowed)} allowed`}
                </td>
                <td className="small muted">From service miles</td>
                <td className={`num ${Number(view.calculation.fuelOverspend) > 0 ? 'minus' : ''}`}>{Number(view.calculation.fuelOverspend) > 0 ? `−${money(view.calculation.fuelOverspend)}` : money(0)}</td>
                <td />
              </tr>
            )}
            {view.adjustments.map((a) => {
              const t = typeInfo(a.type);
              const add = t.direction === 'ADDITION';
              return (
                <tr key={a._id || a.createdAt}>
                  <td className="strong">{t.label}</td>
                  <td className="small">{a.description || '—'}</td>
                  <td className="small muted">{date(a.date)} · {a.createdBy?.name}</td>
                  <td className={`num ${add ? 'plus' : 'minus'}`}>{add ? '+' : '−'}{money(a.amount)}</td>
                  <td className="num">{editable && <button className="btn btn-ghost btn-sm no-print" onClick={() => setRemoving(a)}>Remove</button>}</td>
                </tr>
              );
            })}
            {!view.adjustments.length && <tr><td colSpan={5} className="muted small">No fares or other adjustments entered.</td></tr>}
          </tbody>
        </table>
      </div>
      {editable && (
        <form className="card-body no-print" onSubmit={add} style={{ borderTop: '1px solid var(--border)' }}>
          <div className="filters">
            <Field label="Type" htmlFor="a-type">
              <select id="a-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <optgroup label="Deductions">{choices.filter((t) => t.direction === 'DEDUCTION').map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup>
                <optgroup label="Additions">{choices.filter((t) => t.direction === 'ADDITION').map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup>
              </select>
            </Field>
            <Field label="Amount ($)" htmlFor="a-amt"><input id="a-amt" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="25.20" style={{ width: 110 }} /></Field>
            <Field label="Description" htmlFor="a-desc"><input id="a-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. 9 cash fares" /></Field>
            <Field label="Date" htmlFor="a-date"><input id="a-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <button className="btn btn-primary" type="submit" disabled={busy || !form.amount}>Add</button>
          </div>
          <p className="muted small" style={{ marginTop: 6 }}>Enter a positive amount — the type decides whether it is deducted or added.</p>
          {error && <div style={{ marginTop: 8 }}><ErrorAlert error={error} /></div>}
        </form>
      )}
      {removing && (
        <Confirm title="Remove adjustment?" message={`${typeInfo(removing.type).label} of ${money(removing.amount)} will be removed and the VDP recalculated.`}
          confirmLabel="Remove" tone="danger" onClose={() => setRemoving(null)}
          onConfirm={async () => onChanged(await api.del(`/vdps/${vdp._id}/adjustments/${removing._id}`))} />
      )}
      {lease && (
        <Modal title="Lift lease weeks charged" onClose={() => setLease(null)}
          footer={<><button className="btn" onClick={() => setLease(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={async () => {
              try { onChanged(await api.patch(`/vdps/${vdp._id}/lease`, lease)); setLease(null); } catch (e) { setLease({ ...lease, error: e }); }
            }}>Save</button></>}>
          <div className="stack">
            <p className="small">Normally the lease is charged for every week in the cycle. Change it only for a partial cycle (e.g. provider started mid-cycle).</p>
            <Field label="Weeks charged (blank = all weeks)" htmlFor="l-weeks"><input id="l-weeks" value={lease.weeksCharged} onChange={(e) => setLease({ ...lease, weeksCharged: e.target.value })} placeholder="2" /></Field>
            <Field label="Reason" htmlFor="l-note"><textarea id="l-note" value={lease.note} onChange={(e) => setLease({ ...lease, note: e.target.value })} /></Field>
            <ErrorAlert error={lease.error} />
          </div>
        </Modal>
      )}
    </Card>
  );
}

export function NetCard({ vdp }) {
  const c = vdp.view.calculation;
  const line = (label, value, sign) => (
    <tr><td>{label}</td><td className={`num ${sign === '-' ? 'minus' : sign === '+' ? 'plus' : ''}`}>{value && value !== '0.00' ? `${sign === '-' ? '−' : sign === '+' ? '+' : ''}${money(value)}` : money(value)}</td></tr>
  );
  return (
    <div className="stack">
      <div className="net-card">
        <div className="net-label">Net VDP payment</div>
        <div className={`net-value ${isNegative(c?.net) ? 'negative' : ''}`}>{c ? money(c.net) : '—'}</div>
        <div className="net-meta">{vdp.view.cycle ? `Pays ${date(vdp.view.cycle.paymentDate, 'long')}` : ''}</div>
      </div>
      {c && (
        <Card>
          <table className="ledger">
            <tbody>
              {line('Week 1 earnings', c.weeks[0]?.weeklyEarnings)}
              {line('Week 2 earnings', c.weeks[1]?.weeklyEarnings)}
              <tr className="total"><td>Gross VDP</td><td className="num">{money(c.gross)}</td></tr>
              {line('Lift lease', c.lease, '-')}
              {line('Fares collected', c.fares, '-')}
              {line('Other deductions', c.otherDeductions, '-')}
              {c.fuelAllowance && line('Fuel overspend', c.fuelOverspend, Number(c.fuelOverspend) > 0 ? '-' : '')}
              {(c.fuelReimbursementRate || c.fuelReimbursementDetail) && line(`Fuel reimbursement (${c.fuelReimbursementDetail || `${num(c.fuelTrips)} trips × ${rate(c.fuelReimbursementRate)}`})`, c.fuelReimbursement, '+')}
              {line('Reimbursements', c.reimbursements, '+')}
              {line('Other income', c.otherIncome, '+')}
              <tr className="total"><td>Net VDP</td><td className="num" style={{ fontSize: 16 }}>{money(c.net)}</td></tr>
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function deadlineText(cycle) {
  if (!cycle?.submissionDate) return 'The provider can approve it in their portal.';
  const past = new Date(`${cycle.submissionDate}T23:59:59`) < new Date();
  return past
    ? `The Closed for Submission date (${date(cycle.submissionDate)}) has passed, so it will be auto-approved immediately.`
    : `The provider has until the end of ${date(cycle.submissionDate, 'long')} (Closed for Submission) to approve; after that it is auto-approved.`;
}

function ProviderApprovalBanner({ vdp }) {
  const a = vdp.providerApproval;
  if (vdp.status === 'DISPUTED') {
    return (
      <Alert tone="bad">
        <strong>The provider reported an issue.</strong> Auto-approval is paused until Big Star answers.
        Answer with no change if the statement is correct, or reopen to correct it — the provider then reviews it again
        (at least 48 hours, even after the Closed for Submission date).
      </Alert>
    );
  }
  if (vdp.status === 'APPROVED') {
    return (
      <Alert tone="warn">
        <strong>Awaiting provider approval.</strong> Sent to the provider portal.
        {vdp.providerDeadline ? <> Auto-approves after {deadlineLabel(vdp.view.cycle?.submissionDate)} (Closed for Submission) if the provider does not respond.</> : null}
      </Alert>
    );
  }
  if (!a?.method) return null;
  return (
    <Alert tone="ok">
      <strong>{a.method === 'AUTO' ? 'Auto-approved' : `Approved by provider (${a.by?.name})`}</strong> on {dateTime(a.at)}
      {a.method === 'AUTO' && ' — no response by the Closed for Submission date'}.
      {vdp.status === 'PROCESSED' && ' Ready to be marked as paid.'}
      {vdp.paidAt && <> Paid {dateTime(vdp.paidAt)} ({vdp.paidBy?.name}).</>}
    </Alert>
  );
}

export default function VdpReview() {
  const { id } = useParams();
  const toast = useToast();
  const { data: vdp, loading, error, setData, reload } = useLoad(() => api.get(`/vdps/${id}`), [id]);
  const types = useLoad(() => api.get('/vdps/adjustment-types'), []);
  const [dialog, setDialog] = useState(null);
  const [ack, setAck] = useState(null);
  const [actionError, setActionError] = useState(null);

  if (loading && !vdp) return <div className="page"><Loading /></div>;
  if (error) return <div className="page"><ErrorAlert error={error} /></div>;

  const v = vdp.view;
  const editable = EDITABLE.includes(vdp.status);
  const perTrip = v.settings?.paymentType?.value === 'PER_TRIP';
  const act = async (fn, msg) => {
    setActionError(null);
    try { setData(await fn()); if (msg) toast(msg); } catch (e) { setActionError(e); reload(); }
  };
  const openIssues = editable ? vdp.exceptions : [];
  const acked = new Map(vdp.acknowledgements.map((a) => [a.code, a]));

  return (
    <div className="page">
      <PageHead
        crumbs={<><Link to="/processing">VDP Processing</Link> / {v.provider?.name}</>}
        title={<>{v.provider?.name} <StatusBadge status={vdp.status} /></>}
        sub={`${v.provider?.operatorName || ''} · Route ${(v.provider?.routes || []).join(', ') || '—'} · ${cycleLabel(v.cycle)}`}
        actions={<>
          <button className="btn" onClick={() => downloadFile(`/vdps/${id}/statement.pdf`).catch((e) => toast(e.message, 'bad'))}>Download PDF</button>
          {editable && <button className="btn" onClick={() => act(() => api.post(`/vdps/${id}/recalculate`), 'Recalculated')}>Recalculate</button>}
          {editable && <button className="btn btn-success" disabled={vdp.status !== 'READY'} title={vdp.status !== 'READY' ? 'Resolve the issues first' : ''} onClick={() => setDialog('approve')}>Approve VDP</button>}
          {vdp.status === 'DISPUTED' && <button className="btn" onClick={() => setDialog('answer')}>Answer — no change</button>}
          {['APPROVED', 'DISPUTED', 'PROCESSED'].includes(vdp.status) && (
            <button className={`btn ${vdp.status === 'DISPUTED' ? 'btn-primary' : ''}`} onClick={() => setDialog('reopen')}>
              {vdp.status === 'DISPUTED' ? 'Reopen to correct' : 'Reopen'}
            </button>
          )}
          {vdp.status === 'PROCESSED' && <button className="btn btn-primary" onClick={() => setDialog('paid')}>Mark paid</button>}
        </>}
      />

      <div className="stack">
        {v.source === 'SNAPSHOT' && <ProviderApprovalBanner vdp={vdp} />}
        {vdp.issues?.length > 0 && (
          <Card title="Provider issues" hint={vdp.status === 'DISPUTED'
            ? 'Auto-approval is paused. Answer the provider, or reopen to correct the VDP and approve it again.'
            : 'Issues the provider reported on this VDP.'}>
            <IssueList issues={vdp.issues} staff />
          </Card>
        )}
        {v.source === 'SNAPSHOT' && (
          <Alert tone="info">
            Approved by Big Star {dateTime(v.approvedAt)} ({v.approvedBy?.name}). These figures are a frozen snapshot of the rules and data used — later plan or profile changes do not affect them.
          </Alert>
        )}
        {vdp.stale && editable && (
          <Alert tone="warn" action={<button className="btn btn-sm" onClick={() => act(() => api.post(`/vdps/${id}/recalculate`), 'Recalculated')}>Recalculate now</button>}>
            The report, plan or provider profile changed after this VDP was calculated.
          </Alert>
        )}
        {actionError && <ErrorAlert error={actionError} />}
        {openIssues.map((ex) => (
          <Alert key={ex.code} tone={acked.has(ex.code) ? 'info' : 'bad'}
            action={ex.acknowledgeable && editable && !acked.has(ex.code) && <button className="btn btn-sm" onClick={() => setAck(ex)}>Accept</button>}>
            <strong>{acked.has(ex.code) ? 'Accepted: ' : 'Needs review: '}</strong>{ex.message}
            {acked.has(ex.code) && <div className="small">“{acked.get(ex.code).note}” — {acked.get(ex.code).by?.name}</div>}
          </Alert>
        ))}

        <Card>
          <div className="kv">
            <div><div className="k">Provider</div><div className="v">{v.provider?.name} <span className="muted small">#{v.provider?.providerNumber}</span></div></div>
            <div><div className="k">Operator</div><div className="v">{v.provider?.operatorName || '—'}</div></div>
            <div><div className="k">Division</div><div className="v">DIV {v.division?.divisionNumber} – {v.division?.name}</div></div>
            <div><div className="k">Route</div><div className="v mono">{(v.provider?.routes || []).join(', ') || '—'}</div></div>
            <div><div className="k">VDP cycle</div><div className="v">{cycleLabel(v.cycle)}</div></div>
            <div><div className="k">VDP plan</div><div className="v">{v.plan ? <>{v.plan.name} <span className="muted small">v{v.plan.versionNumber} · {PAYMENT_TYPE_LABELS[v.settings?.paymentType?.value]}</span></> : '—'}</div></div>
            <div><div className="k">TUI eligible</div><div className="v">{v.settings ? (v.settings.tuiEligible.value ? 'Yes' : 'No') : '—'}{v.settings?.tuiEligible.source === 'PROVIDER_OVERRIDE' && <span className="source-tag source-override"> · override</span>}</div></div>
            <div><div className="k">Bonus rate</div><div className="v">{v.settings?.bonusEnabled.value ? rate(v.settings.bonusRate.value) : 'None'}</div></div>
            <div><div className="k">Fuel</div><div className="v">{v.settings?.fuelMethod?.value === 'SERVICE_MILE_ALLOWANCE' ? `Service mile allowance · ${num(v.settings.fuelMpg.value)} MPG` : v.settings?.fuelReimbursementEnabled?.value ? `${rate(v.settings.fuelReimbursementRate.value)} / trip` : 'None'}</div></div>
          </div>
        </Card>

        <div className="split">
          <div className="stack">
            {!v.calculation && !v.performance && <Card><Empty title="Not calculated">Resolve the issues above, then recalculate.</Empty></Card>}
            <PerformanceCard view={v} />
            <OperatorsCard calc={v.calculation} perTrip={perTrip} settings={v.settings} />
            <EarningsCard calc={v.calculation} perTrip={perTrip} />
            <FuelCard key={`${vdp._id}-${vdp.view.fuelExpense?.amount ?? ''}`} vdp={vdp} editable={editable} onChanged={(d) => { setData(d); toast('Fuel expense saved'); }} />
            <AdjustmentsCard vdp={vdp} types={types.data || []} editable={editable} onChanged={(d) => { setData(d); toast('VDP updated'); }} />
            <ExplainCalculation calc={v.calculation} settings={v.settings} />
          </div>
          <div className="stack">
            <NetCard vdp={vdp} />
            <Card title="History" className="no-print">
              <ul className="timeline">
                {[...vdp.history].reverse().map((h, i) => (
                  <li key={i}>
                    <div><strong>{HISTORY_LABELS[h.action] || h.action}</strong> · {h.by?.name}</div>
                    <div className="muted small">{dateTime(h.at)}</div>
                    {h.reason && <div className="small">{h.reason}</div>}
                    {h.previousSnapshot && <div className="small muted">Previously approved net: {money(h.previousSnapshot.net)}</div>}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </div>

      {dialog === 'approve' && (
        <Confirm title="Approve this VDP?" confirmLabel="Approve" tone="success"
          message={<>
            Net payment <strong>{money(v.calculation?.net)}</strong> to {v.provider?.name}. Approval freezes the calculation and sends the statement to the provider’s portal.
            {' '}{deadlineText(v.cycle)}
          </>}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            const d = await api.post(`/vdps/${id}/approve`);
            setData(d);
            toast(d.status === 'PROCESSED' ? 'Approved — submission date has passed, so it was auto-approved' : 'Approved and sent to the provider');
          }} />
      )}
      {dialog === 'answer' && (
        <Confirm title="Answer the provider — no change" confirmLabel="Send answer" reason="Explain to the provider why the statement is correct"
          message="The statement stays as it is and goes back to the provider for approval. They will see your answer and have at least 48 hours to approve."
          onClose={() => setDialog(null)} onConfirm={async (message) => { setData(await api.post(`/vdps/${id}/issues/respond`, { message })); toast('Answer sent to the provider'); }} />
      )}
      {dialog === 'reopen' && (
        <Confirm title={vdp.status === 'DISPUTED' ? 'Reopen to correct the provider’s issue' : 'Reopen approved VDP'} confirmLabel="Reopen" tone="danger"
          reason={vdp.status === 'DISPUTED' ? 'What will be corrected? (the provider will see this)' : 'Why does this VDP need correcting?'}
          message="The approved snapshot is kept in the history. The VDP will be recalculated with current data and must be approved again."
          onClose={() => setDialog(null)} onConfirm={async (reason) => { setData(await api.post(`/vdps/${id}/reopen`, { reason })); toast('VDP reopened'); }} />
      )}
      {dialog === 'paid' && (
        <Confirm title="Mark as paid?" confirmLabel="Mark paid" message={`Record that ${money(v.calculation?.net)} has been paid to ${v.provider?.name}. The provider will see it as paid. Paid VDPs cannot be reopened.`}
          onClose={() => setDialog(null)} onConfirm={async () => { setData(await api.post(`/vdps/${id}/mark-paid`)); toast('Marked as paid'); }} />
      )}
      {ack && (
        <Confirm title="Accept this issue?" confirmLabel="Accept" reason="Explain why this is acceptable" message={ack.message}
          onClose={() => setAck(null)} onConfirm={async (note) => { setData(await api.post(`/vdps/${id}/acknowledge`, { code: ack.code, note })); }} />
      )}
    </div>
  );
}
