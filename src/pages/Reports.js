// Leadership reporting: pay, performance, provider approvals, issues and team activity.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../api';
import { date, money, num } from '../format';
import { Alert, Card, CYCLE_STATUS, Empty, ErrorAlert, Loading, PageHead, Stat, StatusBadge, useLoad, VDP_STATUS } from '../components/ui';
import { AXIS, GRID, Legend, SERIES, TipCard, compactMoney, moneyRow, tierColor } from '../components/charts';

const PERIODS = [['3', 'Last 3 cycles'], ['6', 'Last 6 cycles'], ['12', 'Last 12 cycles'], ['all', 'All cycles']];
const AREA_LABELS = {
  TRIPS: 'Trips', HOURS: 'Hours worked', CONTRACTED_HOURS: 'Contracted hours', RATE: 'Rate / tier', BONUS: 'Bonus pay',
  LIFT_LEASE: 'Lift lease', FARES: 'Fares', ADJUSTMENT: 'Deduction/addition', MISSING: 'Missing item', OTHER: 'Other',
};

const pctOf = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

function Delta({ now, before, invert, money: isMoney }) {
  if (now === null || now === undefined || before === null || before === undefined) return null;
  const d = Number(now) - Number(before);
  if (!d) return <span className="delta muted">no change</span>;
  const good = invert ? d < 0 : d > 0;
  return (
    <span className={`delta ${good ? 'up' : 'down'}`}>
      {d > 0 ? '▲' : '▼'} {isMoney ? money(Math.abs(d).toFixed(2)) : num(Math.abs(d).toFixed(1))}
    </span>
  );
}

function PayChart({ series }) {
  const data = series.map((s) => ({ ...s, netN: Number(s.net), dedN: Number(s.deductions) }));
  return (
    <>
      <Legend items={[[SERIES.net, 'Net VDP'], [SERIES.deductions, 'Deductions']]} />
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid {...GRID} />
          <XAxis dataKey="label" {...AXIS} />
          <YAxis {...AXIS} tickFormatter={compactMoney} width={56} />
          <Tooltip cursor={{ fill: 'rgba(15,42,74,0.05)' }} content={({ active, payload }) => active && payload?.length ? (
            <TipCard title={`Cycle ${payload[0].payload.label}`} rows={[
              moneyRow(null, 'Gross VDP', payload[0].payload.gross, true),
              moneyRow(SERIES.deductions, 'Deductions', payload[0].payload.deductions),
              moneyRow(SERIES.additions, 'Additions', payload[0].payload.additions),
              moneyRow(SERIES.net, 'Net VDP', payload[0].payload.net, true),
            ]} note={`${payload[0].payload.vdps} VDPs · payment date ${date(payload[0].payload.paymentDate)}`} />
          ) : null} />
          <Bar dataKey="netN" stackId="pay" fill={SERIES.net} stroke="#fff" strokeWidth={1} maxBarSize={48} />
          <Bar dataKey="dedN" stackId="pay" fill={SERIES.deductions} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}

function PerformanceChart({ series }) {
  const data = series.map((s) => ({ ...s, at100: pctOf(s.weeksAt100, s.hourlyWeeks) }));
  return (
    <ResponsiveContainer width="100%" height={284}>
      <LineChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} width={44} tickFormatter={(v) => `${v}%`} domain={[0, (max) => Math.max(120, Math.ceil(max / 10) * 10)]} />
        <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: 'Contract (100%)', position: 'insideTopRight', fill: '#64748b', fontSize: 11 }} />
        <Tooltip content={({ active, payload }) => active && payload?.length ? (
          <TipCard title={`Cycle ${payload[0].payload.label}`} rows={[
            [SERIES.net, 'Average performance', `${payload[0].payload.avgPerformance ?? '—'}%`, true],
            [null, 'Weeks at 100%+', `${payload[0].payload.weeksAt100} of ${payload[0].payload.hourlyWeeks} (${payload[0].payload.at100 ?? 0}%)`],
            [null, 'Bonus hours', `${num(payload[0].payload.bonusHours)} h`],
          ]} note="Hourly plans: hours worked ÷ contracted hours, per provider-week" />
        ) : null} />
        <Line type="monotone" dataKey="avgPerformance" stroke={SERIES.net} strokeWidth={2} dot={{ r: 4, stroke: '#fff', strokeWidth: 2, fill: SERIES.net }} activeDot={{ r: 6 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function TierChart({ tiers }) {
  const total = tiers.reduce((a, t) => a + t.weeks, 0);
  const data = tiers.map((t, i) => ({ ...t, share: pctOf(t.weeks, total), color: tierColor(i, tiers.length) }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 4 }} barCategoryGap="24%">
        <CartesianGrid stroke="#e8ecf1" horizontal={false} />
        <XAxis type="number" {...AXIS} allowDecimals={false} />
        <YAxis type="category" dataKey="tier" {...AXIS} width={96} />
        <Tooltip cursor={{ fill: 'rgba(15,42,74,0.05)' }} content={({ active, payload }) => active && payload?.length ? (
          <TipCard title={`Tier ${payload[0].payload.tier}`} rows={[
            [payload[0].payload.color, 'Provider-weeks', payload[0].payload.weeks, true],
            [null, 'Share of weeks', `${payload[0].payload.share}%`],
          ]} />
        ) : null} />
        <Bar dataKey="weeks" radius={[0, 4, 4, 0]} maxBarSize={26}>
          {data.map((d) => <Cell key={d.tier} fill={d.color} />)}
          <LabelList dataKey="weeks" position="right" style={{ fill: '#334155', fontSize: 12, fontWeight: 600 }} formatter={(v) => `${v} wk`} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function MoneyBars({ rows }) {
  const max = Math.max(...rows.map((r) => Number(r.amount)), 1);
  return (
    <div className="hbar-list">
      {rows.map((r) => (
        <div className="hbar-row" key={r.key} title={`${r.label}: ${money(r.amount)}`}>
          <span>{r.label}</span>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${(Number(r.amount) / max) * 100}%`, background: r.direction === 'ADDITION' ? SERIES.additions : SERIES.deductions }} />
          </div>
          <span className="hbar-value">{r.direction === 'ADDITION' ? '+' : '−'}{money(r.amount)}</span>
        </div>
      ))}
    </div>
  );
}

const PIPE = ['NEEDS_REVIEW', 'READY', 'APPROVED', 'DISPUTED', 'PROCESSED', 'PAID'];

function Pipeline({ latest }) {
  const navigate = useNavigate();
  const go = (status) => {
    try { localStorage.setItem('vdp.cycleId', latest.cycleId); } catch { /* storage unavailable */ }
    navigate(`/processing?status=${status}`);
  };
  return (
    <div className="pipeline">
      {PIPE.map((s) => (
        <button key={s} type="button" className="pipe" style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit' }} onClick={() => go(s)}>
          <div className="n">{latest.statusCounts[s] || 0}</div>
          <div className="l"><StatusBadge status={s} /></div>
        </button>
      ))}
    </div>
  );
}

const SORTS = {
  name: (a, b) => a.name.localeCompare(b.name),
  net: (a, b) => Number(a.net) - Number(b.net),
  hours: (a, b) => Number(a.hours) - Number(b.hours),
  avgPerformance: (a, b) => (a.avgPerformance ?? -1) - (b.avgPerformance ?? -1),
  weeksAt100: (a, b) => pctOf(a.weeksAt100, a.hourlyWeeks) - pctOf(b.weeksAt100, b.hourlyWeeks),
  bonusHours: (a, b) => Number(a.bonusHours) - Number(b.bonusHours),
  issues: (a, b) => a.issues - b.issues,
};

function Scorecard({ rows }) {
  const navigate = useNavigate();
  const [sort, setSort] = useState({ key: 'net', dir: -1 });
  const sorted = useMemo(() => [...rows].sort((a, b) => SORTS[sort.key](a, b) * sort.dir), [rows, sort]);
  const th = (key, label, cls = '') => (
    <th className={`sortable ${cls} ${sort.key === key ? `sorted ${sort.dir > 0 ? 'asc' : ''}` : ''}`}
      onClick={() => setSort({ key, dir: sort.key === key ? -sort.dir : -1 })}>{label}</th>
  );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {th('name', 'Provider')}
            <th>Plan</th>
            {th('net', 'Net VDP', 'num')}
            {th('hours', 'Hours', 'num')}
            {th('avgPerformance', 'Avg performance')}
            {th('weeksAt100', 'Weeks at 100%+', 'num')}
            {th('bonusHours', 'Bonus hours', 'num')}
            {th('issues', 'Issues', 'num')}
            <th>Latest</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.providerId} className="clickable" onClick={() => navigate(`/providers/${r.providerId}`)}>
              <td><div className="strong">{r.name}</div><div className="muted small">{r.operator} · route {r.routes.join(', ')}</div></td>
              <td className="small">{r.plan}</td>
              <td className="num strong">{money(r.net)}</td>
              <td className="num">{num(r.hours)}</td>
              <td className="nowrap">
                {r.avgPerformance === null ? <span className="muted small">per trip</span> : (
                  <>
                    <span className={`minibar ${r.avgPerformance >= 100 ? 'over' : ''}`}><span style={{ width: `${Math.min(100, r.avgPerformance)}%` }} /></span>
                    {r.avgPerformance}%
                  </>
                )}
              </td>
              <td className="num">{r.hourlyWeeks ? `${r.weeksAt100} / ${r.hourlyWeeks}` : '—'}</td>
              <td className="num">{Number(r.bonusHours) ? num(r.bonusHours) : '—'}</td>
              <td className="num">{r.issues || '—'}{r.autoApproved ? <div className="muted small">{r.autoApproved} auto-approved</div> : null}</td>
              <td><StatusBadge status={r.latestStatus} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Reports() {
  const divisions = useLoad(() => api.get('/divisions'), []);
  const [divisionId, setDivisionId] = useState('');
  const [period, setPeriod] = useState('6');
  const { data: r, loading, error } = useLoad(() => api.get('/reports/leadership', { divisionId, cycles: period }), [divisionId, period]);

  const k = r?.kpis;
  const trend = r && r.series.length >= 2;
  return (
    <div className="page">
      <PageHead title="Reports" sub="Pay, performance and review status for leadership decisions." />
      <div className="filters" style={{ marginBottom: 16 }}>
        <div className="field">
          <label htmlFor="rp-div">Division</label>
          <select id="rp-div" value={divisionId || r?.division?._id || ''} onChange={(e) => setDivisionId(e.target.value)}>
            {(divisions.data || []).filter((d) => d.status === 'ACTIVE').map((d) => <option key={d._id} value={d._id}>DIV {d.divisionNumber} – {d.name}</option>)}
          </select>
        </div>
        <div className="field">
          <span className="label">Period</span>
          <div className="segmented" role="tablist">
            {PERIODS.map(([v, l]) => <button key={v} type="button" className={period === v ? 'on' : ''} onClick={() => setPeriod(v)}>{l}</button>)}
          </div>
        </div>
      </div>
      <ErrorAlert error={error} />
      {loading && !r ? <Loading /> : r && (!r.series.length ? (
        <Card><Empty title="No VDPs yet">Reports appear once VDPs have been processed for this division.</Empty></Card>
      ) : (
        <div className="stack">
          <p className="muted small">
            {r.period.cycles} cycle{r.period.cycles === 1 ? '' : 's'} · {date(r.period.from)} – {date(r.period.to)} ·
            latest cycle {r.latest.label} <StatusBadge status={r.latest.status} map={CYCLE_STATUS} />
          </p>
          <div className="grid grid-4">
            <Stat label="Net VDP" value={money(k.net)} tone="ok"
              note={<>Latest cycle {money(r.latest.net)}{r.previous && <Delta now={r.latest.net} before={r.previous.net} money />}</>} />
            <Stat label="Gross VDP" value={money(k.gross)} note={`Bonus pay ${money(k.bonusPay)}`} />
            <Stat label="Deductions" value={money(k.deductions)} note={`Lease ${money(k.lease)} · fares ${money(k.fares)}`} />
            <Stat label="Providers" value={k.providers} note={`${k.vdps} VDPs`} />
          </div>
          <div className="grid grid-4">
            <Stat label="Hours worked" value={num(k.hours)} note={`${num(k.trips)} trips`} />
            <Stat label="Avg performance" value={k.avgPerformance === null ? '—' : `${k.avgPerformance}%`}
              note={<>hourly plans{r.previous && <Delta now={r.latest.avgPerformance} before={r.previous.avgPerformance} />}</>} />
            <Stat label="Weeks at 100%+" value={k.hourlyWeeks ? `${pctOf(k.weeksAt100, k.hourlyWeeks)}%` : '—'} note={`${k.weeksAt100} of ${k.hourlyWeeks} provider-weeks`} />
            <Stat label="Bonus hours" value={num(k.bonusHours)} note="hours above contract" />
          </div>

          <div className="grid grid-2">
            <Card title="Pay by cycle" hint="Gross VDP = net paid + deductions" body={false}>
              <div className="chart-card-body">
                {trend ? <PayChart series={r.series} /> : <Alert tone="info">The trend appears once two or more cycles are processed. Latest cycle: gross {money(r.latest.gross)}, deductions {money(r.latest.deductions)}, net {money(r.latest.net)}.</Alert>}
              </div>
            </Card>
            <Card title="Performance by cycle" hint="Average % of contracted hours (hourly plans)" body={false}>
              <div className="chart-card-body">
                {trend ? <PerformanceChart series={r.series} /> : <Alert tone="info">The trend appears once two or more cycles are processed. Latest cycle average: {r.latest.avgPerformance ?? '—'}%.</Alert>}
              </div>
            </Card>
          </div>

          <div className="grid grid-2">
            <Card title="Incentive tiers reached" hint="Provider-weeks per tier, hourly plans" body={false}>
              <div className="chart-card-body">
                {r.tiers.length ? <TierChart tiers={r.tiers} /> : <p className="muted">No hourly weeks in this period.</p>}
              </div>
            </Card>
            <Card title="Deductions & additions" hint="Totals for the period">
              {r.deductions.length ? <MoneyBars rows={r.deductions} /> : <p className="muted">None.</p>}
            </Card>
          </div>

          <Card title={`Where the latest cycle stands · ${r.latest.label}`} hint="Select a status to open those VDPs">
            <Pipeline latest={r.latest} />
          </Card>

          <div className="grid grid-2">
            <Card title="Provider approvals" hint="After Big Star approves, providers approve or report an issue">
              <div className="grid grid-2">
                <Stat label="Approved by provider" value={k.providerApproved} tone="ok" />
                <Stat label="Auto-approved" value={k.autoApproved} note="no response by the deadline" />
                <Stat label="Awaiting provider" value={k.awaitingProvider} tone={k.awaitingProvider ? 'warn' : undefined} />
                <Stat label="Open issues" value={k.disputed} tone={k.disputed ? 'bad' : undefined} />
              </div>
            </Card>
            <Card title="Provider issues" hint="What providers disputed and how it was resolved">
              <div className="grid grid-2" style={{ marginBottom: 12 }}>
                <Stat label="Issues raised" value={r.issues.raised} note={`${r.issues.open} open`} tone={r.issues.open ? 'bad' : undefined} />
                <Stat label="Resolved" value={r.issues.corrected + r.issues.noChange}
                  note={`${r.issues.corrected} corrected · ${r.issues.noChange} no change${r.issues.avgHoursToResolve !== null ? ` · avg ${r.issues.avgHoursToResolve} h` : ''}`} />
              </div>
              {r.issues.byArea.length > 0 && (
                <table className="table-compact">
                  <thead><tr><th>Most disputed</th><th className="num">Lines</th></tr></thead>
                  <tbody>{r.issues.byArea.map((a) => <tr key={a.area}><td>{AREA_LABELS[a.area] || a.area}</td><td className="num">{a.count}</td></tr>)}</tbody>
                </table>
              )}
            </Card>
          </div>

          <Card title="Provider scorecard" hint="Select a column to sort · select a provider to open their profile" body={false}>
            <Scorecard rows={r.scorecard} />
          </Card>

          <div className="grid grid-2">
            <Card title="Team activity · approvals" body={false}>
              {r.activity.approvals.length ? (
                <table className="table-compact"><tbody>
                  {r.activity.approvals.map((a) => <tr key={a.name}><td>{a.name}</td><td className="num strong">{a.count} VDPs approved</td></tr>)}
                </tbody></table>
              ) : <div className="card-body muted">No approvals yet.</div>}
            </Card>
            <Card title="Team activity · adjustments entered" body={false}>
              {r.activity.adjustments.length ? (
                <table className="table-compact"><tbody>
                  {r.activity.adjustments.map((a) => <tr key={a.name}><td>{a.name}</td><td className="num">{a.count} entries</td><td className="num strong">{money(a.amount)}</td></tr>)}
                </tbody></table>
              ) : <div className="card-body muted">No adjustments yet.</div>}
            </Card>
          </div>
          <p className="muted small">Approved, processed and paid VDPs are reported from their frozen snapshots. Status legend: {Object.values(VDP_STATUS).map((s) => s.label).join(' · ')}. <Link to="/processing">Open VDP processing</Link></p>
        </div>
      ))}
    </div>
  );
}
