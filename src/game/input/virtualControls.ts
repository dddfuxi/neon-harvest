import type { ActionVector } from "./actions";

type VirtualControlState = {
  enabled: boolean;
  move: ActionVector;
  aim: ActionVector;
  fire: boolean;
  dashQueued: boolean;
  interact: boolean;
  pauseQueued: boolean;
};

const state: VirtualControlState = {
  enabled: false,
  move: { x: 0, y: 0 },
  aim: { x: 1, y: 0 },
  fire: false,
  dashQueued: false,
  interact: false,
  pauseQueued: false
};

export function setVirtualControlsEnabled(enabled: boolean): void {
  state.enabled = enabled;
  if (!enabled) {
    resetVirtualControls();
  }
}

export function isVirtualControlsEnabled(): boolean {
  return state.enabled;
}

export function resetVirtualControls(): void {
  state.move = { x: 0, y: 0 };
  state.aim = { x: 1, y: 0 };
  state.fire = false;
  state.dashQueued = false;
  state.interact = false;
  state.pauseQueued = false;
}

export function setVirtualMove(next: ActionVector): void {
  state.move = next;
}

export function setVirtualAim(next: ActionVector): void {
  state.aim = next;
}

export function setVirtualFire(next: boolean): void {
  state.fire = next;
}

export function queueVirtualDash(): void {
  state.dashQueued = true;
}

export function setVirtualInteract(next: boolean): void {
  state.interact = next;
}

export function queueVirtualPause(): void {
  state.pauseQueued = true;
}

export function consumeVirtualControls(): Omit<VirtualControlState, "enabled"> {
  const snapshot = {
    move: state.move,
    aim: state.aim,
    fire: state.fire,
    dashQueued: state.dashQueued,
    interact: state.interact,
    pauseQueued: state.pauseQueued
  };
  state.dashQueued = false;
  state.pauseQueued = false;
  return snapshot;
}

/** 渲染用：读取当前虚拟瞄准，不消费队列（与 {@link consumeVirtualControls} 成对使用）。 */
export function peekVirtualAimState(): Pick<VirtualControlState, "aim" | "fire"> {
  return { aim: { ...state.aim }, fire: state.fire };
}
