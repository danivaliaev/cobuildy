import { supabase, errText } from './supabase'

export const MAX_BYTES = 25 * 1024 * 1024
export const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png'
const MIME: Record<string, string> = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
}

/** The type the file is stored with, or null when the extension is not allowed. */
export const mimeOf = (name: string): string | null => MIME[name.split('.').pop()?.toLowerCase() ?? ''] ?? null

/** A readable reason when the file cannot be uploaded, otherwise null. */
export function checkFile(f: { name: string; size: number }): string | null {
  if (!mimeOf(f.name)) return 'Allowed files: PDF, Word, Excel, JPG and PNG.'
  if (f.size === 0) return 'The file is empty.'
  if (f.size > MAX_BYTES) return 'The file is larger than 25 MB.'
  return null
}

export const sizeText = (n: number | null | undefined) => (n == null ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

/** Downloads a data room file through a link that works for one minute. Access is decided by the database, not by this code. */
export async function downloadDoc(path: string, fileName: string | null, logId?: string): Promise<void> {
  const { data, error } = await supabase.storage.from('data-room').createSignedUrl(path, 60, { download: fileName ?? true })
  if (error || !data) throw new Error(errText(error?.message ?? 'The file is not available.'))
  if (logId) await supabase.rpc('log_doc_download', { p_doc: logId })
  const a = document.createElement('a')
  a.href = data.signedUrl; a.rel = 'noopener'
  document.body.appendChild(a); a.click(); a.remove()
}
