import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, downloadFile } from '../api';
import { useAuth } from '../App';
import { date, isoDate, todayLocal } from '../format';
import { Badge, Card, CYCLE_STATUS, Empty, ErrorAlert, Field, Loading, Modal, PageHead, StatusBadge, useLoad, useToast } from '../components/ui';
import { useDivisionCycle } from '../components/selection';

// VDP cycles are company-wide: one schedule, and every period exists for every active division
// with the same dates. Each division still uploads its own report and processes its own VDPs.

function GenerateModal({ onClose, onDone }) {
  const [fromDate, setFromDate] = useState(todayLocal());
  const [count, setCount] = useState(4);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const preview = useLoad(() => api.get('/cycles/preview', { date: fromDate }), [fromDate]);
  const generate = async () => {
    setBusy(true);
    try { onDone(await api.post('/cycles/generate', { fromDate, count })); } catch (e) { setError(e); setBusy(false); }
  };
  return (
    <Modal title="Generate VDP cycles" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={generate}>Generate for all divisions</button></>}>
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
        <p className="muted small">Each cycle is created for every active division with the same dates. Cycles that already exist are left unchanged; divisions missing a cycle get it.</p>
        <ErrorAlert error={error || preview.error} />
      </div>
    </Modal>
  );
}

function ScheduleCard() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, error, reload } = useLoad(() => api.get('/settings/cycle-schedule'), []);
  const [form, setForm] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const save = async () => {
    setSaveError(null);
    try {
      await api.put('/settings/cycle-schedule', form);
      setForm(null);
      toast('Cycle schedule saved');
      reload();
    } catch (e) { setSaveError(e); }
  };
  return (
    <Card title="Company cycle schedule" hint="Applies to every division"
      actions={user.role === 'ADMIN' && data && <button className="btn btn-sm" onClick={() => setForm({ ...data })}>Edit</button>}>
      <ErrorAlert error={error} />
      {data && (
        <div className="kv">
          <div><div className="k">Cycle length</div><div className="v">{data.lengthDays} days (Mon–Sun weeks)</div></div>
          <div><div className="k">Aligned to</div><div className="v">{date(data.anchorDate)}</div></div>
          <div><div className="k">Submission closes</div><div className="v">{data.submissionOffsetDays} days after cycle end</div></div>
          <div><div className="k">Payment date</div><div className="v">{data.paymentOffsetDays} days after submission</div></div>
        </div>
      )}
      {form && (
        <Modal title="Company cycle schedule" onClose={() => setForm(null)}
          footer={<><button className="btn" onClick={() => setForm(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save schedule</button></>}>
          <div className="stack">
            <div className="form-grid">
              <Field label="A known cycle start (Monday)" htmlFor="cs-anchor" help="Cycles are 14 days, Monday to Sunday, aligned to this date.">
                <input id="cs-anchor" type="date" value={isoDate(form.anchorDate)} onChange={(e) => setForm({ ...form, anchorDate: e.target.value })} />
              </Field>
              <div />
              <Field label="Submission closes (days after cycle end)" htmlFor="cs-sub">
                <input id="cs-sub" type="number" min="0" value={form.submissionOffsetDays} onChange={(e) => setForm({ ...form, submissionOffsetDays: e.target.value })} />
              </Field>
              <Field label="Payment date (days after submission)" htmlFor="cs-pay">
                <input id="cs-pay" type="number" min="0" value={form.paymentOffsetDays} onChange={(e) => setForm({ ...form, paymentOffsetDays: e.target.value })} />
              </Field>
            </div>
            <p className="muted small">Changes apply to cycles generated from now on. Existing cycles keep their dates.</p>
            <ErrorAlert error={saveError} />
          </div>
        </Modal>
      )}
    </Card>
  );
}

export default function Cycles() {
  const sel = useDivisionCycle();
  const navigate = useNavigate();
  const toast = useToast();
  const [generating, setGenerating] = useState(false);
  const [pdfYear, setPdfYear] = useState('');
  const [downloading, setDownloading] = useState(false);
  const { data, loading, error, reload } = useLoad(() => api.get('/cycles/periods'), []);

  const setStatus = async (cycleId, status) => {
    await api.patch(`/cycles/${cycleId}`, { status });
    toast(`Cycle marked ${CYCLE_STATUS[status].label.toLowerCase()}`);
    reload();
  };
  const open = (divisionId, cycleId) => {
    sel.setDivisionId(divisionId);
    sel.setCycleId(cycleId);
    navigate('/processing');
  };
  const downloadPdf = async () => {
    setDownloading(true);
    try { await downloadFile(`/exports/cycle-schedule.pdf${pdfYear ? `?year=${pdfYear}` : ''}`); } catch (e) { toast(e.message, 'bad'); }
    setDownloading(false);
  };

  const periods = data?.periods || [];
  const divisions = data?.divisions || [];
  const years = [...new Set(periods.map((p) => new Date(p.cycleStart).getUTCFullYear()))].sort();
  const today = todayLocal();

  return (
    <div className="page">
      <PageHead title="VDP Cycles" sub="Two-week payment cycles (Monday–Sunday weeks), company-wide: every division runs on the same dates."
        actions={(
          <>
            <select aria-label="Year for PDF" value={pdfYear} onChange={(e) => setPdfYear(e.target.value)} style={{ width: 120 }}>
              <option value="">All cycles</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button className="btn" disabled={downloading || !periods.length} onClick={downloadPdf}>{downloading ? 'Preparing…' : 'Download PDF'}</button>
            <button className="btn btn-primary" onClick={() => setGenerating(true)}>Generate cycles</button>
          </>
        )} />
      <div className="stack">
        <ScheduleCard />
        <ErrorAlert error={error} />
        {loading ? <Loading /> : (
          <Card body={false}>
            {!periods.length ? (
              <Empty title="No cycles yet" actions={<button className="btn btn-primary" onClick={() => setGenerating(true)}>Generate cycles</button>}>
                Generate the company’s cycles — the dates are calculated for you and created for every division.
              </Empty>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Cycle</th><th>Week 1</th><th>Week 2</th><th>Submission closes</th><th>Payment date</th><th>Divisions</th></tr></thead>
                  <tbody>
                    {periods.map((p) => {
                      const current = isoDate(p.cycleStart) <= today && today <= isoDate(p.cycleEnd);
                      return (
                        <tr key={p.cycleStart}>
                          <td className="strong nowrap">{date(p.cycleStart)} – {date(p.cycleEnd)} {current && <Badge tone="ok">Current</Badge>}</td>
                          <td className="nowrap">{date(p.week1Start, 'md')} – {date(p.week1End, 'md')}</td>
                          <td className="nowrap">{date(p.week2Start, 'md')} – {date(p.week2End, 'md')}</td>
                          <td className="nowrap">{date(p.submissionDate)}</td>
                          <td className="nowrap strong">{date(p.paymentDate)}</td>
                          <td>
                            <div className="stack" style={{ gap: 6 }}>
                              {divisions.map((d) => {
                                const c = p.cycles.find((x) => x.divisionId === d._id);
                                return (
                                  <div key={d._id} className="actions" style={{ gap: 8, flexWrap: 'nowrap' }}>
                                    <span className="small strong" style={{ width: 56 }}>DIV {d.divisionNumber}</span>
                                    {c ? (
                                      <>
                                        <StatusBadge status={c.status} map={CYCLE_STATUS} />
                                        <select aria-label={`Status for DIV ${d.divisionNumber}`} className="btn-sm no-print" style={{ width: 140 }} value={c.status} onChange={(e) => setStatus(c._id, e.target.value)}>
                                          {Object.entries(CYCLE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                        </select>
                                        <button className="btn btn-sm no-print" onClick={() => open(d._id, c._id)}>Open</button>
                                      </>
                                    ) : <span className="muted small">Not generated — use Generate cycles</span>}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>
      {generating && <GenerateModal onClose={() => setGenerating(false)}
        onDone={(r) => { setGenerating(false); toast(`${r.created.length} cycle(s) created across ${r.divisions} division(s)${r.existing ? `, ${r.existing} already existed` : ''}`); reload(); }} />}
    </div>
  );
}
