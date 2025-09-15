interface MyThreadsProps {
  caseId: string
}

export function MyThreads({ }: MyThreadsProps) {
  // No mock threads by default
  const mockThreads: any[] = []

  return (
    <div className="p-0">
      <h3 className="text-base font-medium text-slate-900 mb-2">My threads</h3>
      
      {mockThreads.length === 0 ? (
        <div className="text-center text-slate-400 py-6 text-sm">No threads yet.</div>
      ) : (
      <div className="space-y-3">
        {mockThreads.map((thread) => (
          <div 
            key={thread.id} 
            className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 cursor-pointer hover:bg-slate-800/70 transition-colors"
          >
            <div className="text-sm font-medium text-white truncate">
              {thread.title}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
              <span>{thread.lastMessageAt}</span>
              <span>{thread.messageCount} messages</span>
            </div>
          </div>
        ))}
        
      </div>
      )}
    </div>
  )
}