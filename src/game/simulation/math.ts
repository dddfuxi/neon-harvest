import type { Vec2 } from "./types";

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function length(vec: Vec2): number {
  return Math.hypot(vec.x, vec.y);
}

export function normalize(vec: Vec2): Vec2 {
  const len = length(vec);
  if (len <= 0.0001) {
    return { x: 0, y: 0 };
  }

  return { x: vec.x / len, y: vec.y / len };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subtract(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(vec: Vec2, amount: number): Vec2 {
  return { x: vec.x * amount, y: vec.y * amount };
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function fromAngle(angle: number): Vec2 {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

export function clampPosition(position: Vec2, width: number, height: number, radius: number): Vec2 {
  return {
    x: clamp(position.x, radius, width - radius),
    y: clamp(position.y, radius, height - radius)
  };
}
