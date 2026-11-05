// Stage runtime files into android-app/www (Capacitor webDir). Shared logic: ../app-common/stage-www.mjs. Android adds sw.js (bundled-first, remote second).
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stageWww } from "../app-common/stage-www.mjs";
const here = dirname(fileURLToPath(import.meta.url));
const boot = `<script>if("serviceWorker"in navigator){navigator.serviceWorker.register("/sw.js",{scope:"/"}).then(function(){return navigator.serviceWorker.ready}).then(function(){if(!navigator.serviceWorker.controller&&!sessionStorage.getItem("sw-reload")){sessionStorage.setItem("sw-reload","1");location.reload()}}).catch(function(){})}</script>`;
stageWww(here, { head: boot, sw: join(here, "sw.js") });
