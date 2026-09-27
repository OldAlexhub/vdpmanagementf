import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { date, todayLocal } from '../format';
import { Card, CYCLE_STATUS, Empty, ErrorAlert, Field, Loading, Modal, PageHead, StatusBadge, useLoad, useToast } from '../components/ui';
import { useDivisionCycle } from '../components/selection';

function GenerateModal({ divisionId, onClose, onDone }) {
  const [fromDate, setFromDate] = useState(todayLocal());
  const [count, setCount] = useState(4);
  const [error, setError] = useState(null);
  const preview = useLoad(() => api.get('/cycles/preview', { divisionId, date: fromDate }), [divisionId, fromDate]);
  const generate = async () => {
    try { onDone(await api.post('/cycles/generate', { divisionId, fromDate, count })); } catch (e) { setError(e); }
  };
  return (
    <Modal title="Generate VDP cycles" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={generate}>Generate</button></>}>
      <div className="stack">
        <div className="form-grid">
          <Field label="Starting with the cycle that contains" htmlFor="g-from"><input id="g-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></Field>
          <Field label="Number of cycles" htmlFor="g-count"><input id="g-count" type="number" min="1" max="26" value={count} onChange={(e) => setCount(e.target.value)} /></Field>
        </div>
        {preview.data && (
          <div className="explain">
            <h4>First cycle</h4>
            <div className="small">
              {date(preview.data.cycleStart)} – {date(preview.data.cycleEnd)}<br />
              Week 1: {date(preview.data.week1Start, 'md')} – {date(preview.data.week1End, 'md')} · Week 2: {date(preview.data.week2Start, 'md')} – {date(preview.data.week2End, 'md')}<br />
              Submission closes {date(preview.data.submissionDate)} · Payment {date(preview.data.paymentDate)}
            </div>
          </div>
        )}
        <p className="muted small">Cycles that already exist are left unchanged.</p>
        <ErrorAlert error={error || preview.error} />
      </div>
    </Modal>
  );
}

export default function Cycles() {
  const sel = useDivisionCycle();
  const navigate = useNavigate();
  const toast = useToast();
  const [generating, setGenerating] = useState(false);
  const { data, loading, error, reload } = useLoad(
    () => (sel.divisionId ? api.get('/cycles', { divisionId: sel.divisionId }) : Promise.resolve([])),
    [sel.divisionId],
  );

  const setStatus = async (c, status) => {
    await api.patch(`/cycles/${c._id}`, { status });
    toast(`Cycle marked ${CYCLE_STATUS[status].label.toLowerCase()}`);
    reload();
  };

  return (
    <div className="page">
      <PageHead title="VDP Cycles" sub="Two-week payment cycles (Monday–Sunday weeks). Dates are generated from the division’s schedule."
        actions={sel.divisionId && <button className="btn btn-primary" onClick={() => setGenerating(true)}>Generate cycles</button>} />
      <div className="filters" style={{ marginBottom: 16 }}>
        <div className="field">
          <label htmlFor="c-div">Division</label>
          <select id="c-div" value={sel.divisionId} onChange={(e) => sel.setDivisionId(e.target.value)}>
            {sel.divisions.map((d) => <option key={d._id} value={d._id}>DIV {d.divisionNumber} – {d.name}</option>)}
          </select>
        </div>
      </div>
      <ErrorAlert error={error} />
      {loading || sel.loading ? <Loading /> : (
        <Card body={false}>
          {!data.length ? (
            <Empty title="No cycles yet" actions={sel.divisionId && <button className="btn btn-primary" onClick={() => setGenerating(true)}>Generate cycles</button>}>
              Generate the cycles for this division — the dates are calculated for you.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Cycle</th><th>Week 1</th><th>Week 2</th><th>Submission closes</th><th>Payment date</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {data.map((c) => (
                    <tr key={c._id}>
                      <td className="strong nowrap">{date(c.cycleStart)} – {date(c.cycleEnd)}</td>
                      <td className="nowrap">{date(c.week1Start, 'md')} – {date(c.week1End, 'md')}</td>
                      <td className="nowrap">{date(c.week2Start, 'md')} – {date(c.week2End, 'md')}</td>
                      <td className="nowrap">{date(c.submissionDate)}</td>
                      <td className="nowrap strong">{date(c.paymentDate)}</td>
                      <td><StatusBadge status={c.status} map={CYCLE_STATUS} /></td>
                      <td className="num">
                        <div className="actions" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn btn-sm" onClick={() => { sel.setCycleId(c._id); navigate('/processing'); }}>Open</button>
                          <select aria-label="Change status" className="btn-sm" style={{ width: 150 }} value={c.status} onChange={(e) => setStatus(c, e.target.value)}>
                            {Object.entries(CYCLE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {generating && <GenerateModal divisionId={sel.divisionId} onClose={() => setGenerating(false)}
        onDone={(r) => { setGenerating(false); toast(`${r.created.length} cycle(s) created${r.existing ? `, ${r.existing} already existed` : ''}`); reload(); }} />}
    </div>
  );
}
