import React from 'react';
import { LogItem } from '../hooks/useSpeechTranslation';

interface LogViewerProps {
  logs: LogItem[];
  containerRef: React.RefObject<HTMLDivElement>;
}

export const LogViewer: React.FC<LogViewerProps> = ({ logs, containerRef }) => {
  return (
    <div
      className="flex-1 bg-gray-800 rounded-lg p-2 custom-scrollbar overflow-y-auto text-sm font-mono"
      ref={containerRef}
    >
      {logs.length === 0 && (
        <div className="text-center text-gray-500 mt-10">Waiting for audio...</div>
      )}
      {logs.map((log) => (
        <div key={log.id} className="mb-2 border-b border-gray-700 pb-2 last:border-0">
          {log.type === 'system' ? (
            <div className="text-gray-400">
              <span className="mr-2">[{log.time}]</span>
              <span>[SYSTEM] {log.original}</span>
            </div>
          ) : (
            <>
              <div className="flex items-baseline text-gray-100 mb-1">
                <span className="text-gray-500 mr-2 min-w-[120px]">
                  [{log.time}] #{log.id}
                </span>
                <span className="font-bold text-primary mr-2">SRC:</span>
                <span>{log.original}</span>
              </div>
              {log.translated && (
                <div className="flex items-baseline text-white">
                  <span className="text-gray-600 mr-2 min-w-[120px]">
                    [{log.transTime || '...'}] #{log.id}
                  </span>
                  <span className="font-bold text-secondary mr-2">DST:</span>
                  <span>{log.translated}</span>
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
};
