import type { 
  CaseWorkspaceEntity, 
  CaseWorkspaceFormValues, 
  LegalReference, 
  CaseDocument, 
  AIThread, 
  AIMessage, 
  PresignResponse 
} from './case-workspace-types';

const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL ?? 'http://localhost:3000';

// Helper function to handle response parsing and error throwing
async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const msg = `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// Case Operations
export async function getCase(caseId: string): Promise<CaseWorkspaceEntity> {
  try {
    return await jsonOrThrow<CaseWorkspaceEntity>(
      await fetch(`${BACKEND_URL}/api/cases/${caseId}?mock=1`)
    );
  } catch (err: any) {
    console.error(err?.message || 'getCase failed');
    throw err;
  }
}

export async function createCase(data: CaseWorkspaceFormValues): Promise<CaseWorkspaceEntity> {
  try {
    return await jsonOrThrow<CaseWorkspaceEntity>(
      await fetch(`${BACKEND_URL}/api/cases?mock=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    );
  } catch (err: any) {
    console.error(err?.message || 'createCase failed');
    throw err;
  }
}

export async function updateCase(caseId: string, data: Partial<CaseWorkspaceFormValues>): Promise<CaseWorkspaceEntity> {
  try {
    return await jsonOrThrow<CaseWorkspaceEntity>(
      await fetch(`${BACKEND_URL}/api/cases/${caseId}?mock=1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    );
  } catch (err: any) {
    console.error(err?.message || 'updateCase failed');
    throw err;
  }
}

// Legal References Operations
export async function getCaseReferences(caseId: string): Promise<LegalReference[]> {
  try {
    return await jsonOrThrow<LegalReference[]>(
      await fetch(`${BACKEND_URL}/api/cases/${caseId}/references?mock=1`)
    );
  } catch (err: any) {
    console.error(err?.message || 'getCaseReferences failed');
    throw err;
  }
}

export async function addCaseReference(caseId: string, reference: Omit<LegalReference, 'id'>): Promise<LegalReference> {
  try {
    return await jsonOrThrow<LegalReference>(
      await fetch(`${BACKEND_URL}/api/cases/${caseId}/references?mock=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reference),
      })
    );
  } catch (err: any) {
    console.error(err?.message || 'addCaseReference failed');
    throw err;
  }
}

export async function deleteCaseReference(caseId: string, referenceId: string): Promise<void> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/cases/${caseId}/references/${referenceId}?mock=1`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const msg = `HTTP ${response.status}`;
      throw new Error(msg);
    }
  } catch (err: any) {
    console.error(err?.message || 'deleteCaseReference failed');
    throw err;
  }
}

// Documents Operations
export async function getCaseDocuments(caseId: string): Promise<CaseDocument[]> {
  try {
    return await jsonOrThrow<CaseDocument[]>(
      await fetch(`${BACKEND_URL}/api/cases/${caseId}/documents?mock=1`)
    );
  } catch (err: any) {
    console.error(err?.message || 'getCaseDocuments failed');
    throw err;
  }
}

export async function presignDocumentUpload(
  caseId: string, 
  fileName: string, 
  fileSize: number, 
  contentType: string
): Promise<PresignResponse> {
  try {
    return await jsonOrThrow<PresignResponse>(
      await fetch(`${BACKEND_URL}/api/cases/${caseId}/documents/presign?mock=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fileName,
          size: fileSize,
          contentType,
        }),
      })
    );
  } catch (err: any) {
    console.error(err?.message || 'presignDocumentUpload failed');
    throw err;
  }
}

export async function uploadToPresignedUrl(
  uploadUrl: string,
  file: File,
  fields?: Record<string, string>,
  onProgress?: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          onProgress(progress);
        }
      });
    }
    
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });
    
    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed'));
    });
    
    xhr.open('PUT', uploadUrl);
    
    const formData = new FormData();
    if (fields) {
      Object.entries(fields).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }
    formData.append('file', file);
    
    xhr.send(formData);
  });
}

export async function registerUploadedDocument(
  caseId: string, 
  documentData: Omit<CaseDocument, 'id'>
): Promise<CaseDocument> {
  try {
    return await jsonOrThrow<CaseDocument>(
      await fetch(`${BACKEND_URL}/api/cases/${caseId}/documents?mock=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(documentData),
      })
    );
  } catch (err: any) {
    console.error(err?.message || 'registerUploadedDocument failed');
    throw err;
  }
}

export async function deleteCaseDocument(caseId: string, documentId: string): Promise<void> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/cases/${caseId}/documents/${documentId}?mock=1`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const msg = `HTTP ${response.status}`;
      throw new Error(msg);
    }
  } catch (err: any) {
    console.error(err?.message || 'deleteCaseDocument failed');
    throw err;
  }
}

// AI Threads Operations
export async function getCaseThreads(caseId: string): Promise<AIThread[]> {
  try {
    return await jsonOrThrow<AIThread[]>(
      await fetch(`${BACKEND_URL}/api/cases/${caseId}/threads?mock=1`)
    );
  } catch (err: any) {
    console.error(err?.message || 'getCaseThreads failed');
    throw err;
  }
}

export async function createCaseThread(caseId: string, initialPrompt?: string): Promise<AIThread> {
  try {
    return await jsonOrThrow<AIThread>(
      await fetch(`${BACKEND_URL}/api/cases/${caseId}/threads?mock=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initialPrompt }),
      })
    );
  } catch (err: any) {
    console.error(err?.message || 'createCaseThread failed');
    throw err;
  }
}

export async function getThreadMessages(caseId: string, threadId: string): Promise<AIMessage[]> {
  try {
    return await jsonOrThrow<AIMessage[]>(
      await fetch(`${BACKEND_URL}/api/cases/${caseId}/threads/${threadId}/messages?mock=1`)
    );
  } catch (err: any) {
    console.error(err?.message || 'getThreadMessages failed');
    throw err;
  }
}

export async function sendThreadMessage(
  caseId: string, 
  threadId: string, 
  content: string
): Promise<AIMessage> {
  try {
    return await jsonOrThrow<AIMessage>(
      await fetch(`${BACKEND_URL}/api/cases/${caseId}/threads/${threadId}/messages?mock=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
    );
  } catch (err: any) {
    console.error(err?.message || 'sendThreadMessage failed');
    throw err;
  }
}