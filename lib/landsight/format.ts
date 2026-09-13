import type { Project } from './types'
import { CSV_COLUMNS } from './service'
export const number = (value: number) => value.toLocaleString('en-IN')
export const formatDate = (date: string) => new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
export const formatTime = (date: string) => new Date(date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
export function downloadText(name: string, content: string, type = 'text/csv;charset=utf-8;') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function exportProjects(projects: Project[]) {
  const keys = [...CSV_COLUMNS, 'riskScore', 'riskLevel', 'expectedDelay', 'source'] as const
  const escape = (value: unknown) => `"${String(value).replace(/^[=+\-@]/, "'$&").replaceAll('"', '""')}"`
  downloadText('landsight-synthetic-projects.csv', [keys.join(','), ...projects.map(p => keys.map(key => escape(p[key])).join(','))].join('\r\n'))
}
export function downloadTemplate() {
  downloadText('landsight-upload-template.csv', CSV_COLUMNS.join(',') + '\r\nLS-UPLOAD-001,Sample district road,Maharashtra,Pune,Road infrastructure,100,50,60,3,30,2,18.5204,73.8567\r\n')
}
