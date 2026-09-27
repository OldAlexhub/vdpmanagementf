// Shared chart pieces. Colors validated with the dataviz validator:
// categorical slots (net, deductions, additions) and a one-hue ordinal ramp for tiers.
import { money } from '../format';

export const SERIES = {
  net: '#2a78d6', // slot 1 — blue
  deductions: '#eb6834', // slot 2 — orange
  additions: '#1baf7a', // slot 3 — aqua (below 3:1: always labelled / in tooltips)
  contracted: '#52514e',
};
// Ordinal blue ramp (light → dark) for incentive tiers, validated --ordinal.
export const TIER_RAMP = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#0d366b'];
export const tierColor = (i, n) => TIER_RAMP[Math.min(TIER_RAMP.length - 1, Math.round((i * (TIER_RAMP.length - 1)) / Math.max(1, n - 1)))];

export const AXIS = { stroke: '#cbd5e1', tick: { fill: '#64748b', fontSize: 12 }, tickLine: false };
export const GRID = { stroke: '#e8ecf1', vertical: false };

export const compactMoney = (v) => {
  const n = Number(v);
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `$${n.toFixed(0)}`;
};

// Tooltip card: rows of [color, label, value]. Text stays in ink colors; the swatch carries identity.
export function TipCard({ title, rows, note }) {
  return (
    <div className="chart-tip">
      {title && <div className="chart-tip-title">{title}</div>}
      {rows.filter(Boolean).map(([color, label, value, strong]) => (
        <div className="chart-tip-row" key={label}>
          {color ? <span className="chart-swatch" style={{ background: color }} /> : <span className="chart-swatch blank" />}
          <span className="chart-tip-label">{label}</span>
          <span className={`chart-tip-value ${strong ? 'strong' : ''}`}>{value}</span>
        </div>
      ))}
      {note && <div className="chart-tip-note">{note}</div>}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="chart-legend">
      {items.map(([color, label, dashed]) => (
        <span key={label} className="chart-legend-item">
          <span className={`chart-swatch ${dashed ? 'dashed' : ''}`} style={dashed ? { borderColor: color } : { background: color }} />{label}
        </span>
      ))}
    </div>
  );
}

export const moneyRow = (color, label, v, strong) => [color, label, money(v), strong];
