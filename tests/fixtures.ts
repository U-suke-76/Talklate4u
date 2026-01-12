/* eslint-disable react-hooks/rules-of-hooks */
import {
  test as base,
  expect,
  _electron as electron,
  Page,
  ElectronApplication,
} from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type TestFixtures = {
  app: ElectronApplication;
  window: Page;
  launchArgs: string[];
};

export const test = base.extend<TestFixtures>({
  launchArgs: [[], { option: true }], // Default: empty args

  app: async ({ launchArgs }, use) => {
    const electronPath = path.join(__dirname, '../node_modules/.bin/electron.cmd');
    const appPath = path.join(__dirname, '../.');

    const configPath = path.join(__dirname, 'config.test.json');

    const app = await electron.launch({
      args: [appPath, `--config=${configPath}`, ...launchArgs],
      executablePath: electronPath,
      env: { ...process.env, NODE_ENV: 'development' },
    });

    await use(app);

    await app.close();
  },

  window: async ({ app }, use) => {
    const window = await app.firstWindow();
    await use(window);
  },
});

export { expect };
