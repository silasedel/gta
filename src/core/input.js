export function createInput(canvas) {
  const held = new Set();
  const justPressed = new Set();
  const input = {
    mouseDX: 0, mouseDY: 0, mouseDown: false, mouseClicked: false, locked: false,
    down: (c) => held.has(c),
    pressed: (c) => justPressed.has(c),
    endFrame() { justPressed.clear(); input.mouseDX = 0; input.mouseDY = 0; input.mouseClicked = false; },
  };
  addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    if (!held.has(e.code)) justPressed.add(e.code);
    held.add(e.code);
  });
  addEventListener('keyup', (e) => held.delete(e.code));
  addEventListener('blur', () => held.clear());
  addEventListener('mousemove', (e) => {
    if (document.pointerLockElement) { input.mouseDX += e.movementX; input.mouseDY += e.movementY; }
  });
  addEventListener('mousedown', (e) => {
    if (e.button === 0) { input.mouseDown = true; if (document.pointerLockElement) input.mouseClicked = true; }
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) input.mouseDown = false; });
  document.addEventListener('pointerlockchange', () => { input.locked = !!document.pointerLockElement; });
  return input;
}
