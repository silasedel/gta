// electron-builder config for the Southline desktop app (run from the repo root, see desktop/scripts/build.mjs).
// Unsigned build for local use: no signing identity, no notarization.
module.exports = {
  appId: 'com.portsolana.game', // kept: changing it would give macOS a new app identity (prefs, permissions)
  productName: 'Southline',
  copyright: 'Southline',
  artifactName: 'Southline-${version}-${arch}.${ext}',
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
    icon: 'desktop/build/icon.icns',
    identity: null,
    hardenedRuntime: false,
    gatekeeperAssess: false,
    darkModeSupport: true,
    extendInfo: {
      CFBundleName: 'Southline',
      CFBundleDisplayName: 'Southline',
      NSHumanReadableCopyright: 'Southline',
      NSHighResolutionCapable: true,
      LSMinimumSystemVersion: '12.0',
      // Prefer the discrete GPU on dual-GPU Macs.
      NSSupportsAutomaticGraphicsSwitching: false,
      // Allow ProMotion displays to run above 60 Hz.
      CADisableMinimumFrameDurationOnPhone: true,
    },
  },
  dmg: {
    title: 'Southline',
    icon: 'desktop/build/icon.icns',
    writeUpdateInfo: false,
  },
  win: {
    target: [
      'nsis',
    ],
    icon: 'desktop/build/icon.png',
  },
  nsis: {
    shortcutName: 'Southline',
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
  publish: null,
};
