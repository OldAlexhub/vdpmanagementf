import { useRef, useState } from 'react';
import { api, downloadFile } from '../api';
import { Alert, Badge, ErrorAlert, Modal } from './ui';

// Excel bulk import for divisions, VDP plans and providers.
// 1) download the template, 2) upload → the server checks every row (nothing saved),
// 3) import → only NEW rows are created. Existing records are pointed out, never changed.
const ROW_STATUS = {
  NEW: { label: 'Will be added', tone: 'info' },
  CREATED: { label: 'Added', tone: 'ok' },
  EXISTS: { label: 'Already exists — skipped', tone: 'warn' },
  DUPLICATE: { label: 'Repeated in file — skipped', tone: 'neutral' },
  ERROR: { label: 'Needs fixing', tone: 'bad' },
};

const FILTERS = [
  ['ALL', 'All rows'],
  ['NEW', 'To add'],
  ['EXISTS', 'Already exist'],
  ['ERROR', 'Need fixing'],
  ['WARN', 'With warnings'],
];

function RowDetails({ r }) {
  return (
    <div className="small">
      {r.existing && <div>In the system as <span className="strong">{r.existing}</span>. Nothing was changed.</div>}
      {r.differences?.length > 0 && (
        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
          {r.differences.map((d) => <li key={d.field}>{d.field}: file has <span className="strong">{d.file}</span>, system has <span className="strong">{d.system}</span></li>)}
        </ul>
      )}
      {r.errors.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--bad, #b91c1c)' }}>{r.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      {r.warnings.length > 0 && <ul style={{ margin: 0, paddingLeft: 18 }} className="muted">{r.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
    </div>
  );
}

export default function BulkImport({ kind, title, onClose, onDone }) {
  const input = useRef();
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [result, setResult] = useState(null);
  const [committed, setCommitted] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('ALL');

  const run = async (step, f = file) => {
    setBusy(step);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', f);
      const data = await api.post(`/imports/${kind}/${step}`, form);
      setResult(data);
      setCommitted(step === 'commit');
      setFilter('ALL');
      if (step === 'commit' && data.summary.created) onDone?.(data);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const choose = (f) => {
    if (!f) return;
    setFile(f);
    setResult(null);
    setCommitted(false);
    run('preview', f);
    if (input.current) input.current.value = '';
  };

  const template = async () => {
    setBusy('template');
    setError(null);
    try { await downloadFile(`/imports/${kind}/template`); } catch (e) { setError(e); } finally { setBusy(null); }
  };

  const s = result?.summary;
  const rows = (result?.rows || []).filter((r) => (
    filter === 'ALL' ? true
      : filter === 'WARN' ? r.warnings.length > 0 && ['NEW', 'CREATED'].includes(r.status)
        : filter === 'NEW' ? ['NEW', 'CREATED'].includes(r.status)
          : filter === 'EXISTS' ? ['EXISTS', 'DUPLICATE'].includes(r.status)
            : r.status === filter
  ));

  return (
    <Modal
      wide
      title={`Bulk import ${title.toLowerCase()}`}
      onClose={onClose}
      footer={committed ? <button className="btn btn-primary" onClick={onClose}>Done</button> : (
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          {result && (
            <button className="btn btn-primary" disabled={!s.new || Boolean(busy)} onClick={() => run('commit')}>
              {busy === 'commit' ? 'Importing…' : s.new ? `Import ${s.new} new ${s.new === 1 ? 'row' : 'rows'}` : 'Nothing new to import'}
            </button>
          )}
        </>
      )}
    >
      <div className="stack">
        <div className="card card-body">
          <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="strong">1 · Download the Excel template</div>
              <div className="muted small">
                Required columns are red, needed ones amber. Choices like division, plan, status and payment type are drop-downs.
                Download a fresh copy after adding divisions or plans so the drop-downs include them.
              </div>
            </div>
            <button className="btn" disabled={busy === 'template'} onClick={template}>{busy === 'template' ? 'Preparing…' : 'Download template'}</button>
          </div>
        </div>

        <div
          className={`upload-drop ${drag ? 'drag' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); choose(e.dataTransfer.files[0]); }}
        >
          <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => choose(e.target.files[0])} />
          {busy === 'preview' ? <span className="loading" style={{ justifyContent: 'center', padding: 0 }}><span className="spinner" /> Checking {file?.name}…</span> : (
            <>
              <div className="strong" style={{ marginBottom: 8 }}>2 · Upload the completed template</div>
              <button className="btn btn-primary" disabled={Boolean(busy) || committed} onClick={() => input.current.click()}>{file ? 'Choose another file' : 'Choose file'}</button>
              <div className="muted small" style={{ marginTop: 8 }}>
                {file ? `${file.name} — ` : 'or drop the .xlsx here. '}
                Every row is checked first; nothing is saved until you press Import.
              </div>
            </>
          )}
        </div>

        <ErrorAlert error={error} />

        {result && (
          <>
            {committed
              ? <Alert tone={s.created ? 'ok' : 'warn'}>{s.created} added. {s.exists + s.duplicate} skipped because they already exist or repeat a row. {s.error ? `${s.error} need fixing — correct them in the file and upload it again; rows already added will show as existing.` : ''}</Alert>
              : <Alert tone={s.error ? 'warn' : 'info'}>{s.total} rows checked: {s.new} will be added{s.exists ? `, ${s.exists} already exist and will be skipped (not changed)` : ''}{s.duplicate ? `, ${s.duplicate} repeat an earlier row` : ''}{s.error ? `, ${s.error} need fixing and will be skipped` : ''}.</Alert>}
            {result.notes?.length > 0 && <Alert tone="warn"><ul style={{ margin: 0, paddingLeft: 18 }}>{result.notes.map((n) => <li key={n}>{n}</li>)}</ul></Alert>}
            <div className="segmented" role="tablist" aria-label="Filter rows">
              {FILTERS.map(([k, l]) => <button key={k} type="button" className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}
            </div>
            <div className="table-wrap" style={{ maxHeight: 380, overflow: 'auto' }}>
              <table className="table-compact">
                <thead><tr><th>Row</th><th>Record</th><th>Result</th><th>Details</th></tr></thead>
                <tbody>
                  {rows.length === 0 ? <tr><td colSpan={4} className="muted">No rows in this view.</td></tr> : rows.map((r) => (
                    <tr key={`${r.sheet}-${r.row}`}>
                      <td className="mono nowrap">{r.sheet !== result.rows[0]?.sheet ? `${r.sheet} ` : ''}{r.row}</td>
                      <td className="strong">{r.label}</td>
                      <td className="nowrap"><Badge tone={ROW_STATUS[r.status].tone} dot>{ROW_STATUS[r.status].label}</Badge></td>
                      <td><RowDetails r={r} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
