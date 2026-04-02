import type Phaser from "phaser";
import { weaponDefinitions } from "../../game/content/weapons";

export function createGeneratedTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists("fx/vision-mask")) {
    const spotlight = scene.textures.createCanvas("fx/vision-mask", 512, 512);
    if (spotlight) {
      const context = spotlight.context;
      const gradient = context.createRadialGradient(256, 256, 24, 256, 256, 256);
      gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
      gradient.addColorStop(0.42, "rgba(255, 255, 255, 0.92)");
      gradient.addColorStop(0.72, "rgba(255, 255, 255, 0.42)");
      gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
      context.clearRect(0, 0, 512, 512);
      context.fillStyle = gradient;
      context.fillRect(0, 0, 512, 512);
      spotlight.refresh();
    }
  }

  const graphics = scene.add.graphics();

  for (const weapon of Object.values(weaponDefinitions)) {
    graphics.fillStyle(weapon.color, 1);
    graphics.fillCircle(16, 16, 12);
    graphics.lineStyle(2, 0xffffff, 0.95);
    graphics.strokeCircle(16, 16, 12);
    graphics.generateTexture(`player/hull-${weapon.id}`, 32, 32);
    graphics.clear();
  }

  graphics.fillStyle(0xff728f, 1);
  graphics.fillCircle(12, 12, 10);
  graphics.generateTexture("enemy/drone", 24, 24);
  graphics.clear();

  graphics.fillStyle(0xb482ff, 1);
  graphics.fillRect(2, 2, 24, 24);
  graphics.generateTexture("enemy/sniper", 28, 28);
  graphics.clear();

  graphics.fillStyle(0xff9c47, 1);
  graphics.fillRoundedRect(2, 2, 34, 34, 8);
  graphics.generateTexture("enemy/brute", 38, 38);
  graphics.clear();

  graphics.fillStyle(0xff445f, 1);
  graphics.fillCircle(28, 28, 24);
  graphics.lineStyle(4, 0xffd3db, 0.95);
  graphics.strokeCircle(28, 28, 24);
  graphics.lineStyle(3, 0x65131f, 0.75);
  graphics.strokeCircle(28, 28, 14);
  graphics.generateTexture("enemy/boss", 56, 56);
  graphics.clear();

  graphics.fillStyle(0x6cf3ff, 1);
  graphics.fillRect(0, 0, 16, 5);
  graphics.generateTexture("weapon/pulse", 16, 5);
  graphics.clear();

  graphics.fillStyle(0xd4ff63, 1);
  graphics.fillRect(0, 0, 14, 6);
  graphics.generateTexture("weapon/arc", 14, 6);
  graphics.clear();

  graphics.fillStyle(0xffc46b, 1);
  graphics.fillRect(0, 0, 20, 6);
  graphics.generateTexture("weapon/lance", 20, 6);
  graphics.clear();

  graphics.fillStyle(0xd4ff63, 1);
  graphics.fillCircle(8, 8, 5);
  graphics.lineStyle(1, 0xffffff, 0.9);
  graphics.strokeCircle(8, 8, 5);
  graphics.generateTexture("fx/shard", 16, 16);
  graphics.clear();

  graphics.lineStyle(4, 0x6cf3ff, 0.95);
  graphics.strokeCircle(48, 48, 40);
  graphics.generateTexture("fx/extraction", 96, 96);
  graphics.clear();

  graphics.fillStyle(0x07111f, 1);
  graphics.fillRect(0, 0, 128, 128);
  graphics.lineStyle(1, 0x0b1730, 0.85);
  for (let x = 0; x <= 128; x += 32) {
    graphics.lineBetween(x, 0, x, 128);
  }
  for (let y = 0; y <= 128; y += 32) {
    graphics.lineBetween(0, y, 128, y);
  }
  graphics.fillStyle(0x6cf3ff, 0.06);
  graphics.fillCircle(16, 16, 2);
  graphics.fillCircle(96, 40, 2);
  graphics.fillCircle(54, 92, 1.5);
  graphics.generateTexture("bg/grid-tile", 128, 128);
  graphics.destroy();

  const themeGraphics = scene.add.graphics();

  themeGraphics.fillStyle(0x091525, 0.0);
  themeGraphics.fillRect(0, 0, 128, 128);
  themeGraphics.fillStyle(0x6cf3ff, 0.08);
  themeGraphics.fillCircle(20, 26, 4);
  themeGraphics.fillCircle(84, 56, 3);
  themeGraphics.fillCircle(50, 98, 2);
  themeGraphics.lineStyle(1, 0x6cf3ff, 0.08);
  themeGraphics.strokeCircle(92, 30, 14);
  themeGraphics.generateTexture("bg/theme-skirmish", 128, 128);
  themeGraphics.clear();

  themeGraphics.fillStyle(0x0b1224, 0.0);
  themeGraphics.fillRect(0, 0, 128, 128);
  themeGraphics.lineStyle(2, 0x7f9dff, 0.09);
  themeGraphics.lineBetween(0, 18, 128, 44);
  themeGraphics.lineBetween(0, 66, 128, 92);
  themeGraphics.lineBetween(0, 114, 96, 128);
  themeGraphics.fillStyle(0xb482ff, 0.05);
  themeGraphics.fillRect(40, 12, 12, 12);
  themeGraphics.fillRect(92, 72, 14, 14);
  themeGraphics.generateTexture("bg/theme-crossfire", 128, 128);
  themeGraphics.clear();

  themeGraphics.fillStyle(0x150d08, 0.0);
  themeGraphics.fillRect(0, 0, 128, 128);
  themeGraphics.lineStyle(2, 0xff9c47, 0.08);
  themeGraphics.strokeCircle(30, 30, 20);
  themeGraphics.strokeCircle(94, 82, 16);
  themeGraphics.strokeCircle(70, 118, 10);
  themeGraphics.fillStyle(0xffc46b, 0.04);
  themeGraphics.fillCircle(28, 30, 6);
  themeGraphics.fillCircle(92, 80, 5);
  themeGraphics.generateTexture("bg/theme-siege", 128, 128);
  themeGraphics.destroy();
}
