import React from 'react';
import type { PlamoLocalStatus } from '../hooks/usePlamoLocal';
import { cn } from '../utils/cn';

interface AppHeaderProps {
  asrProvider: string;
  serverStatus: boolean;
  fallbackToSenseVoice: boolean;
  fallbackSenseVoiceStatus: 'idle' | 'loading' | 'ready' | 'error';
  overlayStatus: { success: boolean; port: number } | null;
  llmProvider: string;
  fallbackToPlamoLocal: boolean;
  plamoStatus: PlamoLocalStatus;
  statusText: string;
  onOpenSettings: () => void;
}

const ASR_LABELS: Record<string, string> = {
  sensevoice: 'SenseVoice',
  groq: 'Groq Whisper',
  openai: 'OpenAI Whisper',
};

function getStandbyBadgeClass(status: 'idle' | 'loading' | 'ready' | 'error'): string {
  if (status === 'ready') return 'badge-success';
  if (status === 'error') return 'badge-error';
  return 'badge-warning';
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  asrProvider,
  serverStatus,
  fallbackToSenseVoice,
  fallbackSenseVoiceStatus,
  overlayStatus,
  llmProvider,
  fallbackToPlamoLocal,
  plamoStatus,
  statusText,
  onOpenSettings,
}) => {
  const asrLabel = ASR_LABELS[asrProvider] || 'Whisper';

  return (
    <header className="flex justify-between items-center mb-4 border-b border-gray-700 pb-2">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold bg-linear-to-r from-primary to-accent bg-clip-text text-transparent">
          Talklate4u
        </h1>
        <span className={cn('badge badge-outline', serverStatus ? 'badge-success' : 'badge-error')}>
          {serverStatus ? `${asrLabel} Ready` : `${asrLabel} Offline`}
        </span>
        {asrProvider === 'groq' && fallbackToSenseVoice && (
          <span
            className={cn('badge badge-outline', getStandbyBadgeClass(fallbackSenseVoiceStatus))}
            title={statusText}
          >
            {fallbackSenseVoiceStatus === 'ready'
              ? 'SenseVoice Standby'
              : fallbackSenseVoiceStatus === 'error'
                ? 'SenseVoice Error'
                : 'SenseVoice Loading...'}
          </span>
        )}
        <span
          className={cn(
            'badge badge-outline',
            overlayStatus?.success ? 'badge-success' : 'badge-error',
          )}
          title={
            overlayStatus?.success ? `Port: ${overlayStatus.port}` : 'Overlay Server not running'
          }
        >
          {overlayStatus?.success ? 'Overlay Ready' : 'Overlay Offline'}
        </span>
        {(llmProvider === 'plamo-local' || (llmProvider === 'groq' && fallbackToPlamoLocal)) && (
          <span
            className={cn('badge badge-outline', getStandbyBadgeClass(plamoStatus))}
            title={statusText}
          >
            {plamoStatus === 'ready'
              ? llmProvider === 'groq'
                ? 'PLaMo Standby'
                : 'PLaMo Ready'
              : plamoStatus === 'error'
                ? 'PLaMo Error'
                : 'PLaMo Loading...'}
          </span>
        )}
      </div>
      <button className="btn btn-sm btn-ghost" onClick={onOpenSettings}>
        ⚙️ Settings
      </button>
    </header>
  );
};
