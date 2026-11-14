// electron-builder config for the Port Solana desktop app (run from the repo root, see desktop/scripts/build.mjs).
// Unsigned build for local use: no signing identity, no notarization.
module.exports = {
  appId: 'com.portsolana.game',
  productName: 'Port Solana',
  copyright: 'Port Solana',
  electronVersion: '45.2.1',
  directories: {
    app: 'desktop/app',
    output: 'desktop/dist',
    buildResources: 'desktop/build',
  },
  // The game is fully bundled by vite into Resources/web; the app itself needs no node modules.
  files: [
    '**/*',
    '!node_modules{,/**/*}',
  ],
  // The vite production build (index.html + assets) ships next to the app as Resources/web.
  extraResources: [
    {
      from: 'desktop/dist/web',
      to: 'web',
    },
  ],
  asar: true,
  compression: 'store',
  mac: {
    target: [
      'dir',
      'dmg',
    ],
    category: 'public.app-category.games',
    icon: 'desktop/build/icon.png',
    identity: null,
    hardenedRuntime: false,
    gatekeeperAssess: false,
    darkModeSupport: true,
    extendInfo: {
      NSHighResolutionCapable: true,
      LSMinimumSystemVersion: '12.0',
      // Prefer the discrete GPU on dual-GPU Macs.
      NSSupportsAutomaticGraphicsSwitching: false,
      // Allow ProMotion displays to run above 60 Hz.
      CADisableMinimumFrameDurationOnPhone: true,
    },
  },
  dmg: {
    title: 'Port Solana',
    writeUpdateInfo: false,
  },
  win: {
    target: [
      'nsis',
    ],
    icon: 'desktop/build/icon.png',
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
  publish: null,
};
