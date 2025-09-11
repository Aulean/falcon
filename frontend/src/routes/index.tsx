import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageAvatar, MessageContent } from '@/components/ai-elements/message'
import { Response } from '@/components/ai-elements/response'
import { Actions, Action } from '@/components/ai-elements/actions'
import { RefreshCcw, Copy, ThumbsUp, ThumbsDown, Check, Paperclip as PaperclipIcon } from 'lucide-react'
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
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
import { Mic, Plus } from 'lucide-react'

export const Route = createFileRoute('/')({
  component: ChatPage,
  validateSearch: (search: Record<string, unknown>) => ({
    sid: typeof search?.sid === 'string' ? (search.sid as string) : '',
  }),
})

const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL ?? 'http://localhost:3000'

import type { FileUIPart } from 'ai'

type ChatMsg = { role: 'user' | 'assistant'; content: string; files?: (FileUIPart & { id?: string })[] }

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

// Show submit when there is text OR attachments, otherwise show mic
function SubmitOrMic({ inputValue }: { inputValue: string }) {
  const attachments = usePromptInputAttachments()
  const hasText = Boolean(inputValue.trim())
  const hasAttachments = attachments.files.length > 0

  if (hasText || hasAttachments) {
    return (
      <PromptInputSubmit
        className="bg-teal-700 hover:bg-teal-600 text-white border-0 shadow-none focus-visible:ring-2 focus-visible:ring-teal-600"
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
    >
      <Mic className="size-4" />
    </Button>
  )
}

function ChatPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [mode, setMode] = useState<'retrieval' | 'qa' | 'fact'>('qa')
  const [isDragging, setIsDragging] = useState(false)
  const [caseId, setCaseId] = useState<string | undefined>(undefined)
  const [inputValue, setInputValue] = useState('')
  const [sessionId, setSessionId] = useState<string>('')
  const [reaction, setReaction] = useState<'like' | 'dislike' | null>(null)
  const [hoveredAssistantIndex, setHoveredAssistantIndex] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  async function streamAssistantFromBackend(userText: string, files?: (FileUIPart & { id?: string; raw?: File })[]) {
    setReaction(null)
    setCopied(false)
    // 1) Insert placeholder assistant message
    let assistantIndex = -1
    setMessages((prev) => {
      const next = prev.concat({ role: 'assistant', content: '' })
      assistantIndex = next.length - 1
      return next
    })

    try {
      let res: Response
      // Always send JSON. If files are present, upload each first and send attachments with fileUrl
      let attachmentsPayload: { fileUrl: string; filename: string; contentType: string }[] = []
      if (files && files.length > 0) {
        const uploaded: { fileUrl: string; filename: string; contentType: string }[] = []
        for (const part of files) {
          try {
            const file = part.raw
              ? part.raw
              : (part.url ? new File([await fetch(part.url).then((r) => r.blob())], part.filename || 'attachment', { type: part.mediaType || 'application/octet-stream' }) : undefined)
            if (!file) continue
            const fd = new FormData()
            fd.append('file', file, file.name)
            const up = await fetch(`${BACKEND_URL}/api/ai/upload`, { method: 'POST', body: fd })
            if (up.ok) {
              const info = await up.json()
              if (info?.url) uploaded.push({ fileUrl: info.url, filename: info.filename || file.name, contentType: info.contentType || file.type || 'application/octet-stream' })
            }
          } catch (e) {
            console.error('Upload failed', e)
          }
        }
        attachmentsPayload = uploaded
      }

      res = await fetch(`${BACKEND_URL}/api/ai/chat?mock=1&sid=${encodeURIComponent(sessionId)}` , {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: userText }], attachments: attachmentsPayload }),
      })
      if (!res.ok || !res.body) {
        throw new Error(`Bad response: ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE frames are separated by blank line
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue
          const data = part.slice(6) // drop 'data: '
          if (data === '[DONE]') {
            return
          }
          try {
            const evt = JSON.parse(data)
            if (evt?.type === 'text-delta' && typeof evt.delta === 'string') {
              setMessages((prev) => {
                const next = prev.slice()
                const idx = assistantIndex >= 0 ? assistantIndex : prev.length - 1
                next[idx] = { ...next[idx], content: (next[idx]?.content || '') + evt.delta }
                return next
              })
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
    }
  }

  function getLastUserText(msgs: ChatMsg[] = messages) {
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') return msgs[i].content
    }
    return ''
  }

  function removeLastAssistant() {
    setMessages((prev) => {
      const idx = [...prev].reverse().findIndex((m) => m.role === 'assistant')
      if (idx === -1) return prev
      const cut = prev.length - 1 - idx
      return prev.slice(0, cut)
    })
  }

  async function handleRetry() {
    const text = getLastUserText()
    if (!text) return
    removeLastAssistant()
    await streamAssistantFromBackend(text)
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
      navigate({ to: '/', search: { ...search, sid }, replace: true })
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
    setSessionId(search.sid)
    setMessages([])
    setInputValue('')
    setReaction(null)
    setCopied(false)
    setHoveredAssistantIndex(null)
  }, [search.sid])

  const startNewSession = () => {
    const sid = 's_' + Math.random().toString(36).slice(2, 10)
    setSessionId(sid)
    setMessages([])
    setInputValue('')
    setReaction(null)
    setCopied(false)
    setHoveredAssistantIndex(null)
    navigate({ to: '/', search: (prev: any) => ({ ...prev, sid }) })
  }

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
        <div className="flex items-center justify-center h-full p-4">
          <div className="flex flex-col items-center justify-center gap-8 w-full max-w-4xl">
            <h1 className="text-6xl md:text-7xl tracking-tight text-foreground font-instrument-serif-italic">Falcon</h1>
            <div className="w-full max-w-3xl">
              <PromptInput
                globalDrop
                multiple
onSubmit={async ({ text, files }, event) => {
                  if (!text?.trim()) return
                  const t = text
                  setMessages((prev) => [...prev, { role: 'user', content: t, files }])
                  event.currentTarget.reset()
                  setInputValue('')
                  await streamAssistantFromBackend(t, files)
                }}
              >
                <PromptInputBody>
                  <PromptInputTextarea 
                    placeholder="Ask anything or @mention a Space" 
                    onChange={(e) => setInputValue(e.target.value)}
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
                      <SubmitOrMic inputValue={inputValue} />
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
{messages.map((m, i) => (
                m.role === 'assistant' ? (
                  <div
                    key={i}
                    className="mx-auto w-full max-w-2xl py-4 relative"
                    onMouseEnter={() => setHoveredAssistantIndex(i)}
                    onMouseLeave={() => setHoveredAssistantIndex(null)}
                    onFocus={() => setHoveredAssistantIndex(i)}
                    onBlur={() => setHoveredAssistantIndex(null)}
                  >
                    <Response>{m.content}</Response>
                    {i === messages.length - 1 && hoveredAssistantIndex === i && (
                      <div className="mt-2">
                        <Actions className="w-fit bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 rounded-md border shadow-sm">
                          <Action
                            onClick={handleRetry}
                            label="Retry"
                            className="group text-muted-foreground hover:bg-accent"
                          >
                            <RefreshCcw className="size-3 transition-transform duration-300 group-hover:rotate-180" />
                          </Action>
                          <Action
                            onClick={() => setReaction(reaction === 'like' ? null : 'like')}
                            label="Like"
                            className={`group ${reaction === 'like' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'text-muted-foreground hover:bg-accent'}`}
                          >
                            <ThumbsUp className="size-3" />
                          </Action>
                          <Action
                            onClick={() => setReaction(reaction === 'dislike' ? null : 'dislike')}
                            label="Dislike"
                            className={`group ${reaction === 'dislike' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' : 'text-muted-foreground hover:bg-accent'}`}
                          >
                            <ThumbsDown className="size-3" />
                          </Action>
                          <Action
                            onClick={() => handleCopy(m.content)}
                            label="Copy"
                            className="group text-muted-foreground hover:bg-accent"
                            aria-pressed={copied}
                          >
                            {copied ? (
                              <Check className="size-3" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                          </Action>
                        </Actions>
                      </div>
                    )}
                  </div>
                ) : (
                  <Message key={i} from={m.role}>
                    <MessageAvatar src={'/feather.svg'} name={'You'} />
                    <MessageContent>
                      {m.content}
                      {m.files && m.files.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {m.files.map((f, idx) => (
                            f.mediaType?.startsWith('image/') && f.url ? (
                              <img
                                key={idx}
                                src={f.url}
                                alt={f.filename || 'attachment'}
                                className="h-20 w-20 rounded-md object-cover border"
                              />
                            ) : (
                              <div key={idx} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
                                <PaperclipIcon className="size-3" />
                                <span>{f.filename || 'file'}</span>
                              </div>
                            )
                          ))}
                        </div>
                      )}
                    </MessageContent>
                  </Message>
                )
              ))}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
          </div>

          <div className="shrink-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4">
            <PromptInput
              globalDrop
              multiple
onSubmit={async ({ text, files }, event) => {
                if (!text?.trim()) return
                const t = text
                setMessages((prev) => [...prev, { role: 'user', content: t, files }])
                event.currentTarget.reset()
                setInputValue('')
                await streamAssistantFromBackend(t, files)
              }}
              className="mx-auto max-w-3xl"
            >
              <PromptInputBody>
                <PromptInputTextarea 
                  placeholder="Type a message..." 
                  onChange={(e) => setInputValue(e.target.value)}
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
                    <SubmitOrMic inputValue={inputValue} />
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
