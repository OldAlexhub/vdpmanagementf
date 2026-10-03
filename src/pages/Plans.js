import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App';
import { date, isoDate, rate, num, pct, METRIC_LABELS, PAYMENT_TYPE_LABELS } from '../format';
import { ActiveBadge, Alert, Badge, Card, Empty, ErrorAlert, Field, Loading, Modal, PageHead, useLoad, useToast } from '../components/ui';
import BulkImport from '../components/BulkImport';

const blankTier = () => ({ minimumPercentage: '', maximumPercentage: '', rate: '' });
const DEFAULT_TIERS = [
  { minimumPercentage: '0', maximumPercentage: '79.99', rate: '' },
  { minimumPercentage: '80', maximumPercentage: '86.99', rate: '' },
  { minimumPercentage: '87', maximumPercentage: '94.99', rate: '' },
  { minimumPercentage: '95', maximumPercentage: '99.99', rate: '' },
  { minimumPercentage: '100', maximumPercentage: '', rate: '' },
];

const DEFAULT_UBER_CONFIG = {
  coreRatePct: '0.65', approvedExtraHours: '0',
  contractHoursIncentiveTiers: [
    { minimum: '0.94', rate: '0.05' }, { minimum: '0.96', rate: '0.10' }, { minimum: '0.98', rate: '0.20' },
  ],
  acceptanceIncentiveTiers: [{ minimum: '0.92', rate: '0.05' }, { minimum: '0.95', rate: '0.10' }],
  cancellationIncentiveTiers: [{ maximum: '0.04', rate: '0.10' }, { maximum: '0.05', rate: '0.05' }],
  utilizationTarget: '0.70', utilizationIncentivePct: '0.05', coreHoursRequirement: '0.60',
};

export function TierTable({ tiers, compact }) {
  if (!tiers?.length) return <p className="muted">No incentive tiers.</p>;
  return (
    <table className={compact ? 'table-compact' : ''}>
      <thead><tr><th>Performance (% of contracted hours)</th><th className="num">Rate</th></tr></thead>
      <tbody>
        {tiers.map((t) => (
          <tr key={t.minimumPercentage}>
            <td>{t.maximumPercentage ? `${num(t.minimumPercentage)}% – ${num(t.maximumPercentage)}%` : `${num(t.minimumPercentage)}% and above`}</td>
            <td className="num strong">{rate(t.rate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TierEditor({ tiers, onChange }) {
  const update = (i, k, v) => onChange(tiers.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
  return (
    <div className="stack">
      <table className="table-compact">
        <thead><tr><th>From %</th><th>To %</th><th>Rate ($)</th><th /></tr></thead>
        <tbody>
          {tiers.map((t, i) => (
            <tr key={i}>
              <td><input aria-label={`Tier ${i + 1} from`} value={t.minimumPercentage} onChange={(e) => update(i, 'minimumPercentage', e.target.value)} /></td>
              <td><input aria-label={`Tier ${i + 1} to`} value={t.maximumPercentage ?? ''} placeholder={i === tiers.length - 1 ? 'and above' : ''} onChange={(e) => update(i, 'maximumPercentage', e.target.value)} /></td>
              <td><input aria-label={`Tier ${i + 1} rate`} value={t.rate} onChange={(e) => update(i, 'rate', e.target.value)} /></td>
              <td className="num"><button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(tiers.filter((_, j) => j !== i))}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="actions">
        <button type="button" className="btn btn-sm" onClick={() => onChange([...tiers, blankTier()])}>Add tier</button>
        {!tiers.length && <button type="button" className="btn btn-sm" onClick={() => onChange(DEFAULT_TIERS)}>Start from 80/87/95/100% layout</button>}
      </div>
      <p className="help muted small">
        Tiers are chosen by range: the highest tier whose “From %” is at or below the result. Leave “To %” blank on the last tier.
        Rates keep the precision you enter (up to 4 decimals).
      </p>
    </div>
  );
}

// Versions saved before the fuel method existed only had the per-trip switch.
export const fuelMethodOf = (v) => v?.fuelMethod || (v?.fuelReimbursementEnabled ? 'PER_TRIP' : 'NONE');
export const FUEL_METHOD_LABELS = { NONE: 'None', PER_TRIP: 'Per trip reimbursement', SERVICE_MILE_ALLOWANCE: 'Service mile allowance' };

export function fuelSummary(v) {
  const m = fuelMethodOf(v);
  if (m === 'PER_TRIP') return `${rate(v.fuelReimbursementRate)} / trip reimbursement`;
  if (m === 'SERVICE_MILE_ALLOWANCE') return `Service mile allowance · ${num(v.fuelMpg)} MPG × fuel price by date`;
  return 'None';
}

// Fuel price per gallon by date (service mile allowance). Blank "To" = open-ended.
const blankPrice = () => ({ pricePerGallon: '', effectiveFrom: '', effectiveTo: '' });
const priceForm = (list) => (list || []).map((p) => ({ _id: p._id, pricePerGallon: p.pricePerGallon || '', effectiveFrom: p.effectiveFrom || '', effectiveTo: p.effectiveTo || '' }))
  .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

function FuelPriceRows({ prices, onChange }) {
  const update = (i, k, val) => onChange(prices.map((p, j) => (j === i ? { ...p, [k]: val } : p)));
  return (
    <div className="stack">
      <table className="table-compact">
        <thead><tr><th>Fuel price ($/gallon)</th><th>From</th><th>To</th><th /></tr></thead>
        <tbody>
          {prices.map((p, i) => (
            <tr key={p._id || i}>
              <td><input aria-label={`Fuel price ${i + 1}`} value={p.pricePerGallon} onChange={(e) => update(i, 'pricePerGallon', e.target.value)} placeholder="4.794" style={{ width: 100 }} /></td>
              <td><input aria-label={`Fuel price ${i + 1} from`} type="date" value={p.effectiveFrom} onChange={(e) => update(i, 'effectiveFrom', e.target.value)} /></td>
              <td><input aria-label={`Fuel price ${i + 1} to`} type="date" value={p.effectiveTo} onChange={(e) => update(i, 'effectiveTo', e.target.value)} /></td>
              <td className="num"><button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(prices.filter((_, j) => j !== i))}>Remove</button></td>
            </tr>
          ))}
          {!prices.length && <tr><td colSpan={4} className="muted small">No fuel prices yet. Every service date needs a price.</td></tr>}
        </tbody>
      </table>
      <div className="actions"><button type="button" className="btn btn-sm" onClick={() => onChange([...prices, blankPrice()])}>Add fuel price</button></div>
      <p className="help muted small">Each service date uses the price whose dates cover it, so a cycle can span two prices (e.g. $4.794 to 08/31, $4.9249 from 09/01). Leave “To” blank on the latest price.</p>
    </div>
  );
}

function FuelPricesModal({ plan, onClose, onSaved }) {
  const [prices, setPrices] = useState(() => priceForm(plan.fuelPrices));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError(null);
    try { onSaved(await api.put(`/vdp-plans/${plan._id}/fuel-prices`, { fuelPrices: prices })); } catch (e) { setError(e); setBusy(false); }
  };
  return (
    <Modal title={`Fuel prices — ${plan.name}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>Save fuel prices</button></>}>
      <div className="stack">
        <FuelPriceRows prices={prices} onChange={setPrices} />
        <p className="muted small">Open VDPs are recalculated with the new prices. Approved VDPs keep the prices they were calculated with.</p>
        <ErrorAlert error={error} />
      </div>
    </Modal>
  );
}

const versionForm = (v) => ({
  calculationType: v?.calculationType || 'STANDARD',
  paymentType: v?.paymentType || 'HOURLY',
  basePay: v?.basePay || '',
  contractedHours: v?.contractedHours || '',
  incentiveEnabled: v?.incentiveEnabled ?? false,
  incentiveTiers: (v?.incentiveTiers || []).map((t) => ({ ...t, maximumPercentage: t.maximumPercentage ?? '' })),
  bonusEnabled: v?.bonusEnabled ?? false,
  bonusRate: v?.bonusRate || '',
  fuelMethod: fuelMethodOf(v),
  fuelReimbursementRate: v?.fuelReimbursementRate || '',
  fuelMpg: v?.fuelMpg || '',
  fuelMileageSource: v?.fuelMileageSource || 'SERVICE_MILES',
  performanceHourMetric: v?.performanceHourMetric || 'TOTAL_HOURS',
  performanceHourColumn: v?.performanceHourColumn || '',
  uberConfig: v?.uberConfig ? {
    ...DEFAULT_UBER_CONFIG,
    ...v.uberConfig,
    contractHoursIncentiveTiers: (v.uberConfig.contractHoursIncentiveTiers || []).map((t) => ({ ...t })),
    acceptanceIncentiveTiers: (v.uberConfig.acceptanceIncentiveTiers || []).map((t) => ({ ...t })),
    cancellationIncentiveTiers: (v.uberConfig.cancellationIncentiveTiers || []).map((t) => ({ ...t })),
  } : { ...DEFAULT_UBER_CONFIG,
    contractHoursIncentiveTiers: DEFAULT_UBER_CONFIG.contractHoursIncentiveTiers.map((t) => ({ ...t })),
    acceptanceIncentiveTiers: DEFAULT_UBER_CONFIG.acceptanceIncentiveTiers.map((t) => ({ ...t })),
    cancellationIncentiveTiers: DEFAULT_UBER_CONFIG.cancellationIncentiveTiers.map((t) => ({ ...t })),
  },
  effectiveFrom: isoDate(v?.effectiveFrom) || '',
  effectiveTo: isoDate(v?.effectiveTo) || '',
  notes: v?.notes || '',
});

function UberTierEditor({ title, tiers, thresholdKey, thresholdLabel, onChange }) {
  const update = (i, key, value) => onChange(tiers.map((tier, index) => (index === i ? { ...tier, [key]: value } : tier)));
  return (
    <div>
      <h4 style={{ margin: '8px 0 6px' }}>{title}</h4>
      <table className="table-compact">
        <thead><tr><th>{thresholdLabel}</th><th>Incentive rate</th><th /></tr></thead>
        <tbody>
          {tiers.map((tier, i) => (
            <tr key={i}>
              <td><input aria-label={`${title} tier ${i + 1} threshold`} value={tier[thresholdKey]} onChange={(e) => update(i, thresholdKey, e.target.value)} placeholder="0.95" /></td>
              <td><input aria-label={`${title} tier ${i + 1} rate`} value={tier.rate} onChange={(e) => update(i, 'rate', e.target.value)} placeholder="0.10" /></td>
              <td className="num"><button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(tiers.filter((_, index) => index !== i))}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => onChange([...tiers, { [thresholdKey]: '', rate: '' }])}>Add tier</button>
    </div>
  );
}

function UberConfigFields({ value, onChange }) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });
  const tiers = (key) => (next) => onChange({ ...value, [key]: next });
  return (
    <div className="card card-body">
      <h3 style={{ margin: '0 0 4px' }}>Uber compensation configuration</h3>
      <p className="muted small" style={{ margin: '0 0 10px' }}>Enter percentages as ratios: 0.65 = 65%. Every value is frozen with the plan version used by the VDP.</p>
      <div className="form-grid">
        <Field label="Core rate percentage" htmlFor="uber-core"><input id="uber-core" value={value.coreRatePct} onChange={set('coreRatePct')} placeholder="0.65" /></Field>
        <Field label="Approved extra hours default" htmlFor="uber-extra" help="Can be overridden for an individual driver/week during VDP review."><input id="uber-extra" value={value.approvedExtraHours} onChange={set('approvedExtraHours')} placeholder="0" /></Field>
        <Field label="Utilization target" htmlFor="uber-util-target"><input id="uber-util-target" value={value.utilizationTarget} onChange={set('utilizationTarget')} placeholder="0.70" /></Field>
        <Field label="Utilization incentive percentage" htmlFor="uber-util-rate"><input id="uber-util-rate" value={value.utilizationIncentivePct} onChange={set('utilizationIncentivePct')} placeholder="0.05" /></Field>
        <Field label="Core hours requirement" htmlFor="uber-core-hours" help="Calculated and flagged only; it does not change Gross VDP."><input id="uber-core-hours" value={value.coreHoursRequirement} onChange={set('coreHoursRequirement')} placeholder="0.60" /></Field>
      </div>
      <div className="grid grid-3" style={{ alignItems: 'start', marginTop: 10 }}>
        <UberTierEditor title="Contract-hours tiers" tiers={value.contractHoursIncentiveTiers} thresholdKey="minimum" thresholdLabel="Minimum fulfillment" onChange={tiers('contractHoursIncentiveTiers')} />
        <UberTierEditor title="Acceptance tiers" tiers={value.acceptanceIncentiveTiers} thresholdKey="minimum" thresholdLabel="Minimum acceptance" onChange={tiers('acceptanceIncentiveTiers')} />
        <UberTierEditor title="Cancellation tiers" tiers={value.cancellationIncentiveTiers} thresholdKey="maximum" thresholdLabel="Maximum cancellation" onChange={tiers('cancellationIncentiveTiers')} />
      </div>
    </div>
  );
}

function VersionFields({ form, setForm, showDates = true }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const hourly = form.paymentType === 'HOURLY';
  const uber = form.calculationType === 'UBER';
  return (
    <div className="stack">
      <div className="form-grid">
        <Field label="Plan / service type" htmlFor="v-calc-type" help="Selects the backend calculation engine and source-data workflow.">
          <select id="v-calc-type" value={form.calculationType} onChange={(e) => setForm({ ...form, calculationType: e.target.value, ...(e.target.value === 'UBER' ? { paymentType: 'HOURLY', basePay: '', contractedHours: '', incentiveEnabled: false, bonusEnabled: false, fuelMethod: 'NONE' } : {}) })}>
            <option value="STANDARD">Standard hourly or per-trip</option>
            <option value="UBER">Uber</option>
          </select>
        </Field>
        {!uber && <Field label="Payment type" htmlFor="v-type">
          <select id="v-type" value={form.paymentType} onChange={(e) => setForm({ ...form, paymentType: e.target.value, bonusEnabled: e.target.value === 'HOURLY' && form.bonusEnabled })}>
            <option value="HOURLY">Hourly — paid on hours performed</option>
            <option value="PER_TRIP">Per trip — paid on trips provided</option>
          </select>
        </Field>}
        {!uber && <Field label={hourly ? 'Base pay ($/hour)' : 'Base pay ($/trip)'} htmlFor="v-base" help="Paid when TUI does not apply.">
          <input id="v-base" value={form.basePay} onChange={set('basePay')} placeholder={hourly ? '25.97' : '21.50'} />
        </Field>}
        {!uber && <Field label="Contracted hours per week" htmlFor="v-hours" help={hourly ? 'Required for hourly plans.' : 'Optional for per-trip plans (needed only for TUI).'}>
          <input id="v-hours" value={form.contractedHours} onChange={set('contractedHours')} placeholder="40" />
        </Field>}
        {!uber && <Field label="Performance hours come from" htmlFor="v-metric" help="Which Performance Report column counts as hours worked.">
          <select id="v-metric" value={form.performanceHourMetric} onChange={set('performanceHourMetric')}>
            {Object.entries(METRIC_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>}
        {!uber && form.performanceHourMetric === 'OTHER' && (
          <Field label="Report column name (Hours section)" htmlFor="v-col" full>
            <input id="v-col" value={form.performanceHourColumn} onChange={set('performanceHourColumn')} placeholder="e.g. Slk Time (mins)" />
          </Field>
        )}
        {showDates && (
          <>
            <Field label="Effective from" htmlFor="v-from"><input id="v-from" type="date" value={form.effectiveFrom} onChange={set('effectiveFrom')} /></Field>
            <Field label="Effective to" htmlFor="v-to" help="Leave blank if open-ended."><input id="v-to" type="date" value={form.effectiveTo} onChange={set('effectiveTo')} /></Field>
          </>
        )}
      </div>

      {uber ? <UberConfigFields value={form.uberConfig} onChange={(uberConfig) => setForm({ ...form, uberConfig })} /> : <>
      <div className="card card-body">
        <label className="check"><input type="checkbox" checked={form.incentiveEnabled} onChange={set('incentiveEnabled')} /> TUI (Top-Up Incentive) eligible</label>
        <p className="muted small" style={{ margin: '4px 0 10px 24px' }}>
          When on, the weekly rate comes from the incentive tiers below. When off, everyone on this plan is paid the base pay.
          Individual providers can still be switched on or off on their profile.
        </p>
        {(form.incentiveEnabled || form.incentiveTiers.length > 0) && (
          <TierEditor tiers={form.incentiveTiers} onChange={(incentiveTiers) => setForm({ ...form, incentiveTiers })} />
        )}
      </div>

      {hourly && (
        <div className="card card-body">
          <label className="check"><input type="checkbox" checked={form.bonusEnabled} onChange={set('bonusEnabled')} /> Pay bonus rate for hours above contracted hours</label>
          {form.bonusEnabled && (
            <div className="form-grid" style={{ marginTop: 10 }}>
              <Field label="Bonus rate ($/hour)" htmlFor="v-bonus" help="Separate from the incentive tiers.">
                <input id="v-bonus" value={form.bonusRate} onChange={set('bonusRate')} placeholder="34.62" />
              </Field>
            </div>
          )}
        </div>
      )}
      <div className="card card-body">
        <h3 style={{ margin: '0 0 8px' }}>Fuel</h3>
        <div className="form-grid">
          <Field label="Fuel method" htmlFor="v-fuel-method">
            <select id="v-fuel-method" value={form.fuelMethod} onChange={set('fuelMethod')}>
              {Object.entries(FUEL_METHOD_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          {form.fuelMethod === 'PER_TRIP' && (
            <Field label="Fuel reimbursement ($/trip)" htmlFor="v-fuel" help="Up to 4 decimals.">
              <input id="v-fuel" value={form.fuelReimbursementRate} onChange={set('fuelReimbursementRate')} placeholder="2.50" />
            </Field>
          )}
          {form.fuelMethod === 'SERVICE_MILE_ALLOWANCE' && (
            <>
              <Field label="Fuel efficiency (MPG)" htmlFor="v-mpg" help="Allowed gallons = service miles ÷ this number. Providers can override it on their profile.">
                <input id="v-mpg" value={form.fuelMpg} onChange={set('fuelMpg')} placeholder="19" />
              </Field>
              <Field label="Mileage source" htmlFor="v-miles">
                <select id="v-miles" value={form.fuelMileageSource} onChange={set('fuelMileageSource')}>
                  <option value="SERVICE_MILES">Service miles (Performance Report: Miles → Service)</option>
                </select>
              </Field>
            </>
          )}
        </div>
        <p className="muted small" style={{ margin: '6px 0 0' }}>
          {form.fuelMethod === 'NONE' && 'No fuel reimbursement or fuel deduction.'}
          {form.fuelMethod === 'PER_TRIP' && 'Trips in the cycle × this rate is added to the VDP after Gross.'}
          {form.fuelMethod === 'SERVICE_MILE_ALLOWANCE' && <>
            Each service date: service miles ÷ {form.fuelMpg || 'MPG'} = allowed gallons × that day’s fuel price = allowed fuel.
            Accounting enters the provider’s actual fuel expense on the VDP; only the amount above the maximum is deducted.
          </>}
        </p>
        {form.fuelMethod === 'SERVICE_MILE_ALLOWANCE' && form.fuelPrices && (
          <div style={{ marginTop: 10 }}>
            <FuelPriceRows prices={form.fuelPrices} onChange={(fuelPrices) => setForm({ ...form, fuelPrices })} />
          </div>
        )}
      </div>
      </>}
      <Field label="Notes" htmlFor="v-notes"><textarea id="v-notes" value={form.notes} onChange={set('notes')} /></Field>
    </div>
  );
}

function VersionModal({ plan, version, mode, onClose, onSaved }) {
  // mode: 'create-plan' | 'add' | 'edit'
  const [form, setForm] = useState(() => {
    const f = { ...versionForm(version), fuelPrices: priceForm(plan?.fuelPrices) };
    if (mode === 'add') { f.effectiveFrom = ''; f.effectiveTo = ''; f.notes = ''; }
    return f;
  });
  const [meta, setMeta] = useState({ name: '', divisionId: plan?.divisionId || '', notes: '' });
  const divisions = useLoad(() => (mode === 'create-plan' ? api.get('/divisions') : Promise.resolve([])), [mode]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      let saved;
      // Fuel prices belong to the plan; they are saved with the fuel options when the allowance is used.
      const { fuelPrices, ...rules } = form;
      const body = form.fuelMethod === 'SERVICE_MILE_ALLOWANCE' ? { ...rules, fuelPrices } : rules;
      if (mode === 'create-plan') saved = await api.post('/vdp-plans', { ...meta, version: rules, ...(body.fuelPrices ? { fuelPrices } : {}) });
      else if (mode === 'add') saved = await api.post(`/vdp-plans/${plan._id}/versions`, body);
      else saved = await api.put(`/vdp-plans/${plan._id}/versions/${version._id}`, body);
      onSaved(saved);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  const title = mode === 'create-plan' ? 'New VDP plan' : mode === 'add' ? `New version of ${plan.name}` : `Edit ${plan.name} v${version.versionNumber}`;
  return (
    <Modal wide title={title} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>{mode === 'create-plan' ? 'Create plan' : 'Save version'}</button></>}>
      <div className="stack">
        {mode === 'add' && <Alert tone="info">The new version starts on its effective date. The current version will automatically end the day before. VDPs already approved keep the rules they were calculated with.</Alert>}
        {mode === 'edit' && <Alert tone="warn">Editing corrects this version in place. It is only allowed because no approved VDP uses it yet.</Alert>}
        {mode === 'create-plan' && (
          <div className="form-grid">
            <Field label="Division" htmlFor="p-div">
              <select id="p-div" value={meta.divisionId} onChange={(e) => setMeta({ ...meta, divisionId: e.target.value })}>
                <option value="">Choose…</option>
                {(divisions.data || []).map((d) => <option key={d._id} value={d._id}>DIV {d.divisionNumber} – {d.name}</option>)}
              </select>
            </Field>
            <Field label="Plan name" htmlFor="p-name"><input id="p-name" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} placeholder="Night Service" /></Field>
          </div>
        )}
        <VersionFields form={form} setForm={setForm} />
        <ErrorAlert error={error} />
      </div>
    </Modal>
  );
}

export function planSummary(v) {
  if (!v) return 'No version';
  if (v.calculationType === 'UBER') return `Operator-profile rate and hours | ${v.uberConfig?.contractHoursIncentiveTiers?.length || 0} fulfillment tiers`;
  const unit = v.paymentType === 'HOURLY' ? '/hr' : '/trip';
  const parts = [`${rate(v.basePay)}${unit} base`];
  if (v.contractedHours) parts.push(`${num(v.contractedHours)} h/week`);
  parts.push(v.incentiveEnabled ? `TUI ${v.incentiveTiers.length} tiers` : 'no TUI');
  if (v.bonusEnabled) parts.push(`bonus ${rate(v.bonusRate)}`);
  if (fuelMethodOf(v) === 'PER_TRIP') parts.push(`fuel ${rate(v.fuelReimbursementRate)}/trip`);
  if (fuelMethodOf(v) === 'SERVICE_MILE_ALLOWANCE') parts.push(`fuel allowance ${num(v.fuelMpg)} MPG`);
  return parts.join(' · ');
}

export function PlanList() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const divisionId = params.get('divisionId') || '';
  const navigate = useNavigate();
  const toast = useToast();
  const divisions = useLoad(() => api.get('/divisions'), []);
  const { data, loading, error, reload } = useLoad(() => api.get('/vdp-plans', { divisionId }), [divisionId]);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const divName = (id) => { const d = divisions.data?.find((x) => x._id === id); return d ? `DIV ${d.divisionNumber} – ${d.name}` : ''; };

  return (
    <div className="page">
      <PageHead title="VDP Plans" sub="How providers are paid. Providers inherit these rules unless their profile overrides them."
        actions={user.role === 'ADMIN' && <><button className="btn" onClick={() => setImporting(true)}>Bulk import</button><button className="btn btn-primary" onClick={() => setCreating(true)}>New plan</button></>} />
      {importing && <BulkImport kind="plans" title="VDP plans" onClose={() => setImporting(false)} onDone={reload} />}
      <div className="filters" style={{ marginBottom: 16 }}>
        <Field label="Division" htmlFor="pl-div">
          <select id="pl-div" value={divisionId} onChange={(e) => setParams(e.target.value ? { divisionId: e.target.value } : {})}>
            <option value="">All divisions</option>
            {(divisions.data || []).map((d) => <option key={d._id} value={d._id}>DIV {d.divisionNumber} – {d.name}</option>)}
          </select>
        </Field>
      </div>
      <ErrorAlert error={error} />
      {loading ? <Loading /> : data && (
        <Card body={false}>
          {data.length === 0 ? <Empty title="No VDP plans">Create a plan to define how providers in a division are paid.</Empty> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Plan</th><th>Division</th><th>Type</th><th>Current rules</th><th className="num">Providers</th><th>Versions</th><th>Status</th></tr></thead>
                <tbody>
                  {data.map((p) => {
                    const cur = p.versions.find((v) => v._id === p.currentVersionId);
                    return (
                      <tr key={p._id} className="clickable" onClick={() => navigate(`/plans/${p._id}`)}>
                        <td className="strong">{p.name}</td>
                        <td>{divName(p.divisionId)}</td>
                        <td>{cur?.calculationType === 'UBER' ? 'Uber' : PAYMENT_TYPE_LABELS[cur?.paymentType]}</td>
                        <td className="small">{planSummary(cur)}</td>
                        <td className="num">{p.providerCount}</td>
                        <td>{p.versions.length}</td>
                        <td><ActiveBadge status={p.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {creating && <VersionModal mode="create-plan" plan={{ divisionId }} onClose={() => setCreating(false)}
        onSaved={(p) => { setCreating(false); toast('Plan created'); reload(); navigate(`/plans/${p._id}`); }} />}
    </div>
  );
}

export function PlanDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const isAdmin = user.role === 'ADMIN';
  const toast = useToast();
  const { data: plan, loading, error, reload, setData } = useLoad(() => api.get(`/vdp-plans/${id}`), [id]);
  const providers = useLoad(() => api.get('/providers', { planId: id }), [id]);
  const [modal, setModal] = useState(null);
  const [editMeta, setEditMeta] = useState(null);
  const [pricing, setPricing] = useState(false);

  if (loading) return <div className="page"><Loading /></div>;
  if (error) return <div className="page"><ErrorAlert error={error} /></div>;
  const current = plan.versions.find((v) => v._id === plan.currentVersionId);

  return (
    <div className="page">
      <PageHead
        crumbs={<Link to="/plans">VDP Plans</Link>}
        title={<>{plan.name} <ActiveBadge status={plan.status} /></>}
        sub={plan.notes}
        actions={isAdmin && (
          <>
            <button className="btn" onClick={() => setEditMeta({ name: plan.name, notes: plan.notes || '', status: plan.status })}>Edit plan</button>
            <button className="btn btn-primary" onClick={() => setModal({ mode: 'add', version: current })}>New version (rate change)</button>
          </>
        )}
      />
      <div className="split">
        <div className="stack">
          {plan.versions.map((v) => (
            <Card key={v._id}
              title={<>Version {v.versionNumber} {v._id === plan.currentVersionId && <Badge tone="ok">Current</Badge>} {v.locked && <Badge tone="outline">Used by approved VDPs</Badge>}</>}
              hint={`Effective ${date(v.effectiveFrom)} – ${v.effectiveTo ? date(v.effectiveTo) : 'open'}`}
              actions={isAdmin && !v.locked && <button className="btn btn-sm" onClick={() => setModal({ mode: 'edit', version: v })}>Edit</button>}>
              <div className="kv" style={{ marginBottom: 14 }}>
                <div><div className="k">Plan / service type</div><div className="v">{v.calculationType === 'UBER' ? 'Uber' : PAYMENT_TYPE_LABELS[v.paymentType]}</div></div>
                <div><div className="k">{v.calculationType === 'UBER' ? 'Base hourly rate' : 'Base pay'}</div><div className="v">{v.calculationType === 'UBER' ? 'Operator profile' : <>{rate(v.basePay)}{v.paymentType === 'HOURLY' ? '/hour' : '/trip'}</>}</div></div>
                <div><div className="k">Contracted hours</div><div className="v">{v.calculationType === 'UBER' ? 'Operator profile' : v.contractedHours ? `${num(v.contractedHours)} / week` : '—'}</div></div>
                {v.calculationType !== 'UBER' && <div><div className="k">Performance hours</div><div className="v">{METRIC_LABELS[v.performanceHourMetric]}{v.performanceHourColumn ? ` (${v.performanceHourColumn})` : ''}</div></div>}
                {v.calculationType !== 'UBER' && <div><div className="k">TUI eligible</div><div className="v">{v.incentiveEnabled ? <Badge tone="ok">On</Badge> : <Badge>Off</Badge>}</div></div>}
                {v.calculationType !== 'UBER' && <div><div className="k">Bonus rate</div><div className="v">{v.bonusEnabled ? `${rate(v.bonusRate)}/hour above contract` : 'None'}</div></div>}
                {v.calculationType !== 'UBER' && <div><div className="k">Fuel</div><div className="v">{fuelSummary(v)}</div></div>}
              </div>
              {v.calculationType === 'UBER' && v.uberConfig && (
                <div style={{ marginBottom: 14 }}>
                  <h3 style={{ margin: '4px 0 8px' }}>Uber compensation rules</h3>
                  <div className="kv">
                    <div><div className="k">Core rate</div><div className="v">{pct(Number(v.uberConfig.coreRatePct) * 100)}</div></div>
                    <div><div className="k">Approved extra hours default</div><div className="v">{num(v.uberConfig.approvedExtraHours)}</div></div>
                    <div><div className="k">Utilization target / incentive</div><div className="v">{pct(Number(v.uberConfig.utilizationTarget) * 100)} / {pct(Number(v.uberConfig.utilizationIncentivePct) * 100)}</div></div>
                    <div><div className="k">Core hours requirement</div><div className="v">{pct(Number(v.uberConfig.coreHoursRequirement) * 100)} (visibility only)</div></div>
                    <div><div className="k">Contract-hours tiers</div><div className="v small">{v.uberConfig.contractHoursIncentiveTiers.map((t) => `${pct(Number(t.minimum) * 100)}+: ${pct(Number(t.rate) * 100)}`).join(' | ')}</div></div>
                    <div><div className="k">Acceptance tiers</div><div className="v small">{v.uberConfig.acceptanceIncentiveTiers.map((t) => `${pct(Number(t.minimum) * 100)}+: ${pct(Number(t.rate) * 100)}`).join(' | ')}</div></div>
                    <div><div className="k">Cancellation tiers</div><div className="v small">{v.uberConfig.cancellationIncentiveTiers.map((t) => `up to ${pct(Number(t.maximum) * 100)}: ${pct(Number(t.rate) * 100)}`).join(' | ')}</div></div>
                  </div>
                </div>
              )}
              {fuelMethodOf(v) === 'SERVICE_MILE_ALLOWANCE' && v._id === plan.currentVersionId && (
                <div style={{ marginBottom: 14 }}>
                  <div className="actions" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                    <h3 style={{ margin: 0 }}>Fuel prices</h3>
                    <button className="btn btn-sm" onClick={() => setPricing(true)}>Edit fuel prices</button>
                  </div>
                  {plan.fuelPrices?.length ? (
                    <table className="table-compact">
                      <thead><tr><th>Dates</th><th className="num">Price per gallon</th></tr></thead>
                      <tbody>
                        {plan.fuelPrices.map((p) => (
                          <tr key={p._id}><td>{date(p.effectiveFrom)} – {p.effectiveTo ? date(p.effectiveTo) : 'open'}</td><td className="num">{rate(p.pricePerGallon)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <Alert tone="warn">No fuel prices yet. VDPs on this plan need a price for every service date.</Alert>}
                </div>
              )}
              {(v.incentiveEnabled || v.incentiveTiers.length > 0) && (
                <>
                  <h3 style={{ margin: '4px 0 8px' }}>Incentive tiers {!v.incentiveEnabled && <span className="muted small">(kept, TUI off)</span>}</h3>
                  <TierTable tiers={v.incentiveTiers} compact />
                </>
              )}
              {v.notes && <p className="muted small" style={{ marginTop: 10 }}>{v.notes}</p>}
            </Card>
          ))}
        </div>
        <Card title="Providers on this plan" body={false}>
          {providers.loading ? <Loading /> : providers.data.length === 0 ? <Empty title="No providers">Assign this plan on a provider profile.</Empty> : (
            <table className="table-compact">
              <tbody>
                {providers.data.map((p) => (
                  <tr key={p._id}>
                    <td><Link to={`/providers/${p._id}`}>{p.name}</Link><div className="muted small">{p.operatorName} · route {p.routes.join(', ') || '—'}</div></td>
                    <td className="num">{p.overrides?.tuiEligibility !== 'INHERIT' || p.overrides?.contractedHours || p.overrides?.basePay || p.overrides?.bonusRate
                      ? <Badge tone="warn">Override</Badge> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
      {pricing && <FuelPricesModal plan={plan} onClose={() => setPricing(false)} onSaved={(d) => { setData(d); setPricing(false); toast('Fuel prices saved'); }} />}
      {modal && <VersionModal plan={plan} mode={modal.mode} version={modal.version} onClose={() => setModal(null)}
        onSaved={(p) => { setModal(null); setData(p); toast('Plan version saved'); }} />}
      {editMeta && (
        <Modal title="Edit plan" onClose={() => setEditMeta(null)}
          footer={<><button className="btn" onClick={() => setEditMeta(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={async () => { await api.put(`/vdp-plans/${plan._id}`, editMeta); setEditMeta(null); reload(); toast('Plan saved'); }}>Save</button></>}>
          <div className="stack">
            <Field label="Name" htmlFor="pm-name"><input id="pm-name" value={editMeta.name} onChange={(e) => setEditMeta({ ...editMeta, name: e.target.value })} /></Field>
            <Field label="Status" htmlFor="pm-status">
              <select id="pm-status" value={editMeta.status} onChange={(e) => setEditMeta({ ...editMeta, status: e.target.value })}>
                <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
              </select>
            </Field>
            <Field label="Notes" htmlFor="pm-notes"><textarea id="pm-notes" value={editMeta.notes} onChange={(e) => setEditMeta({ ...editMeta, notes: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
