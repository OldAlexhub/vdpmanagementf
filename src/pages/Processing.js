import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, downloadFile } from '../api';
import { cycleLabel, date, dateTime, money, num } from '../format';
import {
  Alert, Badge, Card, CYCLE_STATUS, Empty, ErrorAlert, Field, Loading, Modal, PageHead, Stat, StatusBadge, useLoad, useToast, VDP_STATUS,
} from '../components/ui';
import { DivisionCyclePicker, useDivisionCycle } from '../components/selection';

function UploadCard({ summary, onUploaded }) {
  const input = useRef();
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [replace, setReplace] = useState(null); // { file, message }
  const [reason, setReason] = useState('');
  const perf = summary.performance;

  const send = async (file, replaceReason) => {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append('cycleId', summary.cycle._id);
    form.append('file', file);
    if (replaceReason) { form.append('replace', 'true'); form.append('replaceReason', replaceReason); }
    try {
      const doc = await api.post('/performance-imports', form);
      setReplace(null);
      setReason('');
      onUploaded(doc);
    } catch (e) {
      if (e.details?.code === 'REPLACEMENT_REQUIRED') setReplace({ file, message: e.message });
      else setError(e);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const onFile = (file) => file && send(file);

  return (
    <Card title="1 · Performance Report"
      hint={perf.loaded ? 'Trips from “Total Prov”; hours from the column set on each VDP plan.' : 'Upload the Trapeze Paratransit Operation Report (.xlsx or .csv).'}
      actions={perf.loaded ? <Badge tone="ok" dot>Uploaded</Badge> : <Badge tone="bad" dot>Missing</Badge>}>
      <div className="stack">
        {perf.loaded && (
          <div className="kv">
            <div><div className="k">File</div><div className="v small">{perf.fileName}</div></div>
            <div><div className="k">Rows in cycle</div><div className="v">{perf.rowCount}</div></div>
            <div><div className="k">Dates found</div><div className="v">{date(perf.dataRange?.from, 'md')} – {date(perf.dataRange?.to, 'md')}</div></div>
            <div><div className="k">Uploaded</div><div className="v small">{dateTime(perf.uploadedAt)} · {perf.uploadedBy?.name}</div></div>
          </div>
        )}
        <div
          className={`upload-drop ${drag ? 'drag' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}
        >
          <input ref={input} type="file" accept=".xlsx,.csv" hidden onChange={(e) => onFile(e.target.files[0])} />
          {busy ? <span className="loading" style={{ justifyContent: 'center', padding: 0 }}><span className="spinner" /> Reading report…</span> : (
            <>
              <button className="btn btn-primary" onClick={() => input.current.click()}>{perf.loaded ? 'Upload corrected report' : 'Upload Performance Report'}</button>
              <div className="muted small" style={{ marginTop: 8 }}>or drop the file here. Rows outside {cycleLabel(summary.cycle)} are ignored; subtotal rows are removed.</div>
            </>
          )}
        </div>
        <ErrorAlert error={error} />
      </div>
      {replace && (
        <Modal title="Replace the loaded Performance Report?" onClose={() => setReplace(null)}
          footer={<><button className="btn" onClick={() => setReplace(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={!reason.trim() || busy} onClick={() => send(replace.file, reason)}>Replace report</button></>}>
          <div className="stack">
            <p>{replace.message}</p>
            <p className="muted small">The current report will be kept in the audit history as “replaced”. VDPs not yet approved will need to be processed again. Approved VDPs keep their snapshot.</p>
            <Field label="Reason for replacement" htmlFor="rep-reason"><textarea id="rep-reason" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
          </div>
        </Modal>
      )}
    </Card>
  );
}

function UberDriverRow({ match, providers, cycleId, onChanged }) {
  const [providerId, setProviderId] = useState(match.suggestedProviderId || '');
  const [operatorId, setOperatorId] = useState(match.suggestedOperatorId || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const provider = providers.find((item) => item._id === providerId);
  const operators = (provider?.operators || []).filter((operator) => operator.status === 'ACTIVE' && !operator.transferredTo);
  const assign = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/uber-driver-matches', { cycleId, driverUuid: match.driverUuid, providerId, operatorId: operators.length ? operatorId : undefined });
      onChanged();
    } catch (e) { setError(e); }
    setBusy(false);
  };
  return (
    <tr>
      <td>
        <div className="strong">{match.sourceName || 'Name not supplied'}</div>
        <div className="mono muted small">{match.driverUuid}</div>
        {match.sourceName && <div className="muted small">Name from upload; profile name remains authoritative</div>}
      </td>
      <td>{match.weeks.map((week) => date(week, 'md')).join(', ')}</td>
      <td>{match.status === 'MATCHED'
        ? <><Badge tone="ok">Matched</Badge> {match.providerName} | {match.operatorName}{match.matchMethod === 'AUTO_EXACT_NAME' && <div className="muted small">Automatic exact name match</div>}</>
        : match.status === 'SUGGESTED'
          ? <><Badge tone="warn">Suggested</Badge> {match.suggestedProviderName} | {match.suggestedOperatorName}<div className="muted small">{match.suggestionReason} ({Math.round(match.suggestionConfidence * 100)}%)</div></>
          : <><Badge tone="bad">Needs review</Badge>{match.status === 'AMBIGUOUS' && ' UUID is assigned more than once'}</>}</td>
      <td className="num">
        {match.status !== 'MATCHED' && <div className="actions" style={{ justifyContent: 'flex-end' }}>
          <select aria-label={`Provider for Uber driver ${match.driverUuid}`} value={providerId} onChange={(e) => { setProviderId(e.target.value); setOperatorId(''); }}>
            <option value="">Choose provider...</option>
            {providers.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
          </select>
          {operators.length > 0 && <select aria-label={`Operator for Uber driver ${match.driverUuid}`} value={operatorId} onChange={(e) => setOperatorId(e.target.value)}>
            <option value="">Choose operator...</option>
            {operators.map((operator) => <option key={operator._id} value={operator._id}>{operator.name}</option>)}
          </select>}
          <button className="btn btn-sm btn-primary" disabled={busy || !providerId || (operators.length > 0 && !operatorId)} onClick={assign}>{busy ? 'Saving...' : match.status === 'SUGGESTED' ? 'Confirm match' : 'Match'}</button>
        </div>}
        {error && <div className="small" style={{ color: 'var(--bad)' }}>{error.message}</div>}
      </td>
    </tr>
  );
}

function UberUploadCard({ summary, onChanged }) {
  const input = useRef();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const uber = summary.uberPerformance;
  const providers = useLoad(() => api.get('/providers', { divisionId: summary.division._id, status: 'ACTIVE' }), [summary.division._id]);
  const upload = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append('cycleId', summary.cycle._id);
    [...files].forEach((file) => form.append('files', file));
    try {
      const result = await api.post('/uber-performance-imports', form);
      onChanged(result.files);
    } catch (e) { setError(e); }
    setBusy(false);
    if (input.current) input.current.value = '';
  };
  const invalidFiles = uber.files.filter((file) => file.validationStatus === 'INVALID' && file.status === 'INVALID');
  const removeFile = async (file) => {
    const invalid = file.validationStatus === 'INVALID';
    const message = invalid
      ? `Clear the failed upload “${file.fileName}”? You can upload a corrected copy immediately afterward.`
      : `Remove “${file.fileName}” from this cycle’s active Uber data? Any VDPs using it will need recalculation.`;
    if (!window.confirm(message)) return;
    setRemoving(file._id);
    setError(null);
    try {
      await api.del(`/uber-performance-imports/${file._id}`);
      toast(invalid ? 'Failed upload cleared' : 'Uber file removed');
      onChanged();
    } catch (e) { setError(e); }
    setRemoving(null);
  };
  const clearInvalid = async () => {
    if (!window.confirm(`Clear ${invalidFiles.length} failed Uber upload${invalidFiles.length === 1 ? '' : 's'}? Valid files will stay active.`)) return;
    setRemoving('all');
    setError(null);
    try {
      const result = await api.del(`/uber-performance-imports/invalid?cycleId=${encodeURIComponent(summary.cycle._id)}`);
      toast(`${result.deletedCount} failed upload${result.deletedCount === 1 ? '' : 's'} cleared`);
      onChanged();
    } catch (e) { setError(e); }
    setRemoving(null);
  };
  const matches = showAll ? uber.driverMatches : uber.driverMatches.filter((match) => match.status !== 'MATCHED');
  return (
    <Card title="Uber weekly data" hint="Upload one or more weekly Uber files. Each driver/week is validated and calculated independently." body={false}
      actions={<>{uber.loaded ? <Badge tone="ok" dot>{uber.activeFileCount} active file(s)</Badge> : <Badge tone="bad" dot>Missing</Badge>}</>}>
      <div className="card-body stack">
        <div className="upload-drop">
          <input ref={input} type="file" accept=".xlsx,.xls,.csv" multiple hidden onChange={(e) => upload(e.target.files)} />
          <button className="btn btn-primary" disabled={busy || Boolean(removing)} onClick={() => input.current.click()}>{busy ? 'Validating...' : 'Upload Uber data'}</button>
          <div className="muted small" style={{ marginTop: 8 }}>.xlsx, .xls, or .csv | multiple weekly files allowed</div>
        </div>
        {invalidFiles.length > 0 && <Alert tone="warn" action={<div className="actions">
          <button className="btn btn-sm" disabled={Boolean(removing)} onClick={clearInvalid}>{removing === 'all' ? 'Clearing...' : `Clear ${invalidFiles.length} failed upload${invalidFiles.length === 1 ? '' : 's'}`}</button>
          <button className="btn btn-sm btn-primary" disabled={busy || Boolean(removing)} onClick={() => input.current?.click()}>Choose corrected files</button>
        </div>}>
          Failed uploads are not used in calculations. Clear them, correct the source files, and upload again.
        </Alert>}
        <ErrorAlert error={error} />
      </div>
      {uber.files.length > 0 && <div className="table-wrap" style={{ borderTop: '1px solid var(--border)' }}>
        <table className="table-compact">
          <thead><tr><th>File</th><th>Status</th><th className="num">Rows</th><th>Weeks</th><th className="num">Drivers</th><th>Uploaded</th><th /></tr></thead>
          <tbody>{uber.files.map((file) => <tr key={file._id}>
            <td className="strong">{file.fileName}</td>
            <td>{file.validationStatus === 'VALID' && file.status === 'ACTIVE' ? <><Badge tone="ok">Valid</Badge>{file.warnings?.length > 0 && <details className="small" style={{ color: 'var(--warn)', marginTop: 4 }}><summary>{file.warnings.length} source row{file.warnings.length === 1 ? '' : 's'} used \N as 0</summary>{file.warnings.map((warning) => <div key={warning}>{warning}</div>)}</details>}</> : file.status === 'REPLACED' ? <Badge>Removed</Badge> : <><Badge tone="bad">Invalid</Badge><div className="small" style={{ color: 'var(--bad)' }}>{file.processingErrors.join(' ')}</div></>}</td>
            <td className="num">{file.rowCount}</td>
            <td>{file.weeksDetected.map((week) => date(week, 'md')).join(', ') || '-'}</td>
            <td className="num">{file.driversDetected}</td>
            <td className="small">{dateTime(file.uploadedAt)}<div className="muted">{file.uploadedBy?.name}</div></td>
            <td className="num">{['ACTIVE', 'INVALID'].includes(file.status) && <button className="btn btn-ghost btn-sm" disabled={Boolean(removing)} onClick={() => removeFile(file)}>{removing === file._id ? 'Removing...' : file.validationStatus === 'INVALID' ? 'Clear' : 'Remove'}</button>}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      {uber.loaded && <div style={{ borderTop: '1px solid var(--border)' }}>
        <div className="card-body actions" style={{ justifyContent: 'space-between' }}>
          <div><strong>Driver matching</strong><div className="muted small">{uber.unresolvedCount ? `${uber.unresolvedCount} driver(s) need a provider/operator match.` : `All ${uber.driversDetected} drivers are matched.`}</div></div>
          <button className="btn btn-sm" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show only issues' : `Show all ${uber.driversDetected}`}</button>
        </div>
        {matches.length > 0 && <div className="table-wrap"><table className="table-compact">
          <thead><tr><th>Uber driver</th><th>Weeks</th><th>Provider / operator</th><th /></tr></thead>
          <tbody>{matches.map((match) => <UberDriverRow key={match.driverUuid} match={match} providers={providers.data || []} cycleId={summary.cycle._id} onChanged={onChanged} />)}</tbody>
        </table></div>}
      </div>}
    </Card>
  );
}

function RouteRow({ m, providers, importId, onResolved }) {
  const [providerId, setProviderId] = useState(m.candidates?.[0]?.id || '');
  const [save, setSave] = useState(true);
  const [operatorId, setOperatorId] = useState('');
  const [error, setError] = useState(null);
  // Saving the route to a provider with several operators needs the operator who runs it.
  const operators = (providers.find((p) => p._id === providerId)?.operators || []).filter((o) => o.status === 'ACTIVE');
  const pickOperator = save && operators.length > 1;
  const resolve = async (action) => {
    setError(null);
    try {
      await api.post(`/performance-imports/${importId}/routes`, { route: m.route, action, providerId, saveToProfile: save, operatorId: pickOperator ? operatorId : undefined });
      onResolved();
    } catch (e) { setError(e); }
  };
  const needs = m.status === 'UNKNOWN' || m.status === 'AMBIGUOUS';
  return (
    <tr>
      <td className="mono strong">{m.route}</td>
      <td className="num">{m.days}</td>
      <td>
        {m.status === 'MATCHED' && <><Badge tone="ok">Matched</Badge> {m.providerName}
          {m.matchType && m.matchType !== 'EXACT' && m.profileRoutes?.length > 0 && (
            <span className="muted small"> (profile route {m.profileRoutes.join(', ')})</span>
          )}</>}
        {m.status === 'ASSIGNED' && <><Badge tone="info">Assigned</Badge> {m.providerName}</>}
        {m.status === 'IGNORED' && <Badge>Not a VDP route this cycle</Badge>}
        {needs && <><Badge tone="bad">Needs review</Badge> <span className="small">{m.message}</span></>}
        {error && <div className="small" style={{ color: 'var(--bad)' }}>{error.message}</div>}
      </td>
      <td className="num">
        {needs ? (
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <select aria-label={`Provider for route ${m.route}`} style={{ width: 200 }} value={providerId} onChange={(e) => setProviderId(e.target.value)}>
              <option value="">Choose provider…</option>
              {(m.candidates?.length ? m.candidates.map((c) => ({ _id: c.id, name: c.name })) : providers).map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
            <label className="check small"><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} /> Save to profile</label>
            {pickOperator && (
              <select aria-label={`Operator for route ${m.route}`} style={{ width: 160 }} value={operatorId} onChange={(e) => setOperatorId(e.target.value)}>
                <option value="">Which operator…</option>
                {operators.map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}
              </select>
            )}
            <button className="btn btn-sm btn-primary" disabled={!providerId || (pickOperator && !operatorId)} onClick={() => resolve('ASSIGN')}>Assign</button>
            <button className="btn btn-sm" onClick={() => resolve('IGNORE')}>Ignore</button>
          </div>
        ) : (m.status === 'ASSIGNED' || m.status === 'IGNORED') && (
          <button className="btn btn-ghost btn-sm" onClick={() => resolve('CLEAR')}>Undo</button>
        )}
      </td>
    </tr>
  );
}

function RoutesCard({ summary, onChanged }) {
  const perf = summary.performance;
  const [showAll, setShowAll] = useState(false);
  const providers = useLoad(() => api.get('/providers', { divisionId: summary.division._id, status: 'ACTIVE' }), [summary.division._id]);
  if (!perf.loaded) return null;
  const routes = [...perf.routes].sort((a, b) => {
    const rank = (m) => (['UNKNOWN', 'AMBIGUOUS'].includes(m.status) ? 0 : 1);
    return rank(a) - rank(b);
  });
  const visible = showAll ? routes : routes.filter((m) => ['UNKNOWN', 'AMBIGUOUS'].includes(m.status));
  return (
    <Card title="2 · Routes → providers" body={false}
      hint={perf.unresolvedCount ? `${perf.unresolvedCount} route(s) could not be matched confidently. Nothing is guessed — decide below.` : `All ${routes.length} routes are matched or resolved.`}
      actions={<>
        {perf.unresolvedCount > 0 ? <Badge tone="bad" dot>{perf.unresolvedCount} need review</Badge> : <Badge tone="ok" dot>Resolved</Badge>}
        <button className="btn btn-sm" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show only issues' : `Show all ${routes.length} routes`}</button>
      </>}>
      {visible.length === 0 ? <div className="card-body muted small">No route issues. Use “Show all routes” to see every match.</div> : (
        <div className="table-wrap">
          <table className="table-compact">
            <thead><tr><th>Route</th><th className="num">Days</th><th>Provider</th><th /></tr></thead>
            <tbody>
              {visible.map((m) => <RouteRow key={m.route} m={m} providers={providers.data || []} importId={perf.importId} onResolved={onChanged} />)}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

const TABS = [['', 'All'], ['NEEDS_REVIEW', 'Needs review'], ['READY', 'Ready'], ['APPROVED', 'Awaiting provider'], ['DISPUTED', 'Provider issues'], ['PROCESSED', 'Processed'], ['PAID', 'Paid']];

export function VdpTable({ cycleId, status, search, refreshKey }) {
  const navigate = useNavigate();
  const { data, loading, error } = useLoad(() => api.get('/vdps', { cycleId, status, search }), [cycleId, status, search, refreshKey]);
  if (loading) return <Loading />;
  if (error) return <div className="card-body"><ErrorAlert error={error} /></div>;
  if (!data.length) return <Empty title="No VDPs here">{status ? 'No VDPs with this status.' : 'Process VDPs after the Performance Report is loaded.'}</Empty>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Provider</th><th>Route</th><th>Plan</th><th className="num">Week 1 hrs</th><th className="num">Week 2 hrs</th><th className="num">Gross</th><th className="num">Deductions</th><th className="num">Net VDP</th><th>Status</th></tr>
        </thead>
        <tbody>
          {data.map((v) => (
            <tr key={v._id} className="clickable" onClick={() => navigate(`/vdps/${v._id}`)}>
              <td>
                <div className="strong">{v.provider?.name}</div>
                <div className="muted small">{v.provider?.operatorName}</div>
                {v.status === 'NEEDS_REVIEW' && v.exceptions?.[0] && <div className="small" style={{ color: 'var(--bad)' }}>{v.exceptions[0].message}{v.exceptions.length > 1 ? ` (+${v.exceptions.length - 1} more)` : ''}</div>}
              </td>
              <td className="mono">{v.provider?.routes?.join(', ')}</td>
              <td className="small">{v.planName || '—'}</td>
              <td className="num">{num(v.weeks?.[0]?.actualHours)}</td>
              <td className="num">{num(v.weeks?.[1]?.actualHours)}</td>
              <td className="num">
                <div className="strong">{money(v.gross)}</div>
                {v.weeks?.some((week) => week.weeklyEarnings !== null && week.weeklyEarnings !== undefined) && (
                  <div className="muted small">{v.weeks.map((week, index) => `W${week.weekNumber || index + 1} ${money(week.weeklyEarnings)}`).join(' + ')}</div>
                )}
              </td>
              <td className="num">{money(v.totalDeductions)}</td>
              <td className="num strong">{money(v.net)}</td>
              <td className="nowrap">
                <StatusBadge status={v.status} />{v.stale && <> <Badge tone="warn">Recalc</Badge></>}
                {v.status === 'APPROVED' && v.providerDeadline && <div className="muted small">auto-approves after {date(v.cycle?.submissionDate, 'md')}</div>}
                {v.providerApproval?.method === 'AUTO' && <div className="muted small">auto-approved</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Processing() {
  const sel = useDivisionCycle();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const [search, setSearch] = useState('');
  const [processing, setProcessing] = useState(false);
  const [processError, setProcessError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { data: summary, loading, error, reload } = useLoad(
    () => (sel.cycleId ? api.get(`/cycles/${sel.cycleId}`) : Promise.resolve(null)),
    [sel.cycleId, refreshKey],
  );
  const refresh = () => { setRefreshKey((k) => k + 1); };

  const process = async () => {
    setProcessing(true);
    setProcessError(null);
    try {
      const r = await api.post('/vdps/process', { cycleId: sel.cycleId });
      toast(`${r.processed} VDP(s) calculated · ${r.ready} ready · ${r.needsReview} need review${r.skippedLocked ? ` · ${r.skippedLocked} approved left unchanged` : ''}`);
      refresh();
    } catch (e) {
      setProcessError(e);
      reload();
    } finally {
      setProcessing(false);
    }
  };

  const v = summary?.vdps;
  const perf = summary?.performance;
  const uber = summary?.uberPerformance;
  const requirements = summary?.inputRequirements;
  const standardReady = !requirements?.standardProviderCount || (perf?.loaded && !perf.unresolvedCount);
  const uberReady = !requirements?.uberProviderCount || (uber?.loaded && !uber.unresolvedCount);
  const canProcess = standardReady && uberReady;

  return (
    <div className="page">
      <PageHead title="VDP Processing"
        sub={summary ? <>DIV {summary.division.divisionNumber} – {summary.division.name} · {cycleLabel(summary.cycle)} · payment {date(summary.cycle.paymentDate)} <StatusBadge status={summary.cycle.status} map={CYCLE_STATUS} /></> : 'Choose a division and cycle.'}
        actions={summary && v.total > 0 && (
          <>
            <button className="btn" onClick={() => downloadFile(`/exports/cycles/${summary.cycle._id}.pdf`).catch((e) => toast(e.message, 'bad'))}>Payment register (PDF)</button>
            <button className="btn" onClick={() => downloadFile(`/exports/cycles/${summary.cycle._id}.xlsx`).catch((e) => toast(e.message, 'bad'))}>Export to Excel</button>
          </>
        )} />
      <div className="filters" style={{ marginBottom: 16 }}>
        <DivisionCyclePicker sel={sel} />
      </div>
      {!sel.loading && !sel.cycles.length && (
        <Alert tone="info" action={<Link className="btn btn-sm" to="/cycles">Go to Cycles</Link>}>This division has no VDP cycles yet. Generate cycles first.</Alert>
      )}
      <ErrorAlert error={error} />
      {loading && !summary ? <Loading /> : summary && (
        <div className="stack">
          <div className="grid grid-4">
            <Stat label="Providers expected" value={summary.providersExpected} note="Active providers in division" />
            <Stat label="Source data" value={canProcess ? 'Ready' : 'Missing'} tone={canProcess ? 'ok' : 'bad'} note={`${requirements.standardProviderCount} standard | ${requirements.uberProviderCount} Uber provider(s)`} />
            <Stat label="Needs review" value={v.NEEDS_REVIEW} tone={v.NEEDS_REVIEW ? 'bad' : undefined} note={`${v.calculated} calculated`} />
            <Stat label="Approved" value={`${v.APPROVED + v.DISPUTED + v.PROCESSED + v.PAID} / ${v.total || summary.providersExpected}`}
              tone={v.total && v.APPROVED + v.DISPUTED + v.PROCESSED + v.PAID === v.total ? 'ok' : undefined}
              note={`${v.APPROVED} awaiting provider · ${v.DISPUTED} issues · ${v.PROCESSED} to pay`} />
          </div>

          {requirements.standardProviderCount > 0 && <UploadCard summary={summary} onUploaded={(doc) => { toast(`Report loaded: ${doc.rowCount} rows in this cycle`); refresh(); }} />}
          {requirements.standardProviderCount > 0 && <RoutesCard summary={summary} onChanged={reload} />}
          {requirements.uberProviderCount > 0 && <UberUploadCard summary={summary} onChanged={(files) => { if (files) toast(`${files.filter((file) => file.validationStatus === 'VALID').length} Uber file(s) validated`); refresh(); }} />}

          <Card title="3 · Process VDPs"
            hint="Calculates every active provider’s VDP from the report, their plan and their profile. Approved VDPs are never changed."
            actions={<button className="btn btn-primary" disabled={!canProcess || processing} onClick={process}>{processing ? 'Processing…' : v.total ? 'Re-process VDPs' : 'Process VDPs'}</button>}>
            {requirements.standardProviderCount > 0 && !perf.loaded && <Alert tone="warn">Upload the Performance Report for standard plans first.</Alert>}
            {perf.loaded && perf.unresolvedCount > 0 && <Alert tone="warn">Resolve the routes that need review above before processing.</Alert>}
            {requirements.uberProviderCount > 0 && !uber.loaded && <Alert tone="warn">Upload valid Uber weekly data first.</Alert>}
            {uber.loaded && uber.unresolvedCount > 0 && <Alert tone="warn">Match the Uber drivers that need review above before processing.</Alert>}
            {v.stale > 0 && <Alert tone="warn">{v.stale} VDP(s) have changed inputs since they were calculated (report, plan or provider). Re-process to update them.</Alert>}
            {processError && <ErrorAlert error={processError} />}
            {canProcess && !v.stale && !processError && <p className="muted small">{v.total ? `${v.total} VDPs: ${v.NEEDS_REVIEW} need review, ${v.READY} ready, ${v.APPROVED} awaiting provider, ${v.DISPUTED} with provider issues, ${v.PROCESSED} processed, ${v.PAID} paid.` : 'Ready to process.'}</p>}
          </Card>

          <Card title="4 · Review VDPs" body={false}
            actions={<>
              <div className="segmented" role="tablist">
                {TABS.map(([k, l]) => (
                  <button key={k} className={status === k ? 'on' : ''} onClick={() => setParams(k ? { status: k } : {})}>
                    {l}{k && v[k] ? ` (${v[k]})` : ''}
                  </button>
                ))}
              </div>
              <input aria-label="Search VDPs" style={{ width: 200 }} placeholder="Search provider or route" value={search} onChange={(e) => setSearch(e.target.value)} />
            </>}>
            <VdpTable cycleId={summary.cycle._id} status={status} search={search} refreshKey={refreshKey} />
          </Card>

          {v.calculated > 0 && (
            <div className="grid grid-3">
              <Stat label="Gross VDP" value={money(summary.totals.gross)} />
              <Stat label="Total deductions" value={money(summary.totals.deductions)} note={`Additions ${money(summary.totals.additions)}`} />
              <Stat label="Net VDP" value={money(summary.totals.net)} tone="ok" />
            </div>
          )}
          <p className="muted small">Status legend: {Object.values(VDP_STATUS).map((s) => s.label).join(' → ')}</p>
        </div>
      )}
    </div>
  );
}
