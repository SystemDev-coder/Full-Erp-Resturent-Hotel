import { companyHeader, esc, printHtml, printStamp, type OrgInfo } from './print'
import { cellText, money, type ColType } from './detailFormat'

// A4 printouts for the dashboard / report cards. Every one starts with the company
// banner or logo + contact details set in Systems → Company Info.

export interface PrintColumn  { key: string; label: string; type?: ColType; align?: 'left' | 'right' | 'center' }
export interface PrintSummary { label: string; value: string | number; type?: 'text' | 'money' | 'number' }
export interface PrintPayload {
  title: string; subtitle?: string; summary?: PrintSummary[]
  columns: PrintColumn[]; rows: Record<string, unknown>[]; empty?: string
}

const sumText = (s: PrintSummary) =>
  s.type === 'money' ? money(s.value) : s.type === 'number' ? Number(s.value).toLocaleString('en-US') : String(s.value)

const docHead = (org: OrgInfo | null, title: string, subtitle?: string) => `
  ${companyHeader(org, 'a4')}
  <div class="doc-title">${esc(title)}</div>
  ${subtitle ? `<div class="doc-sub">${esc(subtitle)}</div>` : ''}`

const footer = (by: string) => `<div class="doc-foot">Printed by ${esc(by)} · ${printStamp()}</div>`

const summaryBlock = (summary?: PrintSummary[]) => !summary?.length ? '' : `
  <table class="kv"><tr>${summary.map(s =>
    `<td><span class="k">${esc(s.label)}</span><span class="v">${esc(sumText(s))}</span></td>`).join('')}</tr></table>`

// The rows behind one card (what the modal shows), as a printable table
export function printDetail(org: OrgInfo | null, d: PrintPayload, printedBy: string) {
  const head = d.columns.map(c => `<th class="${c.align === 'right' ? 'num' : ''}">${esc(c.label)}</th>`).join('')
  const body = d.rows.length === 0
    ? `<tr><td colspan="${d.columns.length}" class="empty">${esc(d.empty ?? 'Nothing to show.')}</td></tr>`
    : d.rows.map(r => `<tr>${d.columns.map(c =>
        `<td class="${c.align === 'right' ? 'num' : ''}">${esc(cellText(c.type, r[c.key]))}</td>`).join('')}</tr>`).join('')

  printHtml(`
    ${docHead(org, d.title, d.subtitle)}
    ${summaryBlock(d.summary)}
    <table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    ${footer(printedBy)}
  `, 190, { a4: true })
}

// A one-page summary made of titled key/value sections (used by the dashboard)
export function printSections(
  org: OrgInfo | null, title: string, subtitle: string, printedBy: string,
  sections: { heading: string; rows: [string, string][] }[],
) {
  printHtml(`
    ${docHead(org, title, subtitle)}
    ${sections.map(s => `
      <div class="sec">${esc(s.heading)}</div>
      <table class="grid">${s.rows.map(([k, v]) =>
        `<tr><td>${esc(k)}</td><td class="num"><b>${esc(v)}</b></td></tr>`).join('')}</table>`).join('')}
    ${footer(printedBy)}
  `, 190, { a4: true })
}
