import "./styles.css";
import { inject } from "@vercel/analytics";
import { injectSpeedInsights } from "@vercel/speed-insights";

import { createAppShell } from "./ui/appShell";

/** 与浏览器 UI（地址栏等）无关的实际可视区域，修正移动端 100vh 偏大导致的裁切。 */
function applyViewportCssVars(): void {
  const vv = window.visualViewport;
  const h = vv?.height ?? window.innerHeight;
  const w = vv?.width ?? window.innerWidth;
  const root = document.documentElement;
  root.style.setProperty("--vvh", `${h}px`);
  root.style.setProperty("--vvw", `${w}px`);
  root.style.setProperty("--vv-offset-top", vv ? `${vv.offsetTop}px` : "0px");
}

function onVisualViewportChange(): void {
  applyViewportCssVars();
  window.dispatchEvent(new Event("resize"));
}

applyViewportCssVars();
window.addEventListener("resize", applyViewportCssVars);
window.visualViewport?.addEventListener("resize", onVisualViewportChange);
window.visualViewport?.addEventListener("scroll", onVisualViewportChange);

inject();
injectSpeedInsights();
createAppShell(document.getElementById("app")!);
