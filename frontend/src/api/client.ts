import type {
  AnalyzeRequest,
  AnalyzeResponse,
  SessionStatus,
  AnalysisResult,
} from '../types/api';

const API_BASE_URL = 'http://localhost:8000/api/v1';

type ProjectRead = {
  id: number;
  name: string;
  repo_url: string;
  created_at: string;
};

type AnalysisRunRead = {
  id: number;
  project_id: number;
  commit_hash: string | null;
  created_at: string;
  status: 'processing' | 'completed' | 'failed' | string;
  error: string | null;
};

type ProjectGraphResponse = {
  project_id: number;
  analysis_run_id: number;
  graph: {
    nodes: Array<Record<string, unknown>>;
    links: Array<Record<string, unknown>>;
  };
};

type MetricsResponse = {
  project_id: number;
  analysis_run_id: number;
  metrics: Array<{
    id: number;
    file_path: string;
    file_type: string;
    lines_count: number;
    metrics: null | {
      degree: number;
      centrality: number;
      fan_in: number;
      fan_out: number;
    };
  }>;
};

function parseSessionId(sessionId: string): { projectId: number; runId: number } {
  const [projectPart, runPart] = sessionId.split(':');
  const projectId = Number(projectPart);
  const runId = Number(runPart);
  if (!Number.isFinite(projectId) || !Number.isFinite(runId)) {
    throw new Error('Некорректный идентификатор сессии');
  }
  return { projectId, runId };
}

function deriveProjectName(repoUrl: string): string {
  try {
    const trimmed = repoUrl.trim().replace(/\/+$/, '');
    const last = trimmed.split('/').pop() || 'project';
    return last.toLowerCase().endsWith('.git') ? last.slice(0, -4) : last;
  } catch {
    return 'project';
  }
}

export class ApiClient {
  private baseUrl: string;
  private projectCache = new Map<number, ProjectRead>();

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

  private async createOrGetProject(repoUrl: string): Promise<ProjectRead> {
    const response = await fetch(`${this.baseUrl}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: deriveProjectName(repoUrl),
        repo_url: repoUrl,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Не удалось создать проект');
    }

    const project = (await response.json()) as ProjectRead;
    this.projectCache.set(project.id, project);
    return project;
  }

  private async getProject(projectId: number): Promise<ProjectRead> {
    const cached = this.projectCache.get(projectId);
    if (cached) return cached;

    const response = await fetch(`${this.baseUrl}/projects/${projectId}`);
    if (!response.ok) {
      throw new Error('Не удалось получить проект');
    }
    const project = (await response.json()) as ProjectRead;
    this.projectCache.set(project.id, project);
    return project;
  }

  private async startAnalysis(projectId: number): Promise<AnalysisRunRead> {
    const response = await fetch(`${this.baseUrl}/projects/${projectId}/analyze`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Не удалось запустить анализ');
    }

    return response.json();
  }

  private async getRun(runId: number): Promise<AnalysisRunRead> {
    const response = await fetch(`${this.baseUrl}/runs/${runId}`);
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Сессия не найдена');
      }
      throw new Error('Не удалось получить статус анализа');
    }
    return response.json();
  }

  private async getGraph(projectId: number, runId: number): Promise<ProjectGraphResponse> {
    const response = await fetch(`${this.baseUrl}/projects/${projectId}/graph?run_id=${runId}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Не удалось получить граф');
    }
    return response.json();
  }

  private async getMetrics(projectId: number, runId: number): Promise<MetricsResponse> {
    const response = await fetch(`${this.baseUrl}/projects/${projectId}/metrics?run_id=${runId}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Не удалось получить метрики');
    }
    return response.json();
  }

  async analyzeRepository(repoUrl: string): Promise<AnalyzeResponse> {
    // Backward-compatible wrapper over the new API:
    // 1) create project, 2) start analysis run, 3) return a combined session id.
    const _unused: AnalyzeRequest = { repo_url: repoUrl };
    void _unused;

    const project = await this.createOrGetProject(repoUrl);
    const run = await this.startAnalysis(project.id);

    return {
      session_id: `${project.id}:${run.id}`,
      status: run.status === 'failed' ? 'failed' : 'processing',
      repository: {
        url: project.repo_url,
        name: project.name,
        analyzed_at: null,
      },
      files: [],
      graph_data: { nodes: [], links: [] },
    };
  }

  async getSessionStatus(sessionId: string): Promise<SessionStatus> {
    const { projectId, runId } = parseSessionId(sessionId);
    const [run, project] = await Promise.all([this.getRun(runId), this.getProject(projectId)]);

    const status =
      run.status === 'completed' || run.status === 'failed' || run.status === 'processing'
        ? run.status
        : 'processing';

    return {
      session_id: sessionId,
      repo_url: project.repo_url,
      status,
      started_at: run.created_at,
      finished_at: status === 'processing' ? null : run.created_at,
      error: run.error,
    };
  }

  async getAnalysisResult(sessionId: string): Promise<AnalysisResult> {
    const { projectId, runId } = parseSessionId(sessionId);

    const run = await this.getRun(runId);
    if (run.status === 'processing') {
      throw new Error('Анализ ещё выполняется');
    }
    if (run.status === 'failed') {
      throw new Error(run.error || 'Анализ завершился с ошибкой');
    }

    const [project, graph, metrics] = await Promise.all([
      this.getProject(projectId),
      this.getGraph(projectId, runId),
      this.getMetrics(projectId, runId),
    ]);

    const files = metrics.metrics.map((m) => ({
      file_path: m.file_path,
      file_type: m.file_type,
      sloc: m.lines_count,
      dependencies: [],
      metrics: {
        in_degree: m.metrics?.fan_in ?? 0,
        out_degree: m.metrics?.fan_out ?? 0,
        centrality: m.metrics?.centrality ?? 0,
      },
    }));

    const totalFiles = files.length;
    const totalDependencies = Array.isArray(graph.graph.links) ? graph.graph.links.length : 0;
    const sumIn = files.reduce((acc, f) => acc + (f.metrics?.in_degree ?? 0), 0);
    const sumOut = files.reduce((acc, f) => acc + (f.metrics?.out_degree ?? 0), 0);

    return {
      session_id: sessionId,
      status: 'completed',
      repository: {
        url: project.repo_url,
        name: project.name,
        analyzed_at: new Date().toISOString(),
      },
      files,
      graph_data: graph.graph as unknown as AnalysisResult['graph_data'],
      statistics: {
        total_files: totalFiles,
        total_dependencies: totalDependencies,
        average_in_degree: totalFiles ? sumIn / totalFiles : 0,
        average_out_degree: totalFiles ? sumOut / totalFiles : 0,
      },
    };
  }
}

export const apiClient = new ApiClient();




