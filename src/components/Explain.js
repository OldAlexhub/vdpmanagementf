// "Explain calculation": attainment, tier reached, and a ledger of every step — per week, then payment.
// All numbers and wording come from the server's calculation steps; nothing is computed here.
import { useState } from 'react';
import { date, money, num, pct, rate } from '../format';
import { Card } from './ui';

function StepLedger({ steps = [] }) {
  return (
    <table className="calc-ledger">
      <tbody>
        {steps.map((s, i) => (
          <tr key={i} className={`tone-${s.tone}`}>
            <td className="calc-label">{s.label}</td>
            <td className="calc-detail">{s.detail}</td>
            <td className="calc-value">{s.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Attainment({ week }) {
  if (week.performancePercentage === null || week.performancePercentage === undefined) return null;
  const p = Number(week.performancePercentage);
  const fill = Math.min(p, 100);
  const over = Math.max(0, Math.min(p - 100, 50));
  return (
    <div className="attain">
      <div className="attain-head">
        <span><strong>{num(week.actualHours)} h</strong> of {num(week.contractedHours)} h contracted</span>
        <span className={`attain-pct ${p >= 100 ? 'ok' : ''}`}>{pct(week.performancePercentage)}</span>
      </div>
      <div className="attain-bar" aria-hidden>
        <div className="attain-fill" style={{ width: `${(fill / 150) * 100}%` }} />
        {over > 0 && <div className="attain-over" style={{ left: `${(100 / 150) * 100}%`, width: `${(over / 150) * 100}%` }} />}
        {[80, 87, 95, 100].map((m) => <span key={m} className="attain-mark" style={{ left: `${(m / 150) * 100}%` }} />)}
      </div>
      {Number(week.bonusHours) > 0 && <div className="attain-note">+{num(week.bonusHours)} h above contract paid at the bonus rate</div>}
    </div>
  );
}

function TierLadder({ tiers, reached, perTrip }) {
  if (!tiers?.length) return null;
  return (
    <div className="tier-ladder" role="list" aria-label="Incentive tiers">
      {tiers.map((t, i) => (
        <div key={i} role="listitem" className={`tier ${i === reached ? 'reached' : ''}`}>
          <div className="tier-range">{t.maximumPercentage ? `${num(t.minimumPercentage)}–${num(t.maximumPercentage)}%` : `${num(t.minimumPercentage)}%+`}</div>
          <div className="tier-rate">{rate(t.rate)}{perTrip ? '/trip' : '/h'}</div>
        </div>
      ))}
    </div>
  );
}

// Service mile fuel allowance: how the maximum was reached, and the day-by-day detail on request.
function FuelAllowance({ fuel, overspend }) {
  const [open, setOpen] = useState(false);
  const entered = fuel.actualExpense !== null;
  const byOperator = fuel.days.some((d) => d.operator);
  const over = Number(overspend) > 0;
  const steps = [
    { label: 'Service miles', detail: `Performance Report (Miles → Service) · week 1 ${num(fuel.weekMiles[0])} + week 2 ${num(fuel.weekMiles[1])}`, value: num(fuel.serviceMiles), tone: 'info' },
    { label: 'Fuel efficiency', detail: fuel.mpg ? 'VDP plan' : 'Each operator’s VDP plan', value: `${fuel.mpg ? num(fuel.mpg) : fuel.mpgs.join(' / ')} MPG`, tone: 'info' },
    { label: 'Allowed gallons', detail: fuel.mpg ? `${num(fuel.serviceMiles)} miles ÷ ${num(fuel.mpg)} MPG` : 'Each operator’s miles ÷ their MPG', value: Number(fuel.gallons).toFixed(4), tone: 'info' },
    {
      label: 'Fuel price',
      detail: fuel.pricesUsed.length > 1 ? 'Price in effect on each service date (changes during this cycle)' : 'Price in effect on each service date',
      value: fuel.pricesUsed.map((p) => `${rate(p)}/gal`).join(', '),
      tone: 'info',
    },
    { label: 'Maximum allowed fuel', detail: 'Sum of each day’s gallons × that day’s price', value: money(fuel.maxAllowed), tone: 'subtotal' },
    { label: 'Actual fuel expense', detail: 'Entered by Accounting', value: entered ? money(fuel.actualExpense) : 'Not entered', tone: 'info' },
    entered && over
      ? { label: 'Fuel overspend', detail: `${money(fuel.actualExpense)} actual − ${money(fuel.maxAllowed)} maximum`, value: `−${money(overspend)}`, tone: 'minus' }
      : { label: 'Fuel overspend', detail: entered ? `Within the allowance (${money(fuel.unused)} unused — not paid out)` : 'Calculated once the actual expense is entered', value: money(0), tone: 'info' },
    { label: 'Fuel deduction', detail: 'Deducted from the VDP', value: over ? `−${money(overspend)}` : money(0), tone: 'total' },
  ];
  return (
    <section className="calc-week calc-payment">
      <header>
        <div className="calc-week-title">Fuel allowance</div>
        <div className="calc-week-total">{over ? `−${money(overspend)}` : money(0)}</div>
      </header>
      <StepLedger steps={steps} />
      <button type="button" className="btn btn-ghost btn-sm no-print" style={{ marginTop: 8 }} onClick={() => setOpen(!open)}>
        {open ? 'Hide' : 'Show'} daily fuel calculation
      </button>
      {open && (
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="table-compact">
            <thead><tr><th>Date</th>{byOperator && <th>Operator</th>}<th className="num">Service miles</th><th className="num">MPG</th><th className="num">Allowed gallons</th><th className="num">Fuel price</th><th className="num">Allowed fuel</th></tr></thead>
            <tbody>
              {fuel.days.map((d) => (
                <tr key={`${d.date}-${d.operator || ''}`}>
                  <td>{date(d.date)}</td>
                  {byOperator && <td>{d.operator}</td>}
                  <td className="num">{num(d.serviceMiles)}</td>
                  <td className="num">{num(d.mpg)}</td>
                  <td className="num">{Number(d.gallons).toFixed(6)}</td>
                  <td className="num">{rate(d.pricePerGallon)}</td>
                  <td className="num">{Number(d.allowed).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>Total</td>{byOperator && <td />}<td className="num">{num(fuel.serviceMiles)}</td><td /><td className="num">{Number(fuel.gallons).toFixed(6)}</td><td /><td className="num">{money(fuel.maxAllowed)}</td></tr>
            </tfoot>
          </table>
          <p className="muted small" style={{ marginTop: 6 }}>Daily amounts keep full precision; only the total is rounded to the cent.</p>
        </div>
      )}
    </section>
  );
}

// Old approved snapshots only carry text lines.
function LegacyExplain({ calc }) {
  const weeks = Array.isArray(calc.weeks) ? calc.weeks : [];
  const payment = Array.isArray(calc.explanation) ? calc.explanation : [];
  return (
    <>
      {weeks.map((w) => (
        <div className="explain" key={w.weekNumber}>
          <h4>Week {w.weekNumber}</h4>
          <ol>{(Array.isArray(w.explanation) ? w.explanation : []).map((line) => <li key={line}>{line}</li>)}</ol>
        </div>
      ))}
      {payment.length > 0 && <div className="explain"><h4>Payment</h4><ol>{payment.map((line) => <li key={line}>{line}</li>)}</ol></div>}
    </>
  );
}

function UberExplain({ calc }) {
  const steps = Array.isArray(calc.steps) ? calc.steps : [];
  if (!steps.length) return <LegacyExplain calc={calc} />;
  return (
    <div className="stack">
      <section className="calc-week calc-payment">
        <header>
          <div className="calc-week-title">Uber payment summary</div>
          <div className="calc-week-total">{money(calc.net)}</div>
        </header>
        <StepLedger steps={steps} />
        <p className="muted small" style={{ marginTop: 8 }}>Open Details on a driver/week above for its qualification, tiers, and Gross calculation.</p>
      </section>
    </div>
  );
}

export default function ExplainCalculation({ calc, settings }) {
  if (!calc) return null;
  const weeks = Array.isArray(calc.weeks) ? calc.weeks : [];
  const uber = calc.calculationType === 'UBER';
  const structured = Array.isArray(calc.steps) && weeks.length > 0 && weeks.every((w) => Array.isArray(w.steps));
  const perTrip = settings?.paymentType?.value === 'PER_TRIP';
  const tiers = settings?.tuiEligible?.value ? settings.incentiveTiers?.value : null;
  return (
    <Card title="Explain calculation" hint="Every dollar, step by step. Each week is calculated on its own.">
      {uber ? <UberExplain calc={calc} /> : !structured ? <LegacyExplain calc={calc} /> : (
        <div className="stack">
          <div className="calc-weeks">
            {weeks.map((w) => (
              <section key={w.weekNumber} className="calc-week">
                <header>
                  <div>
                    <div className="calc-week-title">Week {w.weekNumber}</div>
                    <div className="muted small">{date(w.start, 'md')} – {date(w.end, 'md')}</div>
                  </div>
                  <div className="calc-week-total">{money(w.weeklyEarnings)}</div>
                </header>
                {!perTrip && <Attainment week={w} />}
                {tiers && <TierLadder tiers={tiers} reached={w.tierIndex} perTrip={perTrip} />}
                <StepLedger steps={w.steps} />
              </section>
            ))}
          </div>
          <section className="calc-week calc-payment">
            <header>
              <div className="calc-week-title">Payment</div>
              <div className="calc-week-total">{money(calc.net)}</div>
            </header>
            <StepLedger steps={calc.steps} />
          </section>
          {calc.fuelAllowance && <FuelAllowance fuel={calc.fuelAllowance} overspend={calc.fuelOverspend} />}
        </div>
      )}
    </Card>
  );
}
