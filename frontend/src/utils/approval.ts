import axios from 'axios'

// Manager approval (big discounts, voiding food already in the kitchen).
// The server answers 403 { data: { approval_required: true, needs_pin, needs_reason, label } } when an action
// needs approval. `withApproval` shows the dialog, then repeats the call with the manager's PIN / reason.

export interface ApprovalRequest { label: string; needsPin: boolean; needsReason: boolean; error?: string }
export interface ApprovalAnswer { staff_id?: string; pin?: string; reason?: string }
/** What gets merged into the request body when the call is repeated */
export interface ApprovalBody { approval?: { staff_id: string; pin: string }; reason?: string }

type Host = (r: ApprovalRequest) => Promise<ApprovalAnswer | null>
let host: Host | null = null
export const registerApprovalHost = (h: Host | null) => { host = h }

export class ApprovalCancelled extends Error { constructor() { super('Approval cancelled') } }
export const isApprovalCancelled = (e: unknown) => e instanceof ApprovalCancelled

const toBody = (a: ApprovalAnswer): ApprovalBody => ({
  ...(a.staff_id && a.pin ? { approval: { staff_id: a.staff_id, pin: a.pin } } : {}),
  ...(a.reason ? { reason: a.reason } : {}),
})

interface ApprovalInfo { label: string; needs_pin: boolean; needs_reason: boolean }
const infoFrom = (e: unknown): { info: ApprovalInfo; message: string } | null => {
  if (!axios.isAxiosError(e)) return null
  const d = e.response?.data as { data?: ApprovalInfo & { approval_required?: boolean }; message?: string } | undefined
  return d?.data?.approval_required ? { info: d.data, message: d.data ? (d.message ?? '') : '' } : null
}

/**
 * Run `call`. If the server asks for approval, ask the manager and run it again (a wrong PIN asks again).
 * `ask` shows the dialog up-front, for flows where the discount is known before the first call.
 * Throws ApprovalCancelled when the dialog is dismissed.
 */
export async function withApproval<T>(
  call: (body: ApprovalBody) => Promise<T>,
  ask?: { label: string; needsPin: boolean; needsReason?: boolean },
): Promise<T> {
  let body: ApprovalBody = {}
  let request: ApprovalRequest | null = ask ? { label: ask.label, needsPin: ask.needsPin, needsReason: !!ask.needsReason } : null
  for (;;) {
    if (request) {
      if (!host) throw new Error('Manager approval is required but no approval dialog is available')
      const answer = await host(request)
      if (!answer) throw new ApprovalCancelled()
      body = toBody(answer)
    }
    try { return await call(body) }
    catch (e) {
      const need = infoFrom(e)
      if (!need) throw e
      // First time the message is only "approval required"; after a wrong PIN it explains what was wrong
      const wrong = request !== null || Object.keys(body).length > 0
      request = { label: need.info.label, needsPin: need.info.needs_pin, needsReason: need.info.needs_reason, error: wrong ? need.message : undefined }
    }
  }
}
