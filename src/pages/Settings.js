import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../App';
import { Badge, Card, ErrorAlert, Field, Loading, Modal, PageHead, useLoad, useToast } from '../components/ui';

export function PasswordCard() {
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [error, setError] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/auth/password', form);
      setForm({ currentPassword: '', newPassword: '' });
      toast('Password changed');
    } catch (err) { setError(err); }
  };
  return (
    <Card title="Your password">
      <form className="stack" onSubmit={save}>
        <Field label="Current password" htmlFor="s-cur"><input id="s-cur" type="password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} /></Field>
        <Field label="New password" htmlFor="s-new" help="At least 8 characters."><input id="s-new" type="password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} /></Field>
        <ErrorAlert error={error} />
        <div><button className="btn btn-primary" type="submit" disabled={!form.currentPassword || !form.newPassword}>Change password</button></div>
      </form>
    </Card>
  );
}

function UsersCard() {
  const { user: me } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get('/users'), []);
  const [adding, setAdding] = useState(null);
  const [addError, setAddError] = useState(null);
  const update = async (u, patch) => {
    try { await api.patch(`/users/${u._id}`, patch); reload(); toast('User updated'); } catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <Card title="Users" body={false} actions={<button className="btn btn-sm btn-primary" onClick={() => setAdding({ name: '', email: '', password: '', role: 'USER' })}>Add user</button>}>
      <ErrorAlert error={error} />
      {loading ? <Loading /> : (
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th /></tr></thead>
          <tbody>
            {data.map((u) => (
              <tr key={u._id}>
                <td className="strong">{u.name}</td>
                <td>{u.email}</td>
                <td>{u.role === 'ADMIN' ? <Badge tone="accent">Administrator</Badge> : 'User'}</td>
                <td>{u.active ? <Badge tone="ok">Active</Badge> : <Badge>Disabled</Badge>}</td>
                <td className="num">
                  {u._id !== me._id && (
                    <div className="actions" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn btn-sm" onClick={() => update(u, { role: u.role === 'ADMIN' ? 'USER' : 'ADMIN' })}>{u.role === 'ADMIN' ? 'Make user' : 'Make admin'}</button>
                      <button className="btn btn-sm" onClick={() => update(u, { active: !u.active })}>{u.active ? 'Disable' : 'Enable'}</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {adding && (
        <Modal title="Add user" onClose={() => setAdding(null)}
          footer={<><button className="btn" onClick={() => setAdding(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={async () => {
              setAddError(null);
              try { await api.post('/users', adding); setAdding(null); reload(); toast('User added'); } catch (e) { setAddError(e); }
            }}>Add user</button></>}>
          <div className="stack">
            <Field label="Name" htmlFor="u-name"><input id="u-name" value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} /></Field>
            <Field label="Email" htmlFor="u-email"><input id="u-email" type="email" value={adding.email} onChange={(e) => setAdding({ ...adding, email: e.target.value })} /></Field>
            <Field label="Temporary password" htmlFor="u-pw"><input id="u-pw" type="password" value={adding.password} onChange={(e) => setAdding({ ...adding, password: e.target.value })} /></Field>
            <Field label="Role" htmlFor="u-role" help="Administrators can change divisions, plans and rates.">
              <select id="u-role" value={adding.role} onChange={(e) => setAdding({ ...adding, role: e.target.value })}><option value="USER">User</option><option value="ADMIN">Administrator</option></select>
            </Field>
            <ErrorAlert error={addError} />
          </div>
        </Modal>
      )}
    </Card>
  );
}

function RulesCard() {
  return (
    <Card title="How VDPs are calculated">
      <ol className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
        <li>Performance Report rows inside the cycle are summed per route and day; routes are matched to providers by their profile.</li>
        <li>Each week is calculated on its own: performance % = actual hours ÷ contracted hours.</li>
        <li>If the provider is TUI eligible, the incentive tier covering that % sets the rate; otherwise the base pay applies.</li>
        <li>Hourly plans with a bonus: hours up to the contract are paid at that rate, hours above it at the bonus rate.</li>
        <li>Per-trip plans: trips × rate.</li>
        <li>Each earnings line is rounded to the cent; Gross = Week 1 + Week 2.</li>
        <li>Plans with fuel reimbursement: trips in the cycle × the per-trip fuel rate, added after Gross (not part of earnings).</li>
        <li>Net = Gross − lift lease − fares − other deductions + fuel reimbursement + reimbursements + other income.</li>
        <li>Approval freezes a snapshot of every rate and input used and sends the statement to the provider portal.</li>
        <li>The provider approves by the end of the Closed for Submission date; otherwise it is auto-approved. Then it can be marked paid.</li>
      </ol>
    </Card>
  );
}

export default function Settings() {
  const { user } = useAuth();
  return (
    <div className="page">
      <PageHead title="Settings" sub={`Signed in as ${user.name} (${user.email})`} />
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <PasswordCard />
          <RulesCard />
        </div>
        {user.role === 'ADMIN' && <UsersCard />}
      </div>
    </div>
  );
}
