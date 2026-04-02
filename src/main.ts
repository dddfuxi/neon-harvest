import "./styles.css";
import { inject } from "@vercel/analytics";

import { createAppShell } from "./ui/appShell";

inject();
createAppShell(document.getElementById("app")!);
