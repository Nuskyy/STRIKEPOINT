// Clavier (codes physiques => fonctionne en AZERTY et QWERTY), souris, Pointer Lock.
const BLOCK = new Set(['Tab', 'Space', 'KeyF', 'KeyG', 'KeyR', 'KeyV', 'KeyC', 'KeyQ', 'KeyE', 'Digit1', 'Digit2', 'Digit3', 'Digit4']);

export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set();
    this.pressed = new Set();
    this.mx = 0; this.my = 0;
    this.buttons = 0; this.mPressed = 0;
    this.wheel = 0;
    this.locked = false;
    this.onLockChange = null;

    addEventListener('keydown', (e) => {
      if (this.locked && BLOCK.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // filtre des pics anormaux de movementX (bug connu de certains navigateurs)
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mx += e.movementX; this.my += e.movementY;
    });
    addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.buttons |= 1 << e.button;
      this.mPressed |= 1 << e.button;
    });
    addEventListener('mouseup', (e) => { this.buttons &= ~(1 << e.button); });
    addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('blur', () => { this.keys.clear(); this.buttons = 0; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      if (!this.locked) this.buttons = 0;
      this.onLockChange?.(this.locked);
    });
  }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  mouseDown(b) { return (this.buttons & (1 << b)) !== 0; }
  mouseHit(b) { return (this.mPressed & (1 << b)) !== 0; }

  endFrame() {
    this.pressed.clear();
    this.mPressed = 0;
    this.mx = 0; this.my = 0;
    this.wheel = 0;
  }

  lock() {
    try {
      const p = this.el.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.el.requestPointerLock(); } catch { /* ignore */ } });
    } catch { try { this.el.requestPointerLock(); } catch { /* ignore */ } }
  }

  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
}
