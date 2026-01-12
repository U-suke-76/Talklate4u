import { app } from 'electron';

export class PathUtils {
  public static isDev(): boolean {
    return !app.isPackaged;
  }

  /**
   * Returns the path where static resources (like system_prompt.txt, config.default.json) are located.
   * In Dev: Project root (process.cwd())
   * In Prod: Resources directory (process.resourcesPath)
   */
  public static getResourcesPath(): string {
    if (PathUtils.isDev()) {
      return process.cwd();
    } else {
      return process.resourcesPath;
    }
  }
}
