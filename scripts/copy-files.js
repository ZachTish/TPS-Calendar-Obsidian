import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const buildDir = path.join(rootDir, "build");

// Copy main.js from build to root
const mainJsSrc = path.join(buildDir, "main.js");
const mainJsDest = path.join(rootDir, "main.js");
fs.copyFileSync(mainJsSrc, mainJsDest);
console.log("✓ Copied main.js to root");

// Copy manifest.json from build to root
const manifestSrc = path.join(buildDir, "manifest.json");
const manifestDest = path.join(rootDir, "manifest.json");
fs.copyFileSync(manifestSrc, manifestDest);
console.log("✓ Copied manifest.json to root");

// Copy styles.css from build to root
const stylesSrc = path.join(buildDir, "styles.css");
const stylesDest = path.join(rootDir, "styles.css");
fs.copyFileSync(stylesSrc, stylesDest);
console.log("✓ Copied styles.css to root");

console.log("\n✅ Plugin files copied to root for BRAT compatibility.");
