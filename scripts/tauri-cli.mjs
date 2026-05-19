// Drop-in wrapper for the `tauri` CLI invoked by `npm run tauri ...`.
//
// For `tauri dev` only, sets TAURI_CONFIG to null out
// `bundle.resources`. tauri-build otherwise re-copies
// WinDivert.dll/WinDivert64.sys into target/<profile>/ on every build,
// which fails with ERROR_SHARING_VIOLATION whenever the WinDivert
// kernel driver is still loaded from a prior dev session. build.rs
// places those files for dev itself (with skip-if-locked semantics);
// installer builds run unmodified so NSIS still bundles them.

import { spawn } from "node:child_process";

const args = process.argv.slice(2);

if (args[0] === "dev") {
  process.env.TAURI_CONFIG = JSON.stringify({ bundle: { resources: null } });
}

const tauri = spawn("tauri", args, { stdio: "inherit", shell: true });
tauri.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
