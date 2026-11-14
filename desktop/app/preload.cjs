// Port Solana desktop preload: tells the game it runs inside the desktop app. Nothing else is exposed.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('portSolanaDesktop', {
  isDesktop: true,
  platform: process.platform,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
});
