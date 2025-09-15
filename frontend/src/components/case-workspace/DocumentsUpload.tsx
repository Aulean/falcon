interface DocumentsUploadProps {
  caseId: string
  show: boolean
  onClose: () => void
}

export function DocumentsUpload({ show }: DocumentsUploadProps) {
  // Placeholder component - will be implemented fully later
  if (!show) return null
  
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h3 className="text-lg font-medium text-white mb-4">Case Documents</h3>
      <div className="text-center text-slate-400 py-8">
        <p>Document upload functionality coming soon...</p>
        <p className="text-sm mt-2">Will support drag & drop, progress tracking, and S3 integration</p>
      </div>
    </div>
  )
}