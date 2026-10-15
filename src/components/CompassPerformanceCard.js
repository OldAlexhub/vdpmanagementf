import { useEffect, useState } from 'react';
import { useAuth } from '../App';
import { api } from '../api';
import { dateTime, num } from '../format';
import { Alert, Badge, Card, ErrorAlert, Field, Loading, Modal, useLoad } from './ui';

export default function CompassPerformanceCard({ cycleId, revision, onChanged }) {
  const { user } = useAuth();
  const canEdit = ['ADMIN', 'ACCOUNTING', 'USER'].includes(user?.role);
  const load = useLoad(() => api.get(`/cycles/${cycleId}/compass-performance`), [cycleId, revision]);
  const providers = useLoad(() => api.get('/providers'), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const data = load.data;
  useEffect(() => { setPage(0); }, [query, issuesOnly, cycleId]);
  useEffect(() => {
    if (!data?.refreshing) return undefined;
    const timer = setTimeout(load.reload, 2000);
    return () => clearTimeout(timer);
  }, [data?.refreshing, data?.lastAttemptAt, load.reload]);
  const changed = (next) => { load.setData(next); onChanged(); };
  const refresh = async () => {
    setBusy(true); setError(null);
    try { changed(await api.post(`/cycles/${cycleId}/compass-performance/sync`, { expectedRevision: data.revision })); }
    catch (e) { setError(e); load.reload(); onChanged(); }
    finally { setBusy(false); }
  };
  const edit = (row, action = 'CORRECT') => {
    setEditing({ row, action, revision: data.revision });
    setForm({ trips: row.trips ?? '', serviceHours: row.serviceHours ?? '', providerId: '', operatorId: '', reason: '' });
    setError(null);
  };
  const save = async (event) => {
    event.preventDefault();
    setBusy(true); setError(null);
    const { row, action } = editing;
    const values = {};
    for (const field of ['trips', 'serviceHours']) if (form[field] !== '' && String(form[field]) !== String(row[field] ?? '')) values[field] = form[field];
    try {
      changed(await api.post(`/cycles/${cycleId}/compass-performance/corrections`, {
        rowKey: row.rowKey, action, expectedRevision: editing.revision, values, reason: form.reason,
        ...(form.providerId ? { assignment: { providerId: form.providerId, operatorId: form.operatorId } } : {}),
      }));
      setEditing(null);
    } catch (e) { setError(e); if (e.status === 409) { setEditing(null); load.reload(); onChanged(); } }
    finally { setBusy(false); }
  };
  if (load.loading && !data) return <Loading text="Loading Compass performance…" />;
  if (load.error) return <ErrorAlert error={load.error} />;
  if (!data?.available && !data?.importId) return null;
  const visible = (data.rows || []).filter((row) => (!issuesOnly || row.conflict || row.assignmentIssue || row.metricIssues?.length)
    && `${row.date} ${row.route} ${row.providerName || ''} ${row.operatorName || ''} ${row.reportedOperator || ''}`.toLowerCase().includes(query.toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(visible.length / 50));
  const currentPage = Math.min(page, pageCount - 1);
  const eligibleProviders = (providers.data || []).filter((p) => p.divisionId === editing?.row.divisionId || p.divisionId?._id === editing?.row.divisionId);
  const operators = (eligibleProviders.find((p) => p._id === form.providerId)?.operators || []).filter((o) => o.status === 'ACTIVE');
  return <div id="compass-performance">
    <Card title="Compass performance" hint={data.lastSyncedAt ? `Last refreshed ${dateTime(data.lastSyncedAt)}. Corrections stay in VDP Management.` : 'Trips and service hours load when this pay period is first opened.'}
      actions={canEdit && <button className="btn btn-sm" disabled={busy || data.refreshing || data.locked} onClick={refresh}>{busy || data.refreshing ? 'Refreshing…' : 'Refresh from Compass'}</button>}>
      <ErrorAlert error={!editing ? error : null} />
      {data.lastError && <Alert tone="warn">Compass refresh failed: {data.lastError} {data.importId ? 'The previous snapshot is retained.' : 'Use the required uploads or retry the refresh.'}</Alert>}
      {data.refreshing && <Loading text="Fetching and reconciling Compass records…" />}
      {data.locked && <Alert tone="info">This period is locked. Reopen it before changing performance inputs.</Alert>}
      {!data.loaded && !data.refreshing && <Alert tone="warn">No Compass performance records are available for this pay period. Missing data is not counted as zero work.</Alert>}
      {data.loaded && <>
        <div className="actions"><Badge tone="accent">Compass is the primary source</Badge><span><strong>{num(data.totals.trips)}</strong> trips</span><span><strong>{num(data.totals.serviceHours)}</strong> service hours</span><span>{data.rows.length} records</span></div>
        {data.coverage.map((item) => <div key={item.divisionId} className="muted small">DIV {item.divisionNumber}: {item.dates.length} days with data{item.missingDates.length ? ` · Missing dates: ${item.missingDates.join(', ')}` : ' · Full period covered'}</div>)}
        {data.missingMetrics.length > 0 && <Alert tone="warn">Some records have missing or negative {data.missingMetrics.join(', ')}. Plans requiring these metrics need valid hours before approval.</Alert>}
      </>}
      {(data.conflictCount > 0 || data.unresolvedCount > 0) && <Alert tone="warn">{data.conflictCount} correction conflict(s) · {data.unresolvedCount} assignment issue(s). Review the affected records before approval.</Alert>}
      {data.rows.length > 0 && <>
        <div className="actions" style={{ marginTop: 16 }}><input aria-label="Search Compass performance" placeholder="Date, route, provider or driver" value={query} onChange={(e) => setQuery(e.target.value)} /><label className="check"><input type="checkbox" checked={issuesOnly} onChange={(e) => setIssuesOnly(e.target.checked)} /> Only records needing review</label></div>
        <div className="table-wrap"><table className="table-compact"><thead><tr><th>Date / route</th><th>Provider / operator</th><th>Trips</th><th>Service hours</th><th>Source / review</th><th /></tr></thead><tbody>
          {visible.slice(currentPage * 50, currentPage * 50 + 50).map((row) => <tr key={row.rowKey}>
            <td>{row.date}<div className="mono">{row.route}</div></td>
            <td>{row.providerName || 'Unassigned'}<div className="muted small">{row.operatorName || row.reportedOperator || 'No operator'}</div></td>
            <td>{num(row.trips)}{row.correction?.values?.trips !== undefined && <div className="muted small">Compass: {num(row.original.trips)}</div>}</td>
            <td>{row.serviceHours === null ? 'Missing' : num(row.serviceHours)}{row.correction?.values?.serviceHours !== undefined && <div className="muted small">Compass: {row.original.serviceHours === null ? 'Missing' : num(row.original.serviceHours)}</div>}</td>
            <td><Badge tone={row.correction ? 'info' : 'neutral'}>{row.correction ? 'Corrected' : `Compass · ${row.source}`}</Badge>{row.assignmentIssue && <div className="small">{row.assignmentIssue}</div>}{row.metricIssues?.length > 0 && <div className="small">Missing or negative: {row.metricIssues.join(', ')}</div>}{row.conflict && <div className="small">Source changed — review correction</div>}{row.missingFromSource && <div className="small">Record removed from Compass</div>}{row.correction && <div className="muted small">{row.correction.reason}</div>}</td>
            <td>{canEdit && !data.locked && <div className="actions"><button className="btn btn-sm" disabled={busy || data.refreshing} onClick={() => edit(row)}>Correct</button>{row.correction && <><button className="btn btn-sm" disabled={busy || data.refreshing} onClick={() => edit(row, 'REVERT')}>Revert</button>{row.conflict && <button className="btn btn-sm" disabled={busy || data.refreshing} onClick={() => edit(row, 'RETAIN')}>Keep correction</button>}</>}</div>}</td>
          </tr>)}
        </tbody></table></div>
        <div className="actions"><button className="btn btn-sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage + 1} of {pageCount} · {visible.length} records</span><button className="btn btn-sm" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div>
      </>}
      {data.correctionHistory.length > 0 && <details style={{ marginTop: 16 }}><summary>Correction history ({data.correctionHistory.length})</summary><div className="table-wrap"><table className="table-compact"><thead><tr><th>Record</th><th>Change</th><th>Reason</th><th>By / time</th></tr></thead><tbody>{data.correctionHistory.map((h, index) => <tr key={`${h.rowKey}-${index}`}><td>{h.date} · {h.route}</td><td>{h.action}<div className="small">{h.after ? Object.entries(h.after).map(([key, value]) => `${key === 'serviceHours' ? 'Service hours' : 'Trips'}: ${h.before?.[key] ?? h.original?.[key] ?? 'missing'} → ${value}`).join(' · ') : 'Restored Compass values'}</div></td><td>{h.reason}</td><td>{h.by?.name}<div className="muted small">{dateTime(h.at)}</div></td></tr>)}</tbody></table></div></details>}
    </Card>
    {editing && <Modal title={editing.action === 'REVERT' ? 'Revert correction' : editing.action === 'RETAIN' ? 'Keep correction after source change' : 'Correct performance'} onClose={() => !busy && setEditing(null)}>
      <form onSubmit={save} className="stack"><p>{editing.row.date} · Route {editing.row.route} · {editing.row.operatorName || editing.row.reportedOperator || 'Unassigned'}</p><ErrorAlert error={error} />
        {editing.action === 'CORRECT' && <>
          <Field label="Completed trips"><input aria-label="Corrected completed trips" type="number" min="0" step="1" value={form.trips} onChange={(e) => setForm({ ...form, trips: e.target.value })} /></Field>
          <Field label="Service hours"><input aria-label="Corrected service hours" type="number" min="0" step="any" value={form.serviceHours} onChange={(e) => setForm({ ...form, serviceHours: e.target.value })} /></Field>
          <Field label="Operator assignment (optional)"><select aria-label="Correction provider" value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value, operatorId: '' })}><option value="">Keep current assignment</option>{eligibleProviders.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select></Field>
          {form.providerId && <Field label="Operator"><select required aria-label="Correction operator" value={form.operatorId} onChange={(e) => setForm({ ...form, operatorId: e.target.value })}><option value="">Choose operator…</option>{operators.map((o) => <option key={o.id || o._id} value={o.id || o._id}>{o.name}</option>)}</select></Field>}
        </>}
        {editing.action === 'RETAIN' && <Alert tone="info">The correction will remain in use. If Compass removed this record, keeping it explicitly retains its work in this VDP period.</Alert>}
        <Field label="Reason (required)"><textarea aria-label="Correction reason" required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
        <div className="actions"><button className="btn" type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !form.reason.trim()} type="submit">{busy ? 'Saving…' : 'Save with reason'}</button></div>
      </form>
    </Modal>}
  </div>;
}
