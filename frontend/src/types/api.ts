export interface Repository {
  url: string;
  name: string;
  analyzed_at: string | null;
}

export interface ImportDependency {
  import_path: string;
  import_type: string;
}

export interface FileMetrics {
  in_degree: number;
  out_degree: number;
  centrality: number;
}

export interface SourceFile {
  file_path: string;
  file_type: string;
  sloc: number;
  dependencies: ImportDependency[];
  metrics: FileMetrics;
}

export interface GraphData {
  nodes: Array<{
    id: string;
    name: string;
    group?: number;
    [key: string]: unknown;
  }>;
  links: Array<{
    source: string;
    target: string;
    value?: number;
    [key: string]: unknown;
  }>;
}

export interface Statistics {
  total_files: number;
  total_dependencies: number;
  average_in_degree: number;
  average_out_degree: number;
}

export interface AnalyzeRequest {
  repo_url: string;
}

export interface AnalyzeResponse {
  session_id: string;
  status: 'processing' | 'completed' | 'failed';
  repository: Repository;
  files: SourceFile[];
  graph_data: GraphData;
}

export interface SessionStatus {
  session_id: string;
  repo_url: string;
  status: 'processing' | 'completed' | 'failed';
  started_at: string;
  finished_at: string | null;
  error: string | null;
}

export interface AnalysisResult extends AnalyzeResponse {
  statistics: Statistics;
}



