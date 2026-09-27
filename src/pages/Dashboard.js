import { Link } from 'react-router-dom';
import { useState } from 'react';
import { api } from '../api';
import { cycleLabel, date, money } from '../format';
import { Alert, Card, CYCLE_STATUS, ErrorAlert, Loading, PageHead, Stat, StatusBadge, useLoad, VDP_STATUS } from '../components/ui';
import { DivisionCyclePicker, useDivisionCycle } from '../components/selection';
import { VdpTable } from './Processing';

export default function Dashboard() {
  const sel = useDivisionCycle();
  const [status, setStatus] = useState('');
  const { data: s, loading, error } = useLoad(
    () => (sel.cycleId ? api.get(`/cycles/${sel.cycleId}`) : Promise.resolve(null)),
    [sel.cycleId],
  );

  const nextStep = (() => {
    if (!s) return null;
    if (!s.performance.loaded) return ['Upload the Performance Report for this cycle.', 'Upload performance'];
    if (s.performance.unresolvedCount) return [`${s.performance.unresolvedCount} route(s) need review before processing.`, 'Review routes'];
    if (!s.vdps.total || s.vdps.stale || s.providersWithoutVdp) return ['VDPs need to be processed.', 'Process VDPs'];
    if (s.vdps.DISPUTED) return [`${s.vdps.DISPUTED} provider(s) reported an issue — auto-approval is paused until you answer.`, 'Review provider issues'];
    if (s.vdps.NEEDS_REVIEW) return [`${s.vdps.NEEDS_REVIEW} VDP(s) need review.`, 'Review exceptions'];
    if (s.vdps.READY) return [`${s.vdps.READY} VDP(s) are ready to approve.`, 'Review VDPs'];
    if (s.vdps.PROCESSED) return [`${s.vdps.PROCESSED} VDP(s) are approved & processed — ready to mark as paid.`, 'Review VDPs'];
    return null;
  })();

  return (
    <div className="page">
      <PageHead title="Dashboard"
        sub={s ? <>DIV {s.division.divisionNumber} – {s.division.name} · {cycleLabel(s.cycle)} · payment {date(s.cycle.paymentDate, 'long')} <StatusBadge status={s.cycle.status} map={CYCLE_STATUS} /></> : 'Current VDP cycle at a glance.'} />
      <div className="filters" style={{ marginBottom: 16 }}>
        <DivisionCyclePicker sel={sel} />
        <div className="field">
          <label htmlFor="dash-status">VDP status</label>
          <select id="dash-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(VDP_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>
      {!sel.loading && !sel.divisions.length && (
        <Alert tone="info" action={<Link className="btn btn-sm" to="/divisions">Set up divisions</Link>}>Start by creating a division, its VDP plans and providers.</Alert>
      )}
      <ErrorAlert error={error} />
      {loading && !s ? <Loading /> : s && (
        <div className="stack">
          {nextStep && (
            <Alert tone="warn" action={<Link className="btn btn-sm btn-primary" to={nextStep[1] === 'Review exceptions' ? '/processing?status=NEEDS_REVIEW' : nextStep[1] === 'Review provider issues' ? '/processing?status=DISPUTED' : '/processing'}>{nextStep[1]}</Link>}>
              <strong>Next step:</strong> {nextStep[0]}
            </Alert>
          )}
          <div className="grid grid-3">
            <Stat label="Providers expected" value={s.providersExpected} note="Active in this division" />
            <Stat label="Performance loaded" value={s.performance.loaded ? 'Yes' : 'No'} tone={s.performance.loaded ? 'ok' : 'bad'}
              note={s.performance.loaded ? s.performance.fileName : 'Report not uploaded'} />
            <Stat label="VDPs calculated" value={`${s.vdps.calculated} / ${s.providersExpected}`} />
          </div>
          <div className="grid grid-3">
            <Link className="stat-link" to="/processing?status=NEEDS_REVIEW"><Stat label="Needs review" value={s.vdps.NEEDS_REVIEW} tone={s.vdps.NEEDS_REVIEW ? 'bad' : undefined} /></Link>
            <Link className="stat-link" to="/processing?status=READY"><Stat label="Ready" value={s.vdps.READY} /></Link>
            <Link className="stat-link" to="/processing?status=APPROVED"><Stat label="Awaiting provider" value={s.vdps.APPROVED} tone={s.vdps.APPROVED ? 'warn' : undefined} note="Sent to provider portal" /></Link>
          </div>
          <div className="grid grid-3">
            <Link className="stat-link" to="/processing?status=PROCESSED"><Stat label="Approved & processed" value={s.vdps.PROCESSED} tone={s.vdps.PROCESSED ? 'ok' : undefined} note="Ready to mark paid" /></Link>
            <Link className="stat-link" to="/processing?status=DISPUTED"><Stat label="Provider issues" value={s.vdps.DISPUTED} tone={s.vdps.DISPUTED ? 'bad' : undefined} note="Auto-approval paused" /></Link>
            <Link className="stat-link" to="/processing?status=PAID"><Stat label="Paid" value={s.vdps.PAID} /></Link>
          </div>
          <div className="grid grid-3">
            <Stat label="Gross VDP" value={money(s.totals.gross)} />
            <Stat label="Total deductions" value={money(s.totals.deductions)} note={`Additions ${money(s.totals.additions)}`} />
            <Stat label="Net VDP" value={money(s.totals.net)} tone="ok" />
          </div>
          <Card title="VDPs" body={false} actions={<Link className="btn btn-sm" to="/processing">Open processing</Link>}>
            <VdpTable cycleId={s.cycle._id} status={status} search="" refreshKey={0} />
          </Card>
        </div>
      )}
    </div>
  );
}
