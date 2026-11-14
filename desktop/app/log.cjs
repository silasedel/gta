// Southline desktop: plain-text logs in the app's user data folder.
//   macOS: ~/Library/Application Support/Port Solana/logs/ (folder name kept from before the rename so saves and logs stay put)
//   crash.log  renderer/GPU crashes, hangs, reloads (the file to read first)
//   app.log    startup info, GPU info, renderer console errors, periodic memory samples
// Files roll over at 2 MB so they never grow without bound.
const fs = require('node:fs');
const path = require('node:path');

const MAX_BYTES = 2 * 1024 * 1024;

let dir = null;

function init(userDataDir) {
  dir = path.join(userDataDir, 'logs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function write(name, line) {
  if (!dir) {
    return;
  }
  const file = path.join(dir, name);
  try {
    const st = fs.statSync(file);
    if (st.size > MAX_BYTES) {
      fs.renameSync(file, file + '.old');
    }
  } catch (e) {
    // no file yet
  }
  const text = `[${new Date().toISOString()}] ${line}\n`;
  try {
    fs.appendFileSync(file, text);
  } catch (e) {
    // logging must never take the app down
  }
}

function info(line) {
  write('app.log', line);
}

function crash(line) {
  write('crash.log', line);
  write('app.log', 'CRASH ' + line);
}

module.exports = {
  init,
  info,
  crash,
  dir: () => dir,
};
