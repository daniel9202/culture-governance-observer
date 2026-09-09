import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const configuredPython = process.env.PYTHON;
let python = configuredPython || (process.platform === "win32" ? "py" : "python3");
let usesWindowsLauncher = !configuredPython && process.platform === "win32";
if (usesWindowsLauncher) {
  const launcher = spawnSync("py", ["-3", "--version"], { stdio: "ignore" });
  if (launcher.error || launcher.status !== 0) {
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    const installed = existsSync(programFiles)
      ? readdirSync(programFiles).filter(name => /^Python\d+$/.test(name)).sort().at(-1)
      : null;
    const installedPython = installed && resolve(programFiles, installed, "python.exe");
    const projectPython = resolve(root, ".tools", "python", "python.exe");
    if (installedPython && existsSync(resolve(programFiles, installed, "Lib", "encodings", "__init__.py"))) {
      python = installedPython;
      usesWindowsLauncher = false;
    } else if (existsSync(projectPython)) {
      python = projectPython;
      usesWindowsLauncher = false;
    }
  }
}
const pythonArgs = configuredPython || !usesWindowsLauncher
  ? ["scripts/build_data.py"]
  : ["-3", "scripts/build_data.py"];
const validation = spawnSync(python, pythonArgs, { cwd: root, stdio: "inherit" });
if (validation.error) throw validation.error;
if (validation.status !== 0) process.exit(validation.status ?? 1);

const dist = resolve(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(resolve(dist, "data"), { recursive: true });

const siteFiles = [
  "index.html", "styles.css", "app.js", "nav.js", "cities.js", "mayors.html",
  "councilors.html", "candidate-list.js", "public-candidates.js", "civic.html",
  "civic.js", "methodology.html", "updates.html", "review.html", "review.js",
  "fulfillment.html", "fulfillment.js", "regions.html",
  "regions.js", "region.html", "region.js",
];
const dataFiles = [
  "candidates.json", "civic_policy_calls.json", "governments.json",
  "local_cultural_issues.json", "pledge_fulfillment.json", "region_metrics.json",
];

for (const file of siteFiles) cpSync(resolve(root, file), resolve(dist, file));
for (const file of dataFiles) cpSync(resolve(root, "data", file), resolve(dist, "data", file));
if (existsSync(resolve(root, "data", "inbox"))) {
  cpSync(resolve(root, "data", "inbox"), resolve(dist, "data", "inbox"), { recursive: true });
}

console.log("site build passed");
