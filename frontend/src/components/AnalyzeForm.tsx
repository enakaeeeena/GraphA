import { useState } from 'react';
import { apiClient } from '../api/client';
import type { AnalyzeResponse } from '../types/api';

interface AnalyzeFormProps {
  onAnalysisStart: (response: AnalyzeResponse) => void;
  onError: (error: string) => void;
}

export function AnalyzeForm({ onAnalysisStart, onError }: AnalyzeFormProps) {
  const [repoUrl, setRepoUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!repoUrl.trim()) {
      onError('Введите URL репозитория');
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiClient.analyzeRepository(repoUrl.trim());
      onAnalysisStart(response);
      setRepoUrl('');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Ошибка при запуске анализа');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
        <input
          type="text"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="https://github.com/user/repo.git"
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '10px',
            fontSize: '16px',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        />
        <button
          type="submit"
          disabled={isLoading || !repoUrl.trim()}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading || !repoUrl.trim() ? 0.6 : 1,
          }}
        >
          {isLoading ? 'Запуск...' : 'Анализировать'}
        </button>
      </div>
    </form>
  );
}



