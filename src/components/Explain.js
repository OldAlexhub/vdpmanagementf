// "Explain calculation": attainment, tier reached, and a ledger of every step — per week, then payment.
// All numbers and wording come from the server's calculation steps; nothing is computed here.
import { date, money, num, pct, rate } from '../format';
import { Card } from './ui';

function StepLedger({ steps }) {
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

// Old approved snapshots only carry text lines.
function LegacyExplain({ calc }) {
  return (
    <>
      {calc.weeks.map((w) => (
        <div className="explain" key={w.weekNumber}>
          <h4>Week {w.weekNumber}</h4>
          <ol>{w.explanation.map((line) => <li key={line}>{line}</li>)}</ol>
        </div>
      ))}
      <div className="explain"><h4>Payment</h4><ol>{calc.explanation.map((line) => <li key={line}>{line}</li>)}</ol></div>
    </>
  );
}

export default function ExplainCalculation({ calc, settings }) {
  if (!calc) return null;
  const structured = calc.steps && calc.weeks.every((w) => w.steps);
  const perTrip = settings?.paymentType?.value === 'PER_TRIP';
  const tiers = settings?.tuiEligible?.value ? settings.incentiveTiers?.value : null;
  return (
    <Card title="Explain calculation" hint="Every dollar, step by step. Each week is calculated on its own.">
      {!structured ? <LegacyExplain calc={calc} /> : (
        <div className="stack">
          <div className="calc-weeks">
            {calc.weeks.map((w) => (
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
        </div>
      )}
    </Card>
  );
}
