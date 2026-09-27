// Provider portal dashboard: their pay, hours against contract, tiers reached and anything waiting on them.
import { Link, useNavigate } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../api';
import { date, money, num, rate } from '../format';
import { Alert, Badge, Card, Empty, ErrorAlert, Loading, PageHead, Stat, useLoad } from '../components/ui';
import { AXIS, GRID, Legend, SERIES, TipCard, compactMoney, moneyRow } from '../components/charts';

const STATUS = {
  APPROVED: ['warn', 'Needs your approval'], DISPUTED: ['bad', 'Issue under review'],
  PROCESSED: ['ok', 'Approved'], PAID: ['accent', 'Paid'],
};

function HoursChart({ weeks }) {
  const hourly = weeks.some((w) => w.contracted !== null);
  const constant = hourly && weeks.every((w) => w.contracted === weeks[0].contracted);
  return (
    <>
      <Legend items={[[SERIES.net, 'Hours worked'], ...(hourly ? [[SERIES.contracted, 'Contracted hours', true]] : [])]} />
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={weeks} margin={{ top: 12, right: 12, left: 0, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid {...GRID} />
          <XAxis dataKey="label" {...AXIS} />
          <YAxis {...AXIS} width={40} tickFormatter={(v) => `${v}h`} />
          <Tooltip cursor={{ fill: 'rgba(15,42,74,0.05)' }} content={({ active, payload }) => active && payload?.length ? (() => {
            const w = payload[0].payload;
            return (
              <TipCard title={`Week of ${w.label}`} rows={[
                [SERIES.net, 'Hours worked', `${num(w.hours)} h`, true],
                w.contracted !== null && [SERIES.contracted, 'Contracted', `${num(w.contracted)} h`],
                w.performance !== null && [null, 'Performance', `${w.performance}%`],
                [null, 'Trips', num(w.trips)],
                [null, 'Rate', `${rate(w.rate)}${w.contracted !== null ? '' : ' / trip'}`],
                [null, 'Week earnings', money(w.earnings), true],
              ]} note={w.tier} />
            );
          })() : null} />
          <Bar dataKey="hours" fill={SERIES.net} radius={[4, 4, 0, 0]} maxBarSize={44} />
          {constant && <ReferenceLine y={weeks[0].contracted} stroke={SERIES.contracted} strokeDasharray="5 4" strokeWidth={1.5} />}
          {hourly && !constant && <Line type="stepAfter" dataKey="contracted" stroke={SERIES.contracted} strokeDasharray="5 4" strokeWidth={1.5} dot={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}

function PayChart({ cycles }) {
  const data = cycles.map((c) => ({ ...c, netN: Number(c.net), dedN: Number(c.deductions) }));
  return (
    <>
      <Legend items={[[SERIES.net, 'Net payment'], [SERIES.deductions, 'Deductions']]} />
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid {...GRID} />
          <XAxis dataKey="label" {...AXIS} />
          <YAxis {...AXIS} tickFormatter={compactMoney} width={56} />
          <Tooltip cursor={{ fill: 'rgba(15,42,74,0.05)' }} content={({ active, payload }) => active && payload?.length ? (
            <TipCard title={`Cycle ${payload[0].payload.label}`} rows={[
              moneyRow(null, 'Gross', payload[0].payload.gross, true),
              moneyRow(SERIES.deductions, 'Deductions', payload[0].payload.deductions),
              moneyRow(SERIES.additions, 'Additions', payload[0].payload.additions),
              moneyRow(SERIES.net, 'Net payment', payload[0].payload.net, true),
            ]} />
          ) : null} />
          <Bar dataKey="netN" stackId="p" fill={SERIES.net} stroke="#fff" strokeWidth={1} maxBarSize={44} />
          <Bar dataKey="dedN" stackId="p" fill={SERIES.deductions} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}

export default function PortalDashboard({ user }) {
  const navigate = useNavigate();
  const { data: d, loading, error } = useLoad(() => api.get('/portal/dashboard'), []);
  if (loading) return <div className="page"><Loading /></div>;
  if (error) return <div className="page"><ErrorAlert error={error} /></div>;
  const k = d.kpis;
  const at100 = k.all.hourlyWeeks ? Math.round((k.all.weeksAt100 / k.all.hourlyWeeks) * 100) : null;

  return (
    <div className="page">
      <PageHead title={`Welcome, ${user.name}`} sub={`${d.provider?.name} · route ${(d.provider?.routes || []).join(', ')}`} />
      {!d.cycles.length ? (
        <Card><Empty title="No statements yet">Your dashboard fills in once Big Star approves your first VDP statement.</Empty></Card>
      ) : (
        <div className="stack">
          {k.pending.map((p) => (
            <Alert key={p.vdpId} tone="warn" action={<Link className="btn btn-sm btn-primary" to={`/vdps/${p.vdpId}`}>Review & approve</Link>}>
              <strong>Cycle {p.cycle}</strong> — net {money(p.net)} needs your approval by the end of {date(p.submissionDate, 'long')}.
              Approve it or report an issue; otherwise it is approved automatically.
            </Alert>
          ))}
          {k.openIssues > 0 && <Alert tone="info">{k.openIssues} statement{k.openIssues > 1 ? 's have' : ' has'} an issue under review by Big Star.</Alert>}

          <div className="grid grid-4">
            <Stat label={`Net VDP ${d.year}`} value={money(k.ytd.net)} tone="ok" note={`${k.ytd.statements} statement${k.ytd.statements === 1 ? '' : 's'} · gross ${money(k.ytd.gross)}`} />
            <Stat label="Latest statement" value={k.last ? money(k.last.net) : '—'}
              note={k.last && <>{k.last.cycle} · <Badge tone={STATUS[k.last.status]?.[0]}>{STATUS[k.last.status]?.[1]}</Badge></>} />
            <Stat label="Avg performance" value={k.all.avgPerformance === null ? '—' : `${k.all.avgPerformance}%`}
              note={at100 === null ? 'per-trip service' : `${k.all.weeksAt100} of ${k.all.hourlyWeeks} weeks at 100%+ (${at100}%)`} />
            <Stat label="Bonus hours" value={num(k.all.bonusHours)} note={`${money(k.all.bonusPay)} bonus pay`} />
          </div>

          <div className="grid grid-2">
            <Card title="Hours worked by week" hint="Last 6 cycles · Performance Report" body={false}>
              <div className="chart-card-body"><HoursChart weeks={d.weeks} /></div>
            </Card>
            <Card title="Pay by cycle" hint="Net payment + deductions = gross" body={false}>
              <div className="chart-card-body">
                {d.cycles.length >= 2 ? <PayChart cycles={d.cycles} /> : (
                  <Alert tone="info">Your pay trend appears after your second statement. This cycle: gross {money(d.cycles[0].gross)}, deductions {money(d.cycles[0].deductions)}, net {money(d.cycles[0].net)}.</Alert>
                )}
              </div>
            </Card>
          </div>

          <div className="grid grid-2">
            <Card title="Weekly detail" body={false}>
              <table className="table-compact">
                <thead><tr><th>Week of</th><th className="num">Hours</th><th className="num">Trips</th><th>Tier / rate</th><th className="num">Earned</th></tr></thead>
                <tbody>
                  {[...d.weeks].reverse().map((w) => (
                    <tr key={w.cycle + w.label}>
                      <td>{w.label}</td>
                      <td className="num">{num(w.hours)}{w.performance !== null && <div className="muted small">{w.performance}%</div>}</td>
                      <td className="num">{num(w.trips)}</td>
                      <td className="small">{w.tier}<div className="strong">{rate(w.rate)}</div></td>
                      <td className="num strong">{money(w.earnings)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card title={`Deductions & additions ${d.year}`}>
              {d.deductions.length ? (
                <table className="table-compact"><tbody>
                  {d.deductions.map((x) => (
                    <tr key={x.key}><td>{x.label}</td><td className={`num strong ${x.direction === 'ADDITION' ? 'plus' : 'minus'}`}>{x.direction === 'ADDITION' ? '+' : '−'}{money(x.amount)}</td></tr>
                  ))}
                </tbody></table>
              ) : <p className="muted">None this year.</p>}
              <div style={{ marginTop: 14 }}>
                <button className="btn btn-sm" onClick={() => navigate('/statements')}>All statements</button>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
