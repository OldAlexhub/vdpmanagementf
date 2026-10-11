import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, downloadFile } from '../api';
import { cycleLabel, date, money } from '../format';
import { Badge, Card, Empty, ErrorAlert, Loading, PageHead, StatusBadge, useLoad, useToast } from '../components/ui';

const TABS = [
  ['', 'All VDPs'],
  ['NEEDS_REVIEW', 'Needs review'],
  ['READY', 'Ready'],
  ['PROCESSED', 'Processed'],
  ['PAID', 'Paid'],
  ['APPROVED', 'Awaiting provider'],
  ['DISPUTED', 'Provider issues'],
];

const cycleTime = (vdp) => new Date(vdp.cycle?.cycleStart || 0).getTime();

export default function VdpHistory() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const [search, setSearch] = useState('');
  const { data, loading, error } = useLoad(
    () => api.get('/vdps', { status, search }),
    [status, search],
  );
  const rows = [...(data || [])].sort((a, b) => cycleTime(b) - cycleTime(a)
    || (a.provider?.name || '').localeCompare(b.provider?.name || ''));

  const chooseStatus = (next) => setParams(next ? { status: next } : { status: '' });
  const pdf = async (event, id) => {
    event.stopPropagation();
    try {
      await downloadFile(`/vdps/${id}/statement.pdf`);
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  return (
    <div className="page">
      <PageHead
        title="VDP History"
        sub="Open processed and historical VDP statements without returning to the upload pipeline."
      />
      <Card title="Processed VDP records" body={false} actions={<>
        <div className="segmented" role="tablist" aria-label="VDP status">
          {TABS.map(([key, label]) => (
            <button key={key || 'all'} type="button" className={status === key ? 'on' : ''} onClick={() => chooseStatus(key)}>{label}</button>
          ))}
        </div>
        <input
          aria-label="Search VDP history"
          style={{ width: 230 }}
          placeholder="Search provider, operator or route"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </>}>
        {loading ? <Loading text="Loading VDP history…" /> : error ? <div className="card-body"><ErrorAlert error={error} /></div> : !rows.length ? (
          <Empty title={status === 'PROCESSED' ? 'No processed VDPs found' : 'No VDPs found'}>
            {search ? 'No statements match this search.' : 'Statements will appear here when they reach this status.'}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>VDP period</th><th>Provider</th><th>Plan</th><th className="num">Gross</th><th className="num">Deductions</th><th className="num">Net VDP</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((vdp) => (
                  <tr key={vdp._id} className="clickable" onClick={() => navigate(`/vdps/${vdp._id}`)}>
                    <td className="nowrap"><div className="strong">{cycleLabel(vdp.cycle)}</div><div className="muted small">Payment {date(vdp.cycle?.paymentDate)}</div></td>
                    <td><div className="strong">{vdp.provider?.name || 'Provider unavailable'}</div><div className="muted small">{vdp.provider?.operatorName}</div></td>
                    <td className="small">{vdp.planName || '—'}</td>
                    <td className="num strong">{money(vdp.gross)}</td>
                    <td className="num">{money(vdp.totalDeductions)}</td>
                    <td className="num strong">{money(vdp.net)}</td>
                    <td className="nowrap"><StatusBadge status={vdp.status} />{vdp.providerApproval?.method === 'AUTO' && <> <Badge>Auto-approved</Badge></>}</td>
                    <td className="num"><button type="button" className="btn btn-sm" onClick={(event) => pdf(event, vdp._id)}>PDF</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
