import axios from 'axios';
import * as fs from 'fs';
import { Readable } from 'stream';

export interface DownloadProgressOptions {
  url: string;
  destPath: string;
  label: string;
  onProgress?: (progressMessage: string, percent: number) => void;
}

/**
 * Downloads a file via HTTP stream to a temporary `.part` file, reports percentage progress,
 * and atomically renames it to `destPath` upon completion.
 */
export async function downloadFileWithProgress(options: DownloadProgressOptions): Promise<void> {
  const { url, destPath, label, onProgress } = options;

  const response = await axios.get<Readable>(url, {
    responseType: 'stream',
  });

  const total = parseInt(String(response.headers['content-length'] ?? '0'), 10);
  let current = 0;
  let lastPct = -1;

  const tempPath = `${destPath}.part`;
  const writer = fs.createWriteStream(tempPath);

  await new Promise<void>((resolve, reject) => {
    const stream = response.data;
    stream.on('data', (chunk: Buffer) => {
      current += chunk.length;
      if (total > 0) {
        const pct = Math.floor((current / total) * 100);
        if (pct > lastPct) {
          lastPct = pct;
          const msg = `Downloading ${label}: ${pct}%`;
          onProgress?.(msg, pct);
        }
      }
    });

    stream.pipe(writer);

    writer.on('finish', () => {
      try {
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        fs.renameSync(tempPath, destPath);
        resolve();
      } catch (e) {
        reject(e);
      }
    });

    writer.on('error', (err: Error) => {
      writer.close();
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {
        /* ignore */
      }
      reject(err);
    });
  });
}
