import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { date, money } from '../format';
import { Alert, Empty, ErrorAlert, Loading, PageHead, StatusBadge, VDP_STATUS } from '../components/ui';

const queueOrder = { DISPUTED: 0, NEEDS_REVIEW: 1, READY: 2, APPROVED: 3, PROCESSED: 4, PAID: 5, DRAFT: 6 };

export default function Vdps() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const cycleId = params.get('cycleId') || '';
  const selectedId = params.get('selected') || '';
  const [rows, setRows] = useState([]);
  const [detail, setDetail] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/vdps', { status, cycleId });
      data.sort((a, b) => (queueOrder[a.status] ?? 99) - (queueOrder[b.status] ?? 99) || (a.provider?.name || '').localeCompare(b.provider?.name || ''));
      setRows(data);
      const wanted = selectedId && data.some((row) => String(row._id) === selectedId) ? selectedId : data[0]?._id;
      if (wanted && wanted !== selectedId) setParams((current) => { current.set('selected', wanted); return current; }, { replace: true });
    } catch (e) { setError(e); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [status, cycleId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    api.get(`/vdps/${selectedId}`).then(setDetail).catch(setError);
  }, [selectedId]);

  const cleanReady = useMemo(() => rows.filter((row) => row.status === 'READY' && !row.stale), [rows]);
  const exceptionRows = useMemo(() => rows.filter((row) => ['NEEDS_REVIEW', 'DISPUTED'].includes(row.status)), [rows]);
  const cleanReadyIds = useMemo(() => cleanReady.map((row) => String(row._id)), [cleanReady]);
  const selectedReadyCount = cleanReadyIds.filter((id) => selected.has(id)).length;
  const allCleanReadySelected = cleanReadyIds.length > 0 && selectedReadyCount === cleanReadyIds.length;
  const choose = (id) => setParams((current) => { current.set('selected', id); return current; });
  const toggle = (id) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAllReady = () => setSelected((current) => {
    const next = new Set(current);
    if (allCleanReadySelected) cleanReadyIds.forEach((id) => next.delete(id));
    else cleanReadyIds.forEach((id) => next.add(id));
    return next;
  });
  const approveSelected = async () => {
    const ids = [...selected].filter((id) => cleanReady.some((row) => String(row._id) === String(id)));
    if (!ids.length) return;
    setBusy(true);
    try {
      const result = await api.post('/vdps/bulk-approve', { ids });
      setSelected(new Set());
      if (result.approved?.length) {
        const approvedDivisions = [...new Set(rows
          .filter((row) => result.approved.some((id) => String(id) === String(row._id)))
          .map((row) => String(row.divisionId)))];
        const divisionQuery = approvedDivisions.length === 1 ? `?divisionId=${encodeURIComponent(approvedDivisions[0])}` : '';
        navigate(`/vdps/approved${divisionQuery}`, {
          state: { approvedCount: result.approved.length, skippedCount: result.skipped?.length || 0 },
        });
        return;
      }
      await load();
      if (result.skipped?.length) setError(new Error(`No VDPs were approved; ${result.skipped.length} changed and still need review.`));
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const nextException = () => {
    if (!exceptionRows.length) return;
    const index = exceptionRows.findIndex((row) => String(row._id) === selectedId);
    choose(exceptionRows[(index + 1 + exceptionRows.length) % exceptionRows.length]._id);
  };

  useEffect(() => {
    const onKey = (event) => {
      if (event.target.matches('input,select,textarea,button')) return;
      if (event.key.toLowerCase() === 'n') nextException();
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const index = Math.max(0, rows.findIndex((row) => String(row._id) === selectedId));
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        if (rows.length) choose(rows[(index + delta + rows.length) % rows.length]._id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="page page-wide">
      <PageHead title="VDPs" sub="One queue for exceptions, approval, processed statements, payment, and history."
        actions={<div className="actions"><Link className="btn" to="/vdps/approved">Approved VDPs</Link><button className="btn" disabled={!exceptionRows.length} onClick={nextException}>Next exception <span className="muted">N</span></button><button className="btn btn-success" disabled={busy || selectedReadyCount === 0} onClick={approveSelected}>{busy ? 'Approving…' : `Approve selected${selectedReadyCount ? ` (${selectedReadyCount})` : ''}`}</button></div>} />
      <div className="filters" style={{ marginBottom: 16 }}>
        <div className="field"><label htmlFor="vdp-status">Queue</label><select id="vdp-status" value={status} onChange={(e) => setParams((current) => { if (e.target.value) current.set('status', e.target.value); else current.delete('status'); current.delete('selected'); return current; })}><option value="">All VDPs</option>{Object.entries(VDP_STATUS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></div>
        <span className="muted small">↑/↓ moves through the queue · N opens the next exception</span>
      </div>
      <ErrorAlert error={error} />
      {loading ? <Loading /> : !rows.length ? <Empty title="No VDPs in this queue">Process a cycle or change the queue filter.</Empty> : (
        <div className="vdp-workbench">
          <section className="vdp-queue card" aria-label="VDP queue">
            <div className="vdp-queue-toolbar">
              <label className="check">
                <input type="checkbox" aria-label="Select all clean VDPs ready for approval" checked={allCleanReadySelected} disabled={!cleanReadyIds.length || busy} onChange={toggleAllReady} />
                Select all ready for approval
              </label>
              <span className="muted small">{selectedReadyCount} of {cleanReadyIds.length} selected</span>
            </div>
            {rows.map((row) => <div key={row._id} className={`vdp-queue-row ${String(row._id) === selectedId ? 'selected' : ''}`} onClick={() => choose(row._id)}>
              <input aria-label={`Select ${row.provider?.name}`} type="checkbox" checked={selected.has(String(row._id))} disabled={row.status !== 'READY' || row.stale} onChange={(e) => { e.stopPropagation(); toggle(String(row._id)); }} onClick={(e) => e.stopPropagation()} />
              <div className="grow"><strong>{row.provider?.name || 'Provider'}</strong><div className="muted small">{row.planName || 'No plan'} · {row.cycle ? `${date(row.cycle.cycleStart)}–${date(row.cycle.cycleEnd)}` : ''}</div></div>
              <div className="queue-money">{money(row.net)}</div>
              <StatusBadge status={row.status} map={VDP_STATUS} />
            </div>)}
          </section>
          <aside className="vdp-detail card">
            {!detail ? <Loading /> : <>
              <div className="card-head"><div><h2>{detail.provider?.name}</h2><div className="hint">{detail.plan?.name || detail.settings?.planName}</div></div><StatusBadge status={detail.status} map={VDP_STATUS} /></div>
              <div className="card-body stack">
                {detail.stale && <Alert tone="warn">Source data changed. Recalculate before approval.</Alert>}
                {!!detail.exceptions?.length && <Alert tone="bad"><div><strong>{detail.exceptions.length} exception(s)</strong><div>{detail.exceptions[0]?.message}</div></div></Alert>}
                <div className="detail-money"><span>Gross</span><strong>{money(detail.gross)}</strong><span>Net</span><strong>{money(detail.net)}</strong></div>
                <div><strong>Provenance</strong><p className="muted small">Plan version, source imports, provider/operator rows, manual adjustments, and the approval snapshot are retained on this record.</p></div>
                <Link className="btn btn-primary" to={`/vdps/${detail._id}?from=${encodeURIComponent(window.location.pathname + window.location.search)}`}>Open full review</Link>
              </div>
            </>}
          </aside>
        </div>
      )}
    </div>
  );
}
