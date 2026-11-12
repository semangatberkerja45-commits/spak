import { getAccessToken } from './auth';

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(url, { ...options, headers });
}

export const api = {
  // Status & Reconcile
  async getDriveStatus() {
    const res = await fetchWithAuth('/api/drive/status');
    return res.json();
  },

  async initializeWorkspace() {
    const res = await fetchWithAuth('/api/drive/initialize', { method: 'POST' });
    return res.json();
  },

  async reconcileWorkspace() {
    const res = await fetchWithAuth('/api/drive/reconcile', { method: 'POST' });
    return res.json();
  },

  // Documents
  async listDocuments() {
    const res = await fetchWithAuth('/api/documents');
    return res.json();
  },

  async uploadDocument(formData: FormData) {
    const res = await fetchWithAuth('/api/documents', {
      method: 'POST',
      body: formData,
    });
    return res.json();
  },

  async getDocument(id: string) {
    const res = await fetchWithAuth(`/api/documents/${id}`);
    return res.json();
  },

  async updateDocument(id: string, updates: any) {
    const res = await fetchWithAuth(`/api/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return res.json();
  },

  async deleteDocument(id: string) {
    const res = await fetchWithAuth(`/api/documents/${id}`, {
      method: 'DELETE',
    });
    return res.json();
  },

  // Knowledge Assistant
  async askKnowledge(query: string, allowedDocIds?: string[]) {
    const res = await fetchWithAuth('/api/knowledge/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        allowed_document_ids: allowedDocIds,
      }),
    });
    return res.json();
  },

  // Policy Analysis
  async listAnalyses() {
    const res = await fetchWithAuth('/api/analyses');
    return res.json();
  },

  async createAnalysis(data: any) {
    const res = await fetchWithAuth('/api/analyses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async getAnalysis(id: string) {
    const res = await fetchWithAuth(`/api/analyses/${id}`);
    return res.json();
  },

  async runAnalysis(id: string, inputData: any) {
    const res = await fetchWithAuth(`/api/analyses/${id}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inputData),
    });
    return res.json();
  },

  async updateAnalysis(id: string, data: any) {
    const res = await fetchWithAuth(`/api/analyses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async exportAnalysis(id: string, format: 'DOCX' | 'PDF') {
    const token = await getAccessToken();
    const res = await fetch(`/api/analyses/${id}/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ format }),
    });
    if (!res.ok) throw new Error('Gagal mengunduh file ekspor.');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Kajian_SPAK_TIK_${id}.${format.toLowerCase()}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  },

  // Categories & Templates
  async listCategories() {
    const res = await fetchWithAuth('/api/categories');
    return res.json();
  },

  async createCategory(cat: { name: string; description: string }) {
    const res = await fetchWithAuth('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cat),
    });
    return res.json();
  },

  async deleteCategory(id: string) {
    const res = await fetchWithAuth(`/api/categories/${id}`, {
      method: 'DELETE',
    });
    return res.json();
  },

  async listTemplates() {
    const res = await fetchWithAuth('/api/templates');
    return res.json();
  },

  // Demo
  async seedDemo() {
    const res = await fetchWithAuth('/api/demo/seed', { method: 'POST' });
    return res.json();
  },

  async resetDemo() {
    const res = await fetchWithAuth('/api/demo/reset', { method: 'POST' });
    return res.json();
  },
};
