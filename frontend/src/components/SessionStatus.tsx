import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import type { SessionStatus, AnalysisResult } from '../types/api';

interface SessionStatusProps {
  sessionId: string;
  onComplete: (result: AnalysisResult) => void;
  onError: (error: string) => void;
}

export function SessionStatusComponent({ sessionId, onComplete, onError }: SessionStatusProps) {
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [isPolling, setIsPolling] = useState(true);

  useEffect(() => {
    if (!isPolling) return;

    const pollStatus = async () => {
      try {
        const sessionStatus = await apiClient.getSessionStatus(sessionId);
        setStatus(sessionStatus);

        if (sessionStatus.status === 'completed') {
          setIsPolling(false);
          try {
            const result = await apiClient.getAnalysisResult(sessionId);
            onComplete(result);
          } catch (error) {
            onError(error instanceof Error ? error.message : 'Ошибка при получении результата');
          }
        } else if (sessionStatus.status === 'failed') {
          setIsPolling(false);
          onError(sessionStatus.error || 'Анализ завершился с ошибкой');
        }
      } catch (error) {
        setIsPolling(false);
        onError(error instanceof Error ? error.message : 'Ошибка при проверке статуса');
      }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 2000); // Проверяем каждые 2 секунды

    return () => clearInterval(interval);
  }, [sessionId, isPolling, onComplete, onError]);

  if (!status) {
    return <div>Загрузка статуса...</div>;
  }

  return (
    <div style={{ 
      padding: '15px', 
      backgroundColor: '#f8f9fa', 
      borderRadius: '4px',
      marginBottom: '20px',
    }}>
      <h3>Статус анализа</h3>
      <p><strong>Сессия:</strong> {status.session_id}</p>
      <p><strong>Репозиторий:</strong> {status.repo_url}</p>
      <p><strong>Статус:</strong> 
        <span style={{ 
          marginLeft: '10px',
          padding: '4px 8px',
          borderRadius: '4px',
          backgroundColor: 
            status.status === 'completed' ? '#28a745' :
            status.status === 'failed' ? '#dc3545' :
            '#ffc107',
          color: status.status === 'processing' ? '#000' : '#fff',
        }}>
          {status.status === 'processing' ? 'Обработка...' :
           status.status === 'completed' ? 'Завершено' :
           'Ошибка'}
        </span>
      </p>
      {status.started_at && (
        <p><strong>Начато:</strong> {new Date(status.started_at).toLocaleString('ru-RU')}</p>
      )}
      {status.finished_at && (
        <p><strong>Завершено:</strong> {new Date(status.finished_at).toLocaleString('ru-RU')}</p>
      )}
      {status.error && (
        <p style={{ color: '#dc3545' }}><strong>Ошибка:</strong> {status.error}</p>
      )}
    </div>
  );
}




