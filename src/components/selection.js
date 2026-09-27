import { useEffect, useState } from 'react';
import { api } from '../api';
import { cycleLabel, date, todayLocal } from '../format';

const read = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const write = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* storage unavailable */ } };

// Division + cycle picked on one screen are remembered on the others.
export function useDivisionCycle() {
  const [divisions, setDivisions] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [divisionId, setDivisionIdState] = useState(read('vdp.divisionId'));
  const [cycleId, setCycleIdState] = useState(read('vdp.cycleId'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/divisions').then((all) => {
      const active = all.filter((d) => d.status === 'ACTIVE');
      setDivisions(active);
      if (!active.some((d) => d._id === divisionId)) setDivisionId(active[0]?._id || '');
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!divisionId) { setCycles([]); return; }
    api.get('/cycles', { divisionId }).then((list) => {
      setCycles(list);
      if (!list.some((c) => c._id === cycleId)) {
        const today = todayLocal();
        const pick = list.find((c) => c.cycleEnd.slice(0, 10) < today && !['PAID', 'CLOSED'].includes(c.status))
          || list.find((c) => c.cycleStart.slice(0, 10) <= today) || list[0];
        setCycleId(pick?._id || '');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionId]);

  function setDivisionId(id) { write('vdp.divisionId', id); setDivisionIdState(id); }
  function setCycleId(id) { write('vdp.cycleId', id); setCycleIdState(id); }

  return { divisions, cycles, divisionId, cycleId, setDivisionId, setCycleId, loading };
}

export function DivisionCyclePicker({ sel }) {
  return (
    <>
      <div className="field">
        <label htmlFor="pick-division">Division</label>
        <select id="pick-division" value={sel.divisionId} onChange={(e) => sel.setDivisionId(e.target.value)}>
          {sel.divisions.map((d) => <option key={d._id} value={d._id}>DIV {d.divisionNumber} – {d.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="pick-cycle">VDP cycle</label>
        <select id="pick-cycle" value={sel.cycleId} onChange={(e) => sel.setCycleId(e.target.value)} disabled={!sel.cycles.length}>
          {!sel.cycles.length && <option value="">No cycles yet</option>}
          {sel.cycles.map((c) => (
            <option key={c._id} value={c._id}>{cycleLabel(c)} · pays {date(c.paymentDate, 'md')}</option>
          ))}
        </select>
      </div>
    </>
  );
}
