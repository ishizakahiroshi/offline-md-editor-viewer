fn main() {
    // WACK の DPIAwarenessValidation 対応（plan_ms-store-submission.md C3）。
    // Tauri の既定マニフェストには dpiAware/dpiAwareness が無く高 DPI 非対応と判定されるため、
    // Common Controls v6 依存を保持したまま dpiAwareness=PerMonitorV2 を追加した完全なマニフェストに差し替える。
    let windows = tauri_build::WindowsAttributes::new()
        .app_manifest(include_str!("windows-app-manifest.xml"));
    let attrs = tauri_build::Attributes::new().windows_attributes(windows);
    tauri_build::try_build(attrs).expect("failed to run build script");
}
