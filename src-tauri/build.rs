use std::env;
use std::path::PathBuf;

fn main() {
    // Tell rustc where to find WinDivert.lib (bundled in resources/x64/).
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let lib_dir = manifest_dir.join("resources").join("x64");
    println!("cargo:rustc-link-search=native={}", lib_dir.display());
    println!("cargo:rustc-link-lib=dylib=WinDivert");
    // Rerun if the resources change.
    println!("cargo:rerun-if-changed={}", lib_dir.join("WinDivert.lib").display());

    tauri_build::build()
}
