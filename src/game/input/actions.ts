export type InputAction = "move" | "aim" | "fire" | "dash" | "interact" | "pause";

export type ActionVector = {
  x: number;
  y: number;
};

export type InputSnapshot = {
  move: ActionVector;
  aim: ActionVector;
  fire: boolean;
  dash: boolean;
  interact: boolean;
  pause: boolean;
};

export function createEmptyInput(): InputSnapshot {
  return {
    move: { x: 0, y: 0 },
    aim: { x: 1, y: 0 },
    fire: false,
    dash: false,
    interact: false,
    pause: false
  };
}
