// ─── Thermal-receipt printing (80mm) ──────────────────────────────────────────
// Shared by the POS, Receipts, and Reports pages. Renders the ticket in a
// hidden iframe and calls print() — no popups, and the app's own styles are
// never affected.

export interface OrgInfo {
  name: string; legal_name?: string; tax_id?: string; phone?: string; email?: string
  vat_rate?: string | number
}

export function printHtml(bodyHtml: string, widthMm = 76) {
  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.appendChild(frame)

  const doc = frame.contentWindow!.document
  doc.open()
  doc.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>Print</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; color: #000; width: ${widthMm}mm; padding: 4mm 3mm; }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: 700; }
  .xl  { font-size: 17px; }
  .lg  { font-size: 14px; }
  .md  { font-size: 12px; }
  .sm  { font-size: 10px; }
  .xs  { font-size: 9px;  color: #333; }
  .mt  { margin-top: 6px; }
  .mb  { margin-bottom: 6px; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  td, th { padding: 2px 0; vertical-align: top; text-align: left; }
  th { border-bottom: 1px solid #000; font-size: 10px; text-transform: uppercase; }
  .qty  { width: 26px; font-weight: 700; }
  .amt  { width: 58px; text-align: right; }
  .note { background: #eee; padding: 4px 6px; font-size: 11px; margin-top: 6px; }
  @media print { body { width: auto; } }
</style></head><body>${bodyHtml}</body></html>`)
  doc.close()

  frame.contentWindow!.focus()
  // Give the iframe a moment to layout before printing, then clean up
  setTimeout(() => {
    frame.contentWindow!.print()
    setTimeout(() => document.body.removeChild(frame), 1500)
  }, 150)
}

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Small company header (name big, contact details small) — data comes from
// Systems → Company Info
export function companyHeader(org: OrgInfo | null) {
  if (!org) return ''
  const parts = [
    org.legal_name && org.legal_name !== org.name ? esc(org.legal_name) : '',
    org.phone ? `Tel: ${esc(org.phone)}` : '',
    org.email ? esc(org.email) : '',
    org.tax_id ? `TIN: ${esc(org.tax_id)}` : '',
  ].filter(Boolean)
  return `
    <div class="center bold xl">${esc(org.name)}</div>
    ${parts.length ? `<div class="center xs mt">${parts.join('<br/>')}</div>` : ''}
  `
}

export const printStamp = () => new Date().toLocaleString('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})
