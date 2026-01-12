import { app, Menu, MenuItemConstructorOptions, BrowserWindow, shell } from 'electron';

export class MenuManager {
  constructor(private mainWindow: BrowserWindow) {}

  public buildMenu(): void {
    const isMac = process.platform === 'darwin';
    const isPackaged = app.isPackaged;

    const template: MenuItemConstructorOptions[] = [
      // File Menu
      {
        label: 'File',
        submenu: [
          {
            label: 'Settings',
            accelerator: 'CmdOrCtrl+,',
            click: () => {
              this.mainWindow.webContents.send('open-settings');
            },
          },
          isMac ? { role: 'close' } : { role: 'quit' },
        ],
      },
      // Edit Menu
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          ...(isMac
            ? ([
                { role: 'pasteAndMatchStyle' },
                { role: 'delete' },
                { role: 'selectAll' },
                { type: 'separator' },
                {
                  label: 'Speech',
                  submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }],
                },
              ] as MenuItemConstructorOptions[])
            : ([
                { role: 'delete' },
                { type: 'separator' } as MenuItemConstructorOptions,
                { role: 'selectAll' },
              ] as MenuItemConstructorOptions[])),
        ],
      },
      // View Menu
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
          // DevTools: Only show if NOT packaged or if specifically requested (could add a hidden flag / debug mode later)
          // For now, hide in production as requested.
          ...(!isPackaged
            ? ([{ type: 'separator' }, { role: 'toggleDevTools' }] as MenuItemConstructorOptions[])
            : []),
        ],
      },
      // Window Menu
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          ...(isMac
            ? [{ type: 'separator' }, { role: 'front' }, { type: 'separator' }, { role: 'window' }]
            : [{ role: 'close' }]),
        ],
      },
      // Help Menu
      {
        role: 'help',
        submenu: [
          {
            label: 'Learn More',
            click: async () => {
              await shell.openExternal('https://github.com/U-suke-76/Talklate4u');
            },
          },
        ],
      },
    ];

    // MacOS specific 'App Name' menu
    if (isMac) {
      template.unshift({
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      });
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }
}
