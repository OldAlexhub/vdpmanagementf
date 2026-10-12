import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, downloadFile } from '../api';
import { cycleLabel, date, dateTime, money, num } from '../format';
import {
  Alert, Badge, Card, CYCLE_STATUS, Empty, ErrorAlert, Field, Loading, Modal, PageHead, Stat, StatusBadge, useLoad, useToast, VDP_STATUS,
} from '../components/ui';
import { useDivisionCycle } from '../components/selection';

const divisionNumberKey = (value) => String(value || '').trim().toUpperCase().replace(/\s+/g, '');
const isDivision3Division = (division) => ['3', '3GL'].includes(divisionNumberKey(division?.divisionNumber));
const processingDivisionQuery = (summary, selectedDivision) => {
  const ids = (summary?.processingDivisions || [selectedDivision]).filter(Boolean).map((division) => division._id);
  return ids.length > 1 ? { divisionIds: ids.join(','), status: 'ACTIVE' } : { divisionId: ids[0], status: 'ACTIVE' };
};

// Kept as an exported legacy component for historical reports; the processing
// flow no longer renders it as a fallback for an unconfigured division.
export function UploadCard({ summary, division, onUploaded }) {
  const input = useRef();
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [replace, setReplace] = useState(null); // { file, message }
  const [reason, setReason] = useState('');
  const perf = summary?.performance || { loaded: false };
  const selectedDivision = summary?.division || division;

  const send = async (file, replaceReason) => {
    setBusy(true);
    setError(null);
    const form = new FormData();
    if (summary?.cycle?._id) form.append('cycleId', summary.cycle._id);
    else form.append('divisionId', selectedDivision._id);
    form.append('file', file);
    if (replaceReason) { form.append('replace', 'true'); form.append('replaceReason', replaceReason); }
    try {
      const doc = await api.post('/performance-imports', form);
      setReplace(null);
      setReason('');
      onUploaded(doc);
    } catch (e) {
      if (e.details?.code === 'REPLACEMENT_REQUIRED') setReplace({ file, message: e.message });
      else if (e.details?.code === 'DUPLICATE_UPLOAD' && e.details.cycleId) onUploaded({ cycleId: e.details.cycleId, duplicate: true });
      else setError(e);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const onFile = (file) => file && send(file);

  return (
    <Card title="Performance Report"
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
              <div className="muted small" style={{ marginTop: 8 }}>{summary?.cycle ? <>or drop the file here. Rows outside {cycleLabel(summary.cycle)} are ignored; subtotal rows are removed.</> : <>or drop the file here. The report dates will identify the VDP pay period automatically.</>}</div>
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
            {operators.map((operator) => <option key={operator.id || operator._id} value={operator.id || operator._id}>{operator.name}</option>)}
          </select>}
          <button className="btn btn-sm btn-primary" disabled={busy || !providerId || (operators.length > 0 && !operatorId)} onClick={assign}>{busy ? 'Saving...' : match.status === 'SUGGESTED' ? 'Confirm match' : 'Match'}</button>
        </div>}
        {error && <div className="small" style={{ color: 'var(--bad)' }}>{error.message}</div>}
      </td>
    </tr>
  );
}

function UberUploadCard({ summary, division, onChanged, showUpload = true, showMatching = true }) {
  const input = useRef();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const uber = summary?.uberPerformance || { loaded: false, files: [], driverMatches: [], unresolvedCount: 0, activeFileCount: 0, driversDetected: 0 };
  const selectedDivision = summary?.division || division;
  const providerDivisionIds = (summary?.processingDivisions || [selectedDivision]).filter(Boolean).map((item) => item._id).join(',');
  const providers = useLoad(() => api.get('/providers', processingDivisionQuery(summary, selectedDivision)), [providerDivisionIds]);
  const upload = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    if (summary?.cycle?._id) form.append('cycleId', summary.cycle._id);
    else form.append('divisionId', selectedDivision._id);
    [...files].forEach((file) => form.append('files', file));
    try {
      const result = await api.post('/uber-performance-imports', form);
      onChanged(result.files, result.cycleId);
    } catch (e) { setError(e); }
    setBusy(false);
    if (input.current) input.current.value = '';
  };
  const invalidFiles = uber.files.filter((file) => file.validationStatus === 'INVALID' && file.status === 'INVALID');
  const optional = !uber.required && (summary?.processingDivisions || [selectedDivision]).filter(Boolean).some(isDivision3Division);
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
    <Card title={showUpload ? 'Uber weekly data' : 'Uber driver matching'} hint={showUpload ? (optional ? 'Optional for Division 3. If Uber data is supplied, upload both weekly files; each driver/week is validated independently.' : 'Upload one or more weekly Uber files. Each driver/week is validated and calculated independently.') : 'Confirm every uploaded driver against the provider and operator roster.'} body={false}
      actions={<>{showUpload ? (uber.loaded && (uber.ready ?? true) ? <Badge tone="ok" dot>{uber.activeFileCount} active file(s)</Badge> : optional && !invalidFiles.length ? <Badge tone="info">Optional</Badge> : <Badge tone="bad" dot>{uber.missingWeeks?.length ? `${uber.missingWeeks.length} week(s) missing` : 'Missing'}</Badge>) : (uber.unresolvedCount ? <Badge tone="bad" dot>{uber.unresolvedCount} need review</Badge> : <Badge tone="ok" dot>Resolved</Badge>)}</>}>
      {showUpload && <div className="card-body stack">
        <div className="upload-drop">
          <input ref={input} type="file" accept=".xlsx,.xls,.csv" multiple hidden onChange={(e) => upload(e.target.files)} />
          <button className="btn btn-primary" disabled={busy || Boolean(removing)} onClick={() => input.current.click()}>{busy ? 'Validating...' : 'Upload Uber data'}</button>
          <div className="muted small" style={{ marginTop: 8 }}>.xlsx, .xls, or .csv | multiple weekly files allowed{!summary?.cycle && ' | file dates identify the VDP pay period'}</div>
        </div>
        {uber.expectedWeeks?.length > 0 && (!optional || uber.loaded) && <div className="actions">{uber.expectedWeeks.map((week) => <Badge key={week} tone={uber.weeksDetected?.includes(week) ? 'ok' : 'bad'}>{date(week, 'md')} {uber.weeksDetected?.includes(week) ? 'loaded' : 'missing'}</Badge>)}</div>}
        {invalidFiles.length > 0 && <Alert tone="warn" action={<div className="actions">
          <button className="btn btn-sm" disabled={Boolean(removing)} onClick={clearInvalid}>{removing === 'all' ? 'Clearing...' : `Clear ${invalidFiles.length} failed upload${invalidFiles.length === 1 ? '' : 's'}`}</button>
          <button className="btn btn-sm btn-primary" disabled={busy || Boolean(removing)} onClick={() => input.current?.click()}>Choose corrected files</button>
        </div>}>
          Failed uploads are not used in calculations. Clear them, correct the source files, and upload again.
        </Alert>}
        <ErrorAlert error={error} />
      </div>}
      {showUpload && uber.files.length > 0 && <div className="table-wrap" style={{ borderTop: '1px solid var(--border)' }}>
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
      {showMatching && summary?.cycle && uber.loaded && <div style={{ borderTop: showUpload ? '1px solid var(--border)' : undefined }}>
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

function UberTollUploadCard({ summary, onChanged }) {
  const input = useRef();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState(null);
  const tolls = summary.uberTolls || { files: [], missingWeeks: [], expectedWeeks: [], loadedWeeks: [] };
  const invalidFiles = tolls.files.filter((file) => file.validationStatus === 'INVALID' && file.status === 'INVALID');
  const upload = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append('cycleId', summary.cycle._id);
    [...files].forEach((file) => form.append('files', file));
    try {
      const result = await api.post('/uber-toll-imports', form);
      toast(`${result.files.filter((file) => file.validationStatus === 'VALID').length} toll file(s) validated`);
      onChanged();
    } catch (e) { setError(e); }
    setBusy(false);
    if (input.current) input.current.value = '';
  };
  const removeFile = async (file) => {
    const invalid = file.validationStatus === 'INVALID';
    if (!window.confirm(invalid ? `Clear the failed upload “${file.fileName}”?` : `Remove “${file.fileName}” from this cycle's toll reimbursements?`)) return;
    setRemoving(file._id);
    setError(null);
    try {
      await api.del(`/uber-toll-imports/${file._id}`);
      toast(invalid ? 'Failed upload cleared' : 'Toll file removed');
      onChanged();
    } catch (e) { setError(e); }
    setRemoving(null);
  };
  const clearInvalid = async () => {
    if (!window.confirm(`Clear ${invalidFiles.length} failed toll upload${invalidFiles.length === 1 ? '' : 's'}?`)) return;
    setRemoving('all');
    setError(null);
    try {
      const result = await api.del(`/uber-toll-imports/invalid?cycleId=${encodeURIComponent(summary.cycle._id)}`);
      toast(`${result.deletedCount} failed toll upload${result.deletedCount === 1 ? '' : 's'} cleared`);
      onChanged();
    } catch (e) { setError(e); }
    setRemoving(null);
  };
  return (
    <Card title="Uber toll reimbursements" body={false}
      hint="Upload the weekly payments_driver CSV or Excel files from the Tolls folder. Driver UUID + week connects each reimbursement to the Uber Report."
      actions={tolls.ready ? <Badge tone="ok" dot>Both weeks ready</Badge> : <Badge tone="bad" dot>{tolls.missingWeeks?.length ? `${tolls.missingWeeks.length} week(s) missing` : 'Needs attention'}</Badge>}>
      <div className="card-body stack">
        <Alert tone="info">These are driver toll reimbursements added to VDP earnings. They are different from provider toll-transaction deductions.</Alert>
        <div className="upload-drop">
          <input ref={input} type="file" accept=".csv,.xlsx,.xls" multiple hidden onChange={(event) => upload(event.target.files)} />
          <button className="btn btn-primary" disabled={busy || Boolean(removing)} onClick={() => input.current.click()}>{busy ? 'Validating...' : 'Upload toll files'}</button>
          <div className="muted small" style={{ marginTop: 8 }}>Select both weekly payments_driver files (.csv, .xlsx, or .xls). The dates in each filename are validated against this VDP period.</div>
        </div>
        {tolls.expectedWeeks?.length > 0 && <div className="actions">
          {tolls.expectedWeeks.map((week) => <Badge key={week} tone={tolls.loadedWeeks?.includes(week) ? 'ok' : 'bad'}>{date(week, 'md')} {tolls.loadedWeeks?.includes(week) ? 'loaded' : 'missing'}</Badge>)}
          {tolls.loaded && <span className="muted small">{tolls.tollRowCount} non-zero reimbursement row(s) · {money(tolls.tollTotal)}</span>}
        </div>}
        {invalidFiles.length > 0 && <Alert tone="warn" action={<button className="btn btn-sm" disabled={Boolean(removing)} onClick={clearInvalid}>{removing === 'all' ? 'Clearing...' : 'Clear failed uploads'}</button>}>Failed files are retained for audit but are never used in calculations.</Alert>}
        {tolls.unmatchedRows?.length > 0 && <Alert tone="warn">{tolls.unmatchedRows.length} non-zero toll row(s) do not have the same driver UUID and week in the active Uber Report.</Alert>}
        <ErrorAlert error={error} />
      </div>
      {tolls.files?.length > 0 && <div className="table-wrap" style={{ borderTop: '1px solid var(--border)' }}>
        <table className="table-compact">
          <thead><tr><th>File</th><th>Status</th><th>Week</th><th className="num">Rows</th><th className="num">Tolls</th><th>Uploaded</th><th /></tr></thead>
          <tbody>{tolls.files.map((file) => <tr key={file._id}>
            <td className="strong">{file.fileName}</td>
            <td>{file.validationStatus === 'VALID' && file.status === 'ACTIVE' ? <Badge tone="ok">Valid</Badge> : file.status === 'REPLACED' ? <Badge>Removed</Badge> : <><Badge tone="bad">Invalid</Badge><div className="small" style={{ color: 'var(--bad)' }}>{file.processingErrors?.join(' ')}</div></>}</td>
            <td>{file.weeksDetected?.map((week) => date(week, 'md')).join(', ') || '-'}</td>
            <td className="num">{file.rowCount}</td>
            <td className="num">{money(file.tollTotal)}</td>
            <td className="small">{dateTime(file.uploadedAt)}<div className="muted">{file.uploadedBy?.name}</div></td>
            <td className="num">{['ACTIVE', 'INVALID'].includes(file.status) && <button className="btn btn-ghost btn-sm" disabled={Boolean(removing)} onClick={() => removeFile(file)}>{removing === file._id ? 'Removing...' : file.validationStatus === 'INVALID' ? 'Clear' : 'Remove'}</button>}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </Card>
  );
}

const DIV3_SOURCE_COPY = {
  DIV3_ADA: {
    title: 'ADA raw data',
    hint: 'Upload both weekly DutyReportExport files. Completed Big Star duties are reduced to driver/day ADA paid and fulfillment hours.',
  },
  DIV3_GOLINK: {
    title: 'GoLink raw data',
    hint: 'Upload both weekly DutyReportExport files. Service-area time, pauses, breaks, late starts, and early endings are retained.',
  },
  DIV3_ADA_FARE: {
    title: 'ADA fare data',
    hint: 'Upload both weekly RidershipExport files. Completed Big Star adult riders are valued at the DIV 3 template fare rate.',
  },
  DIV3_RETURNED_FARE: {
    title: 'Returned fare reconciliation',
    hint: 'Optional now. Accounting can upload PARTNER NAME, DriverName, Date, and Fare To Collect; NSM can return the same file later with collection details.',
  },
};

function Division3UploadCard({ kind, summary, division, onChanged }) {
  const input = useRef();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState(null);
  const selectedDivision = summary?.division || division;
  const source = summary?.division3Data?.sources?.[kind] || { files: [], loaded: false, ready: false, missingWeeks: [], loadedWeeks: [], expectedWeeks: [] };
  const copy = DIV3_SOURCE_COPY[kind];
  const required = kind !== 'DIV3_RETURNED_FARE';

  const upload = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    const uploaded = [];
    let detectedCycleId = summary?.cycle?._id || null;
    try {
      // Large Compass workbooks are intentionally sent one at a time. Node
      // streams each temporary file into driver/day aggregates before the next
      // request starts; neither the browser nor API buffers both weeks at once.
      for (const file of [...files]) {
        const form = new FormData();
        if (detectedCycleId) form.append('cycleId', detectedCycleId);
        else form.append('divisionId', selectedDivision._id);
        form.append('kind', kind);
        form.append('files', file);
        const result = await api.post('/division3-imports', form);
        uploaded.push(...result.files);
        detectedCycleId ||= result.cycleId;
      }
      onChanged(uploaded, summary?.cycle?._id ? null : detectedCycleId);
    } catch (e) {
      setError(e);
      if (uploaded.length) onChanged(uploaded, summary?.cycle?._id ? null : detectedCycleId);
    }
    setBusy(false);
    if (input.current) input.current.value = '';
  };

  const remove = async (file) => {
    if (!window.confirm(`${file.validationStatus === 'INVALID' ? 'Clear' : 'Remove'} “${file.fileName}”?`)) return;
    setRemoving(file._id);
    setError(null);
    try {
      await api.del(`/division3-imports/${file._id}`);
      toast(file.validationStatus === 'INVALID' ? 'Failed upload cleared' : `${copy.title} file removed`);
      onChanged();
    } catch (e) { setError(e); }
    setRemoving(null);
  };

  return (
    <Card title={copy.title} hint={copy.hint} body={false}
      actions={required
        ? source.ready ? <Badge tone="ok" dot>Both weeks loaded</Badge> : <Badge tone="bad" dot>{source.loaded ? `${source.missingWeeks?.length || 0} week(s) missing` : 'Missing'}</Badge>
        : source.loaded ? <Badge tone={source.files.some((file) => file.schemaComplete) ? 'ok' : 'warn'} dot>{source.files.some((file) => file.schemaComplete) ? 'NSM detail received' : 'Accounting file received'}</Badge> : <Badge>Optional now</Badge>}>
      <div className="card-body stack">
        <div className="upload-drop">
          <input ref={input} type="file" accept=".xlsx,.xls,.csv" multiple hidden onChange={(event) => upload(event.target.files)} />
          <button className="btn btn-primary" disabled={busy || Boolean(removing)} onClick={() => input.current.click()}>{busy ? 'Validating...' : `Upload ${copy.title}`}</button>
          <div className="muted small" style={{ marginTop: 8 }}>.xlsx, .xls, or .csv · multiple weekly files allowed{!summary?.cycle && ' · source dates identify the VDP period'}</div>
        </div>
        {source.expectedWeeks?.length > 0 && required && <div className="actions">{source.expectedWeeks.map((week) => <Badge key={week} tone={source.loadedWeeks?.includes(week) ? 'ok' : 'bad'}>{date(week, 'md')} {source.loadedWeeks?.includes(week) ? 'loaded' : 'missing'}</Badge>)}</div>}
        {kind === 'DIV3_RETURNED_FARE' && source.loaded && !source.files.some((file) => file.schemaComplete) && <Alert tone="warn">The Accounting columns are accepted. Fare rows remain marked “Pending NSM” until the collection fields are returned.</Alert>}
        <ErrorAlert error={error} />
      </div>
      {source.files?.length > 0 && <div className="table-wrap" style={{ borderTop: '1px solid var(--border)' }}><table className="table-compact">
        <thead><tr><th>File</th><th>Status</th><th className="num">Driver/day rows</th><th>Weeks</th><th>Uploaded</th><th /></tr></thead>
        <tbody>{source.files.map((file) => <tr key={file._id}>
          <td><div className="strong">{file.fileName}</div><div className="muted small">{file.sourceRowCount ? `${file.sourceRowCount} source row(s)` : ''}{file.excludedRowCount ? ` · ${file.excludedRowCount} excluded` : ''}</div></td>
          <td>{file.validationStatus === 'VALID' && file.status === 'ACTIVE' ? <><Badge tone="ok">Valid</Badge>{file.warnings?.map((warning) => <div key={warning} className="small" style={{ color: 'var(--warn)' }}>{warning}</div>)}</> : file.status === 'REPLACED' ? <Badge>Removed</Badge> : <><Badge tone="bad">Invalid</Badge><div className="small" style={{ color: 'var(--bad)' }}>{file.processingErrors?.join(' ')}</div></>}</td>
          <td className="num">{file.rowCount}</td>
          <td>{file.weeksDetected?.map((week) => date(week, 'md')).join(', ') || '—'}</td>
          <td className="small">{dateTime(file.uploadedAt)}<div className="muted">{file.uploadedBy?.name}</div></td>
          <td className="num">{['ACTIVE', 'INVALID'].includes(file.status) && <button className="btn btn-ghost btn-sm" disabled={Boolean(removing)} onClick={() => remove(file)}>{removing === file._id ? 'Removing...' : file.validationStatus === 'INVALID' ? 'Clear' : 'Remove'}</button>}</td>
        </tr>)}</tbody>
      </table></div>}
    </Card>
  );
}

function DivisionSourceUploadCard({ dataset, summary, division, onChanged }) {
  const input = useRef();
  const replacementInput = useRef();
  const replacementTarget = useRef('');
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState(null);
  const files = dataset.files || [];
  const selectedDivision = summary?.division || division;

  const upload = async (selectedFiles, supersedesId = '') => {
    if (!selectedFiles?.length) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    if (summary?.cycle?._id) form.append('cycleId', summary.cycle._id);
    else form.append('divisionId', selectedDivision._id);
    form.append('datasetType', dataset.id);
    if (supersedesId) form.append('supersedesId', supersedesId);
    [...selectedFiles].forEach((file) => form.append('files', file));
    try {
      const result = await api.post('/division-source-imports', form);
      const duplicates = result.files.filter((file) => file.duplicate);
      if (duplicates.length) toast(`${duplicates.map((file) => file.fileName).join(', ')} is already active; no duplicate was created.`);
      else if (supersedesId) toast('Replacement validated and activated');
      onChanged(result.files, result.cycleId);
    } catch (e) { setError(e); }
    setBusy(false);
    if (input.current) input.current.value = '';
    if (replacementInput.current) replacementInput.current.value = '';
    replacementTarget.current = '';
  };

  const remove = async (file) => {
    if (!window.confirm(`${file.validationStatus === 'INVALID' ? 'Clear' : 'Remove'} “${file.fileName}”?`)) return;
    setRemoving(file._id);
    setError(null);
    try {
      await api.del(`/division-source-imports/${file._id}`);
      toast(file.validationStatus === 'INVALID' ? 'Failed upload cleared' : `${dataset.title} file removed`);
      onChanged();
    } catch (e) { setError(e); }
    setRemoving(null);
  };

  const status = dataset.required
    ? dataset.ready ? <Badge tone="ok" dot>Ready</Badge>
      : <Badge tone="bad" dot>{dataset.loaded ? 'Incomplete' : 'Missing'}</Badge>
    : dataset.loaded ? <Badge tone="ok" dot>Loaded</Badge> : <Badge>Only when applicable</Badge>;
  const expectedWeeks = dataset.expectedWeeks || [];
  const loadedWeeks = dataset.weeksDetected || [];

  return <Card title={dataset.title} hint={dataset.hint} body={false} actions={status}>
    <div className="card-body stack">
      <div className="upload-drop">
        <input ref={input} type="file" accept={(dataset.accept || []).join(',')} multiple={dataset.multiple !== false} hidden onChange={(event) => upload(event.target.files)} />
        <input ref={replacementInput} type="file" accept={(dataset.accept || []).join(',')} hidden onChange={(event) => upload(event.target.files, replacementTarget.current)} />
        <button className="btn btn-primary" disabled={busy || Boolean(removing)} onClick={() => input.current.click()}>{busy ? 'Validating…' : `Upload ${dataset.title}`}</button>
        <div className="muted small" style={{ marginTop: 8 }}>{(dataset.accept || []).join(', ')} · {dataset.multiple === false ? 'one file' : 'multiple files allowed'}{!summary?.cycle && ' · source dates identify the VDP period'}</div>
      </div>
      {expectedWeeks.length > 0 && ['BOTH_WEEKS', 'CYCLE_OVERLAP'].includes(dataset.coverage) && <div className="actions">{expectedWeeks.map((week) => <Badge key={week} tone={loadedWeeks.includes(week) ? 'ok' : 'bad'}>{date(week, 'md')} {loadedWeeks.includes(week) ? 'loaded' : 'missing'}</Badge>)}</div>}
      {dataset.coverage === 'EVERY_DAY' && dataset.expectedDates?.length > 0 && <Alert tone={dataset.missingDates?.length ? 'warn' : 'ok'}>{dataset.missingDates?.length ? `${dataset.missingDates.length} date(s) still missing: ${dataset.missingDates.map((item) => date(item, 'md')).join(', ')}` : `All ${dataset.expectedDates.length} period dates are covered.`}</Alert>}
      <ErrorAlert error={error} />
    </div>
    {files.length > 0 && <div className="table-wrap" style={{ borderTop: '1px solid var(--border)' }}><table className="table-compact">
      <thead><tr><th>File</th><th>Status</th><th className="num">Rows</th><th>Dates</th><th>Uploaded</th><th /></tr></thead>
      <tbody>{files.map((file) => <tr key={file._id}>
        <td><div className="strong">{file.fileName}</div>{file.sheetName && <div className="muted small">Sheet: {file.sheetName}</div>}</td>
        <td>{file.validationStatus === 'VALID' && file.status === 'ACTIVE' ? <Badge tone="ok">Valid</Badge> : file.status === 'REPLACED' ? <Badge>Removed</Badge> : <><Badge tone="bad">Rejected</Badge><div className="small" style={{ color: 'var(--bad)' }}>{file.processingErrors?.join(' ')}</div></>}</td>
        <td className="num">{file.rowCount}</td>
        <td className="small">{file.dataRange?.from ? `${date(file.dataRange.from, 'md')} – ${date(file.dataRange.to, 'md')}` : '—'}</td>
        <td className="small">{dateTime(file.uploadedAt)}<div className="muted">{file.uploadedBy?.name}</div></td>
        <td className="num"><div className="actions" style={{ justifyContent: 'flex-end' }}>
          {file.status === 'ACTIVE' && <button className="btn btn-sm" disabled={busy || Boolean(removing)} onClick={() => { replacementTarget.current = file._id; replacementInput.current?.click(); }}>Replace</button>}
          {['ACTIVE', 'INVALID'].includes(file.status) && <button className="btn btn-ghost btn-sm" disabled={Boolean(removing)} onClick={() => remove(file)}>{removing === file._id ? 'Removing…' : file.validationStatus === 'INVALID' ? 'Clear' : 'Remove'}</button>}
        </div></td>
      </tr>)}</tbody>
    </table></div>}
  </Card>;
}

function Division3DriverRow({ match, providers, processingDivisions, cycleId, onChanged }) {
  const [providerId, setProviderId] = useState(match.suggestedProviderId || '');
  const [operatorId, setOperatorId] = useState(match.suggestedOperatorId || '');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(null);
  const targetDivisionNumber = match.service === 'GOLINK' ? '3GL' : '3';
  const targetDivisionIds = new Set((processingDivisions || []).filter((division) => String(division.divisionNumber).trim().toUpperCase() === targetDivisionNumber).map((division) => division._id));
  const eligibleProviders = targetDivisionIds.size ? providers.filter((item) => targetDivisionIds.has(item.divisionId?._id || item.divisionId)) : providers;
  const provider = eligibleProviders.find((item) => item._id === providerId);
  const operators = (provider?.operators || []).filter((operator) => operator.status === 'ACTIVE' && !operator.transferredTo);
  const assign = async () => {
    setBusy('match');
    setError(null);
    try {
      await api.post('/division3-driver-matches', { cycleId, sourceName: match.sourceName, service: match.service, providerId, operatorId });
      await onChanged();
    } catch (e) { setError(e); }
    setBusy('');
  };
  const setAside = async () => {
    const reason = window.prompt(`Why is ${match.sourceName} (${match.service}) being set aside for this VDP cycle?`);
    if (!reason?.trim()) return;
    setBusy('aside');
    setError(null);
    try {
      await api.post('/division3-driver-exclusions', { cycleId, sourceName: match.sourceName, service: match.service, reason: reason.trim() });
      await onChanged();
    } catch (e) { setError(e); }
    setBusy('');
  };
  const restore = async () => {
    setBusy('restore');
    setError(null);
    try {
      await api.post('/division3-driver-exclusions/restore', { cycleId, sourceName: match.sourceName, service: match.service });
      await onChanged();
    } catch (e) { setError(e); }
    setBusy('');
  };
  const clearMatch = async () => {
    if (!window.confirm(`Clear the manual match for ${match.sourceName} (${match.service})? The operator will become available to the correct source driver.`)) return;
    setBusy('clear');
    setError(null);
    try {
      await api.post('/division3-driver-matches/clear', { cycleId, sourceName: match.sourceName, service: match.service });
      await onChanged();
    } catch (e) { setError(e); }
    setBusy('');
  };
  const needsReview = ['UNMATCHED', 'AMBIGUOUS', 'SUGGESTED'].includes(match.status);
  return <tr>
    <td><div className="strong">{match.sourceName}</div><div className="muted small">{match.services?.join(' + ') || 'ADA fare'} · {match.dates?.length || 0} service day(s)</div></td>
    <td>{match.status === 'MATCHED'
      ? <><Badge tone="ok">{match.matchMethod?.startsWith('AUTO_') ? 'Auto-matched' : 'Matched'}</Badge> {match.providerName} | {match.operatorName}</>
      : match.status === 'SET_ASIDE'
        ? <><Badge tone="info">Set aside</Badge><span className="muted small"> Excluded from this VDP cycle{match.setAsideBy?.name ? ` by ${match.setAsideBy.name}` : ''}.</span></>
      : match.status === 'SUGGESTED'
        ? <><Badge tone="warn">Suggested</Badge> {match.suggestedProviderName} | {match.suggestedOperatorName}</>
        : <Badge tone="bad">Needs review</Badge>}</td>
    <td className="num">{needsReview && <div className="actions" style={{ justifyContent: 'flex-end' }}>
      <select aria-label={`Provider for ${match.sourceName}`} value={providerId} onChange={(event) => { setProviderId(event.target.value); setOperatorId(''); }}><option value="">Choose provider...</option>{eligibleProviders.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
      <select aria-label={`Operator for ${match.sourceName}`} value={operatorId} onChange={(event) => setOperatorId(event.target.value)} disabled={!providerId}><option value="">Choose operator...</option>{operators.map((operator) => <option key={operator.id || operator._id} value={operator.id || operator._id}>{operator.name}</option>)}</select>
      <button className="btn btn-sm btn-primary" disabled={Boolean(busy) || !providerId || !operatorId} onClick={assign}>{busy === 'match' ? 'Saving...' : 'Match'}</button>
      <button className="btn btn-sm" disabled={Boolean(busy)} onClick={setAside}>{busy === 'aside' ? 'Setting aside...' : 'Set aside'}</button>
    </div>}
    {match.status === 'SET_ASIDE' && <button className="btn btn-sm" disabled={Boolean(busy)} onClick={restore}>{busy === 'restore' ? 'Restoring...' : 'Restore'}</button>}
    {match.status === 'MATCHED' && match.matchMethod === 'MANUAL' && <button className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={clearMatch}>{busy === 'clear' ? 'Clearing...' : 'Clear match'}</button>}
    {error && <div className="small" style={{ color: 'var(--bad)' }}>{error.message}</div>}</td>
  </tr>;
}

function Division3MatchingCard({ summary, onChanged }) {
  const [showAll, setShowAll] = useState(false);
  const providerDivisionIds = (summary.processingDivisions || [summary.division]).map((item) => item._id).join(',');
  const providers = useLoad(() => api.get('/providers', processingDivisionQuery(summary, summary.division)), [providerDivisionIds]);
  const matches = summary.division3Data?.driverMatches || [];
  const unresolved = matches.filter((match) => ['UNMATCHED', 'AMBIGUOUS', 'SUGGESTED'].includes(match.status));
  const setAsideCount = matches.filter((match) => match.status === 'SET_ASIDE').length;
  const visible = showAll ? matches : unresolved;
  return <Card title="ADA / GoLink driver matching" body={false}
    hint="Matches each source service to its Compass division. Missing or ambiguous operators can be set aside for this cycle and excluded while everyone else is processed."
    actions={<><Badge tone={summary.division3Data?.unresolvedCount ? 'bad' : 'ok'} dot>{summary.division3Data?.unresolvedCount ? `${summary.division3Data.unresolvedCount} need review` : 'Ready'}</Badge>{setAsideCount > 0 && <Badge tone="info">{setAsideCount} set aside</Badge>}<button className="btn btn-sm" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show only issues' : `Show all ${matches.length} service matches`}</button></>}>
    {visible.length ? <div className="table-wrap"><table className="table-compact"><thead><tr><th>Source driver</th><th>Provider / operator</th><th /></tr></thead><tbody>{visible.map((match) => <Division3DriverRow key={match.sourceKey} match={match} providers={providers.data || []} processingDivisions={summary.processingDivisions || [summary.division]} cycleId={summary.cycle._id} onChanged={onChanged} />)}</tbody></table></div>
      : <div className="card-body muted small">{matches.length ? 'No driver matches need review. Use “Show all” to restore set-aside drivers or clear a manual match.' : 'No Division 3 drivers have been loaded yet.'}</div>}
  </Card>;
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
    <Card title="Routes → providers" body={false}
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

const PIPELINE_STEPS = [
  'Division',
  'Required data',
  'Additional data',
  'Validation',
  'Results',
];

function PipelineNav({ step, enabled, onSelect }) {
  return (
    <div className="processing-pipeline" aria-label="VDP processing steps">
      {PIPELINE_STEPS.map((label, index) => {
        const number = index + 1;
        const available = enabled[index] || number === step;
        return (
          <button key={label} type="button" className={`${number === step ? 'active' : ''} ${number < step ? 'done' : ''}`} disabled={!available} onClick={() => available && onSelect(number)}>
            <span className="processing-step-number">{number < step ? '✓' : number}</span>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function Processing() {
  const sel = useDivisionCycle();
  const processingGroupsLoad = useLoad(() => api.get('/settings/processing-groups'), []);
  const processingGroups = processingGroupsLoad.data || [];
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [step, setStep] = useState(1);
  const [cycleId, setCycleId] = useState(() => params.get('cycleId') || '');
  const [runId, setRunId] = useState(() => params.get('runId') || '');
  const [processing, setProcessing] = useState(false);
  const [processError, setProcessError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedDivisionIds, setSelectedDivisionIds] = useState([]);
  const [startFresh, setStartFresh] = useState(false);
  const processingGroupFor = (division) => processingGroups.find((group) => group.divisionIds.includes(division?._id));
  const divisionsForSelection = (division) => {
    const group = processingGroupFor(division);
    if (!group) return division ? [division] : [];
    const byId = new Map(sel.divisions.map((item) => [item._id, item]));
    return group.divisionIds.map((id) => byId.get(id)).filter(Boolean);
  };
  const groupedDivisionIds = new Set(processingGroups.flatMap((group) => group.divisionIds));
  const divisionById = new Map(sel.divisions.map((division) => [division._id, division]));
  const processingOptions = [
    ...processingGroups.map((group) => ({
      key: `group:${group._id}`,
      name: group.name,
      group,
      divisions: group.divisionIds.map((id) => divisionById.get(id)).filter(Boolean),
    })).filter((option) => option.divisions.length >= 2),
    ...sel.divisions.filter((division) => !groupedDivisionIds.has(division._id)).map((division) => ({
      key: `division:${division._id}`,
      name: `DIV ${division.divisionNumber} – ${division.name}`,
      group: null,
      divisions: [division],
    })),
  ];
  const selectedDivisions = sel.divisions.filter((division) => selectedDivisionIds.includes(division._id));
  const selectedGroup = selectedDivisions.length ? processingGroupFor(selectedDivisions[0]) : null;
  const selectedDivision = selectedGroup
    ? selectedDivisions.find((division) => division._id === selectedGroup.divisionIds[0]) || selectedDivisions[0]
    : selectedDivisions[0];
  const selectedOptionKey = selectedGroup ? `group:${selectedGroup._id}` : selectedDivision ? `division:${selectedDivision._id}` : '';
  const { data: summary, loading, error, reload } = useLoad(
    () => (cycleId ? api.get(`/cycles/${cycleId}`) : Promise.resolve(null)),
    [cycleId, refreshKey],
  );
  const sourceContractLoad = useLoad(
    () => (selectedDivision?._id ? api.get(`/division-source-contracts/${selectedDivision._id}`) : Promise.resolve(null)),
    [selectedDivision?._id],
  );
  const refresh = () => { setRefreshKey((key) => key + 1); };

  useEffect(() => {
    if (!sel.divisions.length) return;
    setSelectedDivisionIds((current) => {
      const picked = sel.divisions.find((division) => division._id === sel.divisionId);
      if (!picked) return [];
      const desired = divisionsForSelection(picked).map((division) => division._id);
      return desired.length === current.length && desired.every((id) => current.includes(id)) ? current : desired;
    });
    // The saved group membership is the source of truth for linked selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel.divisions, sel.divisionId, processingGroups.map((group) => `${group._id}:${group.divisionIds.join(',')}`).join('|')]);

  const selectProcessingOption = (option) => {
    const ids = option.divisions.map((division) => division._id);
    const primaryId = option.group?.divisionIds?.[0] || ids[0] || '';
    setSelectedDivisionIds(ids);
    setStartFresh(false);
    sel.setDivisionId(primaryId);
    setRunId('');
    setParams((current) => { current.set('divisionId', primaryId); current.delete('cycleId'); current.delete('runId'); return current; });
  };

  useEffect(() => {
    const linkedDivisionId = params.get('divisionId');
    if (linkedDivisionId && sel.divisions.some((division) => division._id === linkedDivisionId) && sel.divisionId !== linkedDivisionId) {
      sel.setDivisionId(linkedDivisionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel.divisions.length]);

  useEffect(() => {
    const linkedCycleId = params.get('cycleId') || '';
    if (linkedCycleId) setCycleId(linkedCycleId);
    else setCycleId('');
    setStep(1);
    setStartFresh(false);
    setProcessError(null);
  }, [sel.divisionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (startFresh || cycleId || sel.cyclesLoading || !selectedDivision || !sel.cycles.length) return;
    const resumableStatuses = new Set(['PROCESSING', 'READY_FOR_REVIEW']);
    const remembered = sel.cycles.find((cycle) => cycle._id === sel.cycleId && resumableStatuses.has(cycle.status));
    const resumable = remembered || sel.cycles.find((cycle) => resumableStatuses.has(cycle.status));
    if (!resumable) return;
    setCycleId(resumable._id);
    sel.setCycleId(resumable._id);
    setStep(2);
    // Resume only cycles whose status proves that data was already staged or
    // processed. OPEN/UPCOMING cycles still use source dates for detection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startFresh, cycleId, sel.cyclesLoading, sel.cycleId, sel.cycles, selectedDivision?._id]);

  const detectedCycle = (detectedId, message) => {
    const id = String(detectedId?._id || detectedId || '');
    if (!id) return;
    setStartFresh(false);
    setCycleId(id);
    sel.setCycleId(id);
    api.post('/processing-runs', { cycleId: id }).then((run) => {
      setRunId(run._id);
      setParams((current) => { current.set('divisionId', selectedDivision?._id || ''); current.set('cycleId', id); current.set('runId', run._id); return current; }, { replace: true });
    }).catch(setProcessError);
    refresh();
    if (message) toast(message);
  };

  const uberChanged = (files, detectedId) => {
    if (detectedId) detectedCycle(detectedId, 'Uber data validated. VDP period identified from its dates.');
    else refresh();
    if (files && !detectedId) toast(`${files.filter((file) => file.validationStatus === 'VALID').length} Uber file(s) validated`);
  };
  const division3Changed = (files, detectedId) => {
    if (detectedId) detectedCycle(detectedId, 'DIV 3 data validated. VDP period identified from its dates.');
    else refresh();
    if (files && !detectedId) toast(`${files.filter((file) => file.validationStatus === 'VALID').length} DIV 3 file(s) validated`);
  };
  const divisionSourceChanged = (files, detectedId) => {
    const validCount = files?.filter((file) => file.validationStatus === 'VALID').length || 0;
    if (detectedId && !cycleId) detectedCycle(detectedId, `${validCount} source file(s) validated. VDP period identified from the source dates.`);
    else {
      refresh();
      if (files) toast(`${validCount} source file(s) validated`);
    }
  };

  const process = async () => {
    setProcessing(true);
    setProcessError(null);
    try {
      const run = runId ? { _id: runId } : await api.post('/processing-runs', { cycleId });
      if (!runId) setRunId(run._id);
      const response = await api.post(`/processing-runs/${run._id}/process`);
      const result = response.lastResult || {};
      toast(`${result.processed || 0} VDP(s) calculated · ${result.ready || 0} ready · ${result.needsReview || 0} need review${result.intakeExceptions ? ` · ${result.intakeExceptions} unmatched source record(s) set aside from clean providers` : ''}`);
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
  const uberTolls = summary?.uberTolls;
  const division3Data = summary?.division3Data;
  const divisionSources = summary?.divisionSources;
  const requirements = summary?.inputRequirements;
  const division2 = String(selectedDivision?.divisionNumber || '').trim() === '2';
  const division12 = String(selectedDivision?.divisionNumber || '').trim() === '12';
  const division3 = selectedDivisions.some(isDivision3Division);
  const sourceDatasets = (divisionSources ? Object.values(divisionSources.datasets || {}) : (sourceContractLoad.data?.datasets || []))
    .filter((dataset) => dataset.applicable !== false);
  const requiredSourceDatasets = sourceDatasets.filter((dataset) => dataset.stage === 'REQUIRED');
  const additionalSourceDatasets = sourceDatasets.filter((dataset) => dataset.stage === 'ADDITIONAL');
  const genericSourcesConfigured = Boolean(divisionSources?.configured || sourceContractLoad.data?.configured);
  const sourceRoutesRequired = Boolean(divisionSources?.processingSupported && requirements?.standardProviderCount > 0);
  const requiredDataLoaded = Boolean(summary) && (division3
    ? division3Data?.sources?.DIV3_ADA?.ready && division3Data?.sources?.DIV3_GOLINK?.ready
    : (requirements.divisionSourcesRequired ? divisionSources?.requiredReady : (division2 || division12))
      && (!requirements.uberRequired || (uber?.loaded && (uber?.ready ?? true))));
  const additionalDataReady = Boolean(summary) && (division3
    ? division3Data?.sources?.DIV3_ADA_FARE?.ready && (!requirements.tollsRequired || uberTolls?.ready)
    : (!requirements.divisionSourcesRequired || divisionSources?.additionalReady) && (!requirements.tollsRequired || uberTolls?.ready));
  const standardReady = Boolean(summary) && (!(requirements.standardPerformanceRequired || sourceRoutesRequired) || perf?.loaded);
  const uberReady = Boolean(summary) && (uber?.loaded
    ? (uber?.ready ?? true)
    : !requirements.uberRequired);
  const division3Ready = !division3 || summary?.providersExpected === 0 || division3Data?.requiredReady;
  const sourceProcessingReady = !requirements?.divisionSourcesRequired || divisionSources?.processingSupported;
  const canProcess = requiredDataLoaded && standardReady && uberReady && additionalDataReady && division3Ready && sourceProcessingReady;
  const processed = Boolean(v?.calculated);
  const enabledSteps = [true, selectedDivisionIds.length > 0, requiredDataLoaded, requiredDataLoaded && additionalDataReady, processed];

  useEffect(() => {
    if (!cycleId || runId) return;
    api.post('/processing-runs', { cycleId }).then((run) => {
      setRunId(run._id);
      setParams((current) => { current.set('cycleId', cycleId); current.set('runId', run._id); return current; }, { replace: true });
    }).catch(setProcessError);
  }, [cycleId, runId, setParams]);

  useEffect(() => {
    const summaryDivisionId = summary?.division?._id;
    if (summaryDivisionId && summaryDivisionId !== sel.divisionId) sel.setDivisionId(summaryDivisionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary?.division?._id]);

  useEffect(() => {
    setStep(processed ? 5 : requiredDataLoaded && additionalDataReady ? 4 : requiredDataLoaded ? 3 : selectedDivisionIds.length ? 2 : 1);
  }, [processed, requiredDataLoaded, additionalDataReady, selectedDivisionIds.length]);

  const summaryDivisions = summary?.processingDivisions?.length ? summary.processingDivisions : summary?.division ? [summary.division] : [];
  const summaryDivisionLabel = summaryDivisions.map((division) => `DIV ${division.divisionNumber} – ${division.name}`).join(' + ');

  const pageSub = summary
    ? <>{summaryDivisionLabel} · {cycleLabel(summary.cycle)} · payment {date(summary.cycle.paymentDate)} <StatusBadge status={summary.cycle.status} map={CYCLE_STATUS} /></>
    : selectedDivision ? 'Upload the first core dataset and its dates will identify the VDP pay period.' : 'Start by selecting a division or saved processing group.';

  return (
    <div className="page">
      <PageHead title="VDP Processing" sub={pageSub}
        actions={summary && v.total > 0 && <>
          <button className="btn" onClick={() => downloadFile(`/exports/cycles/${summary.cycle._id}.pdf`).catch((e) => toast(e.message, 'bad'))}>Payment register (PDF)</button>
          <button className="btn" onClick={() => downloadFile(`/exports/cycles/${summary.cycle._id}.xlsx`).catch((e) => toast(e.message, 'bad'))}>Export to Excel</button>
        </>} />
      <PipelineNav step={step} enabled={enabledSteps} onSelect={(number) => document.getElementById(`processing-section-${number}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
      <ErrorAlert error={error} />

      <section id="processing-section-1" className="processing-section">
        <Card title="1. Division" hint="Division linkage is managed in Configuration. Grouped divisions appear here as one VDP program.">
          {sel.loading ? <Loading /> : <div className="stack">
            <ErrorAlert error={processingGroupsLoad.error} />
            <Field label="VDP program" htmlFor="processing-program">
              <select id="processing-program" value={selectedOptionKey} onChange={(event) => {
                const option = processingOptions.find((item) => item.key === event.target.value);
                if (option) selectProcessingOption(option);
                else { setSelectedDivisionIds([]); sel.setDivisionId(''); }
              }}>
                <option value="">Choose a division or processing group…</option>
                {processingOptions.map((option) => <option key={option.key} value={option.key}>
                  {option.name}{option.group ? ` (${option.divisions.map((division) => `DIV ${division.divisionNumber}`).join(' + ')})` : ''}
                </option>)}
              </select>
            </Field>
            {selectedGroup && <Alert tone="info"><strong>{selectedGroup.name}:</strong> {division3 ? 'DIV 3 supplies the ADA roster and DIV 3GL supplies the GoLink roster. Uber weekly data is optional.' : 'These Compass divisions will share one VDP processing run while retaining their own rosters and plans.'}</Alert>}
            {selectedDivisions.length > 0 && <div className="explain"><strong>{selectedDivisions.map((division) => `DIV ${division.divisionNumber}`).join(' + ')}</strong><div className="muted small">{selectedDivisions.reduce((total, division) => total + Number(division.activeProviders || 0), 0)} active provider(s) · {selectedDivisions.reduce((total, division) => total + Number(division.activePlans || 0), 0)} active VDP plan(s)</div></div>}
            {sel.cyclesLoading && <Loading text="Checking generated VDP periods…" />}
            {!sel.cyclesLoading && !sel.cycles.length && selectedDivision && <Alert tone="info" action={<Link className="btn btn-sm" to="/cycles">Go to Cycles</Link>}>This division has no generated VDP periods. Generate periods before uploading data.</Alert>}
          </div>}
        </Card>
      </section>

      {selectedDivision && (
        <section id="processing-section-2" className="processing-section stack">
          <h2>2. Required data</h2>
          {!summary && <Alert tone="info">Upload the first core dataset for DIV {selectedDivision.divisionNumber}. Its source dates will select the matching generated VDP period automatically. After that, this step will show the exact remaining requirements for that period.</Alert>}
          {loading && cycleId ? <Loading text="Loading identified VDP period…" /> : !summary ? <>
            {division3 && <>
              <Division3UploadCard kind="DIV3_ADA" division={selectedDivision} onChanged={division3Changed} />
              <Division3UploadCard kind="DIV3_GOLINK" division={selectedDivision} onChanged={division3Changed} />
            </>}
            {(division2 || division12) && <UberUploadCard division={selectedDivision} onChanged={uberChanged} showMatching={false} />}
            {!division2 && !division3 && !division12 && sourceContractLoad.loading && <Loading text="Loading this division's source-file contract…" />}
            {!division2 && !division3 && !division12 && sourceContractLoad.error && <ErrorAlert error={sourceContractLoad.error} />}
            {!division2 && !division3 && !division12 && requiredSourceDatasets.filter((dataset) => dataset.cycleLocator).map((dataset) => <DivisionSourceUploadCard key={dataset.id} dataset={dataset} division={selectedDivision} onChanged={divisionSourceChanged} />)}
            {!division2 && !division3 && !division12 && !sourceContractLoad.loading && !genericSourcesConfigured && <Alert tone="warn"><strong>No upload contract is configured for DIV {selectedDivision.divisionNumber}.</strong> No unrestricted uploader is available. Add representative raw source files before enabling this division.</Alert>}
          </> : <>
            <Alert tone="ok"><strong>VDP period identified:</strong> {cycleLabel(summary.cycle)} · payment {date(summary.cycle.paymentDate)}.</Alert>
            {divisionSources?.targetWorkbooks?.length > 0 && <Alert tone="info">Upload requirements were traced backward from <strong>{divisionSources.targetWorkbooks.join(' and ')}</strong> and verified against the available source-file samples.</Alert>}
            {division3 ? <>
              <Division3UploadCard kind="DIV3_ADA" summary={summary} division={selectedDivision} onChanged={division3Changed} />
              <Division3UploadCard kind="DIV3_GOLINK" summary={summary} division={selectedDivision} onChanged={division3Changed} />
            </> : requiredSourceDatasets.map((dataset) => <DivisionSourceUploadCard key={dataset.id} dataset={dataset} summary={summary} division={selectedDivision} onChanged={divisionSourceChanged} />)}
            {(requirements.uberRequired || division3) && <UberUploadCard summary={summary} division={selectedDivision} onChanged={uberChanged} showMatching={false} />}
            {!division3 && !requirements.divisionSourcesRequired && !requirements.uberRequired && <Alert tone="warn"><strong>No source-file contract is configured for this division.</strong> Processing remains disabled until representative raw files define the accepted schemas.</Alert>}
          </>}
        </section>
      )}

      {summary && (
        <section id="processing-section-3" className="processing-section stack">
          <h2>3. Additional data</h2>
          {division3 ? <>
            <Division3UploadCard kind="DIV3_ADA_FARE" summary={summary} division={selectedDivision} onChanged={division3Changed} />
            <Division3UploadCard kind="DIV3_RETURNED_FARE" summary={summary} division={selectedDivision} onChanged={division3Changed} />
            {requirements.tollsAvailable && <UberTollUploadCard summary={summary} onChanged={reload} />}
            <Alert tone="info">Returned fare reconciliation does not block this step. Missing collection detail stays visible as an NSM-pending review item and must be completed before final Accounting approval.</Alert>
          </> : <>
            {additionalSourceDatasets.map((dataset) => <DivisionSourceUploadCard key={dataset.id} dataset={dataset} summary={summary} division={selectedDivision} onChanged={divisionSourceChanged} />)}
            {requirements.tollsAvailable && <UberTollUploadCard summary={summary} onChanged={reload} />}
            {!additionalSourceDatasets.length && !requirements.tollsRequired && <Card title="Additional datasets" hint="Supplemental inputs for this division and pay period.">
              <Empty title="No additional datasets configured for this division">Nothing additional is required for this division's current flow.</Empty>
            </Card>}
          </>}
        </section>
      )}

      {summary && (
        <section id="processing-section-4" className="processing-section stack">
          <h2>4. Validation & processing</h2>
          <div className="grid grid-3">
            <Stat label="Providers expected" value={summary.providersExpected} note="Active providers in division" />
            <Stat label="Required datasets" value={requiredDataLoaded && additionalDataReady ? 'Uploaded' : 'Missing'} tone={requiredDataLoaded && additionalDataReady ? 'ok' : 'bad'} note={division3 ? 'ADA · GoLink · ADA fare (Uber optional)' : requirements.divisionSourcesRequired ? `${sourceDatasets.filter((dataset) => dataset.required).length} division-specific dataset(s)` : `${requirements.uberProviderCount} Uber provider(s)`} />
            <Stat label="Validation" value={canProcess ? 'Ready' : requirements.divisionSourcesRequired && divisionSources?.ready ? 'Files validated' : 'Needs attention'} tone={canProcess || (requirements.divisionSourcesRequired && divisionSources?.ready) ? 'ok' : 'bad'} note={division3 ? `${division3Data?.unresolvedCount || 0} ADA/GoLink driver · ${uber?.unresolvedCount || 0} Uber driver issue(s)` : requirements.divisionSourcesRequired ? 'Every upload was checked against its exact source schema' : `${uber?.unresolvedCount || 0} driver · ${uberTolls?.missingWeeks?.length || 0} toll week issue(s)`} />
          </div>
          {division3 ? <Division3MatchingCard summary={summary} onChanged={reload} /> : (requirements.standardPerformanceRequired || sourceRoutesRequired) && perf?.loaded && <RoutesCard summary={summary} onChanged={reload} />}
          {(requirements.uberRequired || uber.loaded) && <UberUploadCard summary={summary} division={selectedDivision} onChanged={uberChanged} showUpload={false} />}
          {division3 && <Card title="ADA fare reconciliation" hint="Template-equivalent daily fare checks and cash deduction totals.">
            <div className="grid grid-4">
              <Stat label="Driver/day fares" value={division3Data?.fareReconciliation?.rowCount || 0} />
              <Stat label="Pending NSM" value={division3Data?.fareReconciliation?.pendingCount || 0} tone={division3Data?.fareReconciliation?.pendingCount ? 'bad' : 'ok'} />
              <Stat label="Fare mismatches" value={division3Data?.fareReconciliation?.mismatchCount || 0} tone={division3Data?.fareReconciliation?.mismatchCount ? 'bad' : 'ok'} />
              <Stat label="Cash deduction" value={money(division3Data?.fareReconciliation?.cashToDeduct || 0)} />
            </div>
          </Card>}
          <Card title="Process VDPs" hint="Calculates every active provider’s VDP from the validated datasets, plan, and provider profile. Approved VDPs are never changed."
            actions={<button className="btn btn-primary" disabled={!canProcess || processing} onClick={process}>{processing ? 'Processing…' : 'Process ready providers'}</button>}>
            {requirements.standardPerformanceRequired && !perf.loaded && <Alert tone="warn">Upload the required Performance Report first.</Alert>}
            {requirements.standardPerformanceRequired && perf.loaded && perf.unresolvedCount > 0 && <Alert tone="warn">Resolve the routes that need review above before processing.</Alert>}
            {sourceRoutesRequired && perf.loaded && perf.unresolvedCount > 0 && <Alert tone="warn">Resolve the normalized DIV {selectedDivision.divisionNumber} routes that need review above before processing.</Alert>}
            {requirements.divisionSourcesRequired && divisionSources?.ready && !divisionSources.processingSupported && <Alert tone="info"><strong>The exact source files are validated and safely staged.</strong> {divisionSources.processingBlockReason || `Calculation remains disabled for DIV ${selectedDivision.divisionNumber} until its source-to-VDP calculation adapter is verified against the reference template.`}</Alert>}
            {!division3 && !requirements.divisionSourcesRequired && !requirements.uberRequired && <Alert tone="warn">This division has no verified source-file contract, so processing is disabled.</Alert>}
            {requirements.uberRequired && !uber.loaded && <Alert tone="warn">Upload valid Uber weekly data first.</Alert>}
            {uber.loaded && uber.unresolvedCount > 0 && <Alert tone="warn">Match the Uber drivers that need review above before processing.</Alert>}
            {division3 && division3Data?.unresolvedCount > 0 && summary.providersExpected > 0 && <Alert tone="warn">Match the ADA and GoLink drivers that need review above before processing.</Alert>}
            {division3 && division3Data?.fareReconciliation?.pendingCount > 0 && <Alert tone="warn">{division3Data.fareReconciliation.pendingCount} ADA fare driver/day row(s) are pending NSM collection details. They are accepted for processing but will keep affected VDPs in review.</Alert>}
            {division3 && summary.providersExpected === 0 && <Alert tone="info">DIV 3 files are validated and staged. Add the Compass DIV 3 provider roster before calculating provider VDPs.</Alert>}
            {requirements.tollsRequired && !uberTolls?.ready && <Alert tone="warn">Upload a valid Uber toll reimbursement file for both weeks first.</Alert>}
            {v.stale > 0 && <Alert tone="warn">{v.stale} VDP(s) have changed inputs since they were calculated. Re-process to update them.</Alert>}
            {processError && <ErrorAlert error={processError} />}
            {canProcess && !v.stale && !processError && <p className="muted small">{v.total ? `${v.total} VDPs: ${v.NEEDS_REVIEW} need review and ${v.READY} are ready.` : 'Validation passed. Ready to process.'}</p>}
          </Card>
        </section>
      )}

      {summary && processed && (
        <section id="processing-section-5" className="processing-section stack">
          <h2>5. Results</h2>
          <div className="grid grid-4">
            <Stat label="Providers expected" value={summary.providersExpected} />
            <Stat label="Calculated" value={v.calculated} tone={v.calculated ? 'ok' : undefined} />
            <Stat label="Needs review" value={v.NEEDS_REVIEW} tone={v.NEEDS_REVIEW ? 'bad' : undefined} />
            <Stat label="Approved" value={`${v.APPROVED + v.DISPUTED + v.PROCESSED + v.PAID} / ${v.total || summary.providersExpected}`} note={`${v.APPROVED} awaiting provider · ${v.DISPUTED} issues · ${v.PROCESSED} to pay`} />
          </div>
          <Card title="Provider results" hint="Review, approve, processed, paid, and historical statements all live in VDPs."
            actions={<Link className="btn btn-primary" to={`/vdps?cycleId=${summary.cycle._id}${v.NEEDS_REVIEW ? '&status=NEEDS_REVIEW' : ''}`}>{v.NEEDS_REVIEW ? `Review ${v.NEEDS_REVIEW} exception(s)` : 'Open VDP queue'}</Link>}>
            <p><strong>{v.READY}</strong> clean VDP(s) ready for bulk approval · <strong>{v.NEEDS_REVIEW}</strong> exception(s) · <strong>{v.PROCESSED + v.PAID}</strong> processed/paid.</p>
          </Card>
          {v.calculated > 0 && <div className="grid grid-3">
            <Stat label="Gross VDP" value={money(summary.totals.gross)} />
            <Stat label="Total deductions" value={money(summary.totals.deductions)} note={`Additions ${money(summary.totals.additions)}`} />
            <Stat label="Net VDP" value={money(summary.totals.net)} tone="ok" />
          </div>}
          <div className="pipeline-actions"><button className="btn" onClick={() => { setStartFresh(true); setCycleId(''); setRunId(''); sel.setCycleId(''); setParams({}); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Start another division or period</button></div>
          <p className="muted small">Status legend: {Object.values(VDP_STATUS).map((item) => item.label).join(' → ')}</p>
        </section>
      )}
    </div>
  );
}
