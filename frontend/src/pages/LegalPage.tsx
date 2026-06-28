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
import { SolidCard, GlassCard, PageHeader, PrimaryButton, FormField, RiskBadge } from '@/components/ui'
import {
  FileText, Upload, AlertTriangle, CheckCircle, HelpCircle, Info,
  ChevronDown, ChevronUp, Loader2, PoundSterling, Wrench, ClipboardList,
} from 'lucide-react'

// ── Shared ────────────────────────────────────────────────────────────────────

function PdfUploadZone({ onFile, label }: { onFile: (f: File) => void; label: string }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => files[0] && onFile(files[0]),
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
  })
  return (
    <div
      {...getRootProps()}
      className={cn(
        'rounded-xl p-8 text-center cursor-pointer transition-colors',
        isDragActive
          ? 'bg-purple-faint border-2 border-dashed border-purple'
          : 'bg-white/30 border-2 border-dashed border-white/60 hover:bg-white/50 hover:border-purple/30'
      )}
    >
      <input {...getInputProps()} />
      <Upload className="w-8 h-8 text-plum-soft mx-auto mb-2" />
      <p className="text-sm font-medium text-plum">
        {isDragActive ? 'Drop the PDF here' : label}
      </p>
      <p className="text-xs text-plum-soft mt-1">Text-based PDFs only · max 10MB</p>
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
  const borderColor = { routine: 'border-l-dusk-deep', notable: 'border-l-amber', critical: 'border-l-red-500' }[clause.importance] ?? 'border-l-dusk-deep'
  const bgColor    = { routine: 'bg-white/50', notable: 'bg-amber-light/60', critical: 'bg-red-50/60' }[clause.importance] ?? 'bg-white/50'

  return (
    <div className={cn('border-l-4 rounded-r-xl p-4 mb-2', borderColor, bgColor)}>
      <button type="button" className="w-full flex items-center justify-between gap-3 text-left" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium shrink-0',
            clause.importance === 'critical' ? 'bg-red-100 text-red-700' :
            clause.importance === 'notable'  ? 'bg-amber-light text-amber' :
            'bg-dusk text-plum-soft'
          )}>
            {clause.importance}
          </span>
          <span className="text-sm font-medium text-plum truncate">{clause.clause}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-plum-soft shrink-0" /> : <ChevronDown className="w-4 h-4 text-plum-soft shrink-0" />}
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-plum leading-relaxed">{clause.plain_english}</p>
          {clause.action_required && (
            <div className="flex gap-2 bg-white/60 rounded-lg p-2.5">
              <CheckCircle className="w-4 h-4 text-purple shrink-0 mt-0.5" />
              <p className="text-xs font-medium text-plum">{clause.action_required}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DocumentExplainerTab() {
  const [result, setResult]     = useState<DocumentExplainerResult | null>(null)
  const [mode, setMode]         = useState<'paste' | 'upload'>('paste')
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
      <div className="flex gap-2 text-xs font-medium">
        {(['paste', 'upload'] as const).map(m => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={cn('px-4 py-1.5 rounded-full transition-colors',
              mode === m ? 'btn-primary py-1.5 px-4' : 'btn-ghost py-1.5 px-4'
            )}
          >
            {m === 'paste' ? 'Paste text' : 'Upload PDF'}
          </button>
        ))}
      </div>

      <SolidCard className="space-y-4">
        <FormField label="Document type">
          <select {...register('document_type')} className="glass-input">
            {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </FormField>

        {mode === 'paste' ? (
          <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4">
            <FormField label="Paste document text" error={errors.document_text?.message}>
              <textarea {...register('document_text')} rows={10}
                placeholder="Paste the full text of your document here…"
                className="glass-input resize-none"
              />
            </FormField>
            <PrimaryButton type="submit" loading={mutation.isPending}>
              {mutation.isPending ? 'Analysing…' : 'Explain document'}
            </PrimaryButton>
            {mutation.isError && (
              <p className="text-sm text-red-500 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                {(mutation.error as any)?.userMessage ?? 'Something went wrong. Please try again.'}
              </p>
            )}
          </form>
        ) : (
          <div className="space-y-3">
            {uploading
              ? (
                <div className="rounded-xl p-8 text-center bg-purple-faint border-2 border-dashed border-purple">
                  <Loader2 className="w-8 h-8 text-purple animate-spin mx-auto mb-2" />
                  <p className="text-sm font-medium text-plum">Uploading & analysing…</p>
                </div>
              )
              : <PdfUploadZone onFile={handleUpload} label="Drop your document PDF here, or click to browse" />
            }
            {uploadError && (
              <p className="text-sm text-red-500 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />{uploadError}
              </p>
            )}
          </div>
        )}
      </SolidCard>

      {result && (
        <div className="space-y-4 animate-results">
          <SolidCard>
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-purple" />
              <h2 className="font-display text-lg text-plum">Document summary</h2>
            </div>
            <p className="text-sm text-plum-soft leading-relaxed">{result.summary}</p>
            <div className="flex flex-wrap gap-2 mt-4">
              {criticalClauses.length > 0 && <RiskBadge level="critical" label={`${criticalClauses.length} critical`} />}
              {notableClauses.length  > 0 && <RiskBadge level="amber"    label={`${notableClauses.length} notable`} />}
              {routineClauses.length  > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-dusk text-plum-soft">
                  <span className="w-1.5 h-1.5 rounded-full bg-plum-soft" />
                  {routineClauses.length} routine
                </span>
              )}
            </div>
          </SolidCard>

          <SolidCard>
            <h3 className="font-display text-lg text-plum mb-4">Clause breakdown</h3>
            {[...criticalClauses, ...notableClauses, ...routineClauses].map((c, i) => (
              <ClauseCard key={i} clause={c} />
            ))}
          </SolidCard>

          {result.action_items.length > 0 && (
            <GlassCard className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-purple" />
                <h3 className="font-display text-lg text-plum">Your action items</h3>
              </div>
              <ol className="space-y-2">
                {result.action_items.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-plum">
                    <span className="font-medium text-purple shrink-0">{i + 1}.</span>{item}
                  </li>
                ))}
              </ol>
            </GlassCard>
          )}

          {result.questions_for_solicitor.length > 0 && (
            <SolidCard>
              <div className="flex items-center gap-2 mb-3">
                <HelpCircle className="w-4 h-4 text-purple" />
                <h3 className="font-display text-lg text-plum">Questions for your solicitor</h3>
              </div>
              <ul className="space-y-2">
                {result.questions_for_solicitor.map((q, i) => (
                  <li key={i} className="flex gap-2 text-sm text-plum-soft">
                    <Info className="w-4 h-4 text-amber shrink-0 mt-0.5" />{q}
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
  { value: 'level_1', label: 'Level 1 — Condition Report', hint: 'Basic condition check, typically for new builds' },
  { value: 'level_2', label: 'Level 2 — Homebuyer Report', hint: 'Most common survey for standard properties' },
  { value: 'level_3', label: 'Level 3 — Building Survey', hint: 'Full structural survey for older or complex properties' },
]

const VERDICT_META: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  proceed:     { label: 'Proceed',               color: 'text-sage',     bg: 'bg-sage-light',    border: 'border-sage/30',    icon: <CheckCircle className="w-5 h-5 text-sage" /> },
  renegotiate: { label: 'Renegotiate price',      color: 'text-amber',    bg: 'bg-amber-light',   border: 'border-amber/40',   icon: <PoundSterling className="w-5 h-5 text-amber" /> },
  investigate: { label: 'Investigate further',    color: 'text-purple',   bg: 'bg-purple-faint',  border: 'border-purple/30',  icon: <HelpCircle className="w-5 h-5 text-purple" /> },
  withdraw:    { label: 'Consider withdrawing',   color: 'text-red-600',  bg: 'bg-red-50',        border: 'border-red-200',    icon: <AlertTriangle className="w-5 h-5 text-red-500" /> },
}

function FindingCard({ finding }: { finding: SurveyFinding }) {
  const [open, setOpen] = useState(finding.category !== 'advisory')
  const borderColor = { critical: 'border-l-red-500', significant: 'border-l-amber', advisory: 'border-l-dusk-deep' }[finding.category]
  const bgColor     = { critical: 'bg-red-50/60', significant: 'bg-amber-light/60', advisory: 'bg-white/50' }[finding.category]

  return (
    <div className={cn('border-l-4 rounded-r-xl p-4 mb-2', borderColor, bgColor)}>
      <button type="button" className="w-full flex items-center justify-between gap-3 text-left" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium shrink-0',
            finding.category === 'critical'    ? 'bg-red-100 text-red-700' :
            finding.category === 'significant' ? 'bg-amber-light text-amber' :
            'bg-dusk text-plum-soft'
          )}>
            {finding.category}
          </span>
          <span className="text-sm font-medium text-plum truncate">{finding.title}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {finding.renegotiation_worthy && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-purple-faint text-purple font-medium">
              <PoundSterling className="w-2.5 h-2.5" /> renegotiate
            </span>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-plum-soft" /> : <ChevronDown className="w-4 h-4 text-plum-soft" />}
        </div>
      </button>
      {open && (
        <div className="mt-3 space-y-2.5">
          <p className="text-sm text-plum leading-relaxed">{finding.description}</p>
          {finding.typical_cost_range && (
            <div className="flex gap-2 items-center text-xs text-plum-soft bg-white/60 rounded-lg px-3 py-2">
              <Wrench className="w-3.5 h-3.5 shrink-0 text-plum-soft/60" />
              <span>Typical repair cost: <span className="font-medium text-plum">{finding.typical_cost_range}</span></span>
            </div>
          )}
          <div className="flex gap-2 bg-white/60 rounded-lg p-2.5">
            <ClipboardList className="w-4 h-4 text-purple shrink-0 mt-0.5" />
            <p className="text-xs font-medium text-plum">{finding.action}</p>
          </div>
        </div>
      )}
    </div>
  )
}

function SurveyInterpreterTab() {
  const [result, setResult]   = useState<SurveyInterpreterResult | null>(null)
  const [level, setLevel]     = useState('level_2')
  const [uploading, setUploading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
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

  const verdict = result ? (VERDICT_META[result.overall_assessment] ?? VERDICT_META.investigate) : null

  return (
    <div className="space-y-5">
      <SolidCard className="space-y-5">
        {/* Survey level */}
        <div>
          <label className="block text-sm font-medium text-plum mb-2">Survey level</label>
          <div className="space-y-2">
            {SURVEY_LEVELS.map(l => (
              <label key={l.value}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-xl cursor-pointer border transition-colors',
                  level === l.value
                    ? 'bg-purple-faint border-purple/30'
                    : 'bg-white/30 border-white/50 hover:bg-white/50'
                )}
              >
                <input
                  type="radio" name="survey_level" value={l.value}
                  checked={level === l.value}
                  onChange={() => setLevel(l.value)}
                  className="mt-0.5 accent-purple"
                />
                <div>
                  <p className="text-sm font-medium text-plum">{l.label}</p>
                  <p className="text-xs text-plum-soft mt-0.5">{l.hint}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Drop zone */}
        {uploading
          ? (
            <div className="rounded-xl p-8 text-center bg-purple-faint border-2 border-dashed border-purple">
              <Loader2 className="w-8 h-8 text-purple animate-spin mx-auto mb-2" />
              <p className="text-sm font-medium text-plum">Reading your survey…</p>
              <p className="text-xs text-plum-soft mt-1">This may take a moment</p>
            </div>
          )
          : <PdfUploadZone onFile={handleFile} label="Drop your survey PDF here, or click to browse" />
        }

        {error && (
          <p className="text-sm text-red-500 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />{error}
          </p>
        )}
      </SolidCard>

      {result && verdict && (
        <div className="space-y-4 animate-results">

          {/* Verdict hero */}
          <GlassCard className={cn('border', verdict.border)}>
            <div className="flex items-start gap-4">
              <div className={cn('p-2.5 rounded-xl shrink-0', verdict.bg)}>
                {verdict.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className={cn('font-display text-xl', verdict.color)}>{verdict.label}</span>
                  {result.estimated_remediation_cost && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-white/60 text-plum-soft font-medium">
                      Est. repairs: {result.estimated_remediation_cost}
                    </span>
                  )}
                </div>
                <p className="text-sm text-plum-soft leading-relaxed">{result.summary}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {result.critical_count    > 0 && <RiskBadge level="critical" label={`${result.critical_count} critical`} />}
                  {result.significant_count > 0 && <RiskBadge level="amber"    label={`${result.significant_count} significant`} />}
                  {result.advisory_count    > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-dusk text-plum-soft">
                      <span className="w-1.5 h-1.5 rounded-full bg-plum-soft" />
                      {result.advisory_count} advisory
                    </span>
                  )}
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Findings */}
          {(critical.length + significant.length + advisory.length) > 0 && (
            <SolidCard>
              <h3 className="font-display text-lg text-plum mb-4">Survey findings</h3>
              {[...critical, ...significant, ...advisory].map((f, i) => (
                <FindingCard key={i} finding={f} />
              ))}
            </SolidCard>
          )}

          {/* Renegotiation points */}
          {result.renegotiation_points.length > 0 && (
            <GlassCard>
              <div className="flex items-center gap-2 mb-3">
                <PoundSterling className="w-4 h-4 text-purple" />
                <h3 className="font-display text-lg text-plum">Renegotiation points</h3>
              </div>
              <p className="text-xs text-plum-soft mb-3">Use these findings to negotiate a price reduction with the seller.</p>
              <ol className="space-y-2">
                {result.renegotiation_points.map((pt, i) => (
                  <li key={i} className="flex gap-2 text-sm text-plum">
                    <span className="font-medium text-purple shrink-0">{i + 1}.</span>{pt}
                  </li>
                ))}
              </ol>
            </GlassCard>
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
      <div className="flex gap-2 text-xs font-medium">
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={cn('px-4 py-1.5 rounded-full transition-colors',
              tab === t.key ? 'btn-primary py-1.5 px-4' : 'btn-ghost py-1.5 px-4'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'document'
        ? <DocumentExplainerTab />
        : <SurveyInterpreterTab />
      }
    </div>
  )
}
