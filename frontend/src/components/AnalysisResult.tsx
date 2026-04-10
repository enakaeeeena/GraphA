import type { AnalysisResult } from '../types/api';

interface AnalysisResultProps {
  result: AnalysisResult;
}

export function AnalysisResultComponent({ result }: AnalysisResultProps) {
  return (
    <div style={{ marginTop: '20px' }}>
      <h2>Результаты анализа</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <h3>Репозиторий</h3>
        <p><strong>Название:</strong> {result.repository.name}</p>
        <p><strong>URL:</strong> {result.repository.url}</p>
        {result.repository.analyzed_at && (
          <p><strong>Проанализирован:</strong> {new Date(result.repository.analyzed_at).toLocaleString('ru-RU')}</p>
        )}
      </div>

      {result.statistics && (
        <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#e9ecef', borderRadius: '4px' }}>
          <h3>Статистика</h3>
          <p><strong>Всего файлов:</strong> {result.statistics.total_files}</p>
          <p><strong>Всего зависимостей:</strong> {result.statistics.total_dependencies}</p>
          <p><strong>Средняя входящая степень:</strong> {result.statistics.average_in_degree.toFixed(2)}</p>
          <p><strong>Средняя исходящая степень:</strong> {result.statistics.average_out_degree.toFixed(2)}</p>
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <h3>Файлы ({result.files.length})</h3>
        <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #ccc', padding: '10px', borderRadius: '4px' }}>
          {result.files.map((file, index) => (
            <div key={index} style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#fff', borderRadius: '4px' }}>
              <p><strong>{file.file_path}</strong> ({file.file_type})</p>
              <p>Строк кода: {file.sloc}</p>
              <p>Зависимости: {file.dependencies.length}</p>
              {file.metrics && (
                <div style={{ fontSize: '14px', color: '#666', marginTop: '5px' }}>
                  <span>Входящие: {file.metrics.in_degree}</span>
                  {' | '}
                  <span>Исходящие: {file.metrics.out_degree}</span>
                  {' | '}
                  <span>Центральность: {file.metrics.centrality.toFixed(3)}</span>
                </div>
              )}
              {file.dependencies.length > 0 && (
                <details style={{ marginTop: '5px' }}>
                  <summary style={{ cursor: 'pointer', color: '#007bff' }}>Показать зависимости</summary>
                  <ul style={{ marginTop: '5px', paddingLeft: '20px' }}>
                    {file.dependencies.map((dep, depIndex) => (
                      <li key={depIndex}>{dep.import_path} ({dep.import_type})</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3>Граф данных</h3>
        <p>Узлов: {result.graph_data.nodes.length}</p>
        <p>Связей: {result.graph_data.links.length}</p>
        <pre style={{ 
          backgroundColor: '#f8f9fa', 
          padding: '15px', 
          borderRadius: '4px',
          overflow: 'auto',
          maxHeight: '300px',
        }}>
          {JSON.stringify(result.graph_data, null, 2)}
        </pre>
      </div>
    </div>
  );
}




