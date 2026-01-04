import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { PublisherGithub } from '@electron-forge/publisher-github';
// import * as fs from 'fs';
// import * as path from 'path';
// import { execSync } from 'child_process';

const config: ForgeConfig = {
  packagerConfig: {
    asar: false,
    extraResource: [
      'config.default.json',
      'system_prompt.txt',
      'node_modules/nodejs-whisper/cpp/whisper.cpp/build/bin/whisper-server.exe',
      // DLLs are copied dynamically by prePackage hook below
    ],
    icon: 'assets/icon.ico',
    afterExtract: [
      (buildPath, electronVersion, platform, arch, callback) => {
        const fs = require('fs');
        const path = require('path');
        const localesPath = path.join(buildPath, 'locales');
        if (fs.existsSync(localesPath)) {
          const files = fs.readdirSync(localesPath);
          for (const file of files) {
            if (file.endsWith('.pak')) {
               // Keep en-US, ja, and ko
               if (file !== 'en-US.pak' && file !== 'ja.pak' && file !== 'ko.pak') {
                 try {
                   fs.unlinkSync(path.join(localesPath, file));
                 } catch (e) {
                   console.error(`Failed to delete locale: ${file}`, e);
                 }
               }
            }
          }
        }
        callback();
      }
    ]
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'Talklate4u',
      authors: 'U-suke',
      description: 'Real-time speech recognition and translation app with OBS overlay support',
      setupIcon: 'assets/icon.ico',
    }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  publishers: [
    new PublisherGithub({
      repository: {
        owner: 'U-suke-76',
        name: 'Talklate4u'
      },
      prerelease: false,
      draft: true
    })
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: false,
    }),
  ],
  hooks: {
    postPackage: async (config, { outputPaths }) => {
      const fs = await import('fs');
      const path = await import('path');
      const { execSync } = await import('child_process');

      for (const outputPath of outputPaths) {
        // Copy all DLLs from whisper.cpp build/bin to resources
        const whisperBinDir = path.join(process.cwd(), 'node_modules', 'nodejs-whisper', 'cpp', 'whisper.cpp', 'build', 'bin');
        const resourcesDir = path.join(outputPath, 'resources');
        
        console.log('Copying DLLs to:', resourcesDir);
        
        if (fs.existsSync(whisperBinDir)) {
          const files = fs.readdirSync(whisperBinDir);
          const dllFiles = files.filter((f: string) => f.endsWith('.dll'));
          
          for (const dll of dllFiles) {
            const src = path.join(whisperBinDir, dll);
            const dest = path.join(resourcesDir, dll);
            try {
              fs.copyFileSync(src, dest);
              console.log(`Copied DLL: ${dll}`);
            } catch (err) {
              console.error(`Failed to copy ${dll}:`, err);
            }
          }
          console.log(`Copied ${dllFiles.length} DLLs to resources`);
        } else {
          console.warn(`Whisper bin directory not found: ${whisperBinDir}`);
        }

        // Install production dependencies
        const resourcesApp = path.join(outputPath, 'resources', 'app');
        const packageJson = path.join(resourcesApp, 'package.json');

        if (fs.existsSync(packageJson)) {
          try {
            console.log('Installing production dependencies...');
            execSync('npm install --omit=dev --no-bin-links --ignore-scripts', {
              cwd: resourcesApp,
              stdio: 'inherit'
            });
            console.log(`Dependencies installed in ${resourcesApp}`);
          } catch (error) {
            console.error('Failed to install dependencies:', error);
          }
        } else {
          console.log(`No package.json found in ${resourcesApp}, skipping install.`);
        }
      }
    }
  }
};

export default config;
