// Stage runtime files into ios-app/www (Capacitor webDir). Shared logic: ../app-common/stage-www.mjs. iOS inlines remote-shim.js instead of a service worker.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stageWww } from "../app-common/stage-www.mjs";
const here = dirname(fileURLToPath(import.meta.url));
const shim = "<script>" + readFileSync(join(here, "remote-shim.js"), "utf8") + "</script>";
stageWww(here, { head: shim });
