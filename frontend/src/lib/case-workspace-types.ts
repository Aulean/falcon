import { z } from 'zod';

// Legal Reference schema and type
export const LegalReferenceSchema = z.object({
  id: z.string().optional(),
  url: z.string().url('Please enter a valid URL'),
  title: z.string().min(1, 'Title is required'),
  description: z.string().max(2000, 'Description cannot exceed 2000 characters').optional()
});

export type LegalReference = z.infer<typeof LegalReferenceSchema>;

// Case Document schema and type
export const CaseDocumentSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
  size: z.number(),
  contentType: z.string(),
  uploadedAt: z.string() // ISO date
});

export type CaseDocument = z.infer<typeof CaseDocumentSchema>;

// Case Form schema for new workspace interface
export const CaseWorkspaceFormSchema = z.object({
  title: z.string().min(3, 'Case title must be at least 3 characters'),
  description: z.string().max(5000, 'Description cannot exceed 5000 characters').optional(),
  context: z.string().max(10000, 'Context cannot exceed 10000 characters').optional(),
  instructions: z.string().max(10000, 'Instructions cannot exceed 10000 characters').optional(),
  references: z.array(LegalReferenceSchema).optional()
});

export type CaseWorkspaceFormValues = z.infer<typeof CaseWorkspaceFormSchema>;

// AI Thread and Message types
export type AIMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
};

export type AIThread = {
  id: string;
  title?: string;
  lastMessageAt: string;
  messageCount?: number;
};

// Complete Case Entity for the workspace
export type CaseWorkspaceEntity = {
  id: string;
  title: string;
  description?: string;
  context?: string;
  instructions?: string;
  references: LegalReference[];
  documents: CaseDocument[];
  createdAt: string;
  updatedAt: string;
};

// Upload states for file handling
export type UploadState = 'idle' | 'uploading' | 'success' | 'error';

export type FileUpload = {
  id: string;
  file: File;
  progress: number;
  state: UploadState;
  error?: string;
};

// Presign response from backend
export type PresignResponse = {
  uploadUrl: string;
  fileUrl: string;
  fields?: Record<string, string>;
};