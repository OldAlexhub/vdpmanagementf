import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../App';
import { Badge, Card, Empty, ErrorAlert, Field, Loading, Modal, useLoad, useToast } from './ui';

// Provider portal logins for one provider (managed by administrators).
export default function PortalAccess({ provider }) {
  const { user } = useAuth();
  const isAdmin = user.role === 'ADMIN';
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(
    () => (isAdmin ? api.get('/users', { providerId: provider._id }) : Promise.resolve([])),
    [provider._id, isAdmin],
  );
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState(null);

  if (!isAdmin) return null;

  const create = async () => {
    setFormError(null);
    try {
      await api.post('/users', { ...form, role: 'PROVIDER', providerId: provider._id });
      setForm(null);
      reload();
      toast('Portal login created — share the email and temporary password with the provider');
    } catch (e) { setFormError(e); }
  };
  const toggle = async (u) => {
    await api.patch(`/users/${u._id}`, { active: !u.active });
    reload();
    toast(u.active ? 'Portal login disabled' : 'Portal login enabled');
  };

  return (
    <Card title="Provider portal access" body={false}
      hint="The provider signs in to review and approve their VDP statements."
      actions={<button className="btn btn-sm btn-primary" onClick={() => setForm({ name: provider.name, email: provider.contact?.email || '', password: '' })}>Give portal access</button>}>
      <ErrorAlert error={error} />
      {loading ? <Loading /> : !data.length ? (
        <Empty title="No portal login yet">Without a login the provider cannot approve; VDPs will auto-approve after the Closed for Submission date.</Empty>
      ) : (
        <table className="table-compact">
          <tbody>
            {data.map((u) => (
              <tr key={u._id}>
                <td><div className="strong">{u.name}</div><div className="muted small">{u.email}</div></td>
                <td>{u.active ? <Badge tone="ok">Active</Badge> : <Badge>Disabled</Badge>}</td>
                <td className="num"><button className="btn btn-sm" onClick={() => toggle(u)}>{u.active ? 'Disable' : 'Enable'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {form && (
        <Modal title={`Portal login for ${provider.name}`} onClose={() => setForm(null)}
          footer={<><button className="btn" onClick={() => setForm(null)}>Cancel</button><button className="btn btn-primary" onClick={create}>Create login</button></>}>
          <div className="stack">
            <Field label="Name" htmlFor="pa-name"><input id="pa-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email (their sign-in)" htmlFor="pa-email"><input id="pa-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Temporary password" htmlFor="pa-pw" help="At least 8 characters. The provider can change it under Account.">
              <input id="pa-pw" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <ErrorAlert error={formError} />
          </div>
        </Modal>
      )}
    </Card>
  );
}
