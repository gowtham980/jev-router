import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const output = resolve(process.argv[2] ?? `jev-router-${version}-release.tgz`);
if (existsSync(output)) throw new Error(`Output already exists: ${output}`);
const temp = mkdtempSync(join(tmpdir(), "jev-router-pack-"));
// Do not ship macOS AppleDouble files that confuse the host API scanner.
const tarOptions = { stdio: "inherit", env: { ...process.env, COPYFILE_DISABLE: "1" } };
try {
  const base = join(temp, "base.tgz");
  const stage = join(temp, "stage");
  mkdirSync(stage);
  execFileSync("openclaw", ["plugins", "pack", "--root", root, "--out", base], { stdio: "inherit" });
  execFileSync("tar", ["-xzf", base, "-C", stage], tarOptions);
  copyFileSync(join(root, "doctor-contract-api.js"), join(stage, "package", "doctor-contract-api.js"));
  execFileSync("openclaw", ["plugins", "validate", "--root", join(stage, "package")], { stdio: "inherit" });
  execFileSync("tar", ["-czf", output, "-C", stage, "package"], tarOptions);
  console.log(output);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
