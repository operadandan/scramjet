// Assembles the single-file Worker: the server code plus the game client embedded as a template string.
// The client is src/client/index.html (page, styles, menus) with every file in src/client/js/ pasted into its one module
// script, in file-name order. They share one scope, so the numbering is the load order.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
const dir = "src/client/js/";
const js = readdirSync(dir).filter(f => f.endsWith(".js")).sort().map(f => readFileSync(dir + f, "utf8").replace(/\n$/, "")).join("\n");
const html = readFileSync("src/client/index.html", "utf8").replace("/*@SCRIPTS@*/\n", () => js + "\n");
const esc = html.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
mkdirSync("dist", { recursive: true });
writeFileSync("dist/client.html", html);
writeFileSync("dist/worker.js", readFileSync("src/server.js", "utf8") + "\nconst HTML = `" + esc + "`;\n");
console.log("built dist/worker.js (" + Math.round(html.length / 1024) + " KB client, " + readdirSync(dir).length + " scripts)");
