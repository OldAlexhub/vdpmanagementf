import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { Alert, Badge, Card, ErrorAlert, Field, Loading, Modal, useLoad, useToast } from './ui';

function CompassPreview({ onClose }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    api.post('/compass/preview').then((data) => { if (alive) setPreview(data); })
      .catch((err) => { if (alive) setError(err); });
    return () => { alive = false; };
  }, []);

  const gaps = useMemo(() => (preview?.providers || []).filter((provider) => !provider.mongoProviderMatched
    || provider.exactOperatorMatches !== provider.operatorCount).slice(0, 50), [preview]);

  return (
    <Modal title="Compass roster comparison" wide onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="stack">
        <Alert tone="info">Read-only preview. No Compass or MongoDB records are changed.</Alert>
        {!preview && !error && <Loading text="Reading Compass divisions, providers, operators and run cuts…" />}
        <ErrorAlert error={error} />
        {preview && <>
          <div className="source-summary">
            <div><strong>{preview.summary.compassDivisions}</strong><span>Divisions</span></div>
            <div><strong>{preview.summary.providerDivisionRecords}</strong><span>Provider/division records</span></div>
            <div><strong>{preview.summary.compassOperators}</strong><span>Operators</span></div>
            <div><strong>{preview.summary.operatorsWithRoutes}</strong><span>With active routes</span></div>
            <div><strong>{preview.summary.operatorsWithContractedHours}</strong><span>With weekly hours</span></div>
          </div>
          {preview.warnings.map((warning) => <Alert tone="warn" key={warning}>{warning}</Alert>)}
          <div className="table-wrap">
            <table className="table-compact">
              <thead><tr><th>Compass division</th><th>MongoDB</th><th>Providers</th><th>Operators</th><th>Exact matches</th></tr></thead>
              <tbody>{preview.divisions.map((division) => <tr key={division.code}>
                <td><div className="strong">DIV {division.divisionNumber}</div><div className="muted small">{division.name}</div></td>
                <td>{division.mongoDivisionMatched ? <Badge tone="ok">Matched</Badge> : <Badge tone="warn">Missing</Badge>}</td>
                <td>{division.providerCount}</td><td>{division.operatorCount}</td>
                <td>{division.providersMatched} providers · {division.operatorsMatched} operators</td>
              </tr>)}</tbody>
            </table>
          </div>
          <div>
            <div className="strong" style={{ marginBottom: 8 }}>Provider/operator differences</div>
            <div className="table-wrap"><table className="table-compact">
              <thead><tr><th>Division</th><th>Compass provider</th><th>MongoDB provider</th><th>Operators</th><th>With routes</th></tr></thead>
              <tbody>{gaps.map((provider) => <tr key={`${provider.divisionNumber}.${provider.providerName}`}>
                <td>DIV {provider.divisionNumber}</td><td>{provider.providerName}</td>
                <td>{provider.mongoProviderMatched ? <Badge tone="ok">Matched</Badge> : <Badge tone="warn">Missing</Badge>}</td>
                <td>{provider.exactOperatorMatches} of {provider.operatorCount} exact</td><td>{provider.operatorsWithRoutes} of {provider.operatorCount}</td>
              </tr>)}{!gaps.length && <tr><td colSpan="5" className="muted">Every Compass provider and operator matches MongoDB exactly.</td></tr>}</tbody>
            </table></div>
            {gaps.length === 50 && <div className="muted small" style={{ marginTop: 6 }}>Showing the first 50 differences.</div>}
          </div>
        </>}
      </div>
    </Modal>
  );
}

export default function CompassSettingsCard() {
  const status = useLoad(() => api.get('/compass/status'), []);
  const toast = useToast();
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState(null);
  const [testing, setTesting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [automaticSyncEnabled, setAutomaticSyncEnabled] = useState(true);
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState('15');

  useEffect(() => {
    if (!status.data?.roster) return;
    setAutomaticSyncEnabled(status.data.roster.automaticSyncEnabled);
    setSyncIntervalMinutes(String(status.data.roster.syncIntervalMinutes));
  }, [status.data]);

  const test = async () => {
    setTesting(true); setError(null); setTestResult(null);
    try { setTestResult(await api.post('/compass/test')); } catch (err) { setError(err); }
    setTesting(false);
  };

  const save = async () => {
    setSaving(true); setError(null);
    try {
      await api.put('/compass/settings', { automaticSyncEnabled, syncIntervalMinutes: Number(syncIntervalMinutes) });
      await status.reload();
      toast('Compass refresh settings saved');
    } catch (err) { setError(err); }
    setSaving(false);
  };

  const sync = async () => {
    setSyncing(true); setError(null);
    try {
      await api.post('/compass/sync');
      await status.reload();
      toast('Compass roster refreshed');
    } catch (err) { setError(err); }
    setSyncing(false);
  };

  const roster = status.data?.roster;
  const stamp = (value) => (value ? new Date(value).toLocaleString() : 'Never');

  return (
    <Card title="Compass roster source" hint="Compass owns the roster; MongoDB keeps VDP plans, rates, leases, notes, and history"
      actions={<button className="btn btn-sm btn-primary" disabled={!status.data?.configured} onClick={() => setPreviewing(true)}>Preview comparison</button>}>
      {status.loading ? <Loading /> : <div className="stack">
        <ErrorAlert error={status.error || error} />
        {status.data?.configured ? <Alert tone="ok"><div><strong>Compass is configured.</strong><div className="small">Host: {status.data.host}. The access token stays on the server.</div></div></Alert>
          : <Alert tone="warn"><div><strong>Compass configuration is incomplete.</strong><div className="small">Missing: {status.data?.missing?.join(', ') || 'connection settings'}.</div></div></Alert>}
        {status.data?.configured && <div className="form-grid">
          <Field label="Automatic refresh" htmlFor="compass-auto">
            <select id="compass-auto" value={automaticSyncEnabled ? 'ON' : 'OFF'} onChange={(e) => setAutomaticSyncEnabled(e.target.value === 'ON')}>
              <option value="ON">On</option><option value="OFF">Off</option>
            </select>
          </Field>
          <Field label="Refresh every (minutes)" htmlFor="compass-minutes" help="1 to 1440 minutes. Changes take effect without a redeploy.">
            <input id="compass-minutes" type="number" min="1" max="1440" step="1" value={syncIntervalMinutes} onChange={(e) => setSyncIntervalMinutes(e.target.value)} disabled={!automaticSyncEnabled} />
          </Field>
        </div>}
        {roster && <div className="small">
          <div><strong>Last successful refresh:</strong> {stamp(roster.lastSyncAt)}</div>
          <div><strong>Last attempt:</strong> {stamp(roster.lastAttemptAt)} {roster.lastSyncStatus && <Badge tone={roster.lastSyncStatus === 'SUCCESS' ? 'ok' : roster.lastSyncStatus === 'FAILED' ? 'bad' : 'outline'}>{roster.lastSyncStatus}</Badge>}</div>
        </div>}
        {roster?.lastError && <Alert tone="bad">Last refresh failed: {roster.lastError}</Alert>}
        <div className="actions">
          {status.data?.configured && <button className="btn btn-primary" disabled={syncing} onClick={sync}>{syncing ? 'Refreshing…' : 'Sync now'}</button>}
          {status.data?.configured && <button className="btn" disabled={saving || !syncIntervalMinutes} onClick={save}>{saving ? 'Saving…' : 'Save refresh settings'}</button>}
          <button className="btn" disabled={!status.data?.configured || testing} onClick={test}>{testing ? 'Testing…' : 'Test connection'}</button>
        </div>
        {testResult && <Alert tone="ok">Connected: {testResult.counts.divisions} divisions, {testResult.counts.providers} providers, {testResult.counts.operators} operators and {testResult.counts.runCuts} run cuts.</Alert>}
      </div>}
      {previewing && <CompassPreview onClose={() => setPreviewing(false)} />}
    </Card>
  );
}
