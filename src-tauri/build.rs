use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let lib_dir = manifest_dir.join("resources").join("x64");

    // Linker setup: WinDivert.lib is an import library for WinDivert.dll.
    println!("cargo:rustc-link-search=native={}", lib_dir.display());
    println!("cargo:rustc-link-lib=dylib=WinDivert");
    println!(
        "cargo:rerun-if-changed={}",
        lib_dir.join("WinDivert.lib").display()
    );

    // Runtime: WinDivert.dll and WinDivert64.sys must sit next to the
    // app binary so the kernel driver can be loaded. We copy them
    // ourselves (instead of via `bundle.resources` in tauri.conf.json)
    // because tauri-build's copy is unconditional — once the kernel has
    // WinDivert64.sys open from a previous session, a re-copy fails
    // with ERROR_SHARING_VIOLATION and the whole build dies. The dev
    // npm wrapper passes `TAURI_CONFIG` to null out `bundle.resources`
    // so only this build.rs places the files in dev; installer builds
    // (where no instance is running) still go through tauri-build.
    if let Some(target_dir) = target_dir_from_out_dir() {
        for name in ["WinDivert.dll", "WinDivert64.sys"] {
            let src = lib_dir.join(name);
            let dst = target_dir.join(name);
            println!("cargo:rerun-if-changed={}", src.display());
            place_alongside_binary(&src, &dst);
        }
    }

    let admin_manifest = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency>
    <dependentAssembly>
      <assemblyIdentity
        type="win32"
        name="Microsoft.Windows.Common-Controls"
        version="6.0.0.0"
        processorArchitecture="*"
        publicKeyToken="6595b64144ccf1df"
        language="*"
      />
    </dependentAssembly>
  </dependency>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security>
      <requestedPrivileges>
        <requestedExecutionLevel level="requireAdministrator" uiAccess="false"/>
      </requestedPrivileges>
    </security>
  </trustInfo>
</assembly>"#;

    let windows_attrs = tauri_build::WindowsAttributes::new().app_manifest(admin_manifest);
    let attrs = tauri_build::Attributes::new().windows_attributes(windows_attrs);
    tauri_build::try_build(attrs).expect("tauri build script failed");
}

/// Resolve `<workspace>/target/<profile>/` from `OUT_DIR`.
/// OUT_DIR points at `target/<profile>/build/<pkg-hash>/out`; three
/// `parent()` calls drop the trailing `out/<pkg-hash>/build` segments.
fn target_dir_from_out_dir() -> Option<PathBuf> {
    let out_dir = PathBuf::from(env::var_os("OUT_DIR")?);
    out_dir
        .parent()? // .../build/<pkg-hash>
        .parent()? // .../build
        .parent() // .../<profile>
        .map(Path::to_path_buf)
}

/// Copy `src` to `dst`, but treat ERROR_SHARING_VIOLATION (os error
/// 32) as "already placed by a prior build whose binary is still
/// loaded" and continue. The bytes we'd write are identical to
/// whatever is already there (same vendor binary), so a lock means
/// the file is already correct. A missing destination with a lock
/// is genuinely fatal.
fn place_alongside_binary(src: &Path, dst: &Path) {
    if same_size(src, dst) {
        return;
    }
    match fs::copy(src, dst) {
        Ok(_) => {}
        Err(err) if err.raw_os_error() == Some(32) && dst.exists() => {
            println!(
                "cargo:warning=Could not refresh {} (in use by another process); \
                 keeping existing copy.",
                dst.display()
            );
        }
        Err(err) => panic!("failed to copy {} -> {}: {err}", src.display(), dst.display()),
    }
}

fn same_size(a: &Path, b: &Path) -> bool {
    match (a.metadata(), b.metadata()) {
        (Ok(am), Ok(bm)) => am.len() == bm.len(),
        _ => false,
    }
}
