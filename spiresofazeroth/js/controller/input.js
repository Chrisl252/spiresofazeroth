// Hardware Gamepad polling, standard mapping, auto-repeat, analog deadzones, and rumble.
export const BTN = {
  A: 0,        // Confirm / Play
  B: 1,        // Cancel / Back
  X: 2,        // Inspect / Alternate
  Y: 3,        // End Turn
  LB: 4,       // Left Bumper
  RB: 5,       // Right Bumper
  LT: 6,       // Left Trigger
  RT: 7,       // Right Trigger
  BACK: 8,     // Select / View / Share
  START: 9,    // Start / Menu / Options
  LS: 10,      // Left Stick Click
  RS: 11,      // Right Stick Click
  UP: 12,      // D-Pad Up
  DOWN: 13,    // D-Pad Down
  LEFT: 14,    // D-Pad Left
  RIGHT: 15,   // D-Pad Right
};

const STICK_DEADZONE = 0.35;
const REPEAT_DELAY_MS = 280;
const REPEAT_RATE_MS = 140;

let activeGamepadIndex = null;
let gamepadMode = false;
let modeChangeCallback = null;
let appRef = null;

const prevButtons = new Map();
const dirTimers = {
  up: { held: false, nextTime: 0 },
  down: { held: false, nextTime: 0 },
  left: { held: false, nextTime: 0 },
  right: { held: false, nextTime: 0 },
};

export function setAppRef(app) {
  appRef = app;
}

export function isGamepadConnected() {
  const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
  for (let i = 0; i < pads.length; i++) {
    if (pads[i]) return true;
  }
  return false;
}

export function getActiveGamepadName() {
  const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
  if (activeGamepadIndex !== null && pads[activeGamepadIndex]) {
    return pads[activeGamepadIndex].id;
  }
  for (let i = 0; i < pads.length; i++) {
    if (pads[i]) return pads[i].id;
  }
  return "No controller detected";
}

export function rumble(type = "light") {
  try {
    if (!appRef || (appRef.meta && appRef.meta.settings && appRef.meta.settings.vibration === false)) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = activeGamepadIndex !== null ? pads[activeGamepadIndex] : (pads[0] || pads[1]);
    if (!pad || !pad.vibrationActuator || typeof pad.vibrationActuator.playEffect !== "function") return;

    const effects = {
      tap: { duration: 60, weakMagnitude: 0.3, strongMagnitude: 0.1 },
      light: { duration: 110, weakMagnitude: 0.5, strongMagnitude: 0.2 },
      medium: { duration: 190, weakMagnitude: 0.75, strongMagnitude: 0.45 },
      heavy: { duration: 280, weakMagnitude: 1.0, strongMagnitude: 0.8 },
    };
    const eff = effects[type] || effects.light;
    pad.vibrationActuator.playEffect("dual-rumble", {
      startDelay: 0,
      duration: eff.duration,
      weakMagnitude: eff.weakMagnitude,
      strongMagnitude: eff.strongMagnitude,
    }).catch(() => {});
  } catch (e) {}
}

export function setGamepadMode(active) {
  if (gamepadMode === active) return;
  gamepadMode = active;
  document.body.classList.toggle("sp-gamepad-mode", active);
  if (modeChangeCallback) modeChangeCallback(active);
}

export function onGamepadModeChange(fn) {
  modeChangeCallback = fn;
}

export function isGamepadMode() {
  return gamepadMode;
}

export function startPolling(onAction, onRightStick) {
  window.addEventListener("gamepadconnected", (e) => {
    activeGamepadIndex = e.gamepad.index;
    setGamepadMode(true);
    rumble("light");
    if (appRef && appRef.meta && appRef.meta.settings && appRef.meta.settings.vibration === undefined) {
      appRef.meta.settings.vibration = true;
    }
  });

  window.addEventListener("gamepaddisconnected", (e) => {
    if (activeGamepadIndex === e.gamepad.index) {
      activeGamepadIndex = null;
      if (!isGamepadConnected()) setGamepadMode(false);
    }
  });

  let lastX = 0, lastY = 0;
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse" && (Math.abs(e.clientX - lastX) > 15 || Math.abs(e.clientY - lastY) > 15)) {
      lastX = e.clientX;
      lastY = e.clientY;
      if (gamepadMode) setGamepadMode(false);
    }
  });

  function checkDirectionRepeat(dir, active, now) {
    const t = dirTimers[dir];
    if (!active) {
      t.held = false;
      return;
    }
    if (!t.held) {
      t.held = true;
      t.nextTime = now + REPEAT_DELAY_MS;
      onAction(dir);
    } else if (now >= t.nextTime) {
      t.nextTime = now + REPEAT_RATE_MS;
      onAction(dir);
    }
  }

  function tick() {
    if (typeof navigator === "undefined" || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    const now = performance.now();

    let activePad = null;
    if (activeGamepadIndex !== null && pads[activeGamepadIndex]) {
      activePad = pads[activeGamepadIndex];
    } else {
      for (let i = 0; i < pads.length; i++) {
        if (pads[i]) {
          activePad = pads[i];
          activeGamepadIndex = i;
          break;
        }
      }
    }

    if (!activePad) {
      requestAnimationFrame(tick);
      return;
    }

    // Right stick analog scrolling
    if (activePad.axes && activePad.axes.length >= 4 && onRightStick) {
      const ry = activePad.axes[3];
      if (Math.abs(ry) > 0.2) {
        onRightStick(ry);
      }
    }

    // Directional Stick + D-Pad
    const lx = activePad.axes && activePad.axes.length > 0 ? activePad.axes[0] : 0;
    const ly = activePad.axes && activePad.axes.length > 1 ? activePad.axes[1] : 0;

    const btnUp = activePad.buttons[BTN.UP] && activePad.buttons[BTN.UP].pressed;
    const btnDown = activePad.buttons[BTN.DOWN] && activePad.buttons[BTN.DOWN].pressed;
    const btnLeft = activePad.buttons[BTN.LEFT] && activePad.buttons[BTN.LEFT].pressed;
    const btnRight = activePad.buttons[BTN.RIGHT] && activePad.buttons[BTN.RIGHT].pressed;

    const isUp = btnUp || ly < -STICK_DEADZONE;
    const isDown = btnDown || ly > STICK_DEADZONE;
    const isLeft = btnLeft || lx < -STICK_DEADZONE;
    const isRight = btnRight || lx > STICK_DEADZONE;

    checkDirectionRepeat("up", isUp, now);
    checkDirectionRepeat("down", isDown, now);
    checkDirectionRepeat("left", isLeft, now);
    checkDirectionRepeat("right", isRight, now);

    const buttonsToCheck = [
      { idx: BTN.A, action: "a" },
      { idx: BTN.B, action: "b" },
      { idx: BTN.X, action: "x" },
      { idx: BTN.Y, action: "y" },
      { idx: BTN.LB, action: "lb" },
      { idx: BTN.RB, action: "rb" },
      { idx: BTN.LT, action: "lt" },
      { idx: BTN.RT, action: "rt" },
      { idx: BTN.START, action: "start" },
      { idx: BTN.BACK, action: "back" },
    ];

    for (const b of buttonsToCheck) {
      const isPressed = activePad.buttons[b.idx] && (activePad.buttons[b.idx].pressed || activePad.buttons[b.idx].value > 0.5);
      const wasPressed = prevButtons.get(b.idx) || false;

      if (isPressed && !wasPressed) {
        onAction(b.action);
      }
      prevButtons.set(b.idx, isPressed);
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}
