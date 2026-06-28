import { useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import { explainDocument, uploadDocument } from '@/lib/api'
import { useMarkStage } from '@/lib/useMarkStage'
import type { DocumentExplainerResult, DocumentClause } from '@/types'
import { importanceColor, cn } from '@/lib/utils'
import { SolidCard, PageHeader, PrimaryButton, FormField, RiskBadge } from '@/components/ui'
import { FileText, Upload, AlertTriangle, CheckCircle, HelpCircle, Info, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'

const schema = z.object({
  document_text: z.string().min(100, 'Please paste at least 100 characters'),
  document_type: z.string().min(1, 'Please select a document type'),
})
type FormData = z.infer<typeof schema>

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
  const bgColor = { routine: 'bg-white/50', notable: 'bg-amber-light/60', critical: 'bg-red-50/60' }[clause.importance] ?? 'bg-white/50'

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

function PdfDropzone({ onResult, docType }: { onResult: (r: DocumentExplainerResult) => void; docType: string }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return
    if (!docType) { setError('Please select a document type first'); return }
    setUploading(true); setError(null)
    try {
      const result = await uploadDocument(file, docType)
      onResult(result)
    } catch {
      setError('Upload failed — make sure it is a text-based PDF (not a scan).')
    } finally {
      setUploading(false)
    }
  }, [docType, onResult])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/pdf': ['.pdf'] }, multiple: false,
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
      {uploading
        ? <Loader2 className="w-8 h-8 text-purple animate-spin mx-auto mb-2" />
        : <Upload className="w-8 h-8 text-plum-soft mx-auto mb-2" />}
      <p className="text-sm font-medium text-plum">
        {uploading ? 'Uploading & analysing…' : isDragActive ? 'Drop the PDF here' : 'Drop a PDF here, or click to browse'}
      </p>
      <p className="text-xs text-plum-soft mt-1">Text-based PDFs only · max 10MB</p>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  )
}

export default function LegalPage() {
  const [result, setResult] = useState<DocumentExplainerResult | null>(null)
  const [mode, setMode] = useState<'paste' | 'upload'>('paste')
  const markStage = useMarkStage()

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { document_type: 'draft_contract' },
  })

  const docType = watch('document_type')

  const mutation = useMutation({
    mutationFn: explainDocument,
    onSuccess: (data) => { setResult(data); markStage('legal', 'complete') },
  })

  const criticalClauses = result?.clauses.filter(c => c.importance === 'critical') ?? []
  const notableClauses  = result?.clauses.filter(c => c.importance === 'notable')  ?? []
  const routineClauses  = result?.clauses.filter(c => c.importance === 'routine')  ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        stage="Stage 4 — Legal & Survey"
        title="Document Explainer"
        description="Upload or paste any conveyancing document. HomeReady explains each clause in plain English and flags anything that needs your attention."
      />

      {/* Mode toggle */}
      <div className="flex gap-2 text-xs font-medium">
        {(['paste', 'upload'] as const).map(m => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={cn('px-4 py-1.5 rounded-full transition-colors capitalize',
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
                Something went wrong. Please try again.
              </p>
            )}
          </form>
        ) : (
          <PdfDropzone onResult={setResult} docType={docType} />
        )}
      </SolidCard>

      {result && (
        <div className="space-y-5 animate-results">
          {/* Summary */}
          <SolidCard>
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-purple" />
              <h2 className="font-display text-lg text-plum">Document summary</h2>
            </div>
            <p className="text-sm text-plum-soft leading-relaxed">{result.summary}</p>
            <div className="flex gap-2 mt-4">
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

          {/* Clauses */}
          <SolidCard>
            <h3 className="font-display text-lg text-plum mb-4">Clause breakdown</h3>
            {[...criticalClauses, ...notableClauses, ...routineClauses].map((c, i) => (
              <ClauseCard key={i} clause={c} />
            ))}
          </SolidCard>

          {/* Action items */}
          {result.action_items.length > 0 && (
            <div className="glass-card px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="w-4 h-4 text-purple" />
                <h3 className="font-display text-lg text-plum">Your action items</h3>
              </div>
              <ol className="space-y-2">
                {result.action_items.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-plum">
                    <span className="font-medium text-purple shrink-0">{i + 1}.</span>
                    {item}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Solicitor questions */}
          {result.questions_for_solicitor.length > 0 && (
            <SolidCard>
              <div className="flex items-center gap-2 mb-3">
                <HelpCircle className="w-4 h-4 text-purple" />
                <h3 className="font-display text-lg text-plum">Questions for your solicitor</h3>
              </div>
              <ul className="space-y-2">
                {result.questions_for_solicitor.map((q, i) => (
                  <li key={i} className="flex gap-2 text-sm text-plum-soft">
                    <Info className="w-4 h-4 text-amber shrink-0 mt-0.5" />
                    {q}
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
