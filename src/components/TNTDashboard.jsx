import React, { useState, useEffect, useCallback, useRef } from "react";

const API = "/api/hires";

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
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
  confirmed: { label: "Confirmed", color: "#185FA5", bg: "#E6F1FB" },
  bond_paid: { label: "Bond Paid", color: "#3B6D11", bg: "#EAF3DE" },
  contract_sent: { label: "Contract Sent", color: "#7C3AED", bg: "#F3EEFF" },
  contract_signed: { label: "Ready", color: "#0D7C3D", bg: "#DAFBE8" },
  active: { label: "Out on Hire", color: "#BA7517", bg: "#FAEEDA" },
  returned: { label: "Returned", color: "#5F5E5A", bg: "#F1EFE8" },
  withheld: { label: "Withheld", color: "#A32D2D", bg: "#FCEBEB" },
};
const BOND_CONFIG = {
  pending: { label: "Pending", color: "#BA7517", bg: "#FAEEDA" },
  paid: { label: "Paid", color: "#3B6D11", bg: "#EAF3DE" },
  refunded: { label: "Refunded", color: "#185FA5", bg: "#E6F1FB" },
  withheld: { label: "Withheld", color: "#A32D2D", bg: "#FCEBEB" },
};
const CONTRACT_CONFIG = {
  not_sent: { label: "Not Sent", color: "#5F5E5A", bg: "#F1EFE8" },
  sent: { label: "Sent", color: "#7C3AED", bg: "#F3EEFF" },
  signed: { label: "Signed", color: "#3B6D11", bg: "#EAF3DE" },
};

const pill = (cfg) => (
  <span style={{
    display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
    background: cfg.bg, color: cfg.color, letterSpacing: "0.02em",
  }}>{cfg.label}</span>
);

/* ── Flow progress bar ── */
function FlowProgress({ hire }) {
  const steps = [
    { key: 'booked', label: 'Booked', done: true, at: hire.createdAt },
    { key: 'email', label: 'Email', done: hire.emailSent, at: hire.confirmationSentAt },
    { key: 'bond', label: 'Bond Paid', done: hire.bondStatus === 'paid', at: hire.bondPaidAt },
    { key: 'contract_sent', label: 'Contract Sent', done: ['sent','signed'].includes(hire.contractStatus), at: hire.contractSentAt },
    { key: 'signed', label: 'Signed', done: hire.contractStatus === 'signed', at: hire.contractSignedAt },
    { key: 'picked_up', label: 'Picked Up', done: !!hire.pickedUpAt, at: hire.pickedUpAt },
    { key: 'returned', label: 'Returned', done: ['returned','withheld'].includes(hire.status), at: hire.returnedAt },
    { key: 'bond_outcome', label: hire.bondOutcome === 'withheld' ? 'Withheld' : 'Refunded', done: !!hire.bondOutcome, at: hire.bondOutcomeAt },
  ];

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      {steps.map((step, i) => (
        <React.Fragment key={step.key}>
          {i > 0 && <span style={{ color: '#333', fontSize: 10 }}>{'\u2192'}</span>}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            opacity: step.done ? 1 : 0.35
          }}>
            <span style={{ fontSize: 11, fontWeight: step.done ? 600 : 400, color: step.done ? '#22c55e' : '#666' }}>
              {step.done ? '\u2713' : '\u25CB'} {step.label}
            </span>
            {step.done && step.at && (
              <span style={{ fontSize: 9, color: '#888' }}>
                {new Date(step.at).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

/* ── Signed Contracts register ── */
function SignedContracts() {
  const [contracts, setContracts] = useState([]);
  useEffect(() => {
    fetch('/api/hires/contracts').then(r => r.json()).then(d => setContracts(d.contracts || [])).catch(() => {});
  }, []);

  if (contracts.length === 0) return null;

  return (
    <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, marginTop: 24, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Signed Contracts</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '0.5px solid var(--color-border-tertiary)', textAlign: 'left' }}>
            <th style={{ padding: '8px 12px', color: 'var(--color-text-secondary)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer</th>
            <th style={{ padding: '8px 12px', color: 'var(--color-text-secondary)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Order</th>
            <th style={{ padding: '8px 12px', color: 'var(--color-text-secondary)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Signed</th>
            <th style={{ padding: '8px 12px', color: 'var(--color-text-secondary)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contract</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map(c => (
            <tr key={c.id} style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
              <td style={{ padding: '8px 12px' }}>{c.customerName}</td>
              <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{c.orderNumber}</td>
              <td style={{ padding: '8px 12px', color: 'var(--color-text-secondary)', fontSize: 12 }}>
                {new Date(c.contractSignedAt).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </td>
              <td style={{ padding: '8px 12px' }}>
                <a href={c.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', textDecoration: 'none', fontSize: 12, fontWeight: 500 }}>Download PDF</a>
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
  fontSize: 12, fontWeight: 500, borderRadius: 6, cursor: "pointer",
  border: "1px solid var(--color-border-tertiary)", padding: "6px 14px",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)",
  transition: "all 0.12s", whiteSpace: "nowrap", textAlign: "center",
};
const btnPrimary = {
  ...btnBase, fontWeight: 600,
  background: "var(--color-text-primary)", color: "var(--color-background-primary)",
  border: "1px solid transparent",
};
const btnDanger = {
  ...btnBase, fontWeight: 600,
  background: "#A32D2D", color: "#fff",
  border: "1px solid transparent",
};

/* ── Modals ── */

function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--color-background-primary)", borderRadius: 10, border: "0.5px solid var(--color-border-tertiary)", width: "100%", maxWidth: 520, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", fontSize: 18, lineHeight: 1, padding: "4px 8px" }}>×</button>
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
      <label style={{ display: "block", fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 3, fontWeight: 500 }}>{label}</label>
      <input type={type} value={form[key]} onChange={e => set(key, e.target.value)} placeholder={ph} style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1px solid var(--color-border-tertiary)", borderRadius: 6, background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: 13 }} />
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
        <div style={{ background: "var(--color-background-secondary)", borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "var(--color-text-secondary)" }}>
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
  const [decision, setDecision] = useState(null);
  return (
    <Modal title={`Process Return — ${hire.orderNumber}`} onClose={onClose}>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 16px" }}>
        <strong>{hire.customerName}</strong> — Bond: ${(hire.kitQty || 1) >= 2 ? "$400" : "$200"}{(hire.kitQty || 1) >= 2 ? " (2 kits)" : ""}. What happens to the bond?
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        {[
          { val: "refund", label: "Refund bond", desc: "Good condition — returned clean", color: "#3B6D11", bg: "#EAF3DE" },
          { val: "withhold", label: "Withhold bond", desc: "Damage, dirty, or breach", color: "#A32D2D", bg: "#FCEBEB" },
        ].map(opt => (
          <div key={opt.val} onClick={() => setDecision(opt.val)} style={{
            border: decision === opt.val ? `2px solid ${opt.color}` : "1px solid var(--color-border-tertiary)",
            borderRadius: 8, padding: "14px 16px", cursor: "pointer",
            background: decision === opt.val ? opt.bg : "transparent", transition: "all 0.12s",
          }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: opt.color }}>{opt.label}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>{opt.desc}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnBase}>Cancel</button>
        <button disabled={!decision || loading} onClick={() => decision && onDecide(decision)} style={{
          ...(decision === "withhold" ? btnDanger : btnPrimary),
          opacity: (!decision || loading) ? 0.5 : 1, cursor: decision && !loading ? "pointer" : "not-allowed",
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
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", fontSize: 13, borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
      <span style={{ color: "var(--color-text-secondary)", flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: "right", maxWidth: "58%", wordBreak: "break-all" }}>{val}</span>
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 499, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(2px)" }} />
      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 380,
        background: "var(--color-background-primary)",
        borderLeft: "1px solid var(--color-border-tertiary)",
        zIndex: 500, overflowY: "auto",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.15)",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid var(--color-border-tertiary)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          position: "sticky", top: 0, background: "var(--color-background-primary)", zIndex: 1,
        }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{hire.orderNumber}</span>
          <button onClick={onClose} style={{
            background: "var(--color-background-secondary)", border: "1px solid var(--color-border-tertiary)",
            borderRadius: 6, cursor: "pointer", fontSize: 14, color: "var(--color-text-secondary)",
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
          {hire.bondPaymentUrl && row("Pay link", <a href={hire.bondPaymentUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#185FA5", textDecoration: "underline" }}>Open</a>)}

          {/* Flow Progress */}
          <div style={{ margin: "20px 0 12px", fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Flow Progress</div>
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
            {hire.bondStatus === "paid" && hire.status !== "returned" && hire.status !== "withheld" && (
              <button onClick={() => onAction("mark_returned", hire)} style={{ ...btnDanger, width: "100%" }}>Process return</button>
            )}
            {hire.bondOutcome === "refunded" && (
              <div style={{ padding: "10px", background: "#EAF3DE", borderRadius: 6, fontSize: 12, color: "#3B6D11", textAlign: "center", fontWeight: 600 }}>Bond refunded</div>
            )}
            {hire.bondOutcome === "withheld" && (
              <div style={{ padding: "10px", background: "#FCEBEB", borderRadius: 6, fontSize: 12, color: "#A32D2D", textAlign: "center", fontWeight: 600 }}>Bond withheld</div>
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

  const handleReturn = async (decision) => {
    setActionLoading(true);
    try {
      await api(`/${returnHire.id}/process-return`, { method: "POST", body: JSON.stringify({ decision }) });
      showToast(decision === "refund" ? "Bond refunded, email sent" : "Bond withheld, customer notified");
      setReturnHire(null);
      await loadHires();
    } catch (err) { showToast(err.message, "error"); }
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
          position: "fixed", top: 16, right: 16, zIndex: 2000, borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 600,
          background: toast.type === "success" ? "#EAF3DE" : "#FCEBEB", color: toast.type === "success" ? "#3B6D11" : "#A32D2D",
          border: `1px solid ${toast.type === "success" ? "#C0DD97" : "#F7C1C1"}`, boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}>{toast.msg}</div>
      )}

      {/* Header */}
      <div style={{ padding: "14px 24px", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>TNT Cannon Hire</span>
        <div style={{ display: "flex", gap: 8 }}>
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
            { label: "Awaiting bond", value: c.confirmed, color: "#BA7517" },
            { label: "Out on hire", value: c.active, color: "#185FA5" },
            { label: "Returned", value: c.returned, color: "#5F5E5A" },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, padding: "10px 14px", minWidth: 100 }}>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: s.color || "var(--color-text-primary)" }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Flow Health Panel */}
        {showHealth && health?.checks && (
          <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, padding: "14px 18px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              Flow Health Check
              <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 4, background: health.ok ? "#EAF3DE" : "#FCEBEB", color: health.ok ? "#3B6D11" : "#A32D2D" }}>
                {health.ok ? "ALL SYSTEMS GO" : "ISSUES FOUND"}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
              {Object.entries(health.checks).map(([name, check]) => (
                <div key={name} style={{ fontSize: 12, padding: "8px 12px", borderRadius: 6, border: `1px solid ${check.ok ? '#C0DD97' : '#F7C1C1'}`, background: check.ok ? 'rgba(234,243,222,0.1)' : 'rgba(252,235,235,0.1)' }}>
                  <div style={{ fontWeight: 600, marginBottom: 4, textTransform: "uppercase", fontSize: 10, color: check.ok ? "#3B6D11" : "#A32D2D" }}>
                    {check.ok ? "\u2713" : "\u2717"} {name}
                  </div>
                  {Object.entries(check).filter(([k]) => k !== "ok").map(([k, v]) => (
                    <div key={k} style={{ fontSize: 11, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
              fontSize: 12, padding: "5px 12px", borderRadius: 6,
              background: filter === f.key ? "var(--color-background-secondary)" : "transparent",
              border: filter === f.key ? "1px solid var(--color-border-secondary)" : "1px solid transparent",
              fontWeight: filter === f.key ? 600 : 400, cursor: "pointer", color: "var(--color-text-primary)",
            }}>{f.label} <span style={{ opacity: 0.5 }}>{f.n}</span></button>
          ))}
        </div>

        {/* Table */}
        <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, overflow: "hidden" }}>
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
              <tr>
                {["Customer", "Order", "Event", "Status", "Bond", "Contract", "Email", "Actions"].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: "28px 12px", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13 }}>Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: "28px 12px", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13 }}>No hires</td></tr>
              ) : filtered.map(hire => {
                const sCfg = STATUS_CONFIG[hire.status] || STATUS_CONFIG.confirmed;
                const bCfg = BOND_CONFIG[hire.bondStatus] || BOND_CONFIG.pending;
                const cCfg = CONTRACT_CONFIG[hire.contractStatus] || CONTRACT_CONFIG.not_sent;
                const dates = hire.eventDate ? getHireDates(hire.eventDate) : null;
                const next = nextAction(hire);
                return (
                  <React.Fragment key={hire.id}>
                  <tr style={{ borderBottom: "none", cursor: "pointer" }} onClick={() => setDetailHire(hire)}>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hire.customerName}</div>
                      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hire.customerPhone || hire.customerEmail}</div>
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 12, color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}>{hire.orderNumber}</td>
                    <td style={{ padding: "10px 12px", fontSize: 12, color: "var(--color-text-secondary)" }}>
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
                        ? { label: "Sent", color: "#3B6D11", bg: "#EAF3DE" }
                        : { label: "Not Sent", color: "#A32D2D", bg: "#FCEBEB" }
                      )}
                    </td>
                    <td style={{ padding: "10px 12px" }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {pill(cCfg)}
                        {hire.contractStatus === "signed" && (
                          <a href={`/api/contract/${hire.id}/pdf`} target="_blank" rel="noopener noreferrer" title="Download signed contract" style={{ fontSize: 14, textDecoration: "none", color: "#3B6D11" }}>📄</a>
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
                  <tr style={{ borderBottom: "0.5px solid var(--color-border-tertiary)" }} onClick={() => setDetailHire(hire)}>
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
