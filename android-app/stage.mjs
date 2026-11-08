// Stage runtime files into android-app/www (Capacitor webDir). Shared logic: ../app-common/stage-www.mjs.
// Android fetches un-bundled /assets, /static, /media art natively (android/.../RemoteAssets.java, a WebViewClient
// shouldInterceptRequest hook): Capacitor's Android Bridge never runs a service worker, so the old sw.js approach silently 404'd.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stageWww } from "../app-common/stage-www.mjs";
const here = dirname(fileURLToPath(import.meta.url));
stageWww(here);
