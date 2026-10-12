import { Link } from 'react-router-dom';
import { api } from '../api';
import { date } from '../format';
import { Badge, Card, Empty, ErrorAlert, Loading, PageHead, Stat, useLoad } from '../components/ui';

const statusTone = (status) => ({ EXCEPTIONS: 'bad', FAILED: 'bad', READY: 'ok', REVIEW: 'info', COMPLETE: 'ok' }[status] || 'warn');

export default function Dashboard() {
  const runs = useLoad(() => api.get('/processing-runs', { limit: 12 }), []);
  const vdps = useLoad(() => api.get('/vdps'), []);
  const rows = vdps.data || [];
  const exceptions = rows.filter((row) => ['NEEDS_REVIEW', 'DISPUTED'].includes(row.status));
  const clean = rows.filter((row) => row.status === 'READY' && !row.stale);
  const providerIssues = rows.filter((row) => row.status === 'DISPUTED');

  return (
    <div className="page">
      <PageHead title="Home" sub="Resume current work and act on the small number of records that need attention."
        actions={<Link className="btn btn-primary" to="/processing">Start or resume processing</Link>} />
      <ErrorAlert error={runs.error || vdps.error} />
      {(runs.loading || vdps.loading) && !runs.data ? <Loading /> : <div className="stack">
        <div className="grid grid-3">
          <Link className="stat-link" to="/vdps?status=NEEDS_REVIEW"><Stat label="Exceptions" value={exceptions.length} tone={exceptions.length ? 'bad' : 'ok'} note="Calculation or provider review" /></Link>
          <Link className="stat-link" to="/vdps?status=READY"><Stat label="Ready to approve" value={clean.length} tone={clean.length ? 'ok' : undefined} note="Clean, current VDPs" /></Link>
          <Link className="stat-link" to="/vdps?status=DISPUTED"><Stat label="Provider issues" value={providerIssues.length} tone={providerIssues.length ? 'warn' : undefined} note="Awaiting a response" /></Link>
        </div>
        <Card title="Current processing runs" hint="Uploads and position are saved on the server" actions={<Link className="btn btn-sm" to="/processing">Open processing</Link>} body={false}>
          {!(runs.data || []).length ? <Empty title="No active processing runs" actions={<Link className="btn btn-primary" to="/processing">Begin a cycle</Link>}>Choose a division and upload its first core dataset.</Empty> : <div className="run-list">
            {(runs.data || []).map((run) => <Link key={run._id} className="run-row" to={`/processing?cycleId=${run.cycleId?._id || run.cycleId}&runId=${run._id}`}>
              <div><strong>DIV {run.divisionId?.divisionNumber} — {run.divisionId?.name}</strong><div className="muted small">{date(run.cycleId?.cycleStart)}–{date(run.cycleId?.cycleEnd)} · Last opened {date(run.lastOpenedAt)}</div></div>
              <div className="run-progress"><span>{String(run.currentSection || 'DIVISION').replaceAll('_', ' ').toLowerCase()}</span><Badge tone={statusTone(run.status)}>{run.status}</Badge></div>
            </Link>)}
          </div>}
        </Card>
        {!!exceptions.length && <Card title="Next exceptions" hint="Clean providers are never held behind these records" actions={<Link className="btn btn-sm" to="/vdps?status=NEEDS_REVIEW">Open exception queue</Link>} body={false}>
          <div className="run-list">{exceptions.slice(0, 6).map((row) => <Link key={row._id} className="run-row" to={`/vdps?selected=${row._id}`}><div><strong>{row.provider?.name}</strong><div className="muted small">{row.exceptions?.[0]?.message || 'Provider issue requires review'}</div></div><Badge tone="bad">Review</Badge></Link>)}</div>
        </Card>}
      </div>}
    </div>
  );
}
