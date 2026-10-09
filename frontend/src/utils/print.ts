// ─── Printing ─────────────────────────────────────────────────────────────────
// Shared by the POS, Receipts, Reports, Tables (QR) and booking-payment screens.
// Renders the document in a hidden iframe and calls print() — no popups, and the
// app's own styles are never affected.
//
// Every document carries the company branding set in Systems → Company Info:
//   · thermal receipts  → the LOGO (or, with no logo, a small banner), greyscaled
//   · A4 documents      → the full-width BANNER (or, with no banner, logo + name)

export interface OrgInfo {
  name: string; legal_name?: string; tax_id?: string; phone?: string; email?: string
  vat_rate?: string | number
  address?: string | null
  logo_url?: string | null
  banner_url?: string | null
}

// The print iframe has no base URL, so a relative "/uploads/…" would not load there.
export const absUrl = (u?: string | null) => {
  if (!u) return ''
  if (/^(https?:|data:|blob:)/i.test(u)) return u
  return window.location.origin + (u.startsWith('/') ? u : '/' + u)
}

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Company name of the last header that was built — used for the footer line at the bottom of every thermal slip
let footerOrg = ''
export const setFooterOrg = (name?: string | null) => { if (name) footerOrg = name }

export function printHtml(bodyHtml: string, widthMm = 76, opts: { a4?: boolean } = {}) {
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

  /* company branding */
  img { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .brand-logo   { display: block; margin: 0 auto 4px; max-height: 16mm; max-width: 55mm; object-fit: contain; }
  .brand-banner { display: block; width: auto; max-width: 100%; height: auto; max-height: 42mm; object-fit: contain; margin: 0 auto 4px; }
  .thermal .brand-logo, .thermal .brand-banner { filter: grayscale(1) contrast(1.2); }
  .thermal .brand-banner { max-height: 20mm; }
  .a4-brand { display: flex; align-items: center; justify-content: center; gap: 4mm; }
  .a4-brand .brand-logo { margin: 0; max-height: 20mm; }

  @media print { body { width: auto; } }
  ${opts.a4 ? `
  /* A4 documents (report cards, dashboard summary) */
  @page { size: A4; margin: 10mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a202c; width: ${widthMm}mm; padding: 0; }
  .doc-title { margin-top: 5mm; font-size: 18px; font-weight: 700; text-align: left; }
  .doc-sub   { margin: 1mm 0 4mm; font-size: 11px; color: #4a5568; }
  .doc-foot  { margin-top: 6mm; padding-top: 2mm; border-top: 1px solid #cbd5e0; font-size: 9px; color: #718096; text-align: center; }
  .sec       { margin: 5mm 0 1.5mm; font-size: 12px; font-weight: 700; background: #f1f3f6; padding: 1.5mm 2mm; }
  table.kv   { margin: 0 0 4mm; table-layout: fixed; }
  table.kv td { padding: 2mm 3mm; background: #f1f3f6; border: 2px solid #fff; }
  table.kv .k { display: block; font-size: 9px; color: #718096; text-transform: uppercase; letter-spacing: .04em; }
  table.kv .v { display: block; font-size: 15px; font-weight: 700; }
  table.grid { font-size: 10.5px; }
  table.grid th { background: #34495e; color: #fff; padding: 1.8mm 2mm; font-size: 9.5px; text-transform: none; border: 0; }
  table.grid td { padding: 1.6mm 2mm; border-bottom: 1px solid #e2e8f0; }
  table.grid tr:nth-child(even) td { background: #f8f9fb; }
  table.grid tr { break-inside: avoid; }
  thead { display: table-header-group; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  td.empty { text-align: center; color: #718096; padding: 8mm 0; }
  ` : ''}
</style></head><body>${bodyHtml}${opts.a4 ? '' : `
  <hr/>
  <div class="center xs">© ${new Date().getFullYear()} ${esc(footerOrg)}<br/>Prepared by Madal ICT — madalict.com</div>`}</body></html>`)
  doc.close()

  // Print only once the logo/banner have actually loaded — otherwise a slow image
  // makes the document print without its branding. 3 s cap so a broken link
  // can never block printing.
  const win = frame.contentWindow!
  const images = Array.from(doc.images)
  const loaded = Promise.all(images.map(img =>
    img.complete
      ? Promise.resolve()
      : new Promise<void>(resolve => { img.onload = () => resolve(); img.onerror = () => resolve() })))
  Promise.race([loaded, new Promise<void>(r => setTimeout(r, 3000))]).then(() => {
    setTimeout(() => {
      // 80 mm roll: make the paper exactly as wide as the receipt and exactly as long as its content
      // (Chrome ignores "height: auto" and would fall back to a Letter page with big margins).
      if (!opts.a4) {
        const mm = Math.ceil((doc.documentElement.scrollHeight / 96) * 25.4) + 3
        const st = doc.createElement('style')
        st.textContent = `@page { size: ${widthMm + 4}mm ${Math.max(mm, 40)}mm; margin: 0; }`
        doc.head.appendChild(st)
      }
      win.focus()
      win.print()
      setTimeout(() => { if (frame.parentNode) document.body.removeChild(frame) }, 1500)
    }, 150)
  })
}

// Company header — logo/banner, name and contact details. Data comes from
// Systems → Company Info.
export function companyHeader(org: OrgInfo | null, variant: 'thermal' | 'a4' = 'thermal') {
  if (!org) return ''
  footerOrg = org.name
  const logo   = absUrl(org.logo_url)
  const banner = absUrl(org.banner_url)

  const parts = [
    org.legal_name && org.legal_name !== org.name ? esc(org.legal_name) : '',
    org.address ? esc(org.address) : '',
    org.phone ? `Tel: ${esc(org.phone)}` : '',
    org.email ? esc(org.email) : '',
    org.tax_id ? `TIN: ${esc(org.tax_id)}` : '',
  ].filter(Boolean)
  const details = parts.length ? `<div class="center xs mt">${parts.join('<br/>')}</div>` : ''

  if (variant === 'a4') {
    if (banner) {
      // The banner is the company's own artwork — it usually carries the name already
      return `<img class="brand-banner" src="${esc(banner)}" alt="" />${details}`
    }
    return `
      <div class="a4-brand">
        ${logo ? `<img class="brand-logo" src="${esc(logo)}" alt="" />` : ''}
        <div class="center bold xl">${esc(org.name)}</div>
      </div>${details}`
  }

  // thermal 80 mm: prefer the logo; fall back to a small banner
  const img = logo ? `<img class="brand-logo" src="${esc(logo)}" alt="" />`
            : banner ? `<img class="brand-banner" src="${esc(banner)}" alt="" />` : ''
  return `
    <div class="thermal">${img}</div>
    <div class="center bold xl">${esc(org.name)}</div>
    ${details}
  `
}

export const printStamp = () => new Date().toLocaleString('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})
