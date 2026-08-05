import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const ENGINES_DIR = path.join(REPO_ROOT, "math-lab/engines");
const OUT_FILE = path.join(
  __dirname,
  "../excalidraw-app/syntropy/manifest.generated.json",
);

const ENGINE_IDS = [
  "calculus",
  "complex",
  "linear-algebra",
  "number-theory",
  "numerical",
  "ode",
  "statistics",
];

const ENGINE_NAMES = {
  calculus: "Calculus",
  complex: "Complex Analysis",
  "linear-algebra": "Linear Algebra",
  "number-theory": "Number Theory",
  numerical: "Numerical",
  ode: "ODE / PDE",
  statistics: "Statistics",
};

const decodeEntities = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractAccent = (indexHtml) => {
  const m = indexHtml.match(/--electric-teal:\s*(#[0-9a-fA-F]{6})/);
  if (!m) {
    throw new Error("no --electric-teal override found");
  }
  return m[1];
};

// The 6 "flat" engines list every method as its own card directly on
// methods.html: <a href="methods/<id>.html" class="card engine-card ...">
// ... <h3 class="h3">Name</h3>.
const extractFlatMethods = (methodsHtml) => {
  const methods = [];
  const linkRe =
    /href="methods\/([a-z0-9-]+)\.html"[^>]*class="card engine-card/g;
  let match;
  while ((match = linkRe.exec(methodsHtml))) {
    const methodId = match[1];
    const afterLink = methodsHtml.slice(match.index);
    const h3 = afterLink.match(
      /<h3 class="h3">([^<]+(?:<[^/][^<]*<\/[^>]+>[^<]*)*)<\/h3>/,
    );
    if (!h3) {
      continue;
    }
    const name = decodeEntities(h3[1].replace(/<[^>]+>/g, ""));
    methods.push({ methodId, name });
  }
  return methods;
};

// calculus alone groups methods into 5 category pages (methods.html links to
// methods/category-*.html as "method-tile" anchors carrying the category's display name, and
// each of those pages lists its methods as data-title/data-href "ring-card" tiles) instead of
// one flat method list. That grouping is kept on the method records — 26 flat calculus entries
// overflow the library panel, and the sub-grouping is what makes the list navigable.
const extractCalculusMethods = (methodsHtml, engineDir) => {
  const categoryRe =
    /href="methods\/(category-[a-z0-9-]+)\.html"[\s\S]*?<span class="eyebrow">([^<]+)<\/span>/g;
  const categories = [];
  let catMatch;
  while ((catMatch = categoryRe.exec(methodsHtml))) {
    categories.push({
      categoryId: catMatch[1].replace(/^category-/, ""),
      categoryName: decodeEntities(catMatch[2]),
      pageId: catMatch[1],
    });
  }

  const methods = [];
  for (const { categoryId, categoryName, pageId } of categories) {
    const categoryHtml = readFileSync(
      path.join(engineDir, "methods", `${pageId}.html`),
      "utf-8",
    );
    const cardRe =
      /data-title="([^"]+)"[\s\S]*?data-href="([a-z0-9-]+)\.html"/g;
    let cardMatch;
    while ((cardMatch = cardRe.exec(categoryHtml))) {
      const name = decodeEntities(cardMatch[1]);
      const methodId = cardMatch[2];
      methods.push({ methodId, name, categoryId, categoryName });
    }
  }
  return methods;
};

const manifest = ENGINE_IDS.map((engineId) => {
  const engineDir = path.join(ENGINES_DIR, engineId);
  const indexHtml = readFileSync(path.join(engineDir, "index.html"), "utf-8");
  const methodsHtml = readFileSync(
    path.join(engineDir, "methods.html"),
    "utf-8",
  );
  const methods =
    engineId === "calculus"
      ? extractCalculusMethods(methodsHtml, engineDir)
      : extractFlatMethods(methodsHtml);
  return {
    engineId,
    engineName: ENGINE_NAMES[engineId],
    accent: extractAccent(indexHtml),
    methods,
  };
});

writeFileSync(OUT_FILE, JSON.stringify(manifest, null, 2) + "\n");
console.log(
  `Wrote ${manifest.length} engines, ${manifest.reduce(
    (n, e) => n + e.methods.length,
    0,
  )} methods to ${path.relative(REPO_ROOT, OUT_FILE)}`,
);
