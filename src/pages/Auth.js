import { useState } from 'react';
import { api } from '../api';
import { ErrorAlert, Field } from '../components/ui';

export function AuthScreen({ needsSetup, onDone }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(needsSetup ? '/auth/setup' : '/auth/login', form);
      await onDone();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card stack" onSubmit={submit}>
        <div className="brand-mark" style={{ color: 'var(--brand)' }}>
          <span className="brand-star">★</span> Big Star VDP
        </div>
        <div>
          <h1>{needsSetup ? 'Create administrator' : 'Sign in'}</h1>
          <p className="muted small" style={{ marginTop: 4 }}>
            {needsSetup ? 'First run — create the first administrator account.' : 'Big Star staff and provider portal'}
          </p>
        </div>
        {needsSetup && (
          <Field label="Full name" htmlFor="name">
            <input id="name" value={form.name} onChange={set('name')} required autoFocus />
          </Field>
        )}
        <Field label="Email" htmlFor="email">
          <input id="email" type="email" value={form.email} onChange={set('email')} required autoFocus={!needsSetup} />
        </Field>
        <Field label="Password" htmlFor="password" help={needsSetup ? 'At least 8 characters.' : undefined}>
          <input id="password" type="password" value={form.password} onChange={set('password')} required />
        </Field>
        <ErrorAlert error={error} />
        <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : needsSetup ? 'Create account' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
