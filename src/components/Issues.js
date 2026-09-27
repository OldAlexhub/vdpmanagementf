import { useState } from 'react';
import { dateTime, money, num, rate } from '../format';
import { Badge, ErrorAlert, Field, Modal } from './ui';

export const ISSUE_AREAS = [
  ['TRIPS', 'Trips', true],
  ['HOURS', 'Hours worked', true],
  ['CONTRACTED_HOURS', 'Contracted hours', true],
  ['RATE', 'Rate / incentive tier', true],
  ['BONUS', 'Bonus pay', true],
  ['LIFT_LEASE', 'Lift lease', false],
  ['FARES', 'Fares collected', false],
  ['ADJUSTMENT', 'A deduction or addition', false],
  ['MISSING', 'Something is missing', false],
  ['OTHER', 'Other', false],
];
const AREA_LABEL = Object.fromEntries(ISSUE_AREAS.map(([k, l]) => [k, l]));
const HAS_WEEK = Object.fromEntries(ISSUE_AREAS.map(([k, , w]) => [k, w]));

const ADJ_LABEL = {
  FARES: 'Fares', FUEL: 'Fuel', TOLL: 'Toll', LATE_DEPLOYMENT: 'Late deployment', VIOLATION: 'Violation',
  OTHER_DEDUCTION: 'Other deduction', REIMBURSEMENT: 'Reimbursement', OTHER_INCOME: 'Other income',
};

// What the statement shows for a line — read straight from the statement (display only).
function shownPreview(view, it) {
  const c = view?.calculation;
  if (!c) return '';
  const weeks = it.week ? [c.weeks[Number(it.week) - 1]].filter(Boolean) : c.weeks;
  const each = (fn) => weeks.map((w) => (it.week ? fn(w) : `Wk ${w.weekNumber}: ${fn(w)}`)).join(' · ');
  switch (it.area) {
    case 'TRIPS': return each((w) => `${num(w.trips)} trips`);
    case 'HOURS': return each((w) => `${num(w.actualHours)} h`);
    case 'CONTRACTED_HOURS': return each((w) => `${num(w.contractedHours)} h`);
    case 'RATE': return each((w) => rate(w.incentiveRate));
    case 'BONUS': return each((w) => money(w.bonusEarnings));
    case 'LIFT_LEASE': return money(c.lease);
    case 'FARES': return money(c.fares);
    case 'ADJUSTMENT': {
      const a = view.adjustments?.[it.adjustmentIndex];
      return a ? `${ADJ_LABEL[a.type] || a.type} ${money(a.amount)}` : '';
    }
    default: return '';
  }
}

export function IssueList({ issues, staff }) {
  if (!issues?.length) return null;
  return (
    <div>
      {[...issues].reverse().map((issue, n) => {
        const r = issue.response;
        const resolved = issue.status === 'RESOLVED';
        return (
          <div className="issue" key={issue._id || n}>
            <div className="issue-head">
              <div>
                <strong>Issue reported {dateTime(issue.raisedAt)}</strong>
                <span className="muted small"> · {issue.raisedBy?.name}</span>
              </div>
              {issue.status === 'OPEN' && <Badge tone="bad" dot>Waiting for Big Star</Badge>}
              {issue.status === 'IN_CORRECTION' && <Badge tone="warn" dot>Being corrected</Badge>}
              {resolved && (r?.action === 'CORRECTED' ? <Badge tone="ok" dot>Corrected</Badge> : <Badge tone="info" dot>Answered — no change</Badge>)}
            </div>
            <div className="table-wrap">
              <table className="table-compact">
                <thead><tr><th>What is wrong</th><th>Statement shows</th><th>Should be</th><th>Why</th></tr></thead>
                <tbody>
                  {issue.items.map((it, i) => (
                    <tr key={i}>
                      <td className="strong">{it.areaLabel || AREA_LABEL[it.area]}{it.week ? ` · week ${it.week}` : ''}</td>
                      <td>{it.shownValue || '—'}</td>
                      <td className="strong">{it.expectedValue || '—'}</td>
                      <td>{it.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {issue.comment && <div className="issue-comment"><span className="muted">Comment: </span>{issue.comment}</div>}
            {r?.action && (resolved || staff) && (
              <div className={`issue-response ${r.action === 'CORRECTED' ? 'corrected' : ''}`}>
                <div className="small strong" style={{ marginBottom: 3 }}>
                  {r.action === 'CORRECTED' ? 'Big Star corrected the statement' : 'Big Star response'}
                  {staff && r.by?.name ? ` · ${r.by.name}` : ''}{r.at ? ` · ${dateTime(r.at)}` : ''}
                </div>
                <div>{r.message}</div>
                {r.action === 'CORRECTED' && resolved && issue.netAtRaise && r.newNet && (
                  <div className="small" style={{ marginTop: 4 }}>Net payment {money(issue.netAtRaise)} → <strong>{money(r.newNet)}</strong></div>
                )}
                {!resolved && staff && <div className="small muted" style={{ marginTop: 4 }}>The provider sees this once the corrected VDP is approved again.</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const blankLine = () => ({ area: '', week: '', adjustmentIndex: '', expectedValue: '', reason: '' });

export function ReportIssueModal({ vdp, onClose, onSubmit }) {
  const view = vdp.view;
  const [lines, setLines] = useState([blankLine()]);
  const [comment, setComment] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const update = (i, patch) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const ready = lines.every((l) => l.area && l.reason.trim().length >= 5 && (l.area !== 'ADJUSTMENT' || l.adjustmentIndex !== ''));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        comment,
        items: lines.map((l) => ({ ...l, week: l.week ? Number(l.week) : null, adjustmentIndex: l.adjustmentIndex === '' ? null : Number(l.adjustmentIndex) })),
      });
      onClose();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Modal wide title="Report an issue with this statement" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger" disabled={!ready || busy} onClick={submit}>{busy ? 'Sending…' : 'Send to Big Star'}</button>
      </>}>
      <div className="stack">
        <p className="small">
          Tell us exactly what is wrong and why. Add a line for each item. While Big Star reviews your issue the statement
          will <strong>not</strong> be auto-approved; you will see the answer here.
        </p>
        {lines.map((l, i) => (
          <div className="issue-line" key={i}>
            <Field label="What is wrong" htmlFor={`is-area-${i}`}>
              <select id={`is-area-${i}`} value={l.area} onChange={(e) => update(i, { area: e.target.value, week: '', adjustmentIndex: '' })}>
                <option value="">Choose…</option>
                {ISSUE_AREAS.map(([k, label]) => <option key={k} value={k} disabled={k === 'ADJUSTMENT' && !view.adjustments?.length}>{label}</option>)}
              </select>
            </Field>
            {HAS_WEEK[l.area] ? (
              <Field label="Week" htmlFor={`is-week-${i}`}>
                <select id={`is-week-${i}`} value={l.week} onChange={(e) => update(i, { week: e.target.value })}>
                  <option value="">Both weeks</option>
                  {view.calculation?.weeks.map((w) => <option key={w.weekNumber} value={w.weekNumber}>Week {w.weekNumber}</option>)}
                </select>
              </Field>
            ) : l.area === 'ADJUSTMENT' ? (
              <Field label="Which one" htmlFor={`is-adj-${i}`}>
                <select id={`is-adj-${i}`} value={l.adjustmentIndex} onChange={(e) => update(i, { adjustmentIndex: e.target.value })}>
                  <option value="">Choose…</option>
                  {view.adjustments.map((a, j) => <option key={j} value={j}>{ADJ_LABEL[a.type]} {money(a.amount)}{a.description ? ` — ${a.description}` : ''}</option>)}
                </select>
              </Field>
            ) : <div />}
            <Field label="Should be" htmlFor={`is-exp-${i}`} help={l.area && shownPreview(view, l) ? `Statement shows ${shownPreview(view, l)}` : undefined}>
              <input id={`is-exp-${i}`} value={l.expectedValue} onChange={(e) => update(i, { expectedValue: e.target.value })} placeholder="e.g. 66 trips" />
            </Field>
            <Field label="Why — explain what happened" htmlFor={`is-why-${i}`}>
              <textarea id={`is-why-${i}`} rows={2} value={l.reason} onChange={(e) => update(i, { reason: e.target.value })}
                placeholder="e.g. Two trips on 08/27 were completed but are missing from the report" />
            </Field>
            <div style={{ paddingTop: 22 }}>
              {lines.length > 1 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</button>}
            </div>
          </div>
        ))}
        <div><button type="button" className="btn btn-sm" onClick={() => setLines([...lines, blankLine()])} disabled={lines.length >= 20}>Add another line</button></div>
        <Field label="Anything else? (optional)" htmlFor="is-comment">
          <textarea id="is-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
        <ErrorAlert error={error} />
      </div>
    </Modal>
  );
}
