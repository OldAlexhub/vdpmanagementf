import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export const VDP_STATUS = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  NEEDS_REVIEW: { label: 'Needs review', tone: 'bad' },
  READY: { label: 'Ready', tone: 'info' },
  APPROVED: { label: 'Awaiting provider', tone: 'warn' },
  DISPUTED: { label: 'Provider issue', tone: 'bad' },
  PROCESSED: { label: 'Approved & processed', tone: 'ok' },
  PAID: { label: 'Paid', tone: 'accent' },
};

export const CYCLE_STATUS = {
  UPCOMING: { label: 'Upcoming', tone: 'neutral' },
  OPEN: { label: 'Open', tone: 'info' },
  PROCESSING: { label: 'Processing', tone: 'warn' },
  READY_FOR_REVIEW: { label: 'Ready for review', tone: 'info' },
  APPROVED: { label: 'Approved', tone: 'ok' },
  PAID: { label: 'Paid', tone: 'accent' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
};

export function Badge({ tone = 'neutral', children, dot }) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

export function StatusBadge({ status, map = VDP_STATUS }) {
  const s = map[status] || { label: status, tone: 'neutral' };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

export const ActiveBadge = ({ status }) =>
  status === 'ACTIVE' ? <Badge tone="ok">Active</Badge> : <Badge tone="neutral">Inactive</Badge>;

export function Card({ title, hint, actions, children, body = true, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {hint && <div className="hint">{hint}</div>}
          </div>
          {actions && <div className="actions">{actions}</div>}
        </div>
      )}
      {body ? <div className="card-body">{children}</div> : children}
    </section>
  );
}

export function Stat({ label, value, note, tone }) {
  return (
    <div className={`card stat ${tone ? `tone-${tone}` : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}

export function PageHead({ title, sub, crumbs, actions }) {
  return (
    <div className="page-head">
      <div>
        {crumbs && <div className="crumbs">{crumbs}</div>}
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div className="actions no-print">{actions}</div>}
    </div>
  );
}

export function Loading({ text = 'Loading…' }) {
  return <div className="loading"><span className="spinner" /> {text}</div>;
}

export function Empty({ title, children, actions }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Alert({ tone = 'info', children, action }) {
  return (
    <div className={`alert alert-${tone}`}>
      <div className="grow">{children}</div>
      {action}
    </div>
  );
}

export function ErrorAlert({ error }) {
  if (!error) return null;
  const list = error.details?.errors;
  return (
    <Alert tone="bad">
      {list?.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{list.map((e) => <li key={e}>{e}</li>)}</ul> : error.message || String(error)}
    </Alert>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="close-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// Confirmation dialog, optionally requiring a typed reason.
export function Confirm({ title, message, confirmLabel = 'Confirm', tone = 'primary', reason, onConfirm, onClose }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(text);
      onClose();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className={`btn btn-${tone}`} disabled={busy || (reason && !text.trim())} onClick={submit}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="stack">
        {message && <p>{message}</p>}
        {reason && (
          <div className="field">
            <label htmlFor="confirm-reason">{reason}</label>
            <textarea id="confirm-reason" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          </div>
        )}
        <ErrorAlert error={error} />
      </div>
    </Modal>
  );
}

export function Field({ label, help, children, full, htmlFor }) {
  return (
    <div className={`field ${full ? 'full' : ''}`}>
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {help && <div className="help">{help}</div>}
    </div>
  );
}

// ---------- toast ----------
const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef();
  const show = useCallback((message, tone = 'ok') => {
    clearTimeout(timer.current);
    setToast({ message, tone });
    timer.current = setTimeout(() => setToast(null), 4000);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && <div className={`toast ${toast.tone === 'bad' ? 'bad' : ''}`} role="status">{toast.message}</div>}
    </ToastContext.Provider>
  );
}

// ---------- data hook ----------
export function useLoad(loader, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    loader()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState({ data: null, error, loading: false }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1), setData: (data) => setState((s) => ({ ...s, data })) };
}
