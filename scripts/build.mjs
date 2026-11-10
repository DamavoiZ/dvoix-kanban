// Bundles src/ into the three files a dvoix release needs and puts them into
// dist/: main.js (one ES module without imports), manifest.json, styles.css.
// Also checks that package.json and manifest.json carry the same version, so
// a release tag can never point at the wrong code.
import { build } from "esbuild";
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const pkg = JSON.parse(await readFile("package.json", "utf8"));
if (manifest.version !== pkg.version) {
  console.error(`Version mismatch: manifest.json has ${manifest.version}, package.json has ${pkg.version}`);
  process.exit(1);
}

await rm("dist", { recursive: true, force: true });
await mkdir("dist");
await build({
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "esm",
  target: "es2022",
  outfile: "dist/main.js",
  legalComments: "none",
  banner: { js: `// dvoix Kanban ${manifest.version}, built from https://github.com/dvoi-dev/dvoix-kanban` },
});
await copyFile("manifest.json", "dist/manifest.json");
await copyFile("styles.css", "dist/styles.css");
console.log(`Built dist/ for version ${manifest.version}`);
