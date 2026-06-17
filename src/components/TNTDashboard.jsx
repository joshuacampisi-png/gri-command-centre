import React, { useState, useEffect, useCallback, useRef } from "react";
import HireFlowTracker from "./HireFlowTracker";

const API = "/api/hires";

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.code = data.code || null;
    err.hint = data.hint || null;
    err.bondPaymentId = data.bondPaymentId || null;
    err.payload = data;
    throw err;
  }
  return data;
}

/* ── Date helpers (mirror server logic) ── */
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function ordinal(d) { if (d >= 11 && d <= 13) return d + 'th'; switch (d % 10) { case 1: return d + 'st'; case 2: return d + 'nd'; case 3: return d + 'rd'; default: return d + 'th'; } }
function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function formatDateLong(s) { const dt = parseDate(s); return `${DAYS[dt.getDay()]}, ${ordinal(dt.getDate())} ${MONTHS[dt.getMonth()]}`; }
function addDays(s, n) { const dt = parseDate(s); dt.setDate(dt.getDate() + n); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`; }
function getHireDates(eventDate) {
  const pickup = addDays(eventDate, -1);
  const ret = addDays(eventDate, 1);
  return { pickupFormatted: formatDateLong(pickup), eventFormatted: formatDateLong(eventDate), returnFormatted: formatDateLong(ret) };
}

const STATUS_CONFIG = {
  confirmed: { label: "Confirmed", color: "var(--blue)", bg: "var(--blue-bg)" },
  bond_paid: { label: "Bond Paid", color: "var(--green)", bg: "var(--green-bg)" },
  contract_sent: { label: "Contract Sent", color: "var(--text-soft)", bg: "var(--bg-subtle)" },
  contract_signed: { label: "Ready", color: "var(--green)", bg: "var(--green-bg)" },
  active: { label: "Out on Hire", color: "var(--amber)", bg: "var(--amber-bg)" },
  returned: { label: "Returned", color: "var(--text-muted)", bg: "var(--bg-subtle)" },
  withheld: { label: "Withheld", color: "var(--red)", bg: "var(--red-bg)" },
};
const BOND_CONFIG = {
  pending: { label: "Pending", color: "var(--amber)", bg: "var(--amber-bg)" },
  paid: { label: "Paid", color: "var(--green)", bg: "var(--green-bg)" },
  refunded: { label: "Refunded", color: "var(--blue)", bg: "var(--blue-bg)" },
  withheld: { label: "Withheld", color: "var(--red)", bg: "var(--red-bg)" },
};
const CONTRACT_CONFIG = {
  not_sent: { label: "Not Sent", color: "var(--text-muted)", bg: "var(--bg-subtle)" },
  sent: { label: "Sent", color: "var(--text-soft)", bg: "var(--bg-subtle)" },
  signed: { label: "Signed", color: "var(--green)", bg: "var(--green-bg)" },
};

const pill = (cfg) => (
  <span style={{
    display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
    background: cfg.bg, color: cfg.color, letterSpacing: "0.02em",
  }}>{cfg.label}</span>
);

/* FlowProgress now extracted into shared HireFlowTracker component */
const FlowProgress = ({ hire }) => <HireFlowTracker hire={hire} />;

/* ── Signed Contracts register ── */
function SignedContracts() {
  const [contracts, setContracts] = useState([]);
  useEffect(() => {
    fetch('/api/hires/contracts').then(r => r.json()).then(d => setContracts(d.contracts || [])).catch(() => {});
  }, []);

  if (contracts.length === 0) return null;

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", marginTop: 24, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Signed Contracts</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', background: 'var(--bg-canvas)' }}>
            <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Customer</th>
            <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Order</th>
            <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Signed</th>
            <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Contract</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map(c => (
            <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '8px 12px' }}>{c.customerName}</td>
              <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{c.orderNumber}</td>
              <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 12 }}>
                {new Date(c.contractSignedAt).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </td>
              <td style={{ padding: '8px 12px' }}>
                <a href={c.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text)', textDecoration: 'underline', fontSize: 12, fontWeight: 500 }}>Download PDF</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Shared button styles ── */
const btnBase = {
  fontSize: 12, fontWeight: 500, borderRadius: "var(--radius-sm)", cursor: "pointer",
  border: "1px solid var(--border)", padding: "6px 14px",
  background: "var(--bg-surface)", color: "var(--text)",
  transition: "all 0.12s", whiteSpace: "nowrap", textAlign: "center",
};
const btnPrimary = {
  ...btnBase, fontWeight: 600,
  background: "var(--text)", color: "var(--bg-surface)",
  border: "1px solid transparent",
};
const btnDanger = {
  ...btnBase, fontWeight: 600,
  background: "var(--red)", color: "var(--bg-surface)",
  border: "1px solid transparent",
};

/* ── Modals ── */

function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", width: "100%", maxWidth: 520, maxHeight: "85vh", overflowY: "auto", boxShadow: "var(--shadow-lg)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 18, lineHeight: 1, padding: "4px 8px" }}>×</button>
        </div>
        <div style={{ padding: "16px 20px" }}>{children}</div>
      </div>
    </div>
  );
}

function AddHireModal({ onClose, onAdd, loading }) {
  const [form, setForm] = useState({ orderNumber: "", customerName: "", customerEmail: "", customerPhone: "", eventDate: "" });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const valid = form.orderNumber && form.customerName && form.customerEmail && form.eventDate;
  const inp = (label, key, type = "text", ph = "") => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 3, fontWeight: 500 }}>{label}</label>
      <input type={type} value={form[key]} onChange={e => set(key, e.target.value)} placeholder={ph} style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-surface)", color: "var(--text)", fontSize: 13 }} />
    </div>
  );

  const preview = form.eventDate ? getHireDates(form.eventDate) : null;

  return (
    <Modal title="Lodge new hire" onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        {inp("Order number", "orderNumber", "text", "GRI-1050")}
        {inp("Customer name", "customerName", "text", "Jane Smith")}
        {inp("Email", "customerEmail", "email", "jane@email.com")}
        {inp("Phone", "customerPhone", "tel", "0412 000 000")}
      </div>
      {inp("Event date", "eventDate", "date")}
      {preview && (
        <div style={{ background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)", padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "var(--text-muted)" }}>
          <div>Pickup: {preview.pickupFormatted}</div>
          <div>Event: {preview.eventFormatted}</div>
          <div>Return: {preview.returnFormatted}</div>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
        <button onClick={onClose} style={btnBase}>Cancel</button>
        <button onClick={() => valid && onAdd(form)} disabled={!valid || loading} style={{
          ...btnPrimary, opacity: (!valid || loading) ? 0.5 : 1, cursor: valid && !loading ? "pointer" : "not-allowed",
        }}>{loading ? "Lodging..." : "Lodge hire"}</button>
      </div>
    </Modal>
  );
}

function ReturnModal({ hire, onClose, onDecide, loading }) {
  const fullBond = 200 * (hire.kitQty || 1);
  const [mode, setMode] = useState(null); // 'full' | 'partial' | 'withhold'
  const [partialAmount, setPartialAmount] = useState("");

  const submit = () => {
    if (mode === 'full') return onDecide('refund', {});
    if (mode === 'withhold') return onDecide('withhold', {});
    if (mode === 'partial') {
      const amt = parseFloat(partialAmount);
      if (Number.isNaN(amt) || amt <= 0) { alert('Enter a valid partial amount'); return; }
      if (amt > fullBond) { alert(`Amount can't exceed full bond $${fullBond}`); return; }
      return onDecide('refund', { customAmount: amt });
    }
  };

  const refundAmt = mode === 'full' ? fullBond : mode === 'partial' ? (parseFloat(partialAmount) || 0) : 0;
  const withholdAmt = fullBond - refundAmt;

  return (
    <Modal title={`Process Return — ${hire.orderNumber}`} onClose={onClose}>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 14px" }}>
        <strong>{hire.customerName}</strong> · Bond held: <strong style={{ color: "var(--text)" }}>${fullBond}</strong>
        {(hire.kitQty || 1) > 1 && <> ({hire.kitQty} kits × $200)</>}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
        <button onClick={() => { setMode('full'); setPartialAmount(""); }}
          style={{
            padding: '12px 8px', borderRadius: "var(--radius)", cursor: 'pointer',
            border: mode === 'full' ? '2px solid var(--green)' : '1px solid var(--border)',
            background: mode === 'full' ? 'var(--green-bg)' : 'transparent',
            color: 'var(--green)', fontWeight: 600, fontSize: 13,
          }}>
          Full Refund<div style={{ fontSize: 11, fontWeight: 400, marginTop: 2 }}>${fullBond} → customer</div>
        </button>
        <button onClick={() => setMode('partial')}
          style={{
            padding: '12px 8px', borderRadius: "var(--radius)", cursor: 'pointer',
            border: mode === 'partial' ? '2px solid var(--amber)' : '1px solid var(--border)',
            background: mode === 'partial' ? 'var(--amber-bg)' : 'transparent',
            color: 'var(--amber)', fontWeight: 600, fontSize: 13,
          }}>
          Partial<div style={{ fontSize: 11, fontWeight: 400, marginTop: 2 }}>Keep some for damage</div>
        </button>
        <button onClick={() => { setMode('withhold'); setPartialAmount(""); }}
          style={{
            padding: '12px 8px', borderRadius: "var(--radius)", cursor: 'pointer',
            border: mode === 'withhold' ? '2px solid var(--red)' : '1px solid var(--border)',
            background: mode === 'withhold' ? 'var(--red-bg)' : 'transparent',
            color: 'var(--red)', fontWeight: 600, fontSize: 13,
          }}>
          Withhold All<div style={{ fontSize: 11, fontWeight: 400, marginTop: 2 }}>$0 → customer</div>
        </button>
      </div>

      {mode === 'partial' && (
        <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--border)', borderRadius: "var(--radius)", padding: '12px 14px', marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
            Refund amount to customer ($)
          </label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--amber)' }}>$</span>
            <input type="number" step="0.01" min="0" max={fullBond}
              autoFocus value={partialAmount}
              onChange={e => setPartialAmount(e.target.value)}
              placeholder={`up to ${fullBond}`}
              style={{ flex: 1, padding: '8px 10px', fontSize: 16, borderRadius: "var(--radius-sm)", border: '1px solid var(--border)', fontWeight: 600, outline: 'none' }} />
          </div>
          {parseFloat(partialAmount) > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-soft)', lineHeight: 1.5 }}>
              Customer gets back: <strong>${refundAmt.toFixed(2)}</strong> · GRI keeps for damage: <strong>${withholdAmt.toFixed(2)}</strong>
            </div>
          )}
        </div>
      )}

      {(mode === 'full' || (mode === 'partial' && parseFloat(partialAmount) > 0) || mode === 'withhold') && (
        <div style={{ padding: '10px 12px', background: 'var(--green-bg)', border: '1px solid var(--border)', borderRadius: "var(--radius)", marginBottom: 12, fontSize: 13, color: 'var(--green)' }}>
          {mode === 'full' && <>✓ Refunding <strong>${fullBond.toFixed(2)}</strong> to customer's card. Funds appear in 2–10 business days.</>}
          {mode === 'partial' && parseFloat(partialAmount) > 0 && <>✓ Refunding <strong>${refundAmt.toFixed(2)}</strong> to customer · keeping <strong>${withholdAmt.toFixed(2)}</strong> for damage</>}
          {mode === 'withhold' && <>⚠ No refund — full <strong>${fullBond.toFixed(2)}</strong> bond withheld. Customer notified by email.</>}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnBase}>Cancel</button>
        <button disabled={!mode || (mode === 'partial' && !partialAmount) || loading} onClick={submit}
          style={{
            ...(mode === "withhold" ? btnDanger : btnPrimary),
            opacity: (!mode || (mode === 'partial' && !partialAmount) || loading) ? 0.5 : 1,
            cursor: mode && !loading ? "pointer" : "not-allowed",
          }}>{loading ? "Processing..." : "Confirm"}</button>
      </div>
    </Modal>
  );
}

/* ── Detail side panel ── */

function DetailPanel({ hire, onClose, onAction }) {
  const sCfg = STATUS_CONFIG[hire.status] || STATUS_CONFIG.confirmed;
  const bCfg = BOND_CONFIG[hire.bondStatus] || BOND_CONFIG.pending;
  const cCfg = CONTRACT_CONFIG[hire.contractStatus] || CONTRACT_CONFIG.not_sent;
  const dates = hire.eventDate ? getHireDates(hire.eventDate) : null;

  /* Legacy steps removed — replaced by FlowProgress component */

  const row = (label, val) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", fontSize: 13, borderBottom: "1px solid var(--border)" }}>
      <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: "right", maxWidth: "58%", wordBreak: "break-all" }}>{val}</span>
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 499, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)" }} />
      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 380,
        background: "var(--bg-surface)",
        borderLeft: "1px solid var(--border)",
        zIndex: 500, overflowY: "auto",
        boxShadow: "var(--shadow-lg)",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid var(--border)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          position: "sticky", top: 0, background: "var(--bg-surface)", zIndex: 1,
        }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>{hire.orderNumber}</span>
          <button onClick={onClose} style={{
            background: "var(--bg-subtle)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 14, color: "var(--text-muted)",
            width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
          }}>×</button>
        </div>

        <div style={{ padding: "16px 20px" }}>
          {/* Status pills */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
            {pill(sCfg)} {pill(bCfg)} {pill(cCfg)}
          </div>

          {/* Details */}
          {row("Customer", hire.customerName)}
          {row("Email", hire.customerEmail)}
          {row("Phone", hire.customerPhone || "N/A")}
          {dates && (
            <>
              {row("Pickup", dates.pickupFormatted)}
              {row("Event", dates.eventFormatted)}
              {row("Return by", dates.returnFormatted)}
            </>
          )}
          {row("Kit qty", (hire.kitQty || 1) >= 2 ? "2 kits" : "1 kit")}
          {row("Bond", (hire.kitQty || 1) >= 2 ? "$400" : "$200")}
          {hire.bondPaymentId && row("Square ID", hire.bondPaymentId)}
          {hire.bondPaymentUrl && row("Pay link", <a href={hire.bondPaymentUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)", textDecoration: "underline" }}>Open</a>)}

          {/* Flow Progress */}
          <div style={{ margin: "20px 0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Flow Progress</div>
          <FlowProgress hire={hire} />

          {/* Actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
            {!hire.emailSent && (
              <button onClick={() => onAction("send_confirm", hire)} style={{ ...btnBase, width: "100%" }}>Send confirmation email</button>
            )}
            {hire.emailSent && hire.status === "confirmed" && (
              <button onClick={() => onAction("resend_confirm", hire)} style={{ ...btnBase, width: "100%" }}>Resend confirmation email</button>
            )}
            {hire.status === "confirmed" && (
              <button onClick={() => onAction("mark_bond_paid", hire)} style={{ ...btnPrimary, width: "100%" }}>Mark bond paid</button>
            )}
            {(hire.status === "bond_paid" || hire.status === "contract_sent") && hire.contractStatus !== "signed" && (
              <button onClick={() => onAction("send_contract", hire)} style={{ ...btnPrimary, width: "100%" }}>
                {hire.contractStatus === "sent" ? "Resend contract" : "Send contract"}
              </button>
            )}
            {hire.bondPaymentUrl && hire.bondStatus === "pending" && (
              <button onClick={() => onAction("resend_bond_link", hire)} style={{ ...btnBase, width: "100%" }}>Resend bond payment link</button>
            )}
            {hire.contractStatus === "signed" && !hire.pickedUpAt && (
              <button onClick={() => onAction("mark_picked_up", hire)} style={{ ...btnPrimary, width: "100%" }}>Mark Picked Up</button>
            )}
            {hire.contractStatus === "signed" && (
              <a href={`/api/contract/${hire.id}/pdf`} target="_blank" rel="noopener noreferrer" style={{
                ...btnBase, display: "block", textDecoration: "none", width: "100%", boxSizing: "border-box",
              }}>Download signed contract PDF</a>
            )}
            {hire.bondStatus === "paid" && hire.squareCardId && (
              <button onClick={() => onAction("charge_damages", hire)} style={{ ...btnBase, width: "100%", borderColor: "var(--amber)", color: "var(--amber)" }}>
                Charge card for damages
                <span style={{ display: "block", fontSize: 10, fontWeight: 400, opacity: 0.85, marginTop: 2 }}>
                  {hire.squareCardBrand || "Card"} ending {hire.squareCardLast4 || "••••"}
                </span>
              </button>
            )}
            {hire.bondStatus === "paid" && hire.status !== "returned" && hire.status !== "withheld" && (
              <button onClick={() => onAction("mark_returned", hire)} style={{ ...btnDanger, width: "100%" }}>Process return</button>
            )}
            {Array.isArray(hire.damageCharges) && hire.damageCharges.length > 0 && (
              <div style={{ marginTop: 6, padding: "10px 12px", background: "var(--amber-bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                  Damage charges ({hire.damageCharges.length})
                </div>
                {hire.damageCharges.map((c, i) => (
                  <div key={i} style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 4, paddingBottom: 4, borderBottom: i < hire.damageCharges.length - 1 ? "1px dashed var(--border-strong)" : "none" }}>
                    <strong>${(c.amount || 0).toFixed(2)}</strong> · {c.reason}
                    <div style={{ fontSize: 10, opacity: 0.75 }}>{new Date(c.chargedAt).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {c.status || "COMPLETED"}</div>
                  </div>
                ))}
              </div>
            )}
            {hire.bondOutcome === "refunded" && (
              <div style={{ padding: "10px", background: "var(--green-bg)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--green)", textAlign: "center", fontWeight: 600 }}>Bond refunded</div>
            )}
            {hire.bondOutcome === "withheld" && (
              <div style={{ padding: "10px", background: "var(--red-bg)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--red)", textAlign: "center", fontWeight: 600 }}>Bond withheld</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Main dashboard ── */

export default function TNTDashboard() {
  const [hires, setHires] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const [detailHire, setDetailHire] = useState(null);
  const [filter, setFilter] = useState("all");
  const [toast, setToast] = useState(null);
  const [returnHire, setReturnHire] = useState(null);
  const [health, setHealth] = useState(null);
  const [showHealth, setShowHealth] = useState(false);
  const pollRef = useRef(null);

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const loadHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/hires/health");
      setHealth(await res.json());
    } catch {}
  }, []);

  const loadHires = useCallback(async () => {
    try { setHires((await api("")).hires); }
    catch (err) { showToast(err.message, "error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadHires();
    pollRef.current = setInterval(loadHires, 30000);
    return () => clearInterval(pollRef.current);
  }, [loadHires]);

  const act = async (action, hire) => {
    if (action === "view") { setDetailHire(hire); return; }
    if (action === "mark_returned") { setReturnHire(hire); return; }
    if (action === "charge_damages") {
      const amount = window.prompt(`Charge the card on file ${hire.squareCardBrand || ""} ending ${hire.squareCardLast4 || "••••"}\n\nAmount in AUD (e.g. 150):`);
      if (!amount) return;
      const reason = window.prompt("Reason / description (e.g. 'Cracked outer shell, replacement required')");
      if (!reason || !reason.trim()) return;
      setActionLoading(true);
      try {
        const r = await api(`/${hire.id}/charge-damages`, { method: "POST", body: JSON.stringify({ amount: parseFloat(amount), reason: reason.trim() }) });
        showToast(`Charged $${parseFloat(amount).toFixed(2)} to card on file (${r.charge.status})`);
        await loadHires();
      } catch (err) { showToast(err.message, "error"); }
      finally { setActionLoading(false); }
      return;
    }
    setActionLoading(true);
    try {
      if (action === "send_confirm" || action === "resend_confirm") {
        await api(`/${hire.id}/send-confirmation`, { method: "POST" });
        showToast("Confirmation sent to " + hire.customerEmail);
      } else if (action === "mark_bond_paid") {
        await api(`/${hire.id}/mark-bond-paid`, { method: "POST", body: JSON.stringify({}) });
        showToast("Bond marked as paid. Contract sent automatically.");
      } else if (action === "send_contract") {
        await api(`/${hire.id}/send-contract`, { method: "POST" });
        showToast("Contract sent to " + hire.customerEmail);
      } else if (action === "resend_bond_link") {
        await api(`/${hire.id}/send-bond-link`, { method: "POST" });
        showToast("Bond payment link resent to " + hire.customerEmail);
      } else if (action === "mark_picked_up") {
        await api(`/${hire.id}/mark-picked-up`, { method: "POST" });
        showToast("Marked as picked up");
      }
      await loadHires();
    } catch (err) { showToast(err.message, "error"); }
    finally { setActionLoading(false); }
  };

  const handleReturn = async (decision, opts = {}) => {
    setActionLoading(true);
    try {
      const body = { decision, forceManual: !!opts.forceManual };
      if (opts.customAmount != null) body.customAmount = opts.customAmount;
      const r = await api(`/${returnHire.id}/process-return`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (decision === "refund") {
        if (r.manual) {
          showToast("Marked refunded_manual — process in Square dashboard yourself", "warn");
        } else if (r.refundStatus === "PENDING") {
          const amt = opts.customAmount ? `$${opts.customAmount.toFixed(2)}` : "bond";
          showToast(`Square accepted refund ${amt} (PENDING) — lands in 2-10 days`);
        } else {
          const amt = opts.customAmount ? `$${opts.customAmount.toFixed(2)}` : "Full bond";
          showToast(`${amt} refunded, email sent`);
        }
      } else {
        showToast("Bond withheld, customer notified");
      }
      setReturnHire(null);
      await loadHires();
    } catch (err) {
      if (err.code === "NO_SQUARE_PAYMENT" || err.code === "SQUARE_REFUND_FAILED") {
        const msg = `${err.message}\n\n${err.hint || ""}\n\nClick OK to mark this hire as "refunded_manual" (you handle the refund in Square dashboard). Click Cancel to abort.`;
        if (window.confirm(msg)) {
          return handleReturn("refund", { forceManual: true, customAmount: opts.customAmount });
        }
      } else {
        showToast(err.message, "error");
      }
    }
    finally { setActionLoading(false); }
  };

  const handleAdd = async (form) => {
    setActionLoading(true);
    try {
      const d = await api("", { method: "POST", body: JSON.stringify(form) });
      showToast("Hire lodged. Email + payment link sent to " + d.hire.customerEmail);
      setActiveModal(null);
      await loadHires();
    } catch (err) { showToast(err.message, "error"); }
    finally { setActionLoading(false); }
  };

  const filtered = hires.filter(h => {
    if (filter === "all") return true;
    if (filter === "active") return ["confirmed", "bond_paid", "contract_sent", "contract_signed", "active"].includes(h.status);
    if (filter === "returned") return h.status === "returned" || h.status === "withheld";
    return h.status === filter;
  });

  const c = {
    all: hires.length,
    confirmed: hires.filter(h => h.status === "confirmed").length,
    active: hires.filter(h => ["bond_paid", "contract_sent", "contract_signed", "active"].includes(h.status)).length,
    returned: hires.filter(h => h.status === "returned" || h.status === "withheld").length,
  };

  const nextAction = (h) => {
    if (!h.emailSent) return { key: "send_confirm", label: "Send email", style: btnBase };
    if (h.status === "confirmed") return { key: "mark_bond_paid", label: "Mark bond paid", style: btnPrimary };
    if ((h.status === "bond_paid" || h.status === "contract_sent") && h.contractStatus !== "signed") return { key: "send_contract", label: "Send contract", style: btnPrimary };
    if (h.contractStatus === "signed" && !h.pickedUpAt) return { key: "mark_picked_up", label: "Mark picked up", style: btnPrimary };
    if (h.bondStatus === "paid" && h.status !== "returned" && h.status !== "withheld") return { key: "mark_returned", label: "Process return", style: btnDanger };
    return null;
  };

  return (
    <div className="page" style={{ padding: 0 }}>
      {toast && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 2000, borderRadius: "var(--radius)", padding: "10px 16px", fontSize: 13, fontWeight: 600,
          background: toast.type === "success" ? "var(--green-bg)" : "var(--red-bg)", color: toast.type === "success" ? "var(--green)" : "var(--red)",
          border: `1px solid var(--border)`, boxShadow: "var(--shadow)",
        }}>{toast.msg}</div>
      )}

      {/* Header */}
      <div style={{ padding: "14px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>TNT Cannon Hire</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={async () => {
            try {
              const r = await api('/sync', { method: 'POST' })
              showToast(`Synced: ${r.created} new hires found, ${r.skipped} skipped`)
              // Auto-reconcile payments after sync
              const rec = await api('/reconcile-payments', { method: 'POST' })
              if (rec.reconciled > 0) showToast(`${rec.reconciled} bond payment(s) matched`)
              await loadHires()
            } catch (e) { showToast(e.message, 'error') }
          }} style={btnBase}>
            Sync Orders
          </button>
          <button onClick={() => { loadHealth(); setShowHealth(v => !v); }} style={btnBase}>
            {showHealth ? 'Hide Health' : 'Flow Health'}
          </button>
          <button onClick={() => setActiveModal("add")} style={btnPrimary}>+ Lodge hire</button>
        </div>
      </div>

      <div style={{ padding: "20px 24px" }}>
        {/* Stat row */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            { label: "Total", value: c.all },
            { label: "Awaiting bond", value: c.confirmed, color: "var(--amber)" },
            { label: "Out on hire", value: c.active, color: "var(--blue)" },
            { label: "Returned", value: c.returned, color: "var(--text-muted)" },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "10px 14px", minWidth: 100 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: s.color || "var(--text)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Flow Health Panel */}
        {showHealth && health?.checks && (
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "14px 18px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              Flow Health Check
              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: health.ok ? "var(--green-bg)" : "var(--red-bg)", color: health.ok ? "var(--green)" : "var(--red)" }}>
                {health.ok ? "ALL SYSTEMS GO" : "ISSUES FOUND"}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
              {Object.entries(health.checks).map(([name, check]) => (
                <div key={name} style={{ fontSize: 12, padding: "8px 12px", borderRadius: "var(--radius-sm)", border: `1px solid var(--border)`, background: check.ok ? 'var(--green-bg)' : 'var(--red-bg)' }}>
                  <div style={{ fontWeight: 600, marginBottom: 4, textTransform: "uppercase", fontSize: 11, letterSpacing: "0.08em", color: check.ok ? "var(--green)" : "var(--red)" }}>
                    {check.ok ? "\u2713" : "\u2717"} {name}
                  </div>
                  {Object.entries(check).filter(([k]) => k !== "ok").map(([k, v]) => (
                    <div key={k} style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {k}: {typeof v === "boolean" ? (v ? "\u2713" : "\u2717") : String(v)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 2, marginBottom: 12 }}>
          {[
            { key: "all", label: "All", n: c.all },
            { key: "active", label: "Active", n: c.confirmed + c.active },
            { key: "returned", label: "Returned", n: c.returned },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              fontSize: 12, padding: "5px 12px", borderRadius: "var(--radius-sm)",
              background: filter === f.key ? "var(--bg-subtle)" : "transparent",
              border: filter === f.key ? "1px solid var(--border)" : "1px solid transparent",
              fontWeight: filter === f.key ? 600 : 400, cursor: "pointer", color: "var(--text)",
            }}>{f.label} <span style={{ opacity: 0.5 }}>{f.n}</span></button>
          ))}
        </div>

        {/* Table */}
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "17%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "25%" }} />
            </colgroup>
            <thead>
              <tr style={{ background: "var(--bg-canvas)" }}>
                {["Customer", "Order", "Event", "Status", "Bond", "Contract", "Email", "Actions"].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid var(--border)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: "28px 12px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: "28px 12px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No hires</td></tr>
              ) : filtered.map(hire => {
                const sCfg = STATUS_CONFIG[hire.status] || STATUS_CONFIG.confirmed;
                const bCfg = BOND_CONFIG[hire.bondStatus] || BOND_CONFIG.pending;
                const cCfg = CONTRACT_CONFIG[hire.contractStatus] || CONTRACT_CONFIG.not_sent;
                const dates = hire.eventDate ? getHireDates(hire.eventDate) : null;
                const next = nextAction(hire);
                return (
                  <React.Fragment key={hire.id}>
                  <tr style={{ borderBottom: "none", cursor: "pointer", borderTop: "1px solid var(--border)" }} onClick={() => setDetailHire(hire)}>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hire.customerName}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hire.customerPhone || hire.customerEmail}</div>
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{hire.orderNumber}</td>
                    <td style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-muted)" }}>
                      {dates ? (
                        <>
                          <div>{dates.eventFormatted}</div>
                          <div style={{ fontSize: 10, opacity: 0.6 }}>Pickup: {dates.pickupFormatted}</div>
                        </>
                      ) : "N/A"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>{pill(sCfg)}</td>
                    <td style={{ padding: "10px 12px" }}>{pill(bCfg)}</td>
                    <td style={{ padding: "10px 12px" }} onClick={e => e.stopPropagation()}>
                      {pill(hire.emailSent
                        ? { label: "Sent", color: "var(--green)", bg: "var(--green-bg)" }
                        : { label: "Not Sent", color: "var(--red)", bg: "var(--red-bg)" }
                      )}
                    </td>
                    <td style={{ padding: "10px 12px" }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {pill(cCfg)}
                        {hire.contractStatus === "signed" && (
                          <a href={`/api/contract/${hire.id}/pdf`} target="_blank" rel="noopener noreferrer" title="Download signed contract" style={{ fontSize: 14, textDecoration: "none", color: "var(--green)" }}>📄</a>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "8px 12px" }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        {next && (
                          <button onClick={() => act(next.key, hire)} style={{ ...next.style, fontSize: 11, padding: "5px 10px" }}>{next.label}</button>
                        )}
                        <button onClick={() => setDetailHire(hire)} style={{ ...btnBase, fontSize: 11, padding: "5px 10px" }}>View</button>
                      </div>
                    </td>
                  </tr>
                  <tr onClick={() => setDetailHire(hire)}>
                    <td colSpan={8} style={{ padding: "0 12px 8px" }}>
                      <FlowProgress hire={hire} />
                    </td>
                  </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Signed Contracts Register */}
        <SignedContracts />
      </div>

      {detailHire && <DetailPanel hire={hires.find(h => h.id === detailHire.id) || detailHire} onClose={() => setDetailHire(null)} onAction={act} />}
      {activeModal === "add" && <AddHireModal onClose={() => setActiveModal(null)} onAdd={handleAdd} loading={actionLoading} />}
      {returnHire && <ReturnModal hire={returnHire} onClose={() => setReturnHire(null)} onDecide={handleReturn} loading={actionLoading} />}
    </div>
  );
}
