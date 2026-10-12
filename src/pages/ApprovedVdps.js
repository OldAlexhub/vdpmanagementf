import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { date, money } from '../format';
import { Alert, Card, Empty, ErrorAlert, Loading, PageHead, StatusBadge, VDP_STATUS } from '../components/ui';

const APPROVED_STATUSES = new Set(['APPROVED', 'PROCESSED', 'PAID']);

export default function ApprovedVdps() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const divisionId = params.get('divisionId') || '';
  const [rows, setRows] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      api.get('/vdps', divisionId ? { divisionId } : {}),
      api.get('/divisions'),
    ]).then(([vdps, divisionRows]) => {
      if (!active) return;
      setRows(vdps.filter((row) => APPROVED_STATUSES.has(row.status)));
      setDivisions(divisionRows);
    }).catch((e) => active && setError(e)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [divisionId]);

  const groups = useMemo(() => {
    const divisionById = new Map(divisions.map((division) => [String(division._id), division]));
    const byDivision = new Map();
    rows.forEach((row) => {
      const key = String(row.divisionId || 'unknown');
      if (!byDivision.has(key)) byDivision.set(key, []);
      byDivision.get(key).push(row);
    });
    return [...byDivision.entries()].map(([id, vdps]) => ({
      id,
      division: divisionById.get(id),
      vdps: [...vdps].sort((a, b) => new Date(b.cycle?.cycleStart || 0) - new Date(a.cycle?.cycleStart || 0)
        || (a.provider?.name || '').localeCompare(b.provider?.name || '')),
    })).sort((a, b) => String(a.division?.divisionNumber || '').localeCompare(String(b.division?.divisionNumber || ''), undefined, { numeric: true }));
  }, [rows, divisions]);

  const result = location.state;

  return (
    <div className="page page-wide">
      <PageHead
        crumbs={<><Link to="/vdps">VDPs</Link> / Approved</>}
        title="Approved VDPs"
        sub="Approved statements are organized by division and remain available through payment and history."
        actions={<Link className="btn" to="/vdps">Back to review queue</Link>}
      />

      {result?.approvedCount > 0 && (
        <Alert tone={result.skippedCount ? 'warn' : 'ok'}>
          <strong>{result.approvedCount} VDP{result.approvedCount === 1 ? '' : 's'} approved.</strong>
          {result.skippedCount ? ` ${result.skippedCount} changed during approval and remains in the review queue.` : ''}
        </Alert>
      )}

      <div className="filters" style={{ margin: '16px 0' }}>
        <div className="field">
          <label htmlFor="approved-division">Division</label>
          <select id="approved-division" value={divisionId} onChange={(event) => setParams((current) => {
            if (event.target.value) current.set('divisionId', event.target.value); else current.delete('divisionId');
            return current;
          })}>
            <option value="">All divisions</option>
            {divisions.map((division) => <option key={division._id} value={division._id}>DIV {division.divisionNumber} — {division.name}</option>)}
          </select>
        </div>
        <span className="muted small">{rows.length} approved statement{rows.length === 1 ? '' : 's'}</span>
      </div>

      <ErrorAlert error={error} />
      {loading ? <Loading /> : !groups.length ? (
        <Card><Empty title="No approved VDPs">Approve clean VDPs from the review queue and they will appear here.</Empty></Card>
      ) : (
        <div className="stack">
          {groups.map(({ id: groupId, division, vdps }) => (
            <Card
              key={groupId}
              title={division ? `DIV ${division.divisionNumber} — ${division.name}` : 'Division unavailable'}
              hint={`${vdps.length} approved statement${vdps.length === 1 ? '' : 's'}`}
              body={false}
            >
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Provider</th><th>VDP period</th><th>Plan</th><th className="num">Gross</th><th className="num">Net</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {vdps.map((row) => (
                      <tr key={row._id}>
                        <td><strong>{row.provider?.name || 'Provider'}</strong></td>
                        <td>{row.cycle ? `${date(row.cycle.cycleStart)}–${date(row.cycle.cycleEnd)}` : '—'}</td>
                        <td>{row.planName || '—'}</td>
                        <td className="num">{money(row.gross)}</td>
                        <td className="num strong">{money(row.net)}</td>
                        <td><StatusBadge status={row.status} map={VDP_STATUS} /></td>
                        <td className="num"><Link className="btn btn-sm" to={`/vdps/${row._id}?from=${encodeURIComponent(`/vdps/approved${divisionId ? `?divisionId=${divisionId}` : ''}`)}`}>Open</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
