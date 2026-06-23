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
          <col style={{ width: "16%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "30%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "10%" }} />
        </colgroup>
        <thead>
          <tr style={{ background: "var(--bg-canvas)" }}>
            {["Image", "Description ID", "Generated by", "Button URL", "Posted at", "Status"].map(h => (
              <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid var(--border)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {posts.length === 0 ? (
            <tr><td colSpan={6} style={{ padding: "28px 12px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No posts in the last 30 days</td></tr>
          ) : posts.map(p => {
            const cfg = POST_STATUS_CONFIG[p.status] || POST_STATUS_CONFIG.pending;
            const gen = String(p.generatedBy || "static");
            const isFal = gen.includes("fal");
            const isAi = gen && gen !== "static";
            const genLabel = isFal
              ? `FAL+Claude · $${Number(p.costUsd || 0).toFixed(2)}`
              : isAi
                ? `GPT-4o · $${Number(p.costUsd || 0).toFixed(2)}`
                : "Static";
            const genCfg = isAi
              ? { label: genLabel, color: "var(--green)", bg: "var(--green-bg)" }
              : { label: genLabel, color: "var(--text-muted)", bg: "var(--bg-subtle)" };
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
                <td style={{ padding: "8px 12px" }}>{pill(genCfg)}</td>
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

/* ── Description engine toggle ── */
function DescriptionEngineSection({ aiMode, onSetMode, error }) {
  const mode = aiMode?.mode || "static";
  const falOk = !!aiMode?.falConfigured;
  const aiCost30d = Number(aiMode?.aiCostLast30Days || aiMode?.cost30dUsd || 0);

  const renderStatus = () => {
    if (mode === "static") {
      return (
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Rotating through 30 hand-written SEO variants · 14-day no-repeat
        </span>
      );
    }
    if (mode === "ai-fal-generated" && falOk) {
      return (
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          FAL Nano Banana Pro for images + Claude Sonnet for copy · ~$0.16/post · last 30d AI cost ${aiCost30d.toFixed(2)}
        </span>
      );
    }
    if (mode === "ai-fal-generated" && !falOk) {
      return (
        <span style={{
          display: "inline-block", padding: "4px 10px", borderRadius: 999,
          fontSize: 11, fontWeight: 600,
          background: "var(--amber-bg)", color: "var(--amber)",
        }}>
          FAL_KEY not set in .env — falling back to static
        </span>
      );
    }
    // Legacy ai-openai mode fallthrough — surface state but don't add a toggle.
    return (
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
        Legacy GPT-4o describer active · last 30d cost ${aiCost30d.toFixed(2)}
      </span>
    );
  };

  const toggleBtn = (label, value) => {
    const active = mode === value;
    return (
      <button
        key={value}
        onClick={() => onSetMode(value)}
        style={{
          ...btnBase,
          fontWeight: active ? 600 : 500,
          background: active ? "var(--text)" : "var(--bg-surface)",
          color: active ? "var(--bg-surface)" : "var(--text)",
          border: active ? "1px solid var(--text)" : "1px solid var(--border)",
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div style={{
      background: "var(--bg-surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", padding: "16px 18px", marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Description Engine</span>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {toggleBtn("Static pool (30 hand-written variants)", "static")}
        {toggleBtn("AI Generation (FAL + Claude)", "ai-fal-generated")}
      </div>
      <div>{renderStatus()}</div>
      {error && (
        <div style={{
          marginTop: 10, padding: "8px 12px",
          background: "var(--red-bg)", color: "var(--red)",
          border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
          fontSize: 12,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

/* ── Next AI post panel (visible when ai-fal-generated mode active) ── */
function NextAiPostPanel({ aiMode, onPreview, onGenerate, busy }) {
  const nextCategory = aiMode?.nextCategoryIfAi || null;
  const ctaLabel = nextCategory ? `${nextCategory} collection` : "—";

  return (
    <div style={{
      background: "var(--bg-surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", padding: "16px 18px", marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 4 }}>
            Next AI post
          </div>
          <div style={{ fontSize: 13, color: "var(--text)" }}>
            Category: <strong>{nextCategory || "—"}</strong> · CTA: {ctaLabel}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={onPreview}
            disabled={busy || !nextCategory}
            style={{
              ...btnBase,
              opacity: (busy || !nextCategory) ? 0.5 : 1,
              cursor: (busy || !nextCategory) ? "not-allowed" : "pointer",
            }}
          >
            Preview without spending
          </button>
          <button
            onClick={onGenerate}
            disabled={busy || !nextCategory}
            style={{
              ...btnPrimary,
              opacity: (busy || !nextCategory) ? 0.5 : 1,
              cursor: (busy || !nextCategory) ? "not-allowed" : "pointer",
            }}
          >
            Generate now (~$0.15)
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── AI preview modal (FAL pipeline; no spend) ── */
function AiPreviewModal({ preview, loading, onClose }) {
  const isFalShape = preview && (preview.hookText !== undefined || preview.estimatedCostUsd !== undefined);

  return (
    <Modal title="AI post preview (no spend)" onClose={onClose} maxWidth={620}>
      {loading || !preview ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading preview…</div>
      ) : isFalShape ? (
        <>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
            This is the hook, body copy, and image prompt the FAL pipeline would use.
            {" "}<strong style={{ color: "var(--text)" }}>No FAL or Claude tokens are spent.</strong>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 4 }}>
              Hook text (image overlay)
            </div>
            <div style={{
              fontSize: 18, fontWeight: 700, letterSpacing: "0.04em",
              textTransform: "uppercase",
              padding: "12px 14px", background: "var(--bg-canvas)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)", color: "var(--text)",
              lineHeight: 1.2,
            }}>
              {preview.hookText || "—"}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 4 }}>
              Description (GMB body copy)
            </div>
            <div style={{
              fontSize: 13, lineHeight: 1.5,
              padding: "10px 12px", background: "var(--bg-subtle)",
              borderRadius: "var(--radius-sm)", color: "var(--text)",
              maxHeight: 200, overflowY: "auto",
            }}>
              {preview.description || <span style={{ color: "var(--text-faint)" }}>—</span>}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 2 }}>
                Category
              </div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{preview.category || "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 2 }}>
                Estimated cost
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                ${Number(preview.estimatedCostUsd ?? 0.16).toFixed(2)}
              </div>
            </div>
          </div>

          <details style={{
            border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
            padding: "8px 12px", background: "var(--bg-canvas)",
          }}>
            <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
              FAL prompt
            </summary>
            <pre style={{
              marginTop: 10, fontSize: 11, fontFamily: "var(--font-mono)",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
              color: "var(--text-muted)", lineHeight: 1.5,
            }}>
              {preview.prompt || "—"}
            </pre>
          </details>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
            <button onClick={onClose} style={btnBase}>Close</button>
          </div>
        </>
      ) : (
        /* Legacy GPT-4o describer shape — kept for backward-compat. */
        <>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
            This is what GPT-4o would be grounded against. <strong style={{ color: "var(--text)" }}>No tokens are spent.</strong>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 4 }}>
              Predicted grounding URL
            </div>
            <div style={{
              fontSize: 12, fontFamily: "var(--font-mono)",
              padding: "8px 12px", background: "var(--bg-subtle)",
              borderRadius: "var(--radius-sm)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {preview.predictedUrl || "—"}
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 4 }}>
              Site content snippet
            </div>
            <div style={{
              fontSize: 12, lineHeight: 1.5,
              padding: "10px 12px", background: "var(--bg-subtle)",
              borderRadius: "var(--radius-sm)",
              maxHeight: 160, overflowY: "auto",
              color: "var(--text)",
            }}>
              {preview.siteSnippet || <span style={{ color: "var(--text-faint)" }}>No snippet returned</span>}
            </div>
          </div>
          <details style={{
            border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
            padding: "8px 12px", background: "var(--bg-canvas)",
          }}>
            <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
              Show prompt that will be sent
            </summary>
            <pre style={{
              marginTop: 10, fontSize: 11, fontFamily: "var(--font-mono)",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
              color: "var(--text-muted)", lineHeight: 1.5,
            }}>
              {preview.prompt || "—"}
            </pre>
          </details>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
            <button onClick={onClose} style={btnBase}>Close</button>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ── AI generated modal (real FAL spend already happened) ── */
function AiGeneratedModal({ generated, loading, onClose, onAddToQueue, addingToQueue }) {
  // The backend returns an absolute server-side imagePath. Try to serve it
  // via a public route if one exists (/gmb-images/<basename>); fall back to
  // the raw path string so the user can copy it.
  const imagePath = generated?.post?.imagePath || generated?.imagePath || null;
  const basenameMatch = imagePath ? imagePath.split(/[\\/]/).pop() : null;
  const publicUrl = basenameMatch ? `/gmb-images/${basenameMatch}` : null;

  return (
    <Modal title="AI post generated" onClose={onClose} maxWidth={620}>
      {loading || !generated ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Generating image and copy via FAL + Claude…</div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
            Image and copy were generated.{" "}
            <strong style={{ color: "var(--text)" }}>
              Spent ${Number(generated?.post?.costUsd ?? 0.15).toFixed(2)}.
            </strong>{" "}
            Add to queue to schedule for the next GMB cron tick.
          </div>

          {publicUrl && (
            <div style={{
              border: "1px solid var(--border)", borderRadius: "var(--radius)",
              overflow: "hidden", marginBottom: 12, background: "var(--bg-canvas)",
              display: "flex", alignItems: "center", justifyContent: "center",
              minHeight: 200,
            }}>
              <img
                src={publicUrl}
                alt="Generated GMB post"
                style={{ width: "100%", display: "block" }}
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            </div>
          )}

          {imagePath && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 4 }}>
                Saved to
              </div>
              <div style={{
                fontSize: 11, fontFamily: "var(--font-mono)",
                padding: "8px 12px", background: "var(--bg-subtle)",
                borderRadius: "var(--radius-sm)", color: "var(--text-muted)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {imagePath}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 4 }}>
              Hook text
            </div>
            <div style={{
              fontSize: 18, fontWeight: 700, letterSpacing: "0.04em",
              textTransform: "uppercase",
              padding: "12px 14px", background: "var(--bg-canvas)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)", color: "var(--text)",
              lineHeight: 1.2,
            }}>
              {generated?.hookText || "—"}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 4 }}>
              Description
            </div>
            <div style={{
              fontSize: 13, lineHeight: 1.5,
              padding: "10px 12px", background: "var(--bg-subtle)",
              borderRadius: "var(--radius-sm)", color: "var(--text)",
              maxHeight: 200, overflowY: "auto",
            }}>
              {generated?.post?.description || <span style={{ color: "var(--text-faint)" }}>—</span>}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
            <button onClick={onClose} style={btnBase}>Close</button>
            <button
              onClick={onAddToQueue}
              disabled={addingToQueue || !imagePath}
              style={{
                ...btnPrimary,
                opacity: (addingToQueue || !imagePath) ? 0.5 : 1,
                cursor: (addingToQueue || !imagePath) ? "not-allowed" : "pointer",
              }}
            >
              {addingToQueue ? "Adding…" : "Add to queue"}
            </button>
          </div>
        </>
      )}
    </Modal>
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
  const [aiPreview, setAiPreview] = useState(null);
  const [showAiPreview, setShowAiPreview] = useState(false);
  const [aiPreviewLoading, setAiPreviewLoading] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(null);
  const [showAiGenerated, setShowAiGenerated] = useState(false);
  const [aiGenerateLoading, setAiGenerateLoading] = useState(false);
  const [addingToQueue, setAddingToQueue] = useState(false);
  const [descEngineError, setDescEngineError] = useState(null);
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

  const setDescriptionMode = async (descriptionMode) => {
    setDescEngineError(null);
    try {
      await api("/config", {
        method: "POST",
        body: JSON.stringify({ descriptionMode }),
      });
      const label =
        descriptionMode === "ai-fal-generated" ? "AI Generation (FAL + Claude)"
        : descriptionMode === "ai-openai"      ? "AI · GPT-4o"
        :                                        "Static pool";
      showToast(`Description engine set to ${label}`);
      await loadStatus();
    } catch (err) {
      setDescEngineError(err.message || "Could not update description engine");
    }
  };

  // Legacy GPT-4o describer preview, keyed off the next queued filename.
  const runLegacyAiPreview = async () => {
    setAiPreviewLoading(true);
    setShowAiPreview(true);
    setAiPreview(null);
    try {
      const r = await api("/ai-preview", {
        method: "POST",
        body: JSON.stringify({ filename: status?.nextPost?.filename || null }),
      });
      setAiPreview(r.preview || r);
    } catch (err) {
      showToast(err.message, "error");
      setShowAiPreview(false);
    } finally {
      setAiPreviewLoading(false);
    }
  };

  // FAL pipeline preview — uses the next rotation category, no spend.
  const runAiFalPreview = async () => {
    setAiPreviewLoading(true);
    setShowAiPreview(true);
    setAiPreview(null);
    try {
      const r = await api("/ai-preview", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setAiPreview(r.preview || r);
    } catch (err) {
      showToast(err.message, "error");
      setShowAiPreview(false);
    } finally {
      setAiPreviewLoading(false);
    }
  };

  // FAL pipeline real generation — spends ~$0.15.
  const runAiGenerateNow = async () => {
    setAiGenerateLoading(true);
    setShowAiGenerated(true);
    setAiGenerated(null);
    try {
      const r = await api("/ai-generate-now", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setAiGenerated(r);
    } catch (err) {
      showToast(err.message, "error");
      setShowAiGenerated(false);
    } finally {
      setAiGenerateLoading(false);
    }
  };

  const addGeneratedToQueue = async () => {
    if (!aiGenerated) return;
    setAddingToQueue(true);
    try {
      await api("/queue-add", {
        method: "POST",
        body: JSON.stringify({
          imagePath: aiGenerated?.post?.imagePath,
          description: aiGenerated?.post?.description,
          hookText: aiGenerated?.hookText,
          category: aiGenerated?.category,
          generatedBy: aiGenerated?.post?.generatedBy,
        }),
      });
      showToast("Added to queue");
      setShowAiGenerated(false);
      setAiGenerated(null);
      await loadStatus();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setAddingToQueue(false);
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
  const aiMode        = status?.aiMode ?? { mode: "static", openaiKeyPresent: false, cost30dUsd: 0, falConfigured: false };

  // AI vs static breakdown over recent posts (matches Recent posts table heuristic).
  const aiPostCount = recentPosts.reduce((n, p) => {
    const g = String(p?.generatedBy || "static");
    return g && g !== "static" ? n + 1 : n;
  }, 0);
  const staticPostCount = Math.max(0, recentPosts.length - aiPostCount);

  const isFalMode     = aiMode.mode === "ai-fal-generated";
  const isLegacyAi    = aiMode.mode === "ai-openai";
  const canPreviewAi  = isLegacyAi && !!nextPost?.imageUrl;

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
          <div
            style={{ padding: "14px 18px", flex: 1, minWidth: 0, position: "relative" }}
            title={`AI: ${aiPostCount} · Static: ${staticPostCount} (last 30d)`}
          >
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
              Total posted
            </div>
            <div style={{
              fontSize: 22, fontWeight: 600, color: "var(--text)",
              fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
              lineHeight: 1.1, display: "flex", alignItems: "baseline", gap: 8,
            }}>
              <span>{loading ? "—" : totalPosted.toLocaleString()}</span>
              {!loading && (aiPostCount + staticPostCount > 0) && (
                <span style={{
                  fontSize: 10, fontWeight: 600, fontFamily: "var(--font-mono)",
                  padding: "2px 8px", borderRadius: 999,
                  background: "var(--bg-subtle)", color: "var(--text-muted)",
                  letterSpacing: "0.02em",
                }}>
                  {aiPostCount} AI / {staticPostCount} static
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              All-time · hover for AI breakdown
            </div>
          </div>
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

        {/* Section 3: Description Engine toggle */}
        <DescriptionEngineSection
          aiMode={aiMode}
          onSetMode={setDescriptionMode}
          error={descEngineError}
        />

        {/* Section 3b: Next AI post panel (only when FAL mode active) */}
        {isFalMode && (
          <NextAiPostPanel
            aiMode={aiMode}
            onPreview={runAiFalPreview}
            onGenerate={runAiGenerateNow}
            busy={aiPreviewLoading || aiGenerateLoading}
          />
        )}

        {/* Section 4: Next post preview */}
        <div style={{ marginBottom: 16 }}>
          <NextPostPreview next={nextPost} />
        </div>

        {/* Section 5: Action row */}
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
          {canPreviewAi && (
            <button
              onClick={runLegacyAiPreview}
              disabled={actionLoading || aiPreviewLoading}
              style={{ ...btnBase, opacity: (actionLoading || aiPreviewLoading) ? 0.6 : 1 }}
            >
              Preview AI description
            </button>
          )}
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

      {showAiPreview && (
        <AiPreviewModal
          preview={aiPreview}
          loading={aiPreviewLoading}
          onClose={() => { setShowAiPreview(false); setAiPreview(null); }}
        />
      )}

      {showAiGenerated && (
        <AiGeneratedModal
          generated={aiGenerated}
          loading={aiGenerateLoading}
          addingToQueue={addingToQueue}
          onAddToQueue={addGeneratedToQueue}
          onClose={() => { setShowAiGenerated(false); setAiGenerated(null); }}
        />
      )}
    </div>
  );
}

export default GMBFlywheelTab;
