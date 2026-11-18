// Adds import/export blocks to every client file so static tools (Graphify) can see cross-file links.
// Usage: npm run links  (run after adding or moving cross-file calls; build.mjs strips the blocks)
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import * as acorn from "acorn";
import * as walk from "acorn-walk";

const dir = process.argv[2] || "src/client/js/";
const TOP = "// ---- module links: for code tools only, build.mjs strips this block (all files share one scope at runtime) ----";
const TOP_END = "// ---- end module links ----";
const BOT = "// ---- module exports: build.mjs strips this block ----";
const BOT_END = "// ---- end module exports ----";
const strip = s => s
  .replace(new RegExp("\\n?" + esc(TOP) + "[\\s\\S]*?" + esc(TOP_END) + "\\n?", "g"), "\n")
  .replace(new RegExp("\\n?" + esc(BOT) + "[\\s\\S]*?" + esc(BOT_END) + "\\n?", "g"), "\n");
function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

const files = readdirSync(dir).filter(f => f.endsWith(".js")).sort();
const src = {}, defs = new Map(), ext = new Map(), refs = {};
for (const f of files) {
  src[f] = strip(readFileSync(dir + f, "utf8")).replace(/^\n+/, "").replace(/\n+$/, "\n");
  const ast = acorn.parse(src[f], { ecmaVersion: "latest", sourceType: "module" });
  const add = (n) => { if (defs.has(n) && defs.get(n) !== f) throw new Error("dup " + n); defs.set(n, f); };
  const pat = (p) => {
    if (!p) return;
    if (p.type === "Identifier") add(p.name);
    else if (p.type === "ObjectPattern") p.properties.forEach(q => pat(q.type === "RestElement" ? q.argument : q.value));
    else if (p.type === "ArrayPattern") p.elements.forEach(pat);
    else if (p.type === "AssignmentPattern") pat(p.left);
    else if (p.type === "RestElement") pat(p.argument);
  };
  for (const st of ast.body) {
    if (st.type === "FunctionDeclaration" || st.type === "ClassDeclaration") add(st.id.name);
    else if (st.type === "VariableDeclaration") st.declarations.forEach(d => pat(d.id));
    else if (st.type === "ImportDeclaration") st.specifiers.forEach(s => ext.set(s.local.name, { from: st.source.value, s }));
  }
  const r = refs[f] = new Set();
  walk.fullAncestor(ast, (node, _s, anc) => {
    if (node.type !== "Identifier") return;
    const p = anc[anc.length - 2];
    if (p) {
      if (p.type === "MemberExpression" && p.property === node && !p.computed) return;
      if ((p.type === "Property" || p.type === "MethodDefinition" || p.type === "PropertyDefinition") && p.key === node && !p.computed && !p.shorthand) return;
      if ((p.type === "LabeledStatement" || p.type === "BreakStatement" || p.type === "ContinueStatement") && p.label === node) return;
      if (p.type === "ImportSpecifier" || p.type === "ImportNamespaceSpecifier" || p.type === "ImportDefaultSpecifier") return;
    }
    r.add(node.name);
  });
}

const exportsOf = Object.fromEntries(files.map(f => [f, new Set()]));
const out = {};
for (const g of files) {
  const byFile = new Map(), byExt = new Map();
  for (const n of refs[g]) {
    const f = defs.get(n);
    if (f && f !== g) { if (!byFile.has(f)) byFile.set(f, []); byFile.get(f).push(n); exportsOf[f].add(n); }
    else if (!f && ext.has(n) && !src[g].includes("from '" + ext.get(n).from + "'")) {
      const e = ext.get(n); if (!byExt.has(e.from)) byExt.set(e.from, []); byExt.get(e.from).push(e.s);
    }
  }
  const lines = [];
  for (const [from, ss] of byExt) {
    const ns = ss.find(s => s.type === "ImportNamespaceSpecifier");
    if (ns) lines.push(`import * as ${ns.local.name} from '${from}';`);
    const named = ss.filter(s => s.type === "ImportSpecifier").map(s => s.local.name).sort();
    if (named.length) lines.push(`import { ${named.join(", ")} } from '${from}';`);
  }
  for (const [f, ns] of [...byFile].sort((a, b) => a[0] < b[0] ? -1 : 1)) lines.push(`import { ${ns.sort().join(", ")} } from './${f}';`);
  out[g] = lines;
}
let nImp = 0, nExp = 0;
for (const f of files) {
  let s = src[f];
  if (out[f].length) {
    const block = TOP + "\n" + out[f].join("\n") + "\n" + TOP_END + "\n";
    const m = s.match(/^(?:import [^\n]*\n)+/);
    s = m ? m[0] + block + s.slice(m[0].length) : block + s;
    nImp += out[f].length;
  }
  const ex = [...exportsOf[f]].sort();
  if (ex.length) { s += "\n" + BOT + "\nexport { " + ex.join(", ") + " };\n" + BOT_END + "\n"; nExp += ex.length; }
  writeFileSync(dir + f, s);
}
console.log(files.length, "files,", nImp, "import lines,", nExp, "exported names");
