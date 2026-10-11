import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, downloadFile } from '../api';
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
  minimumFulfillmentForIncentives: '0.94', belowThresholdBehavior: 'FARES_ONLY',
  rateStructureType: 'FLAT', rateStructureScope: 'PAY_UNIT', rateBandOverflowBehavior: 'ERROR', hourlyRateBands: [],
  contractHoursIncentiveTiers: [
    { minimum: '0.94', rate: '0.05' }, { minimum: '0.96', rate: '0.10' }, { minimum: '0.98', rate: '0.20' },
  ],
  acceptanceIncentiveTiers: [{ minimum: '0.92', rate: '0.05' }, { minimum: '0.95', rate: '0.10' }],
  cancellationIncentiveTiers: [{ maximum: '0.04', rate: '0.10' }, { maximum: '0.05', rate: '0.05' }],
  utilizationEnabled: true, utilizationTarget: '0.70', utilizationIncentivePct: '0.05',
  coreHoursRuleType: 'PERCENTAGE', coreHoursRequirement: '0.60',
  incentiveScope: 'PAY_UNIT', coreHoursFailureBehavior: 'STATUS_ONLY',
};

const blankRateComponent = () => ({
  name: '', basis: 'HOURS', rate: '', serviceType: '', vehicleType: '', dayType: 'ANY',
  minimumDistance: '', maximumDistance: '', includedMiles: '',
});
const blankRateCard = () => ({ name: '', minimumPercentage: '0', maximumPercentage: '', components: [blankRateComponent()] });

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

function RateCardEditor({ cards, onChange }) {
  const updateCard = (index, key, value) => onChange(cards.map((card, i) => (i === index ? { ...card, [key]: value } : card)));
  const updateComponent = (cardIndex, componentIndex, key, value) => onChange(cards.map((card, i) => (i !== cardIndex ? card : {
    ...card,
    components: card.components.map((component, j) => (j === componentIndex ? { ...component, [key]: value } : component)),
  })));
  return (
    <div className="stack">
      {cards.map((card, cardIndex) => (
        <div className="card card-body" key={cardIndex}>
          <div className="form-grid">
            <Field label="Card name"><input value={card.name} onChange={(e) => updateCard(cardIndex, 'name', e.target.value)} placeholder="Published rates" /></Field>
            <Field label="From attainment %"><input value={card.minimumPercentage} onChange={(e) => updateCard(cardIndex, 'minimumPercentage', e.target.value)} /></Field>
            <Field label="To attainment %" help="Leave blank on the final card."><input value={card.maximumPercentage ?? ''} onChange={(e) => updateCard(cardIndex, 'maximumPercentage', e.target.value)} /></Field>
          </div>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="table-compact">
              <thead><tr><th>Name</th><th>Basis</th><th>Rate</th><th>Service</th><th>Vehicle</th><th>Day</th><th>Min mi</th><th>Max mi</th><th>Included mi</th><th /></tr></thead>
              <tbody>{card.components.map((component, componentIndex) => (
                <tr key={componentIndex}>
                  <td><input aria-label={`Card ${cardIndex + 1} component ${componentIndex + 1} name`} value={component.name} onChange={(e) => updateComponent(cardIndex, componentIndex, 'name', e.target.value)} /></td>
                  <td><select value={component.basis} onChange={(e) => updateComponent(cardIndex, componentIndex, 'basis', e.target.value)}><option value="HOURS">Hours</option><option value="TRIPS">Trips</option><option value="MILES">Miles</option><option value="EXCESS_MILES">Excess miles</option></select></td>
                  <td><input value={component.rate} onChange={(e) => updateComponent(cardIndex, componentIndex, 'rate', e.target.value)} /></td>
                  <td><input value={component.serviceType || ''} onChange={(e) => updateComponent(cardIndex, componentIndex, 'serviceType', e.target.value)} placeholder="Any" /></td>
                  <td><input value={component.vehicleType || ''} onChange={(e) => updateComponent(cardIndex, componentIndex, 'vehicleType', e.target.value)} placeholder="Any" /></td>
                  <td><select value={component.dayType || 'ANY'} onChange={(e) => updateComponent(cardIndex, componentIndex, 'dayType', e.target.value)}><option value="ANY">Any</option><option value="WEEKDAY">Weekday</option><option value="WEEKEND">Weekend</option></select></td>
                  <td><input value={component.minimumDistance ?? ''} onChange={(e) => updateComponent(cardIndex, componentIndex, 'minimumDistance', e.target.value)} /></td>
                  <td><input value={component.maximumDistance ?? ''} onChange={(e) => updateComponent(cardIndex, componentIndex, 'maximumDistance', e.target.value)} /></td>
                  <td><input value={component.includedMiles ?? ''} onChange={(e) => updateComponent(cardIndex, componentIndex, 'includedMiles', e.target.value)} disabled={component.basis !== 'EXCESS_MILES'} /></td>
                  <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => updateCard(cardIndex, 'components', card.components.filter((_, i) => i !== componentIndex))}>Remove</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="actions" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-sm" onClick={() => updateCard(cardIndex, 'components', [...card.components, blankRateComponent()])}>Add component</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(cards.filter((_, i) => i !== cardIndex))}>Remove card</button>
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-sm" onClick={() => onChange([...cards, blankRateCard()])}>Add attainment card</button>
      <p className="help muted small">Matching components are additive. This supports hourly/trip/mile combinations, weekend differentials, vehicle/service filters, and distance bands.</p>
    </div>
  );
}

// Versions saved before the fuel method existed only had the per-trip switch.
export const fuelMethodOf = (v) => v?.fuelMethod || (v?.fuelReimbursementEnabled ? 'PER_TRIP' : 'NONE');
export const FUEL_METHOD_LABELS = {
  NONE: 'None',
  PER_TRIP: 'Per trip reimbursement',
  SERVICE_MILE_ALLOWANCE: 'Service mile allowance',
  ACTUAL_EXPENSE_REIMBURSEMENT: 'Actual fuel cost reimbursement',
  PRICE_THRESHOLD_SURCHARGE: 'Fuel price threshold surcharge',
};

export function fuelSummary(v) {
  const m = fuelMethodOf(v);
  if (m === 'PER_TRIP') return `${rate(v.fuelReimbursementRate)} / trip reimbursement`;
  if (m === 'SERVICE_MILE_ALLOWANCE') return `Service mile allowance · ${num(v.fuelMpg)} MPG × fuel price by date`;
  if (m === 'ACTUAL_EXPENSE_REIMBURSEMENT') return 'Verified actual fuel cost reimbursement';
  if (m === 'PRICE_THRESHOLD_SURCHARGE') return `Fuel above ${rate(v.fuelPriceThreshold)}/gal · ${num(v.fuelMpg)} MPG`;
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
  rateStructureType: v?.rateStructureType || 'SIMPLE',
  rateCards: (v?.rateCards || []).map((card) => ({
    ...card,
    maximumPercentage: card.maximumPercentage ?? '',
    components: (card.components || []).map((component) => ({
      ...component,
      serviceType: component.serviceType || '', vehicleType: component.vehicleType || '',
      minimumDistance: component.minimumDistance ?? '', maximumDistance: component.maximumDistance ?? '', includedMiles: component.includedMiles ?? '',
    })),
  })),
  basePay: v?.basePay || '',
  contractedHours: v?.contractedHours || '',
  contractedHoursMode: v?.contractedHoursMode || 'PLAN_DEFAULT',
  incentiveEnabled: v?.incentiveEnabled ?? false,
  incentiveTiers: (v?.incentiveTiers || []).map((t) => ({ ...t, maximumPercentage: t.maximumPercentage ?? '' })),
  bonusEnabled: v?.bonusEnabled ?? false,
  bonusRate: v?.bonusRate || '',
  bonusBasis: v?.bonusBasis || 'HOURS_ABOVE_CONTRACT',
  bonusQualificationMetric: v?.bonusQualificationMetric || 'PAID_HOURS',
  bonusQualificationPercentage: v?.bonusQualificationPercentage ?? '100',
  contractedDays: v?.contractedDays || '',
  bonusRequiresContractedDays: v?.bonusRequiresContractedDays ?? false,
  standbyGuaranteeEnabled: v?.standbyGuaranteeEnabled ?? false,
  standbyRate: v?.standbyRate || '',
  fuelMethod: fuelMethodOf(v),
  fuelReimbursementRate: v?.fuelReimbursementRate || '',
  fuelMpg: v?.fuelMpg || '',
  fuelPriceThreshold: v?.fuelPriceThreshold || '',
  fuelMileageSource: v?.fuelMileageSource || 'SERVICE_MILES',
  performanceHourMetric: v?.performanceHourMetric || 'TOTAL_HOURS',
  performanceHourColumn: v?.performanceHourColumn || '',
  attainmentHourMetric: v?.incentiveEnabled ? 'OTHER' : (v?.attainmentHourMetric || 'SAME_AS_PAID'),
  attainmentHourColumn: v?.attainmentHourColumn || (v?.incentiveEnabled ? 'Incentive Hours' : ''),
  attainmentScope: v?.attainmentScope || 'OPERATOR',
  uberConfig: v?.uberConfig ? {
    ...DEFAULT_UBER_CONFIG,
    ...v.uberConfig,
    contractHoursIncentiveTiers: (v.uberConfig.contractHoursIncentiveTiers || []).map((t) => ({ ...t })),
    acceptanceIncentiveTiers: (v.uberConfig.acceptanceIncentiveTiers || []).map((t) => ({ ...t })),
    cancellationIncentiveTiers: (v.uberConfig.cancellationIncentiveTiers || []).map((t) => ({ ...t })),
    minimumFulfillmentForIncentives: v.uberConfig.minimumFulfillmentForIncentives
      || v.uberConfig.contractHoursIncentiveTiers?.[0]?.minimum || '0.94',
    belowThresholdBehavior: v.uberConfig.belowThresholdBehavior || 'FARES_ONLY',
    rateStructureType: v.uberConfig.rateStructureType || 'FLAT',
    rateStructureScope: v.uberConfig.rateStructureScope || 'PAY_UNIT',
    rateBandOverflowBehavior: v.uberConfig.rateBandOverflowBehavior || 'ERROR',
    hourlyRateBands: (v.uberConfig.hourlyRateBands || []).map((band) => ({ ...band })),
    utilizationEnabled: v.uberConfig.utilizationEnabled ?? true,
    coreHoursRuleType: v.uberConfig.coreHoursRuleType || 'PERCENTAGE',
  } : { ...DEFAULT_UBER_CONFIG,
    contractHoursIncentiveTiers: DEFAULT_UBER_CONFIG.contractHoursIncentiveTiers.map((t) => ({ ...t })),
    acceptanceIncentiveTiers: DEFAULT_UBER_CONFIG.acceptanceIncentiveTiers.map((t) => ({ ...t })),
    cancellationIncentiveTiers: DEFAULT_UBER_CONFIG.cancellationIncentiveTiers.map((t) => ({ ...t })),
    hourlyRateBands: [],
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
  const toggle = (key) => (e) => onChange({ ...value, [key]: e.target.checked });
  const tiers = (key) => (next) => onChange({ ...value, [key]: next });
  const updateBand = (index, key, nextValue) => onChange({
    ...value,
    hourlyRateBands: value.hourlyRateBands.map((band, i) => (i === index ? { ...band, [key]: nextValue } : band)),
  });
  return (
    <div className="card card-body">
      <h3 style={{ margin: '0 0 4px' }}>Uber compensation configuration</h3>
      <p className="muted small" style={{ margin: '0 0 10px' }}>Enter percentages as ratios: 0.65 = 65%. Every value is frozen with the plan version used by the VDP.</p>
      <div className="form-grid">
        <Field label="Core rate percentage" htmlFor="uber-core"><input id="uber-core" value={value.coreRatePct} onChange={set('coreRatePct')} placeholder="0.65" /></Field>
        <Field label="Approved extra hours default" htmlFor="uber-extra" help="Can be overridden for an individual driver/week during VDP review."><input id="uber-extra" value={value.approvedExtraHours} onChange={set('approvedExtraHours')} placeholder="0" /></Field>
        <Field label="Minimum fulfillment required for incentives" htmlFor="uber-min-fulfillment"><input id="uber-min-fulfillment" value={value.minimumFulfillmentForIncentives} onChange={set('minimumFulfillmentForIncentives')} placeholder="0.94" /></Field>
        <Field label="Below-threshold behavior" htmlFor="uber-below-threshold">
          <select id="uber-below-threshold" value={value.belowThresholdBehavior} onChange={set('belowThresholdBehavior')}>
            <option value="FARES_ONLY">Fares only</option>
            <option value="CORE_ONLY">Core only</option>
          </select>
        </Field>
        <Field label="Rate structure" htmlFor="uber-rate-structure">
          <select id="uber-rate-structure" value={value.rateStructureType} onChange={set('rateStructureType')}>
            <option value="FLAT">Flat hourly rate</option>
            <option value="HOURLY_BANDS">Hourly bands</option>
          </select>
        </Field>
        {value.rateStructureType === 'HOURLY_BANDS' && <Field label="Rate-band scope" htmlFor="uber-rate-scope" help="Provider scope combines the provider's Uber rows, then multiplies band limits by the number of configured pay units.">
          <select id="uber-rate-scope" value={value.rateStructureScope || 'PAY_UNIT'} onChange={set('rateStructureScope')}>
            <option value="PAY_UNIT">Each pay unit separately</option>
            <option value="PROVIDER">Across the provider</option>
          </select>
        </Field>}
        {value.rateStructureType === 'HOURLY_BANDS' && <Field label="Hours above the last band" htmlFor="uber-band-overflow">
          <select id="uber-band-overflow" value={value.rateBandOverflowBehavior || 'ERROR'} onChange={set('rateBandOverflowBehavior')}>
            <option value="ERROR">Stop for review</option>
            <option value="FIRST_BAND">Return to the first-band rate</option>
          </select>
        </Field>}
        <Field label="Core hours rule" htmlFor="uber-core-rule">
          <select id="uber-core-rule" value={value.coreHoursRuleType} onChange={set('coreHoursRuleType')}>
            <option value="PERCENTAGE">Percentage of contracted hours</option>
            <option value="CONTINUOUS_COVERAGE">Continuous coverage</option>
            <option value="NONE">None</option>
          </select>
        </Field>
        <Field label="Incentive measurements" htmlFor="uber-incentive-scope" help="Provider-wide combines all active pay units before selecting tiers.">
          <select id="uber-incentive-scope" value={value.incentiveScope || 'PAY_UNIT'} onChange={set('incentiveScope')}>
            <option value="PAY_UNIT">Each pay unit separately</option>
            <option value="PROVIDER">Across the provider</option>
          </select>
        </Field>
        <Field label="If core-hours rule fails" htmlFor="uber-core-failure">
          <select id="uber-core-failure" value={value.coreHoursFailureBehavior || 'STATUS_ONLY'} onChange={set('coreHoursFailureBehavior')}>
            <option value="STATUS_ONLY">Flag for review only</option>
            <option value="INELIGIBLE">Remove incentives</option>
          </select>
        </Field>
        {value.coreHoursRuleType === 'PERCENTAGE' && <Field label="Core hours requirement" htmlFor="uber-core-hours" help="Calculated and flagged only; it does not change Gross VDP."><input id="uber-core-hours" value={value.coreHoursRequirement} onChange={set('coreHoursRequirement')} placeholder="0.60" /></Field>}
      </div>
      {value.rateStructureType === 'HOURLY_BANDS' && (
        <div style={{ marginTop: 10 }}>
          <h4 style={{ margin: '8px 0 6px' }}>Hourly rate bands</h4>
          <table className="table-compact">
            <thead><tr><th>From hour</th><th>To hour</th><th>Rate</th><th /></tr></thead>
            <tbody>{value.hourlyRateBands.map((band, index) => (
              <tr key={index}>
                <td><input aria-label={`Rate band ${index + 1} from hour`} value={band.fromHour} onChange={(e) => updateBand(index, 'fromHour', e.target.value)} /></td>
                <td><input aria-label={`Rate band ${index + 1} to hour`} value={band.toHour} onChange={(e) => updateBand(index, 'toHour', e.target.value)} /></td>
                <td><input aria-label={`Rate band ${index + 1} rate`} value={band.hourlyRate} onChange={(e) => updateBand(index, 'hourlyRate', e.target.value)} /></td>
                <td className="num"><button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ ...value, hourlyRateBands: value.hourlyRateBands.filter((_, i) => i !== index) })}>Remove</button></td>
              </tr>
            ))}</tbody>
          </table>
          <button type="button" className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => onChange({ ...value, hourlyRateBands: [...value.hourlyRateBands, { fromHour: '', toHour: '', hourlyRate: '' }] })}>Add band</button>
          <p className="help muted small">Bands must start at 0 and be contiguous. Each payable hour is priced by the band it falls into.</p>
        </div>
      )}
      <div className="card card-body" style={{ marginTop: 10 }}>
        <label className="check"><input type="checkbox" checked={value.utilizationEnabled} onChange={toggle('utilizationEnabled')} /> Enable utilization incentive</label>
        {value.utilizationEnabled && <div className="form-grid" style={{ marginTop: 10 }}>
          <Field label="Utilization target" htmlFor="uber-util-target"><input id="uber-util-target" value={value.utilizationTarget} onChange={set('utilizationTarget')} placeholder="0.70" /></Field>
          <Field label="Utilization incentive percentage" htmlFor="uber-util-rate"><input id="uber-util-rate" value={value.utilizationIncentivePct} onChange={set('utilizationIncentivePct')} placeholder="0.05" /></Field>
        </div>}
      </div>
      {value.coreHoursRuleType === 'CONTINUOUS_COVERAGE' && <Alert tone="warn">Continuous coverage requires operational coverage validation. It is displayed for review and currently does not alter Gross VDP.</Alert>}
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
  const rateCard = form.rateStructureType === 'RATE_CARD';
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
          <select id="v-type" value={form.paymentType} onChange={(e) => setForm({ ...form, paymentType: e.target.value, bonusBasis: e.target.value === 'HOURLY' ? 'HOURS_ABOVE_CONTRACT' : 'SIXTH_DAY_TRIPS' })}>
            <option value="HOURLY">Hourly — paid on hours performed</option>
            <option value="PER_TRIP">Per trip — paid on trips provided</option>
          </select>
        </Field>}
        {!uber && <Field label="Rate structure" htmlFor="v-rate-structure">
          <select id="v-rate-structure" value={form.rateStructureType} onChange={(e) => setForm({ ...form, rateStructureType: e.target.value, rateCards: e.target.value === 'RATE_CARD' && !form.rateCards.length ? [blankRateCard()] : form.rateCards })}>
            <option value="SIMPLE">Single hourly or per-trip rate</option>
            <option value="RATE_CARD">Service / vehicle / day / distance rate card</option>
          </select>
        </Field>}
        {!uber && !rateCard && <Field label={hourly ? 'Base pay ($/hour)' : 'Base pay ($/trip)'} htmlFor="v-base" help="Paid when TUI does not apply.">
          <input id="v-base" value={form.basePay} onChange={set('basePay')} placeholder={hourly ? '25.97' : '21.50'} />
        </Field>}
        {!uber && <Field label="Contracted hours source" htmlFor="v-contract-source">
          <select id="v-contract-source" value={form.contractedHoursMode} onChange={set('contractedHoursMode')}>
            <option value="PLAN_DEFAULT">Plan default</option>
            <option value="OPERATOR_PROFILE">Each operator profile</option>
          </select>
        </Field>}
        {!uber && form.contractedHoursMode === 'PLAN_DEFAULT' && <Field label="Contracted hours per week" htmlFor="v-hours" help={hourly ? 'Required for simple hourly plans.' : 'Needed for attainment tiers or bonus qualification.'}>
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
        {!uber && (form.incentiveEnabled || rateCard) && <Field label="TUI fulfillment hours source" htmlFor="v-attainment-metric" help={form.incentiveEnabled ? 'Only hours actually worked inside the operatorâ€™s Compass start/end window may activate a TUI tier.' : 'Hours used to select the attainment rate card.'}>
          <select id="v-attainment-metric" value={form.attainmentHourMetric} onChange={set('attainmentHourMetric')}>
            {form.incentiveEnabled
              ? <option value="OTHER">Uploaded in-window hours column</option>
              : <><option value="SAME_AS_PAID">Same as paid hours</option>{Object.entries(METRIC_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</>}
          </select>
        </Field>}
        {!uber && (form.incentiveEnabled || rateCard) && <Field label="Attainment scope" htmlFor="v-attainment-scope">
          <select id="v-attainment-scope" value={form.attainmentScope} onChange={set('attainmentScope')}>
            <option value="OPERATOR">Each operator separately</option>
            <option value="PROVIDER">Across all provider operators</option>
          </select>
        </Field>}
        {!uber && (form.incentiveEnabled || rateCard) && form.attainmentHourMetric === 'OTHER' && (
          <Field label={form.incentiveEnabled ? 'In-window hours column' : 'Attainment report column'} htmlFor="v-attainment-column" full help={form.incentiveEnabled ? 'This column must already contain only worked-time overlap with the Compass TUI window; ordinary paid hours are not accepted.' : undefined}>
            <input id="v-attainment-column" value={form.attainmentHourColumn} onChange={set('attainmentHourColumn')} placeholder="e.g. Incentive Hours" />
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
      {rateCard && (
        <div className="card card-body">
          <h3 style={{ margin: '0 0 8px' }}>Rate cards</h3>
          <RateCardEditor cards={form.rateCards} onChange={(rateCards) => setForm({ ...form, rateCards })} />
        </div>
      )}
      <div className="card card-body">
        <label className="check"><input type="checkbox" checked={form.incentiveEnabled} onChange={(e) => setForm({ ...form, incentiveEnabled: e.target.checked, ...(e.target.checked ? { attainmentHourMetric: 'OTHER', attainmentHourColumn: form.attainmentHourColumn || 'Incentive Hours' } : {}) })} /> TUI (Top-Up Incentive) eligible</label>
        <p className="muted small" style={{ margin: '4px 0 10px 24px' }}>
          When on, fulfillment is in-window hours divided by contracted hours; the weekly rate comes from the {rateCard ? 'attainment rate cards' : 'incentive tiers'} below. Compass supplies each operatorâ€™s start/end window.
          Individual providers can still be switched on or off on their profile.
        </p>
        {!rateCard && (form.incentiveEnabled || form.incentiveTiers.length > 0) && (
          <TierEditor tiers={form.incentiveTiers} onChange={(incentiveTiers) => setForm({ ...form, incentiveTiers })} />
        )}
      </div>

      {!rateCard && (
        <div className="card card-body">
          <label className="check"><input type="checkbox" checked={form.bonusEnabled} onChange={set('bonusEnabled')} /> Enable contract bonus</label>
          {form.bonusEnabled && (
            <div className="form-grid" style={{ marginTop: 10 }}>
              <Field label="Bonus basis" htmlFor="v-bonus-basis">
                <select id="v-bonus-basis" value={form.bonusBasis} onChange={set('bonusBasis')}>
                  {hourly && <option value="HOURS_ABOVE_CONTRACT">Hours above contract</option>}
                  {!hourly && <option value="SIXTH_DAY_TRIPS">Qualifying sixth-day trips</option>}
                </select>
              </Field>
              <Field label={hourly ? 'Bonus rate ($/hour)' : 'Bonus rate ($/trip)'} htmlFor="v-bonus" help="Separate from the incentive tiers.">
                <input id="v-bonus" value={form.bonusRate} onChange={set('bonusRate')} placeholder="34.62" />
              </Field>
              <Field label="Qualification hours" htmlFor="v-bonus-metric">
                <select id="v-bonus-metric" value={form.bonusQualificationMetric} onChange={set('bonusQualificationMetric')}>
                  <option value="PAID_HOURS">Paid hours</option><option value="ATTAINMENT_HOURS">Incentive attainment hours</option>
                </select>
              </Field>
              <Field label="Qualification percentage" htmlFor="v-bonus-pct"><input id="v-bonus-pct" value={form.bonusQualificationPercentage} onChange={set('bonusQualificationPercentage')} /></Field>
              {!hourly && <Field label="Contracted days" htmlFor="v-contracted-days"><input id="v-contracted-days" value={form.contractedDays} onChange={set('contractedDays')} placeholder="5" /></Field>}
              {!hourly && <Field label="Day requirement"><label className="check"><input type="checkbox" checked={form.bonusRequiresContractedDays} onChange={set('bonusRequiresContractedDays')} /> Require contracted days</label></Field>}
            </div>
          )}
        </div>
      )}
      <div className="card card-body">
        <label className="check"><input type="checkbox" checked={form.standbyGuaranteeEnabled} onChange={set('standbyGuaranteeEnabled')} /> Enable standby guarantee rules</label>
        {form.standbyGuaranteeEnabled && <div className="form-grid" style={{ marginTop: 10 }}>
          <Field label="Standby hourly rate (optional)" htmlFor="v-standby-rate" help="Leave blank to use the selected weekly rate, or enter a dedicated guarantee rate."><input id="v-standby-rate" value={form.standbyRate} onChange={set('standbyRate')} /></Field>
        </div>}
      </div>
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
          {['SERVICE_MILE_ALLOWANCE', 'PRICE_THRESHOLD_SURCHARGE'].includes(form.fuelMethod) && (
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
          {form.fuelMethod === 'PRICE_THRESHOLD_SURCHARGE' && (
            <Field label="Fuel price threshold ($/gallon)" htmlFor="v-fuel-threshold"><input id="v-fuel-threshold" value={form.fuelPriceThreshold} onChange={set('fuelPriceThreshold')} placeholder="4.60" /></Field>
          )}
        </div>
        <p className="muted small" style={{ margin: '6px 0 0' }}>
          {form.fuelMethod === 'NONE' && 'No fuel reimbursement or fuel deduction.'}
          {form.fuelMethod === 'PER_TRIP' && 'Trips in the cycle × this rate is added to the VDP after Gross.'}
          {form.fuelMethod === 'SERVICE_MILE_ALLOWANCE' && <>
            Each service date: service miles ÷ {form.fuelMpg || 'MPG'} = allowed gallons × that day’s fuel price = allowed fuel.
            Accounting enters the provider’s actual fuel expense on the VDP; only the amount above the maximum is deducted.
          </>}
          {form.fuelMethod === 'ACTUAL_EXPENSE_REIMBURSEMENT' && 'Accounting enters the verified actual fuel expense; that amount is reimbursed after Gross.'}
          {form.fuelMethod === 'PRICE_THRESHOLD_SURCHARGE' && 'For each service date, the provider earns service miles ÷ MPG × the amount that fuel price exceeds the configured threshold.'}
        </p>
        {['SERVICE_MILE_ALLOWANCE', 'PRICE_THRESHOLD_SURCHARGE'].includes(form.fuelMethod) && form.fuelPrices && (
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
  const templates = useLoad(() => (mode === 'create-plan' ? api.get('/vdp-plan-templates') : Promise.resolve([])), [mode]);
  const [templateId, setTemplateId] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const applyTemplate = (id) => {
    setTemplateId(id);
    if (!id) {
      setForm({ ...versionForm(), fuelPrices: [] });
      setMeta({ name: '', divisionId: plan?.divisionId || '', notes: '' });
      return;
    }
    const template = (templates.data || []).find((item) => item.id === id);
    if (!template) return;
    const division = (divisions.data || []).find((item) => String(item.divisionNumber) === String(template.divisionNumber));
    setForm({ ...versionForm(template.version), fuelPrices: [] });
    setMeta({ name: template.name, divisionId: division?._id || plan?.divisionId || '', notes: `Started from ${template.sourceDocument}: ${template.description}` });
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      let saved;
      // Fuel prices belong to the plan; they are saved with the fuel options when the allowance is used.
      const { fuelPrices, ...rules } = form;
      const body = ['SERVICE_MILE_ALLOWANCE', 'PRICE_THRESHOLD_SURCHARGE'].includes(form.fuelMethod) ? { ...rules, fuelPrices } : rules;
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
          <>
          <div className="card card-body">
            <Field label="Start from" htmlFor="p-template" help="A preset copies the audited document rules into this form. You can edit every field before or after creating the plan.">
              <select id="p-template" value={templateId} onChange={(e) => applyTemplate(e.target.value)} disabled={templates.loading}>
                <option value="">Blank custom plan</option>
                {(templates.data || []).map((template) => <option key={template.id} value={template.id}>DIV {template.divisionNumber} — {template.name}</option>)}
              </select>
            </Field>
            {templateId && (() => { const template = templates.data?.find((item) => item.id === templateId); return template ? <p className="muted small" style={{ marginBottom: 0 }}><strong>{template.sourceDocument}</strong> · {template.description}</p> : null; })()}
          </div>
          <div className="form-grid">
            <Field label="Division" htmlFor="p-div">
              <select id="p-div" value={meta.divisionId} onChange={(e) => setMeta({ ...meta, divisionId: e.target.value })}>
                <option value="">Choose…</option>
                {(divisions.data || []).map((d) => <option key={d._id} value={d._id}>DIV {d.divisionNumber} – {d.name}</option>)}
              </select>
            </Field>
            <Field label="Plan name" htmlFor="p-name"><input id="p-name" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} placeholder="Night Service" /></Field>
          </div>
          </>
        )}
        <VersionFields form={form} setForm={setForm} />
        <ErrorAlert error={error} />
      </div>
    </Modal>
  );
}

export function planSummary(v) {
  if (!v) return 'No version';
  if (v.calculationType === 'UBER') {
    const banded = v.uberConfig?.rateStructureType === 'HOURLY_BANDS';
    return `${banded ? `${v.uberConfig?.hourlyRateBands?.length || 0} hourly bands` : 'Operator-profile rate'} and operator hours | ${v.uberConfig?.contractHoursIncentiveTiers?.length || 0} fulfillment tiers`;
  }
  const unit = v.paymentType === 'HOURLY' ? '/hr' : '/trip';
  const parts = v.rateStructureType === 'RATE_CARD'
    ? [`${v.rateCards?.length || 0} rate card${v.rateCards?.length === 1 ? '' : 's'}`]
    : [`${rate(v.basePay)}${unit} base`];
  if (v.contractedHoursMode === 'OPERATOR_PROFILE') parts.push('operator contract hours');
  else if (v.contractedHours) parts.push(`${num(v.contractedHours)} h/week`);
  parts.push(v.incentiveEnabled ? `TUI ${v.incentiveTiers.length} tiers` : 'no TUI');
  if (v.bonusEnabled) parts.push(`bonus ${rate(v.bonusRate)}`);
  if (fuelMethodOf(v) === 'PER_TRIP') parts.push(`fuel ${rate(v.fuelReimbursementRate)}/trip`);
  if (fuelMethodOf(v) === 'SERVICE_MILE_ALLOWANCE') parts.push(`fuel allowance ${num(v.fuelMpg)} MPG`);
  return parts.join(' · ');
}

function UberRulesSummary({ config }) {
  const u = {
    ...DEFAULT_UBER_CONFIG,
    ...config,
    minimumFulfillmentForIncentives: config.minimumFulfillmentForIncentives
      || config.contractHoursIncentiveTiers?.[0]?.minimum || '0.94',
    belowThresholdBehavior: config.belowThresholdBehavior || 'FARES_ONLY',
    rateStructureType: config.rateStructureType || 'FLAT',
    rateStructureScope: config.rateStructureScope || 'PAY_UNIT',
    rateBandOverflowBehavior: config.rateBandOverflowBehavior || 'ERROR',
    utilizationEnabled: config.utilizationEnabled ?? true,
    coreHoursRuleType: config.coreHoursRuleType || 'PERCENTAGE',
  };
  const coreRule = u.coreHoursRuleType === 'PERCENTAGE'
    ? `${pct(Number(u.coreHoursRequirement) * 100)} (visibility only)`
    : u.coreHoursRuleType === 'CONTINUOUS_COVERAGE'
      ? 'Continuous coverage · requires validation'
      : 'None';
  return (
    <div style={{ marginBottom: 14 }}>
      <h3 style={{ margin: '4px 0 8px' }}>Uber compensation rules</h3>
      <div className="kv">
        <div><div className="k">Core rate</div><div className="v">{pct(Number(u.coreRatePct) * 100)}</div></div>
        <div><div className="k">Approved extra hours default</div><div className="v">{num(u.approvedExtraHours)}</div></div>
        <div><div className="k">Incentive qualification</div><div className="v">{pct(Number(u.minimumFulfillmentForIncentives) * 100)} minimum</div></div>
        <div><div className="k">Below threshold</div><div className="v">{u.belowThresholdBehavior === 'CORE_ONLY' ? 'Core only' : 'Fares only'}</div></div>
        <div><div className="k">Rate structure</div><div className="v">{u.rateStructureType === 'HOURLY_BANDS' ? 'Hourly bands' : 'Flat operator-profile rate'}</div></div>
        {u.rateStructureType === 'HOURLY_BANDS' && <div><div className="k">Rate-band scope</div><div className="v">{u.rateStructureScope === 'PROVIDER' ? 'Across provider pay units' : 'Each pay unit'}</div></div>}
        {u.rateStructureType === 'HOURLY_BANDS' && <div><div className="k">Hourly bands</div><div className="v small">{u.hourlyRateBands.map((band) => `${num(band.fromHour)}–${num(band.toHour)} h: ${rate(band.hourlyRate)}`).join(' | ')}</div></div>}
        <div><div className="k">Utilization incentive</div><div className="v">{u.utilizationEnabled ? `${pct(Number(u.utilizationTarget) * 100)} target / ${pct(Number(u.utilizationIncentivePct) * 100)}` : 'Disabled'}</div></div>
        <div><div className="k">Core hours rule</div><div className="v">{coreRule}</div></div>
        <div><div className="k">Incentive scope</div><div className="v">{u.incentiveScope === 'PROVIDER' ? 'Across provider pay units' : 'Each pay unit'}</div></div>
        <div><div className="k">Core-hours failure</div><div className="v">{u.coreHoursFailureBehavior === 'INELIGIBLE' ? 'Removes incentives' : 'Review flag only'}</div></div>
        <div><div className="k">Contract-hours tiers</div><div className="v small">{u.contractHoursIncentiveTiers.map((t) => `${pct(Number(t.minimum) * 100)}+: ${pct(Number(t.rate) * 100)}`).join(' | ')}</div></div>
        <div><div className="k">Acceptance tiers</div><div className="v small">{u.acceptanceIncentiveTiers.map((t) => `${pct(Number(t.minimum) * 100)}+: ${pct(Number(t.rate) * 100)}`).join(' | ')}</div></div>
        <div><div className="k">Cancellation tiers</div><div className="v small">{u.cancellationIncentiveTiers.map((t) => `up to ${pct(Number(t.maximum) * 100)}: ${pct(Number(t.rate) * 100)}`).join(' | ')}</div></div>
      </div>
    </div>
  );
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
  const divisions = useLoad(() => api.get('/divisions'), []);
  const providers = useLoad(() => api.get('/providers', { planId: id }), [id]);
  const [modal, setModal] = useState(null);
  const [editMeta, setEditMeta] = useState(null);
  const [editError, setEditError] = useState(null);
  const [editBusy, setEditBusy] = useState(false);
  const [pricing, setPricing] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);

  const downloadPlanReport = async () => {
    setDownloadingReport(true);
    try { await downloadFile(`/vdp-plans/${id}/report.pdf`); } catch (e) { toast(e.message, 'bad'); }
    finally { setDownloadingReport(false); }
  };

  if (loading) return <div className="page"><Loading /></div>;
  if (error) return <div className="page"><ErrorAlert error={error} /></div>;
  const current = plan.versions.find((v) => v._id === plan.currentVersionId);

  return (
    <div className="page">
      <PageHead
        crumbs={<Link to="/plans">VDP Plans</Link>}
        title={<>{plan.name} <ActiveBadge status={plan.status} /></>}
        sub={plan.notes}
        actions={(
          <>
            <button className="btn" disabled={downloadingReport} onClick={downloadPlanReport}>{downloadingReport ? 'Preparing PDF...' : 'Executive PDF'}</button>
            {isAdmin && <button className="btn" onClick={() => { setEditError(null); setEditMeta({ name: plan.name, divisionId: plan.divisionId, notes: plan.notes || '', status: plan.status }); }}>Edit plan</button>}
            {isAdmin && <button className="btn btn-primary" onClick={() => setModal({ mode: 'add', version: current })}>New version (rate change)</button>}
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
                <div><div className="k">{v.calculationType === 'UBER' ? 'Base hourly rate' : 'Base pay'}</div><div className="v">{v.calculationType === 'UBER' ? (v.uberConfig?.rateStructureType === 'HOURLY_BANDS' ? 'Plan hourly bands' : 'Operator profile') : v.rateStructureType === 'RATE_CARD' ? 'Configured rate cards' : <>{rate(v.basePay)}{v.paymentType === 'HOURLY' ? '/hour' : '/trip'}</>}</div></div>
                <div><div className="k">Contracted hours</div><div className="v">{v.calculationType === 'UBER' || v.contractedHoursMode === 'OPERATOR_PROFILE' ? 'Operator profile' : v.contractedHours ? `${num(v.contractedHours)} / week` : '—'}</div></div>
                {v.calculationType !== 'UBER' && <div><div className="k">Performance hours</div><div className="v">{METRIC_LABELS[v.performanceHourMetric]}{v.performanceHourColumn ? ` (${v.performanceHourColumn})` : ''}</div></div>}
                {v.calculationType !== 'UBER' && <div><div className="k">TUI eligible</div><div className="v">{v.incentiveEnabled ? <Badge tone="ok">On</Badge> : <Badge>Off</Badge>}</div></div>}
                {v.calculationType !== 'UBER' && <div><div className="k">Attainment</div><div className="v">{v.attainmentHourMetric === 'SAME_AS_PAID' ? 'Same as paid hours' : METRIC_LABELS[v.attainmentHourMetric] || v.attainmentHourColumn} · {v.attainmentScope === 'PROVIDER' ? 'provider-wide' : 'per operator'}</div></div>}
                {v.calculationType !== 'UBER' && <div><div className="k">Bonus rate</div><div className="v">{v.bonusEnabled ? `${rate(v.bonusRate)}/hour above contract` : 'None'}</div></div>}
                {v.calculationType !== 'UBER' && <div><div className="k">Fuel</div><div className="v">{fuelSummary(v)}</div></div>}
              </div>
              {v.calculationType === 'UBER' && v.uberConfig && <UberRulesSummary config={v.uberConfig} />}
              {v.calculationType !== 'UBER' && v.rateStructureType === 'RATE_CARD' && (
                <div style={{ marginBottom: 14 }}><h3 style={{ margin: '4px 0 8px' }}>Rate cards</h3>
                  {(v.rateCards || []).map((card) => <div key={card.name} className="muted small" style={{ marginBottom: 6 }}><strong>{card.name}</strong> ({num(card.minimumPercentage)}%{card.maximumPercentage ? `-${num(card.maximumPercentage)}%` : '+'}) · {card.components.length} component(s)</div>)}
                </div>
              )}
              {['SERVICE_MILE_ALLOWANCE', 'PRICE_THRESHOLD_SURCHARGE'].includes(fuelMethodOf(v)) && v._id === plan.currentVersionId && (
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
              {v.rateStructureType !== 'RATE_CARD' && (v.incentiveEnabled || v.incentiveTiers.length > 0) && (
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
            <button className="btn btn-primary" disabled={editBusy || !editMeta.divisionId} onClick={async () => {
              setEditBusy(true);
              setEditError(null);
              try {
                await api.put(`/vdp-plans/${plan._id}`, editMeta);
                setEditMeta(null);
                reload();
                toast('Plan saved');
              } catch (e) {
                setEditError(e);
              } finally {
                setEditBusy(false);
              }
            }}>{editBusy ? 'Saving…' : 'Save'}</button></>}>
          <div className="stack">
            <Field label="Name" htmlFor="pm-name"><input id="pm-name" value={editMeta.name} onChange={(e) => setEditMeta({ ...editMeta, name: e.target.value })} /></Field>
            <Field label="Division" htmlFor="pm-division" help="Divisions synchronized from Compass appear here.">
              <select id="pm-division" value={editMeta.divisionId} onChange={(e) => setEditMeta({ ...editMeta, divisionId: e.target.value })} disabled={divisions.loading}>
                <option value="">Choose…</option>
                {(divisions.data || []).map((division) => <option key={division._id} value={division._id}>DIV {division.divisionNumber} – {division.name}</option>)}
              </select>
            </Field>
            <Field label="Status" htmlFor="pm-status">
              <select id="pm-status" value={editMeta.status} onChange={(e) => setEditMeta({ ...editMeta, status: e.target.value })}>
                <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
              </select>
            </Field>
            <Field label="Notes" htmlFor="pm-notes"><textarea id="pm-notes" value={editMeta.notes} onChange={(e) => setEditMeta({ ...editMeta, notes: e.target.value })} /></Field>
            <ErrorAlert error={divisions.error || editError} />
          </div>
        </Modal>
      )}
    </div>
  );
}
