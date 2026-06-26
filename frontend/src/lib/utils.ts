import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatGBP(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function severityColor(severity: string) {
  return {
    low:      'text-emerald-600 bg-emerald-50',
    medium:   'text-amber-600 bg-amber-50',
    high:     'text-red-600 bg-red-50',
    critical: 'text-red-700 bg-red-100 font-semibold',
  }[severity] ?? 'text-slate-600 bg-slate-50'
}

export function importanceColor(importance: string) {
  return {
    routine:  'border-l-slate-300 bg-slate-50',
    notable:  'border-l-amber-400 bg-amber-50',
    critical: 'border-l-red-500 bg-red-50',
  }[importance] ?? ''
}
