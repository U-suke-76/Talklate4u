import express from 'express';
import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

export class OverlayServer {
  private app: express.Express;
  private httpServer: HttpServer | null = null;
  private io: SocketIOServer | null = null;
  private port: number;

  constructor(port = 3000) {
    this.app = express();
    this.port = port;
  }

  start(staticPath: string) {
    // Serve static files (HTML, CSS, JS) from the overlay directory
    this.app.use(express.static(staticPath));

    this.httpServer = new HttpServer(this.app);
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.io.on('connection', (socket) => {
      console.log('[Overlay] Client connected:', socket.id);

      socket.on('disconnect', () => {
        console.log('[Overlay] Client disconnected:', socket.id);
      });
    });

    this.httpServer.listen(this.port, () => {
      console.log(`[Overlay] Server running at http://localhost:${this.port}`);
    });
  }

  stop() {
    if (this.io) {
      this.io.close();
    }
    if (this.httpServer) {
      this.httpServer.close();
    }
    console.log('[Overlay] Server stopped');
  }

  broadcast<T>(event: string, data: T) {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  isRunning(): boolean {
    return this.httpServer !== null && this.httpServer.listening;
  }

  getPort(): number {
    return this.port;
  }
}
