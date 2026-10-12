import { Link } from 'react-router-dom';
import { Card, PageHead } from '../components/ui';

const areas = [
  ['/configuration/divisions', 'Divisions & processing groups', 'Division identity, Compass grouping, status, and source contracts.'],
  ['/configuration/plans', 'VDP plans & blueprints', 'Create an editable plan from a verified blueprint or start from a blank plan.'],
  ['/configuration/cycles', 'Cycles', 'Company pay-period schedule, submission dates, and payment dates.'],
  ['/configuration/lift-leases', 'Lift leases', 'Division-scoped lease options, rates, assignments, and archival.'],
  ['/configuration/system', 'Users & Compass', 'Roles, password access, Compass connection, and production settings.'],
];

export default function Configuration() {
  return (
    <div className="page">
      <PageHead title="Configuration" sub="The controlled setup behind VDP intake, calculation, and publishing." />
      <div className="grid grid-2">
        {areas.map(([to, title, hint]) => (
          <Link key={to} to={to} className="config-link">
            <Card title={title}><p className="muted">{hint}</p><span className="config-open">Open →</span></Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
