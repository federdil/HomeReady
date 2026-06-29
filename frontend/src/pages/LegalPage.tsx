import { useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import { explainDocument, uploadDocument, uploadSurvey } from '@/lib/api'
import { useMarkStage } from '@/lib/useMarkStage'
import type { DocumentExplainerResult, DocumentClause, SurveyInterpreterResult, SurveyFinding } from '@/types'
import { cn } from '@/lib/utils'
import { SolidCard, PageHeader, PrimaryButton, FormField, RiskBadge, Callout } from '@/components/ui'
import {
  FileText, Upload, AlertTriangle, CheckCircle, HelpCircle, Info,
  ChevronDown, ChevronUp, Loader2, PoundSterling, Wrench, ClipboardList,
} from 'lucide-react'

// ── PDF Upload Zone ───────────────────────────────────────────────────────────

function PdfUploadZone({ onFile, label }: { onFile: (f: File) => void; label: string }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => files[0] && onFile(files[0]),
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
  })
  return (
    <div
      {...getRootProps()}
      className={cn('upload-zone', isDragActive && 'active')}
    >
      <input {...getInputProps()} />
      <div className={cn(
        'w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3 transition-colors',
        isDragActive ? 'bg-brand text-white' : 'bg-surface-2 border border-border text-ink-faint'
      )}>
        <Upload className="w-5 h-5" />
      </div>
      <p className="text-sm font-semibold text-ink">
        {isDragActive ? 'Drop the PDF here' : label}
      </p>
      <p className="text-xs text-ink-muted mt-1">Text-based PDFs only · max 10MB</p>
    </div>
  )
}

// ── Document Explainer ────────────────────────────────────────────────────────

const docSchema = z.object({
  document_text: z.string().min(100, 'Please paste at least 100 characters'),
  document_type: z.string().min(1, 'Please select a document type'),
})
type DocFormData = z.infer<typeof docSchema>

const DOC_TYPES = [
  { value: 'draft_contract',       label: 'Draft contract' },
  { value: 'title_register',       label: 'Title register' },
  { value: 'searches',             label: 'Local authority searches' },
  { value: 'mortgage_offer',       label: 'Mortgage offer' },
  { value: 'leasehold_info',       label: 'Leasehold information pack' },
  { value: 'completion_statement', label: 'Completion statement' },
  { value: 'other',                label: 'Other document' },
]

function ClauseCard({ clause }: { clause: DocumentClause }) {
  const [open, setOpen] = useState(clause.importance !== 'routine')

  const config = {
    critical: { border: 'border-l-danger', bg: 'bg-danger-bg/40', badge: 'badge-danger' },
    notable:  { border: 'border-l-warning', bg: 'bg-warning-bg/40', badge: 'badge-warning' },
    routine:  { border: 'border-l-border', bg: 'bg-surface-2', badge: 'badge-neutral' },
  }[clause.importance] ?? { border: 'border-l-border', bg: 'bg-surface-2', badge: 'badge-neutral' }

  return (
    <div className={cn('border-l-4 rounded-r-xl mb-2 overflow-hidden', config.border, config.bg)}>
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 text-left px-4 py-3 hover:brightness-95 transition-all"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('badge shrink-0', config.badge)}>{clause.importance}</span>
          <span className="text-sm font-semibold text-ink truncate">{clause.clause}</span>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-ink-faint shrink-0" />
          : <ChevronDown className="w-4 h-4 text-ink-faint shrink-0" />
        }
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-sm text-ink-muted leading-relaxed">{clause.plain_english}</p>
          {clause.action_required && (
            <div className="flex gap-2.5 bg-white rounded-lg p-3 border border-border">
              <CheckCircle className="w-4 h-4 text-brand shrink-0 mt-0.5" />
              <p className="text-sm font-semibold text-ink">{clause.action_required}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DocumentExplainerTab() {
  const [result, setResult]           = useState<DocumentExplainerResult | null>(null)
  const [mode, setMode]               = useState<'paste' | 'upload'>('paste')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading]     = useState(false)
  const markStage = useMarkStage()

  const { register, handleSubmit, watch, formState: { errors } } = useForm<DocFormData>({
    resolver: zodResolver(docSchema),
    defaultValues: { document_type: 'draft_contract' },
  })
  const docType = watch('document_type')

  const mutation = useMutation({
    mutationFn: explainDocument,
    onSuccess: (data) => { setResult(data); markStage('legal', 'in_progress') },
  })

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true); setUploadError(null)
    try {
      const r = await uploadDocument(file, docType)
      setResult(r)
      markStage('legal', 'in_progress')
    } catch (e: any) {
      setUploadError(e?.userMessage ?? 'Upload failed — make sure it is a text-based PDF (not a scan).')
    } finally {
      setUploading(false)
    }
  }, [docType, markStage])

  const criticalClauses = result?.clauses.filter(c => c.importance === 'critical') ?? []
  const notableClauses  = result?.clauses.filter(c => c.importance === 'notable')  ?? []
  const routineClauses  = result?.clauses.filter(c => c.importance === 'routine')  ?? []

  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div className="flex gap-2">
        {(['paste', 'upload'] as const).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors',
              mode === m
                ? 'bg-brand text-white shadow-sm'
                : 'bg-surface-2 border border-border text-ink-muted hover:text-ink'
            )}
          >
            {m === 'paste' ? <><FileText className="w-3.5 h-3.5" /> Paste text</> : <><Upload className="w-3.5 h-3.5" /> Upload PDF</>}
          </button>
        ))}
      </div>

      <SolidCard className="space-y-5">
        <FormField label="Document type">
          <select {...register('document_type')} className="glass-input">
            {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </FormField>

        {mode === 'paste' ? (
          <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4">
            <FormField label="Paste document text" error={errors.document_text?.message}>
              <textarea
                {...register('document_text')}
                rows={10}
                placeholder="Paste the full text of your document here…"
                className="glass-input resize-none"
              />
            </FormField>
            <PrimaryButton type="submit" loading={mutation.isPending}>
              {mutation.isPending ? 'Analysing…' : 'Explain document'}
            </PrimaryButton>
            {mutation.isError && (
              <Callout variant="danger">
                {(mutation.error as any)?.userMessage ?? 'Something went wrong. Please try again.'}
              </Callout>
            )}
          </form>
        ) : (
          <div className="space-y-3">
            {uploading ? (
              <div className="upload-zone active">
                <Loader2 className="w-10 h-10 text-brand animate-spin mx-auto mb-3" />
                <p className="text-sm font-semibold text-ink">Uploading & analysing…</p>
                <p className="text-xs text-ink-muted mt-1">This may take a moment</p>
              </div>
            ) : (
              <PdfUploadZone onFile={handleUpload} label="Drop your document PDF here, or click to browse" />
            )}
            {uploadError && <Callout variant="danger">{uploadError}</Callout>}
          </div>
        )}
      </SolidCard>

      {result && (
        <div className="space-y-5 animate-results">
          {/* Summary */}
          <SolidCard>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-brand-light flex items-center justify-center">
                <FileText className="w-4 h-4 text-brand" />
              </div>
              <h2 className="font-display text-lg text-ink">Document summary</h2>
            </div>
            <p className="text-base text-ink-muted leading-relaxed">{result.summary}</p>
            <div className="flex flex-wrap gap-2 mt-4">
              {criticalClauses.length > 0 && <RiskBadge level="critical" label={`${criticalClauses.length} critical`} />}
              {notableClauses.length  > 0 && <RiskBadge level="amber"    label={`${notableClauses.length} notable`} />}
              {routineClauses.length  > 0 && <span className="badge badge-neutral">{routineClauses.length} routine</span>}
            </div>
          </SolidCard>

          {/* Clause breakdown */}
          <SolidCard>
            <h3 className="font-display text-lg text-ink mb-4">Clause breakdown</h3>
            {[...criticalClauses, ...notableClauses, ...routineClauses].map((c, i) => (
              <ClauseCard key={i} clause={c} />
            ))}
          </SolidCard>

          {/* Action items */}
          {result.action_items.length > 0 && (
            <div className="card-tinted p-5 rounded-2xl border border-brand/15">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-brand-light flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-brand" />
                </div>
                <h3 className="font-display text-lg text-ink">Your action items</h3>
              </div>
              <ol className="space-y-3">
                {result.action_items.map((item, i) => (
                  <li key={i} className="flex gap-3 text-sm text-ink-muted">
                    <span className="w-5 h-5 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Solicitor questions */}
          {result.questions_for_solicitor.length > 0 && (
            <SolidCard>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
                  <HelpCircle className="w-4 h-4 text-warning" />
                </div>
                <h3 className="font-display text-lg text-ink">Questions for your solicitor</h3>
              </div>
              <ul className="space-y-2.5">
                {result.questions_for_solicitor.map((q, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-ink-muted py-2 border-b border-border last:border-0">
                    <Info className="w-4 h-4 text-warning shrink-0 mt-0.5" />{q}
                  </li>
                ))}
              </ul>
            </SolidCard>
          )}
        </div>
      )}
    </div>
  )
}

// ── Survey Interpreter ────────────────────────────────────────────────────────

const SURVEY_LEVELS = [
  { value: 'level_1', label: 'Level 1 — Condition Report',  hint: 'Basic condition check, typically for new builds' },
  { value: 'level_2', label: 'Level 2 — Homebuyer Report',  hint: 'Most common survey for standard properties' },
  { value: 'level_3', label: 'Level 3 — Building Survey',   hint: 'Full structural survey for older or complex properties' },
]

const VERDICT_META: Record<string, {
  label: string; colorClass: string; bgClass: string; borderClass: string; icon: React.ReactNode
}> = {
  proceed:     { label: 'Proceed',             colorClass: 'text-success', bgClass: 'bg-success-bg', borderClass: 'border-success/30', icon: <CheckCircle className="w-5 h-5 text-success" /> },
  renegotiate: { label: 'Renegotiate price',   colorClass: 'text-warning', bgClass: 'bg-warning-bg', borderClass: 'border-warning/30', icon: <PoundSterling className="w-5 h-5 text-warning" /> },
  investigate: { label: 'Investigate further', colorClass: 'text-brand',   bgClass: 'bg-brand-light', borderClass: 'border-brand/20', icon: <HelpCircle className="w-5 h-5 text-brand" /> },
  withdraw:    { label: 'Consider withdrawing', colorClass: 'text-danger', bgClass: 'bg-danger-bg',  borderClass: 'border-danger/30', icon: <AlertTriangle className="w-5 h-5 text-danger" /> },
}

function FindingCard({ finding }: { finding: SurveyFinding }) {
  const [open, setOpen] = useState(finding.category !== 'advisory')

  const config = {
    critical:    { border: 'border-l-danger',  bg: 'bg-danger-bg/40',  badge: 'badge-danger' },
    significant: { border: 'border-l-warning', bg: 'bg-warning-bg/40', badge: 'badge-warning' },
    advisory:    { border: 'border-l-border',  bg: 'bg-surface-2',     badge: 'badge-neutral' },
  }[finding.category] ?? { border: 'border-l-border', bg: 'bg-surface-2', badge: 'badge-neutral' }

  return (
    <div className={cn('border-l-4 rounded-r-xl mb-2 overflow-hidden', config.border, config.bg)}>
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 text-left px-4 py-3 hover:brightness-95 transition-all"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('badge shrink-0', config.badge)}>{finding.category}</span>
          <span className="text-sm font-semibold text-ink truncate">{finding.title}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {finding.renegotiation_worthy && (
            <span className="hidden sm:inline-flex badge badge-brand gap-1">
              <PoundSterling className="w-2.5 h-2.5" /> renegotiate
            </span>
          )}
          {open
            ? <ChevronUp className="w-4 h-4 text-ink-faint" />
            : <ChevronDown className="w-4 h-4 text-ink-faint" />
          }
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-sm text-ink-muted leading-relaxed">{finding.description}</p>
          {finding.typical_cost_range && (
            <div className="flex gap-2.5 items-center text-sm text-ink-muted bg-white rounded-lg px-3 py-2.5 border border-border">
              <Wrench className="w-3.5 h-3.5 shrink-0 text-ink-faint" />
              <span>Typical repair cost: <span className="font-semibold text-ink">{finding.typical_cost_range}</span></span>
            </div>
          )}
          <div className="flex gap-2.5 bg-white rounded-lg p-3 border border-border">
            <ClipboardList className="w-4 h-4 text-brand shrink-0 mt-0.5" />
            <p className="text-sm font-semibold text-ink">{finding.action}</p>
          </div>
        </div>
      )}
    </div>
  )
}

function SurveyInterpreterTab() {
  const [result, setResult]       = useState<SurveyInterpreterResult | null>(null)
  const [level, setLevel]         = useState('level_2')
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const markStage = useMarkStage()

  const handleFile = useCallback(async (file: File) => {
    setUploading(true); setError(null)
    try {
      const r = await uploadSurvey(file, level)
      setResult(r)
      markStage('legal', 'in_progress')
    } catch (e: any) {
      setError(e?.userMessage ?? 'Upload failed — make sure it is a text-based PDF (not a scan).')
    } finally {
      setUploading(false)
    }
  }, [level, markStage])

  const critical    = result?.findings.filter(f => f.category === 'critical')    ?? []
  const significant = result?.findings.filter(f => f.category === 'significant') ?? []
  const advisory    = result?.findings.filter(f => f.category === 'advisory')    ?? []
  const verdict     = result ? (VERDICT_META[result.overall_assessment] ?? VERDICT_META.investigate) : null

  return (
    <div className="space-y-5">
      <SolidCard className="space-y-5">
        {/* Survey level selector */}
        <div>
          <label className="block text-sm font-semibold text-ink mb-3">Survey level</label>
          <div className="space-y-2">
            {SURVEY_LEVELS.map(l => (
              <label
                key={l.value}
                className={cn(
                  'flex items-start gap-3 p-3.5 rounded-xl cursor-pointer border transition-all',
                  level === l.value
                    ? 'bg-brand-light border-brand/30 shadow-sm'
                    : 'bg-white border-border hover:border-brand/20 hover:bg-surface-2'
                )}
              >
                <input
                  type="radio"
                  name="survey_level"
                  value={l.value}
                  checked={level === l.value}
                  onChange={() => setLevel(l.value)}
                  className="mt-0.5 accent-brand"
                />
                <div>
                  <p className="text-sm font-semibold text-ink">{l.label}</p>
                  <p className="text-xs text-ink-muted mt-0.5">{l.hint}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Upload zone */}
        {uploading ? (
          <div className="upload-zone active">
            <Loader2 className="w-10 h-10 text-brand animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-ink">Reading your survey…</p>
            <p className="text-xs text-ink-muted mt-1">This may take a moment</p>
          </div>
        ) : (
          <PdfUploadZone onFile={handleFile} label="Drop your survey PDF here, or click to browse" />
        )}

        {error && <Callout variant="danger">{error}</Callout>}
      </SolidCard>

      {result && verdict && (
        <div className="space-y-5 animate-results">
          {/* Verdict hero */}
          <div className={cn('card p-5 border', verdict.borderClass)}>
            <div className="flex items-start gap-4">
              <div className={cn('p-3 rounded-xl shrink-0', verdict.bgClass)}>
                {verdict.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className={cn('font-display text-xl', verdict.colorClass)}>{verdict.label}</span>
                  {result.estimated_remediation_cost && (
                    <span className="badge badge-neutral">
                      Est. repairs: {result.estimated_remediation_cost}
                    </span>
                  )}
                </div>
                <p className="text-sm text-ink-muted leading-relaxed">{result.summary}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {result.critical_count    > 0 && <RiskBadge level="critical" label={`${result.critical_count} critical`} />}
                  {result.significant_count > 0 && <RiskBadge level="amber"    label={`${result.significant_count} significant`} />}
                  {result.advisory_count    > 0 && <span className="badge badge-neutral">{result.advisory_count} advisory</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Findings */}
          {(critical.length + significant.length + advisory.length) > 0 && (
            <SolidCard>
              <h3 className="font-display text-lg text-ink mb-4">Survey findings</h3>
              {[...critical, ...significant, ...advisory].map((f, i) => (
                <FindingCard key={i} finding={f} />
              ))}
            </SolidCard>
          )}

          {/* Renegotiation points */}
          {result.renegotiation_points.length > 0 && (
            <div className="card-tinted p-5 rounded-2xl border border-brand/15">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-brand-light flex items-center justify-center">
                  <PoundSterling className="w-4 h-4 text-brand" />
                </div>
                <div>
                  <h3 className="font-display text-lg text-ink">Renegotiation points</h3>
                  <p className="text-xs text-ink-muted">Use these to negotiate a price reduction</p>
                </div>
              </div>
              <ol className="space-y-3">
                {result.renegotiation_points.map((pt, i) => (
                  <li key={i} className="flex gap-3 text-sm text-ink-muted">
                    <span className="w-5 h-5 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{pt}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page shell ────────────────────────────────────────────────────────────────

type Tab = 'document' | 'survey'

const TABS: { key: Tab; label: string }[] = [
  { key: 'document', label: 'Document Explainer' },
  { key: 'survey',   label: 'Survey Interpreter' },
]

export default function LegalPage() {
  const [tab, setTab] = useState<Tab>('document')

  return (
    <div className="space-y-6">
      <PageHeader
        stage="Stage 4 — Legal & Survey"
        title={tab === 'document' ? 'Document Explainer' : 'Survey Interpreter'}
        description={
          tab === 'document'
            ? 'Upload or paste any conveyancing document. HomeReady explains each clause in plain English and flags anything that needs your attention.'
            : 'Upload your homebuyer or building survey. HomeReady translates the jargon, prioritises the issues, and tells you whether to renegotiate.'
        }
      />

      {/* Tab bar */}
      <div className="flex gap-2">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'px-5 py-2 rounded-xl text-sm font-semibold transition-colors',
              tab === t.key
                ? 'bg-brand text-white shadow-sm'
                : 'bg-surface-2 border border-border text-ink-muted hover:text-ink hover:bg-surface-3'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'document' ? <DocumentExplainerTab /> : <SurveyInterpreterTab />}
    </div>
  )
}
