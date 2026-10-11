import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../App';
import { Alert, Badge, Card, Empty, ErrorAlert, Field, Loading, Modal, PageHead, useLoad, useToast } from '../components/ui';
import CompassSettingsCard from '../components/CompassRoster';

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
      {loading ? <Loading /> : data && (
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

function ProcessingGroupsCard() {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(async () => {
    const [divisions, groups] = await Promise.all([api.get('/divisions'), api.get('/settings/processing-groups')]);
    return { divisions: divisions.filter((division) => division.status === 'ACTIVE'), groups };
  }, []);
  const [editing, setEditing] = useState(null);
  const [saveError, setSaveError] = useState(null);

  const saveGroups = async (groups, message) => {
    setSaveError(null);
    try {
      await api.put('/settings/processing-groups', {
        groups: groups.map((group) => ({ name: group.name, divisionIds: group.divisionIds })),
      });
      setEditing(null);
      reload();
      toast(message);
    } catch (e) { setSaveError(e); }
  };

  const save = () => {
    const groups = data.groups.filter((group) => group._id !== editing._id);
    const next = { ...editing, divisionIds: [...new Set(editing.divisionIds)] };
    saveGroups([...groups, next], editing._id ? 'Processing group updated' : 'Processing group added');
  };

  const remove = (group) => {
    if (!window.confirm(`Remove the processing group “${group.name}”? Its divisions will be processed separately.`)) return;
    saveGroups(data.groups.filter((item) => item._id !== group._id), 'Processing group removed');
  };

  const toggle = (id) => setEditing((current) => {
    const selected = current.divisionIds.includes(id);
    if (!selected && current.divisionIds.length >= 3) return current;
    return { ...current, divisionIds: selected ? current.divisionIds.filter((item) => item !== id) : [...current.divisionIds, id] };
  });

  return (
    <Card title="VDP processing groups" body={false}
      hint="Combine two or three Compass divisions that belong to one VDP program. Their rosters and plans remain separate, but they share one upload and processing run."
      actions={<button className="btn btn-sm btn-primary" disabled={loading} onClick={() => { setSaveError(null); setEditing({ name: '', divisionIds: [] }); }}>Add group</button>}>
      <ErrorAlert error={error} />
      {loading ? <Loading /> : !data?.groups.length ? <div className="card-body"><Empty title="No processing groups">Each division is currently processed separately.</Empty></div> : <div className="table-wrap"><table className="table-compact">
        <thead><tr><th>Group</th><th>Compass divisions</th><th>Run owner</th><th /></tr></thead>
        <tbody>{data.groups.map((group) => <tr key={group._id}>
          <td className="strong">{group.name}</td>
          <td>{group.divisions.map((division) => <Badge key={division._id} tone="accent">DIV {division.divisionNumber} – {division.name}</Badge>)}</td>
          <td>DIV {group.divisions[0]?.divisionNumber || '—'}<div className="muted small">Owns the shared VDP period</div></td>
          <td className="num"><div className="actions" style={{ justifyContent: 'flex-end' }}><button className="btn btn-sm" onClick={() => { setSaveError(null); setEditing({ _id: group._id, name: group.name, divisionIds: [...group.divisionIds] }); }}>Edit</button><button className="btn btn-sm btn-ghost" onClick={() => remove(group)}>Remove</button></div></td>
        </tr>)}</tbody>
      </table></div>}
      {editing && <Modal title={editing._id ? 'Edit processing group' : 'Add processing group'} onClose={() => setEditing(null)}
        footer={<><button className="btn" onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-primary" disabled={!editing.name.trim() || editing.divisionIds.length < 2 || editing.divisionIds.length > 3} onClick={save}>Save group</button></>}>
        <div className="stack">
          <Alert tone="info">Choose two or three divisions. The first selected division owns the shared VDP period; every member keeps its own Compass providers and VDP plans.</Alert>
          <Field label="Group name" htmlFor="processing-group-name"><input id="processing-group-name" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} placeholder="Division 3 – ADA + GoLink" /></Field>
          <Field label="Compass divisions" help={`${editing.divisionIds.length} of 3 selected`}>
            <div className="division-picks">{data.divisions.map((division) => {
              const checked = editing.divisionIds.includes(division._id);
              const usedBy = data.groups.find((group) => group._id !== editing._id && group.divisionIds.includes(division._id));
              return <label key={division._id} className={`division-pick ${checked ? 'selected' : ''}`}>
                <input type="checkbox" checked={checked} disabled={Boolean(usedBy) || (!checked && editing.divisionIds.length >= 3)} onChange={() => toggle(division._id)} />
                <span><strong>DIV {division.divisionNumber} – {division.name}</strong><small>{usedBy ? `Already in ${usedBy.name}` : checked && editing.divisionIds[0] === division._id ? 'Run owner' : 'Available'}</small></span>
              </label>;
            })}</div>
          </Field>
          <ErrorAlert error={saveError} />
        </div>
      </Modal>}
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
        {user.role === 'ADMIN' && <div className="stack"><CompassSettingsCard /><ProcessingGroupsCard /><UsersCard /></div>}
      </div>
    </div>
  );
}
