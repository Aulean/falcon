import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent } from '@/components/ai-elements/message'
import { Response } from '@/components/ai-elements/response'
import { Actions, Action } from '@/components/ai-elements/actions'
import { Loader } from '@/components/ai-elements/loader'
import { RefreshCcw, Copy, ThumbsUp, ThumbsDown, Check, Paperclip as PaperclipIcon } from 'lucide-react'
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
  PromptInputSubmit,
  PromptInputAttachments,
  PromptInputAttachment,
  PromptInputModelSelect,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectValue,
  usePromptInputAttachments,
} from '@/components/ai-elements/prompt-input'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Mic } from 'lucide-react'

export const Route = createFileRoute('/')({
  component: ChatPage,
  validateSearch: (search: Record<string, unknown>) => ({
    sid: typeof search?.sid === 'string' ? (search.sid as string) : '',
  }),
})

const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL ?? 'http://localhost:3000'

//

// Helper component for case selection
function CaseSelector({ caseId, setCaseId }: { caseId: string | undefined; setCaseId: (id: string | undefined) => void }) {
  return (
    <Select value={caseId} onValueChange={setCaseId}>
      <SelectTrigger className="h-8 w-24 border-none bg-transparent text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
        <SelectValue placeholder="Case" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="case-1">Case 1</SelectItem>
        <SelectItem value="case-2">Case 2</SelectItem>
        <SelectItem value="case-3">Case 3</SelectItem>
      </SelectContent>
    </Select>
  )
}

// Helper component for attach button
function AttachButton() {
  const attachments = usePromptInputAttachments()
  
  return (
    <Button 
      type="button" 
      variant="ghost" 
      size="icon" 
      onClick={attachments.openFileDialog}
      aria-label="Attach file"
    >
      <PaperclipIcon className="size-4" />
    </Button>
  )
}

// Show submit when there is text OR attachments, otherwise show mic, or stop when loading
function SubmitOrMic({ inputValue, isLoading, onStop }: { inputValue?: string; isLoading?: boolean; onStop?: () => void }) {
  const attachments = usePromptInputAttachments()
  const hasText = Boolean(inputValue?.trim())
  const hasAttachments = attachments.files.length > 0

  if (isLoading && onStop) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={onStop}
        className="gap-1.5 rounded-lg border border-red-200 text-red-600 bg-white hover:bg-red-50 shadow-none focus-visible:ring-2 focus-visible:ring-red-300"
        aria-label="Stop"
      >
        <div className="size-3 bg-red-600 rounded-sm" />
      </Button>
    )
  }

  if (hasText || hasAttachments) {
    return (
      <PromptInputSubmit
        className="bg-teal-700 hover:bg-teal-600 text-white border-0 shadow-none focus-visible:ring-2 focus-visible:ring-teal-600"
        disabled={isLoading}
      />
    )
  }

  return (
    <Button
      type="button"
      variant="default"
      size="icon"
      className="gap-1.5 rounded-lg bg-teal-700 hover:bg-teal-600 text-white border-0 shadow-none focus-visible:ring-2 focus-visible:ring-teal-600"
      aria-label="Speak"
      disabled={isLoading}
    >
      <Mic className="size-4" />
    </Button>
  )
}

// Helper: extract concatenated text from a UIMessage's parts or content
function extractTextFromMessage(m: any): string {
  if (!m) return ''
  if (typeof m.content === 'string' && m.content.trim()) return m.content
  const parts = Array.isArray(m.parts) ? m.parts : []
  return parts
    .map((p: any) => {
      if (typeof p === 'string') return p
      if (p && typeof p === 'object') {
        if (p.type === 'text' && typeof p.text === 'string') return p.text
        return p.text || p.content || p.value || p.delta || ''
      }
      return ''
    })
    .join('')
}

function ChatPage() {
  const navigate = Route.useNavigate()
  const search = Route.useSearch()
  const [mode, setMode] = useState<'retrieval' | 'qa' | 'fact'>('qa')
  const [isDragging, setIsDragging] = useState(false)
  const [caseId, setCaseId] = useState<string | undefined>(undefined)
  const [sessionId, setSessionId] = useState<string>('')
  const [reaction, setReaction] = useState<'like' | 'dislike' | null>(null)
  const [_, setHoveredAssistantIndex] = useState<number | null>(null) // reserved for hover effects
  const [copied, setCopied] = useState(false)
  const [prompt, setPrompt] = useState('')
  
  const { messages, sendMessage, status, stop, regenerate, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: `${BACKEND_URL}/api/ai/chat`,
      headers: () => {
        const token = (typeof window !== 'undefined' && (localStorage.getItem('AUTH_TOKEN') || sessionStorage.getItem('AUTH_TOKEN'))) || (import.meta as any).env?.VITE_API_TOKEN || ''
        const headers: Record<string, string> = {}
        if (token) {
          headers.Authorization = `Bearer ${token}`
        }
        return headers
      },
      body: {
        id: sessionId,
        // Optionally pass asset filters when available
        assets: undefined,
      },
    }),
    onError: (err) => {
      console.error(err?.message || String(err))
    }
  })

  const isLoading = status === 'streaming'

  async function handleRetry() {
    if (messages.length === 0) return
    // Regenerate the last assistant response using useChat's built-in helper
    try {
      await regenerate()
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    // Ensure a session id in the URL (?sid=...) and local state
    let sid = search.sid
    if (!sid) {
      sid = 's_' + Math.random().toString(36).slice(2, 10)
      // Preserve current location; only add sid
      navigate({ search: (prev) => ({ ...prev, sid }), replace: true })
    }
    setSessionId(sid)

    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types?.includes('Files')
    const onDragOver = (e: DragEvent) => {
      if (hasFiles(e)) {
        e.preventDefault()
        setIsDragging(true)
      }
    }
    const onDragEnter = (e: DragEvent) => {
      if (hasFiles(e)) setIsDragging(true)
    }
    const onDragLeave = () => setIsDragging(false)
    const onDrop = () => setIsDragging(false)

    document.addEventListener('dragover', onDragOver)
    document.addEventListener('dragenter', onDragEnter)
    document.addEventListener('dragleave', onDragLeave)
    document.addEventListener('drop', onDrop)
    return () => {
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('dragenter', onDragEnter)
      document.removeEventListener('dragleave', onDragLeave)
      document.removeEventListener('drop', onDrop)
    }
  }, [])

  // When sid changes (e.g., New clicked in header), reset local UI state
  useEffect(() => {
    if (!search.sid) return
    const newSid = search.sid
    
    // If session ID actually changed, clear the chat
    if (sessionId && sessionId !== newSid) {
      setMessages([]) // Clear the useChat messages
      setPrompt('')
    }
    
    setSessionId(newSid)
    setReaction(null)
    setCopied(false)
    setHoveredAssistantIndex(null)
    setCaseId(undefined)
  }, [search.sid, sessionId, setMessages])

  return (
    <div className="flex flex-col h-full">
      {isDragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          <div className="rounded-2xl border-2 border-dashed border-primary/40 bg-background/80 px-6 py-4 text-sm text-muted-foreground shadow-xl">
            Drop files anywhere to attach
          </div>
        </div>
      )}

      {messages.length === 0 ? (
        // Empty state: centered input with title (no sticky bar)
        <div className="flex items-center justify-center h-full p-4 -mt-16">
          <div className="flex flex-col items-center justify-center gap-8 w-full max-w-4xl">
            <h1 className="text-6xl md:text-7xl tracking-tight text-teal-700 font-instrument-serif-italic">Falcon</h1>
            <div className="w-full max-w-3xl">
              <PromptInput
                globalDrop
                multiple
onSubmit={(msg) => {
                  const text = msg.text?.trim() || ''
                  if (text) {
                    sendMessage({ text })
                    setPrompt('')
                  }
                }}
              >
                <PromptInputBody>
                  <PromptInputTextarea 
                    placeholder="Ask anything or @mention a Space" 
                    value={prompt}
                    onChange={(e) => setPrompt(e.currentTarget.value)}
                  />
                  <PromptInputToolbar>
                    <PromptInputTools>
                      <PromptInputModelSelect value={mode} onValueChange={(v) => setMode(v as any)}>
                        <PromptInputModelSelectTrigger className="h-8">
                          <PromptInputModelSelectValue placeholder="Mode" />
                        </PromptInputModelSelectTrigger>
                        <PromptInputModelSelectContent>
                          <PromptInputModelSelectItem value="retrieval">Retrieval</PromptInputModelSelectItem>
                          <PromptInputModelSelectItem value="qa">Question Answering</PromptInputModelSelectItem>
                          <PromptInputModelSelectItem value="fact">Fact Verification</PromptInputModelSelectItem>
                        </PromptInputModelSelectContent>
                      </PromptInputModelSelect>
                    </PromptInputTools>

                    <div className="ml-auto flex items-center gap-1">
                      <CaseSelector caseId={caseId} setCaseId={setCaseId} />
                      <AttachButton />
                      <SubmitOrMic inputValue={prompt} isLoading={isLoading} onStop={stop} />
                    </div>
                  </PromptInputToolbar>
                  <PromptInputAttachments>
                    {(file) => <PromptInputAttachment data={file} />}
                  </PromptInputAttachments>
                </PromptInputBody>
              </PromptInput>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 min-h-0">
            <Conversation className="h-full hide-scrollbar">
              <ConversationContent>
{messages.map((m, i) => {
                // Assistant message rendering is now working correctly
                return m.role === 'assistant' ? (
                  <div key={m.id || i} className="mx-auto w-full max-w-2xl py-4 relative">
                    <Response>
                      {extractTextFromMessage(m)}
                    </Response>
                    {isLoading && i === messages.length - 1 && (
                      <div className="mt-2 flex items-center gap-2 text-muted-foreground">
                        <Loader size={16} />
                        <span className="text-sm">Thinking...</span>
                      </div>
                    )}
                    {i === messages.length - 1 && (
                      <div className="mt-4">
                        <Actions className="w-fit bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 rounded-md border shadow-sm">
                          <Action onClick={handleRetry} label="Regenerate" className="group text-muted-foreground hover:bg-accent">
                            <RefreshCcw className="size-3 transition-transform duration-300 group-hover:rotate-180" />
                          </Action>
                          <Action onClick={() => setReaction(reaction === 'like' ? null : 'like')} label="Like" className={`group ${reaction === 'like' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'text-muted-foreground hover:bg-accent'}`}>
                            <ThumbsUp className="size-3" />
                          </Action>
                          <Action onClick={() => setReaction(reaction === 'dislike' ? null : 'dislike')} label="Dislike" className={`group ${reaction === 'dislike' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' : 'text-muted-foreground hover:bg-accent'}`}>
                            <ThumbsDown className="size-3" />
                          </Action>
                          <Action onClick={() => handleCopy(extractTextFromMessage(m))} label="Copy" className="group text-muted-foreground hover:bg-accent" aria-pressed={copied}>
                            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                          </Action>
                        </Actions>
                      </div>
                    )}
                  </div>
                ) : (
                  <Message key={m.id || i} from={m.role}>
                    <MessageContent>
                      {extractTextFromMessage(m)}
                    </MessageContent>
                  </Message>
                );
              })}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
          </div>

          <div className="shrink-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4">
            <PromptInput
              globalDrop
              multiple
onSubmit={(msg) => {
              const text = msg.text?.trim() || ''
              if (text) {
                sendMessage({ text })
                setPrompt('')
              }
            }}
              className="mx-auto max-w-3xl"
            >
              <PromptInputBody>
                <PromptInputTextarea 
                  placeholder="Type a message..." 
                  value={prompt}
                  onChange={(e) => setPrompt(e.currentTarget.value)}
                />
                <PromptInputToolbar>
                  <PromptInputTools>
                    <PromptInputModelSelect value={mode} onValueChange={(v) => setMode(v as any)}>
                      <PromptInputModelSelectTrigger className="h-8">
                        <PromptInputModelSelectValue placeholder="Mode" />
                      </PromptInputModelSelectTrigger>
                      <PromptInputModelSelectContent>
                        <PromptInputModelSelectItem value="retrieval">Retrieval</PromptInputModelSelectItem>
                        <PromptInputModelSelectItem value="qa">Question Answering</PromptInputModelSelectItem>
                        <PromptInputModelSelectItem value="fact">Fact Verification</PromptInputModelSelectItem>
                      </PromptInputModelSelectContent>
                    </PromptInputModelSelect>
                  </PromptInputTools>

                  <div className="ml-auto flex items-center gap-1">
                    <CaseSelector caseId={caseId} setCaseId={setCaseId} />
                    <AttachButton />
                    <SubmitOrMic inputValue={prompt} isLoading={isLoading} onStop={stop} />
                  </div>
                </PromptInputToolbar>
                <PromptInputAttachments>
                  {(file) => <PromptInputAttachment data={file} />}
                </PromptInputAttachments>
              </PromptInputBody>
            </PromptInput>
          </div>
        </>
      )}
    </div>
  )
}
