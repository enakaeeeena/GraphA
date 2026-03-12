import type {
  AnalyzeRequest,
  AnalyzeResponse,
  SessionStatus,
  AnalysisResult,
} from '../types/api';

const API_BASE_URL = 'http://localhost:8000/api/v1';

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  async checkHealth(): Promise<{ status: string }> {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error('Health check failed');
    }
    return response.json();
  }

  async analyzeRepository(repoUrl: string): Promise<AnalyzeResponse> {
    const response = await fetch(`${this.baseUrl}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ repo_url: repoUrl } as AnalyzeRequest),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to start analysis');
    }

    return response.json();
  }

  async getSessionStatus(sessionId: string): Promise<SessionStatus> {
    const response = await fetch(`${this.baseUrl}/session/${sessionId}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Сессия не найдена');
      }
      throw new Error('Failed to get session status');
    }

    return response.json();
  }

  async getAnalysisResult(sessionId: string): Promise<AnalysisResult> {
    const response = await fetch(`${this.baseUrl}/session/${sessionId}/result`);
    
    if (!response.ok) {
      if (response.status === 202) {
        throw new Error('Анализ ещё выполняется');
      }
      if (response.status === 404) {
        throw new Error('Сессия не найдена');
      }
      if (response.status === 500) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || 'Ошибка при анализе');
      }
      throw new Error('Failed to get analysis result');
    }

    return response.json();
  }
}

export const apiClient = new ApiClient();



