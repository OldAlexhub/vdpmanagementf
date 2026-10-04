// Provider portal: the provider's own approved VDP statements, and their approval.
import { useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api, downloadFile } from '../api';
import ExplainCalculation from '../components/Explain';
import { IssueList, ReportIssueModal } from '../components/Issues';
import { cycleLabel, date, dateTime, deadlineLabel, money, num, rate, LEASE_LABELS } from '../format';
import { Alert, Badge, Card, Confirm, Empty, ErrorAlert, Loading, PageHead, useLoad, useToast } from '../components/ui';
import { GrossIncomeBreakdown, NetCard, OperatorsCard, PerformanceCard } from './VdpReview';
import { PasswordCard } from './Settings';
import PortalDashboard from './PortalDashboard';

const ADDITIONS = new Set(['REIMBURSEMENT', 'OTHER_INCOME']);
const TYPE_LABELS = {
  FARES: 'Fares collected', FUEL: 'Fuel', TOLL: 'Toll', LATE_DEPLOYMENT: 'Late deployment', VIOLATION: 'Violation',
  OTHER_DEDUCTION: 'Other deduction', REIMBURSEMENT: 'Reimbursement', OTHER_INCOME: 'Other income',
};

function PortalStatus({ vdp }) {
  if (vdp.status === 'APPROVED') return <Badge tone="warn" dot>Needs your approval</Badge>;
  if (vdp.status === 'DISPUTED') return <Badge tone="bad" dot>Issue under review</Badge>;
  if (vdp.status === 'IN_CORRECTION') return <Badge tone="warn" dot>Being corrected</Badge>;
  if (vdp.status === 'PAID') return <Badge tone="accent" dot>Paid</Badge>;
  if (vdp.providerApproval?.method === 'AUTO') return <Badge tone="ok" dot>Auto-approved</Badge>;
  return <Badge tone="ok" dot>Approved</Badge>;
}

function PortalHome() {
  const navigate = useNavigate();
  const { data, loading, error } = useLoad(() => api.get('/portal/vdps'), []);
  const waiting = (data || []).filter((v) => v.status === 'APPROVED');
  return (
    <div className="page">
      <PageHead title="My VDP statements" sub="Review each statement and approve it before the Closed for Submission date." />
      <ErrorAlert error={error} />
      {loading ? <Loading /> : data && (
        <div className="stack">
          {waiting.map((v) => (
            <Alert key={v._id} tone="warn" action={<Link className="btn btn-sm btn-primary" to={`/vdps/${v._id}`}>Review & approve</Link>}>
              <strong>{cycleLabel(v.cycle)}</strong> needs your approval by {deadlineLabel(v.cycle?.submissionDate)} — net {money(v.net)}.
              If you do not respond it will be approved automatically.
            </Alert>
          ))}
          <Card body={false}>
            {!data.length ? <Empty title="No statements yet">Your VDP statements appear here once Big Star has approved them.</Empty> : (
              <table>
                <thead><tr><th>VDP cycle</th><th>Payment date</th><th className="num">Gross</th><th className="num">Net payment</th><th>Status</th></tr></thead>
                <tbody>
                  {data.map((v) => (
                    <tr key={v._id} className="clickable" onClick={() => navigate(`/vdps/${v._id}`)}>
                      <td className="strong">{cycleLabel(v.cycle)}</td>
                      <td>{date(v.cycle?.paymentDate, 'long')}</td>
                      <td className="num">{v.net ? money(v.gross) : '—'}</td>
                      <td className="num strong">{v.net ? money(v.net) : '—'}</td>
                      <td><PortalStatus vdp={v} />{v.status === 'APPROVED' && <div className="muted small">due by {deadlineLabel(v.cycle?.submissionDate)}</div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function AdjustmentList({ view }) {
  const c = view.calculation;
  const l = view.lease || {};
  return (
    <Card title="Deductions & additions" body={false}>
      <table>
        <tbody>
          <tr>
            <td className="strong">Lift lease</td>
            <td className="small">{l.amount ? `${money(l.amount)} / ${LEASE_LABELS[l.frequency]}` : '—'}{l.weeksCharged && ` · ${num(l.weeksCharged)} week(s)`}</td>
            <td className="num minus">{c?.lease && c.lease !== '0.00' ? `−${money(c.lease)}` : money(c?.lease)}</td>
          </tr>
          {view.adjustments.map((a, i) => (
            <tr key={i}>
              <td className="strong">{TYPE_LABELS[a.type] || a.type}</td>
              <td className="small">{a.description || '—'}<span className="muted"> · {date(a.date)}</span></td>
              <td className={`num ${ADDITIONS.has(a.type) ? 'plus' : 'minus'}`}>{ADDITIONS.has(a.type) ? '+' : '−'}{money(a.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function PortalStatement() {
  const { id } = useParams();
  const toast = useToast();
  const { data: vdp, loading, error, setData } = useLoad(() => api.get(`/portal/vdps/${id}`), [id]);
  const [confirming, setConfirming] = useState(false);
  const [reporting, setReporting] = useState(false);
  if (loading && !vdp) return <div className="page"><Loading /></div>;
  if (error) return <div className="page"><ErrorAlert error={error} /></div>;
  if (!vdp.view) {
    return (
      <div className="page">
        <PageHead crumbs={<Link to="/statements">My VDP statements</Link>} title={<>VDP statement <PortalStatus vdp={vdp} /></>} />
        <div className="stack">
          <Alert tone="warn">Big Star is correcting this statement based on the issue you reported. You will be able to review and approve the corrected statement here.</Alert>
          <Card title="Your issues"><IssueList issues={vdp.issues} /></Card>
        </div>
      </div>
    );
  }
  const v = vdp.view;
  const perTrip = v.settings?.paymentType?.value === 'PER_TRIP';
  const a = vdp.providerApproval;

  return (
    <div className="page">
      <PageHead crumbs={<Link to="/statements">My VDP statements</Link>}
        title={<>VDP statement <PortalStatus vdp={vdp} /></>}
        sub={`${v.provider?.name} · ${cycleLabel(v.cycle)} · payment ${date(v.cycle?.paymentDate, 'long')}`}
        actions={<>
          <button className="btn" onClick={() => downloadFile(`/portal/vdps/${id}/statement.pdf`).catch((e) => toast(e.message, 'bad'))}>Download PDF</button>
          {vdp.status === 'APPROVED' && <button className="btn btn-danger" onClick={() => setReporting(true)}>Report an issue</button>}
          {vdp.status === 'APPROVED' && <button className="btn btn-success btn-lg" onClick={() => setConfirming(true)}>Approve statement</button>}
        </>} />
      <div className="stack">
        {vdp.status === 'APPROVED' && (
          <Alert tone="warn">
            Please review this statement and approve it by <strong>{deadlineLabel(v.cycle?.submissionDate)}</strong> (Closed for Submission date).
            If something is wrong, use <strong>Report an issue</strong> before then. If you neither approve nor report an issue,
            it will be approved automatically.
          </Alert>
        )}
        {vdp.status === 'DISPUTED' && (
          <Alert tone="bad">You reported an issue. Big Star is reviewing it — the statement will not be auto-approved while it is under review.</Alert>
        )}
        {vdp.issues?.length > 0 && <Card title="Issues you reported"><IssueList issues={vdp.issues} /></Card>}
        {a && (
          <Alert tone="ok">
            {a.method === 'AUTO' ? 'Approved automatically' : `Approved by ${a.by?.name}`} on {dateTime(a.at)}.
            {vdp.status === 'PAID' ? ` Paid ${dateTime(vdp.paidAt)}.` : ' Payment is being processed.'}
          </Alert>
        )}
        <Card>
          <div className="kv">
            <div><div className="k">Provider</div><div className="v">{v.provider?.name}</div></div>
            <div><div className="k">Operator</div><div className="v">{v.provider?.operatorName || '—'}</div></div>
            <div><div className="k">Route</div><div className="v mono">{(v.provider?.routes || []).join(', ')}</div></div>
            <div><div className="k">Service</div><div className="v">{v.plan?.name}</div></div>
            <div><div className="k">VDP cycle</div><div className="v">{cycleLabel(v.cycle)}</div></div>
            <div><div className="k">Payment date</div><div className="v">{date(v.cycle?.paymentDate, 'long')}</div></div>
            <div><div className="k">Contracted hours</div><div className="v">{v.settings?.contractedHours?.value ? `${num(v.settings.contractedHours.value)} / week` : '—'}</div></div>
            <div><div className="k">Bonus rate</div><div className="v">{v.settings?.bonusEnabled?.value ? rate(v.settings.bonusRate.value) : 'None'}</div></div>
            {v.settings?.fuelReimbursementEnabled?.value && <div><div className="k">Fuel reimbursement</div><div className="v">{rate(v.settings.fuelReimbursementRate.value)} / trip</div></div>}
            {v.settings?.fuelMethod?.value === 'SERVICE_MILE_ALLOWANCE' && <div><div className="k">Fuel</div><div className="v">Service mile allowance · {num(v.settings.fuelMpg.value)} MPG</div></div>}
          </div>
        </Card>
        <div className="split">
          <div className="stack">
            <PerformanceCard view={v} />
            <OperatorsCard calc={v.calculation} perTrip={perTrip} settings={v.settings} />
            <GrossIncomeBreakdown calc={v.calculation} perTrip={perTrip} />
            <AdjustmentList view={v} />
            <ExplainCalculation calc={v.calculation} settings={v.settings} />
          </div>
          <NetCard vdp={vdp} />
        </div>
      </div>
      {reporting && (
        <ReportIssueModal vdp={vdp} onClose={() => setReporting(false)}
          onSubmit={async (body) => { setData(await api.post(`/portal/vdps/${id}/issues`, body)); toast('Issue sent to Big Star'); }} />
      )}
      {confirming && (
        <Confirm title="Approve this VDP statement?" confirmLabel="Approve" tone="success"
          message={`You confirm the statement for ${cycleLabel(v.cycle)} with a net payment of ${money(v.net)} is correct.`}
          onClose={() => setConfirming(false)}
          onConfirm={async () => { setData(await api.post(`/portal/vdps/${id}/approve`)); toast('Thank you — statement approved'); }} />
      )}
    </div>
  );
}

function Account({ user }) {
  return (
    <div className="page">
      <PageHead title="Account" sub={`${user.name} · ${user.email}`} />
      <div style={{ maxWidth: 480 }}><PasswordCard /></div>
    </div>
  );
}

export default function PortalShell({ user, onLogout }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><span className="brand-star">★</span> Big Star</div>
          <div className="brand-sub">Provider Portal</div>
        </div>
        <nav className="nav">
          <NavLink to="/" end><span className="nav-icon" aria-hidden>◧</span>Dashboard</NavLink>
          <NavLink to="/statements"><span className="nav-icon" aria-hidden>▤</span>My VDP statements</NavLink>
          <NavLink to="/account"><span className="nav-icon" aria-hidden>⚙</span>Account</NavLink>
        </nav>
        <div className="sidebar-foot">
          <div style={{ color: '#fff', fontWeight: 600 }}>{user.providerName}</div>
          <div style={{ marginBottom: 6 }}>{user.name}</div>
          <button type="button" onClick={onLogout}>Sign out</button>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<PortalDashboard user={user} />} />
          <Route path="/statements" element={<PortalHome />} />
          <Route path="/vdps/:id" element={<PortalStatement />} />
          <Route path="/account" element={<Account user={user} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
