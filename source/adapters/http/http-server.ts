import { HttpToolServer } from '../../http/http-tool-server.js';
import { SkillServerConfig } from '../../skill/config.js';

export class HttpServerAdapter {
  private static instance: HttpServerAdapter | null = null;
  private readonly server: HttpToolServer;

  private constructor() {
    this.server = new HttpToolServer();
  }

  public static getInstance(): HttpServerAdapter {
    if (!HttpServerAdapter.instance) {
      HttpServerAdapter.instance = new HttpServerAdapter();
    }
    return HttpServerAdapter.instance;
  }

  public async start(config?: Partial<SkillServerConfig>): Promise<void> {
    if (config) {
      this.server.updateConfig(config);
    }
    await this.server.startServer();
  }

  public async stop(): Promise<void> {
    await this.server.stopServer();
  }

  public getInfo(): { isRunning: boolean; config: SkillServerConfig } {
    return this.server.getServerInfo();
  }

  public updateConfig(config: Partial<SkillServerConfig>): void {
    this.server.updateConfig(config);
  }
}
