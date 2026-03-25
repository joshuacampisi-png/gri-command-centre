import { useState, useEffect } from 'react'

const REASONS = ['Change of Mind', 'Faulty / Defective', 'Wrong Item Sent', 'Damaged in Transit', 'Other']

const empty = { customer: '', order: '', amount: '', products: '', reason: '' }

function pad(n) { return String(n).padStart(2, '0') }
function fmtDate(d) {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ReturnsTab() {
  const [form, setForm] = useState(empty)
  const [entries, setEntries] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Load returns from API on mount
  useEffect(() => {
    fetch('/api/returns')
      .then(r => r.json())
      .then(d => { if (d.ok) setEntries(d.returns || []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const submit = async e => {
    e.preventDefault()
    if (!form.customer.trim() || !form.order.trim() || !form.amount || !form.products.trim() || !form.reason) {
      setError('All fields are required.')
      return
    }
    const amt = parseFloat(form.amount)
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid amount.'); return }
    setError('')

    const entry = {
      customer: form.customer.trim(),
      order: form.order.trim().replace(/^#?/, '#'),
      amount: amt,
      products: form.products.trim(),
      reason: form.reason,
      date: fmtDate(new Date()),
    }

    try {
      const res = await fetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      })
      const data = await res.json()
      if (data.ok) {
        setEntries(prev => [data.return, ...prev])
        setForm(empty)
      } else {
        setError(data.error || 'Failed to save return.')
      }
    } catch {
      setError('Failed to save return. Please try again.')
    }
  }

  const remove = async id => {
    try {
      await fetch(`/api/returns/${id}`, { method: 'DELETE' })
      setEntries(prev => prev.filter(e => e.id !== id))
    } catch {}
  }

  const total = entries.reduce((s, e) => s + (e.amount || 0), 0)

  return (
    <div className="returns-tab">
      <div className="returns-section">
        <h3 className="returns-heading">Lodge Return / Refund</h3>
        <form className="returns-form" onSubmit={submit}>
          <div className="returns-form-grid">
            <label className="returns-label">
              <span className="returns-label-text">Customer Name</span>
              <input className="returns-input" type="text" value={form.customer} onChange={e => set('customer', e.target.value)} placeholder="Full name" />
            </label>
            <label className="returns-label">
              <span className="returns-label-text">Order Number</span>
              <input className="returns-input" type="text" value={form.order} onChange={e => set('order', e.target.value)} placeholder="#1001" />
            </label>
            <label className="returns-label">
              <span className="returns-label-text">Amount Refunded (AUD)</span>
              <input className="returns-input" type="number" step="0.01" min="0" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" />
            </label>
            <label className="returns-label">
              <span className="returns-label-text">Reason</span>
              <select className="returns-input returns-select" value={form.reason} onChange={e => set('reason', e.target.value)}>
                <option value="">Select reason...</option>
                {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          </div>
          <label className="returns-label returns-label-full">
            <span className="returns-label-text">Products</span>
            <textarea className="returns-input returns-textarea" value={form.products} onChange={e => set('products', e.target.value)} placeholder="Comma separated or free text description" rows={2} />
          </label>
          {error && <div className="returns-error">{error}</div>}
          <button type="submit" className="returns-submit">Lodge Refund</button>
        </form>
      </div>

      <div className="returns-section">
        <h3 className="returns-heading">Refunds Ledger</h3>
        {loading ? <div className="returns-empty">Loading returns...</div> : (
          <div className="returns-table-wrap">
            <div className="returns-table-header">
              <span className="rt-col rt-num">#</span>
              <span className="rt-col rt-name">Customer</span>
              <span className="rt-col rt-order">Order</span>
              <span className="rt-col rt-products">Products</span>
              <span className="rt-col rt-reason">Reason</span>
              <span className="rt-col rt-amount">Amount</span>
              <span className="rt-col rt-date">Date Lodged</span>
              <span className="rt-col rt-action"></span>
            </div>
            {entries.length === 0 && (
              <div className="returns-empty">No refunds lodged yet.</div>
            )}
            {entries.map((e, i) => (
              <div key={e.id} className={`returns-row ${i % 2 === 1 ? 'alt' : ''}`}>
                <span className="rt-col rt-num">{entries.length - i}</span>
                <span className="rt-col rt-name">{e.customer}</span>
                <span className="rt-col rt-order">{e.order}</span>
                <span className="rt-col rt-products">{e.products}</span>
                <span className="rt-col rt-reason">{e.reason}</span>
                <span className="rt-col rt-amount">${(e.amount || 0).toFixed(2)}</span>
                <span className="rt-col rt-date">{e.date}</span>
                <span className="rt-col rt-action"><button className="returns-delete" onClick={() => remove(e.id)} title="Remove">&times;</button></span>
              </div>
            ))}
          </div>
        )}
        <div className="returns-total">Total Refunded: <strong>${total.toFixed(2)}</strong></div>
      </div>
    </div>
  )
}

export default ReturnsTab
