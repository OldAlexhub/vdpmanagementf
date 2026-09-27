// Display-only formatting of server-provided decimal strings. No arithmetic here.

const group = (intStr) => intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function money(value, { blank = '—' } = {}) {
  if (value === null || value === undefined || value === '') return blank;
  const s = String(value);
  const neg = s.startsWith('-');
  const [int, frac = ''] = s.replace('-', '').split('.');
  return `${neg ? '−' : ''}$${group(int)}.${(frac + '00').slice(0, 2)}`;
}

// Rates keep their configured precision (min 2 dp).
export function rate(value) {
  if (value === null || value === undefined || value === '') return '—';
  const [int, frac = ''] = String(value).split('.');
  return `$${group(int)}.${frac.length < 2 ? (frac + '00').slice(0, 2) : frac}`;
}

export function num(value, maxDp = 4) {
  if (value === null || value === undefined || value === '') return '—';
  const [int, frac = ''] = String(value).split('.');
  const f = frac.slice(0, maxDp).replace(/0+$/, '');
  return f ? `${group(int)}.${f}` : group(int);
}

export function pct(value) {
  if (value === null || value === undefined || value === '') return '—';
  const [int, frac = ''] = String(value).split('.');
  return `${int}.${(frac + '000').slice(0, 3)}%`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Calendar dates are stored as UTC midnight — always read them in UTC.
export function date(value, style = 'short') {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const y = d.getUTCFullYear();
  if (style === 'long') return `${MONTHS[m]} ${day}, ${y}`;
  if (style === 'md') return `${String(m + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
  return `${String(m + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}/${y}`;
}

export const dateTime = (value) => (value ? new Date(value).toLocaleString() : '—');

export const isoDate = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');

// Provider approval deadline, as the contract states it: the end of the Closed for Submission date.
export const deadlineLabel = (submissionDate) => (submissionDate ? `the end of ${date(submissionDate, 'long')}` : 'the submission deadline');

export const cycleLabel = (c) => (c ? `${date(c.cycleStart)} – ${date(c.cycleEnd)}` : '—');

export const isNegative = (value) => String(value || '').startsWith('-');

export const METRIC_LABELS = {
  TOTAL_HOURS: 'Total Hours',
  SERVICE_HOURS: 'Service Hours',
  REVENUE_HOURS: 'Revenue Hours',
  OTHER: 'Other report column',
};

export const PAYMENT_TYPE_LABELS = { HOURLY: 'Hourly', PER_TRIP: 'Per trip' };
export const LEASE_LABELS = { WEEKLY: 'week', PER_VDP_CYCLE: 'VDP cycle', NONE: '' };

// Today's calendar date in the user's local time zone (YYYY-MM-DD).
export const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
