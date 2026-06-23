import React, { useState, useEffect, useCallback, useRef } from "react";

/* ── API helper ── */
const API = "/api/gmb";

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.code = data.code || null;
    err.payload = data;
    throw err;
  }
  return data;
}

/* ── Status pill config (mirror TNTDashboard pattern) ── */
const POST_STATUS_CONFIG = {
  posted:    { label: "Posted",    color: "var(--green)",      bg: "var(--green-bg)" },
  pending:   { label: "Pending",   color: "var(--amber)",      bg: "var(--amber-bg)" },
  failed:    { label: "Failed",    color: "var(--red)",        bg: "var(--red-bg)" },
  scheduled: { label: "Scheduled", color: "var(--blue)",       bg: "var(--blue-bg)" },
  skipped:   { label: "Skipped",   color: "var(--text-muted)", bg: "var(--bg-subtle)" },
};

const AUTH_CONFIG = {
  valid:   { label: "Connected",     color: "var(--green)", bg: "var(--green-bg)" },
  expired: { label: "Re-auth needed", color: "var(--amber)", bg: "var(--amber-bg)" },
  missing: { label: "Not connected", color: "var(--red)",   bg: "var(--red-bg)" },
};

const pill = (cfg) => (
  <span style={{
    display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
    background: cfg.bg, color: cfg.color, letterSpacing: "0.02em",
  }}>{cfg.label}</span>
);

/* ── Button styles (shared with TNTDashboard pattern) ── */
const btnBase = {
  fontSize: 12, fontWeight: 500, borderRadius: "var(--radius-sm)", cursor: "pointer",
  border: "1px solid var(--border)", padding: "6px 14px",
  background: "var(--bg-surface)", color: "var(--text)",
  transition: "all 0.12s", whiteSpace: "nowrap", textAlign: "center",
};
const btnPrimary = {
  ...btnBase, fontWeight: 600,
  background: "var(--accent)", color: "var(--bg-surface)",
  border: "1px solid transparent",
};
const btnWarn = {
  ...btnBase, fontWeight: 600,
  background: "var(--amber)", color: "var(--bg-surface)",
  border: "1px solid transparent",
};

/* ── Date formatting ── */
function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-AU", {
      timeZone: "Australia/Brisbane",
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch { return "—"; }
}

function truncate(s, n = 80) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/* ── Modal ── */
function Modal({ title, onClose, children, maxWidth = 520 }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", width: "100%", maxWidth, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 18, lineHeight: 1, padding: "4px 8px" }}>×</button>
        </div>
        <div style={{ padding: "16px 20px" }}>{children}</div>
      </div>
    </div>
  );
}

/* ── KPI card ── */
function KpiCard({ label, value, sub, accent }) {
  return (
    <div style={{ padding: "14px 18px", flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{label}</div>
      <div style={{
        fontSize: 22, fontWeight: 600, color: accent || "var(--text)",
        fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
        lineHeight: 1.1,
      }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/* ── Next post preview panel ── */
function NextPostPreview({ next }) {
  if (!next) {
    return (
      <div style={{
        background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
        padding: "20px 22px", color: "var(--text-muted)", fontSize: 13,
      }}>
        Queue is empty — no upcoming post scheduled.
      </div>
    );
  }
  return (
    <div style={{
      background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
      overflow: "hidden",
    }}>
      <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Next post</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          Scheduled {formatDateTime(next.scheduledFor)}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 0 }}>
        {/* Image */}
        <div style={{
          background: "var(--bg-canvas)", borderRight: "1px solid var(--border)",
          aspectRatio: "1 / 1", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
        }}>
          {next.imageUrl ? (
            <img src={next.imageUrl} alt="Next GMB post" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>No image</span>
          )}
        </div>
        {/* Body */}
        <div style={{ padding: "14px 18px", minWidth: 0 }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 4 }}>Description</div>
            <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>
              {truncate(next.description, 220) || <span style={{ color: "var(--text-faint)" }}>—</span>}
            </div>
            {next.descriptionId && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                ID: {next.descriptionId}
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 2 }}>CTA button</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{next.buttonType || "—"}</div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 2 }}>Mapped URL</div>
              {next.buttonUrl ? (
                <a href={next.buttonUrl} target="_blank" rel="noopener noreferrer" style={{
                  fontSize: 12, color: "var(--text)", textDecoration: "underline",
                  fontFamily: "var(--font-mono)", display: "block",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{next.buttonUrl}</a>
              ) : (
                <span style={{ fontSize: 12, color: "var(--text-faint)" }}>—</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Recent posts table ── */
function RecentPostsTable({ posts }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Recent posts</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Last 30 days · {posts.length} posts</span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "70px" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "38%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "12%" }} />
        </colgroup>
        <thead>
          <tr style={{ background: "var(--bg-canvas)" }}>
            {["Image", "Description ID", "Button URL", "Posted at", "Status"].map(h => (
              <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid var(--border)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {posts.length === 0 ? (
            <tr><td colSpan={5} style={{ padding: "28px 12px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No posts in the last 30 days</td></tr>
          ) : posts.map(p => {
            const cfg = POST_STATUS_CONFIG[p.status] || POST_STATUS_CONFIG.pending;
            return (
              <tr key={p.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "8px 12px" }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: "var(--radius-sm)",
                    background: "var(--bg-canvas)", border: "1px solid var(--border)",
                    overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ fontSize: 10, color: "var(--text-faint)" }}>—</span>
                    )}
                  </div>
                </td>
                <td style={{ padding: "8px 12px", fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.descriptionId || "—"}
                </td>
                <td style={{ padding: "8px 12px", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.buttonUrl ? (
                    <a href={p.buttonUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text)", textDecoration: "underline", fontFamily: "var(--font-mono)" }}>{p.buttonUrl}</a>
                  ) : <span style={{ color: "var(--text-faint)" }}>—</span>}
                </td>
                <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                  {formatDateTime(p.postedAt)}
                </td>
                <td style={{ padding: "8px 12px" }}>{pill(cfg)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Failures table (collapsible) ── */
function FailuresTable({ failures }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", marginTop: 16 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", padding: "14px 18px", border: "none", background: "transparent", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: open ? "1px solid var(--border)" : "none",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
          Failures
          {failures.length > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
              background: "var(--red-bg)", color: "var(--red)",
              fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums",
            }}>{failures.length}</span>
          )}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {open ? "Hide" : "Show"} {failures.length > 0 ? `· last ${Math.min(failures.length, 10)}` : ""}
        </span>
      </button>
      {open && (
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "20%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "60%" }} />
          </colgroup>
          <thead>
            <tr style={{ background: "var(--bg-canvas)" }}>
              {["Failed at", "Description ID", "Error"].map(h => (
                <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid var(--border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {failures.length === 0 ? (
              <tr><td colSpan={3} style={{ padding: "20px 12px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No recent failures</td></tr>
            ) : failures.slice(0, 10).map((f, i) => (
              <tr key={f.id || i} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                  {formatDateTime(f.failedAt)}
                </td>
                <td style={{ padding: "8px 12px", fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.descriptionId || "—"}
                </td>
                <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--red)", lineHeight: 1.4 }}>
                  {f.error || "Unknown error"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ── Dry run preview modal ── */
function DryRunModal({ preview, onClose }) {
  return (
    <Modal title="Dry run preview" onClose={onClose} maxWidth={560}>
      {!preview ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading preview…</div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
            This is what would post if you tap <strong style={{ color: "var(--text)" }}>Post now</strong>. Nothing has been sent.
          </div>
          {preview.imageUrl && (
            <div style={{
              border: "1px solid var(--border)", borderRadius: "var(--radius)",
              overflow: "hidden", marginBottom: 12, background: "var(--bg-canvas)",
            }}>
              <img src={preview.imageUrl} alt="Preview" style={{ width: "100%", display: "block" }} />
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 4 }}>Description</div>
            <div style={{ fontSize: 13, lineHeight: 1.5, padding: "10px 12px", background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)" }}>
              {preview.description || "—"}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 2 }}>Button</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{preview.buttonType || "—"}</div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 2 }}>URL</div>
              <div style={{ fontSize: 12, fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {preview.buttonUrl || "—"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
            <button onClick={onClose} style={btnBase}>Close</button>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ── Main tab ── */
export function GMBFlywheelTab() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [dryRun, setDryRun] = useState(null);
  const [showDryRun, setShowDryRun] = useState(false);
  const pollRef = useRef(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadStatus = useCallback(async () => {
    try {
      const data = await api("/status");
      setStatus(data);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    pollRef.current = setInterval(loadStatus, 60000);
    return () => clearInterval(pollRef.current);
  }, [loadStatus]);

  const postNow = async () => {
    setActionLoading(true);
    try {
      const r = await api("/post-now", { method: "POST" });
      showToast(r.message || "Posted to Google Business Profile");
      await loadStatus();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const runDryRun = async () => {
    setActionLoading(true);
    setShowDryRun(true);
    setDryRun(null);
    try {
      const r = await api("/dry-run", { method: "POST" });
      setDryRun(r.preview || r);
    } catch (err) {
      showToast(err.message, "error");
      setShowDryRun(false);
    } finally {
      setActionLoading(false);
    }
  };

  const refreshQueue = async () => {
    setActionLoading(true);
    try {
      const r = await api("/refresh-queue", { method: "POST" });
      showToast(r.message || "Queue refreshed");
      await loadStatus();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const triggerReauth = async () => {
    try {
      const r = await api("/auth-url");
      if (r.url) window.open(r.url, "_blank", "noopener,noreferrer");
      else showToast("Could not start re-auth", "error");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const queuePending  = status?.queuePending  ?? 0;
  const totalPosted   = status?.totalPosted   ?? 0;
  const postedLast30  = status?.postedLast30d ?? 0;
  const authValid     = status?.authValid ?? false;
  const authState     = authValid ? "valid" : (status?.authState === "missing" ? "missing" : "expired");
  const authCfg       = AUTH_CONFIG[authState];
  const recentPosts   = status?.recentPosts ?? [];
  const failures      = status?.failures ?? [];
  const nextPost      = status?.nextPost ?? null;

  return (
    <div className="page" style={{ padding: 0 }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 2000,
          borderRadius: "var(--radius)", padding: "10px 16px", fontSize: 13, fontWeight: 600,
          background: toast.type === "success" ? "var(--green-bg)" : "var(--red-bg)",
          color: toast.type === "success" ? "var(--green)" : "var(--red)",
          border: "1px solid var(--border)",
        }}>{toast.msg}</div>
      )}

      {/* Section 1: Header */}
      <div style={{
        padding: "18px 24px", borderBottom: "1px solid var(--border)",
        display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16,
      }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text)", letterSpacing: "-0.01em" }}>
            GMB Flywheel
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
            Daily Google Business Profile auto-poster · scheduled 9:30am AEST
          </div>
        </div>
        {status?.lastFetched && (
          <div style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", paddingTop: 2 }}>
            Updated {formatDateTime(status.lastFetched)}
          </div>
        )}
      </div>

      <div style={{ padding: "20px 24px" }}>
        {/* Section 2: KPI strip */}
        <div style={{
          background: "var(--bg-surface)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", overflow: "hidden", marginBottom: 20,
          display: "flex", flexWrap: "wrap",
        }}>
          <KpiCard
            label="Queue pending"
            value={loading ? "—" : queuePending.toLocaleString()}
            sub="Posts in line"
            accent={queuePending === 0 ? "var(--amber)" : null}
          />
          <div style={{ width: 1, background: "var(--border)" }} />
          <KpiCard
            label="Total posted"
            value={loading ? "—" : totalPosted.toLocaleString()}
            sub="All-time"
          />
          <div style={{ width: 1, background: "var(--border)" }} />
          <KpiCard
            label="Posts last 30d"
            value={loading ? "—" : postedLast30.toLocaleString()}
            sub="Rolling window"
          />
          <div style={{ width: 1, background: "var(--border)" }} />
          <div style={{ padding: "14px 18px", flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
              Auth status
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {pill(authCfg)}
              {status?.authExpiresAt && authValid && (
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                  expires {formatDateTime(status.authExpiresAt)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Section 3: Next post preview */}
        <div style={{ marginBottom: 16 }}>
          <NextPostPreview next={nextPost} />
        </div>

        {/* Section 4: Action row */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <button
            onClick={postNow}
            disabled={actionLoading || !authValid || queuePending === 0}
            style={{
              ...btnPrimary,
              opacity: (actionLoading || !authValid || queuePending === 0) ? 0.5 : 1,
              cursor: (actionLoading || !authValid || queuePending === 0) ? "not-allowed" : "pointer",
            }}
          >
            {actionLoading ? "Working…" : "Post now"}
          </button>
          <button
            onClick={runDryRun}
            disabled={actionLoading}
            style={{ ...btnBase, opacity: actionLoading ? 0.6 : 1 }}
          >
            Dry run preview
          </button>
          <button
            onClick={refreshQueue}
            disabled={actionLoading}
            style={{ ...btnBase, opacity: actionLoading ? 0.6 : 1 }}
          >
            Refresh queue
          </button>
          {!authValid && (
            <button onClick={triggerReauth} style={btnWarn}>
              Re-auth required
            </button>
          )}
        </div>

        {/* Section 5: Recent posts table */}
        <RecentPostsTable posts={recentPosts} />

        {/* Section 6: Failures table (collapsed by default) */}
        <FailuresTable failures={failures} />
      </div>

      {showDryRun && (
        <DryRunModal preview={dryRun} onClose={() => { setShowDryRun(false); setDryRun(null); }} />
      )}
    </div>
  );
}

export default GMBFlywheelTab;
