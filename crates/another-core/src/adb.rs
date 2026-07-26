use anyhow::{anyhow, Result};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tokio::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

static RESOURCE_DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn set_resource_dir(path: PathBuf) {
    let _ = RESOURCE_DIR.set(path);
}

#[derive(Debug, Clone, Serialize)]
pub struct Device {
    pub serial: String,
    pub model: String,
    pub state: String,
    pub avd_name: Option<String>,
}

pub const EMULATOR_SERIAL_PREFIX: &str = "emulator-";

fn adb_binary_name() -> &'static str {
    if cfg!(windows) { "adb.exe" } else { "adb" }
}

/// Walks the same SDK layouts for every tool directory: `platform-tools` holds adb, `emulator` holds the emulator.
pub fn sdk_tool_path(subdir: &str, binary: &str) -> Option<PathBuf> {
    if let Ok(home) = std::env::var("HOME") {
        let candidate = PathBuf::from(&home).join("Library/Android/sdk").join(subdir).join(binary);
        if candidate.exists() {
            return Some(candidate);
        }
    }
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let candidate = PathBuf::from(&local_app_data).join("Android/Sdk").join(subdir).join(binary);
        if candidate.exists() {
            return Some(candidate);
        }
    }
    if let Ok(android_home) = std::env::var("ANDROID_HOME") {
        let candidate = PathBuf::from(&android_home).join(subdir).join(binary);
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

fn adb_path() -> PathBuf {
    let binary = adb_binary_name();

    if let Some(sdk_adb) = sdk_tool_path("platform-tools", binary) {
        return sdk_adb;
    }
    if let Some(dir) = RESOURCE_DIR.get() {
        let bundled = dir.join("resources").join(binary);
        if bundled.exists() {
            return bundled;
        }
    }
    PathBuf::from(binary)
}

fn adb_command() -> Command {
    let mut cmd = Command::new(adb_path());
    #[cfg(windows)]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}

async fn run_adb(args: &[&str]) -> Result<Vec<u8>> {
    let output = adb_command()
        .args(args)
        .output()
        .await
        .map_err(|e| anyhow!("Failed to run adb: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!("adb {} failed: {}", args.join(" "), stderr));
    }
    Ok(output.stdout)
}

async fn run_adb_text(args: &[&str]) -> Result<String> {
    let stdout = run_adb(args).await?;
    Ok(String::from_utf8_lossy(&stdout).to_string())
}

/// An emulator keeps its AVD for as long as the serial lives, and `list_devices` runs every few
/// seconds — without this cache each tick would spawn one `adb emu avd name` process per emulator.
static AVD_NAMES: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn avd_cache() -> &'static Mutex<HashMap<String, String>> {
    AVD_NAMES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cached_avd_name(serial: &str) -> Option<String> {
    avd_cache().lock().ok()?.get(serial).cloned()
}

fn forget_absent_emulators(live: &[String]) {
    if let Ok(mut cache) = avd_cache().lock() {
        cache.retain(|serial, _| live.iter().any(|s| s == serial));
    }
}

/// The emulator console answers `<name>\nOK`; querying it is the only reliable serial → AVD link,
/// since port order says nothing about which AVD booted first.
pub async fn avd_for_serial(serial: &str) -> Option<String> {
    if let Some(name) = cached_avd_name(serial) {
        return Some(name);
    }
    let output = run_adb_text(&["-s", serial, "emu", "avd", "name"]).await.ok()?;
    let name = crate::emulator::parse_avd_name(&output)?;
    if let Ok(mut cache) = avd_cache().lock() {
        cache.insert(serial.to_string(), name.clone());
    }
    Some(name)
}

pub async fn list_devices() -> Result<Vec<Device>> {
    let output = run_adb_text(&["devices", "-l"]).await?;
    let mut devices = Vec::new();

    for line in output.lines().skip(1) {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 2 {
            continue;
        }
        let serial = parts[0].to_string();
        let state = parts[1].to_string();
        let model = parts
            .iter()
            .find(|p| p.starts_with("model:"))
            .map(|p| p.trim_start_matches("model:").to_string())
            .unwrap_or_else(|| serial.clone());

        devices.push(Device {
            serial,
            model,
            state,
            avd_name: None,
        });
    }

    forget_absent_emulators(&devices.iter().map(|d| d.serial.clone()).collect::<Vec<_>>());

    for device in devices.iter_mut() {
        if device.serial.starts_with(EMULATOR_SERIAL_PREFIX) && device.state == "device" {
            device.avd_name = avd_for_serial(&device.serial).await;
        }
    }

    Ok(devices)
}

pub async fn getprop(serial: &str, prop: &str) -> Result<String> {
    run_adb_text(&["-s", serial, "shell", "getprop", prop]).await
}

/// Emulator console shutdown — the graceful counterpart to killing the qemu process.
pub async fn emu_kill(serial: &str) -> Result<()> {
    run_adb(&["-s", serial, "emu", "kill"]).await?;
    if let Ok(mut cache) = avd_cache().lock() {
        cache.remove(serial);
    }
    Ok(())
}

pub async fn push_file(serial: &str, local: &str, remote: &str) -> Result<()> {
    run_adb(&["-s", serial, "push", local, remote]).await?;
    Ok(())
}

pub async fn forward_port(serial: &str, local_port: u16, remote: &str) -> Result<()> {
    run_adb(&[
        "-s",
        serial,
        "forward",
        &format!("tcp:{}", local_port),
        remote,
    ])
    .await?;
    Ok(())
}

pub async fn remove_forward(serial: &str, local_port: u16) -> Result<()> {
    let _ = run_adb(&[
        "-s",
        serial,
        "forward",
        "--remove",
        &format!("tcp:{}", local_port),
    ])
    .await;
    Ok(())
}

pub async fn shell(serial: &str, cmd: &str) -> Result<tokio::process::Child> {
    let child = adb_command()
        .args(["-s", serial, "shell", cmd])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| anyhow!("Failed to spawn adb shell: {}", e))?;
    Ok(child)
}

pub async fn reverse(serial: &str, remote: &str, local_port: u16) -> Result<()> {
    run_adb(&[
        "-s",
        serial,
        "reverse",
        remote,
        &format!("tcp:{}", local_port),
    ])
    .await?;
    Ok(())
}

pub async fn remove_reverse(serial: &str, remote: &str) -> Result<()> {
    let _ = run_adb(&["-s", serial, "reverse", "--remove", remote]).await;
    Ok(())
}

pub async fn kill_scrcpy_server(serial: &str) {
    let _ = run_adb(&[
        "-s",
        serial,
        "shell",
        "pkill -f com.genymobile.scrcpy.Server",
    ])
    .await;
    tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
}

pub async fn exec_out_screencap(serial: &str) -> Result<Vec<u8>> {
    run_adb(&["-s", serial, "exec-out", "screencap", "-p"]).await
}

pub async fn dump_ui_hierarchy(serial: &str) -> Result<String> {
    let output =
        run_adb_text(&["-s", serial, "exec-out", "uiautomator", "dump", "/dev/tty"]).await?;

    if let Some(end) = output.rfind("</hierarchy>") {
        let xml = &output[..end + "</hierarchy>".len()];
        if let Some(start) = xml.find('<') {
            return Ok(xml[start..].to_string());
        }
    }

    Err(anyhow!("Failed to parse UI hierarchy output"))
}

pub async fn kill_server() {
    let mut cmd = Command::new(adb_path());
    cmd.args(["kill-server"]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let _ = cmd.output().await;
}

pub async fn connect_device(address: &str) -> Result<()> {
    let output = run_adb_text(&["connect", address]).await?;
    if output.contains("connected") || output.contains("already connected") {
        Ok(())
    } else {
        Err(anyhow!("Failed to connect: {}", output.trim()))
    }
}

pub async fn tcpip(serial: &str, port: u16) -> Result<()> {
    run_adb(&["-s", serial, "tcpip", &port.to_string()]).await?;
    Ok(())
}

pub async fn disconnect_device(address: &str) -> Result<()> {
    run_adb(&["disconnect", address]).await?;
    Ok(())
}

pub async fn get_device_ip(serial: &str) -> Result<Option<String>> {
    if let Ok(output) = run_adb_text(&["-s", serial, "shell", "ip", "route"]).await {
        for line in output.lines() {
            if line.contains("wlan") {
                if let Some(idx) = line.find("src ") {
                    if let Some(ip) = line[idx + 4..].split_whitespace().next() {
                        return Ok(Some(ip.to_string()));
                    }
                }
            }
        }
    }

    if let Ok(output) = run_adb_text(&[
        "-s", serial, "shell", "ip", "-f", "inet", "addr", "show", "wlan0",
    ])
    .await
    {
        for line in output.lines() {
            let trimmed = line.trim();
            if let Some(rest) = trimmed.strip_prefix("inet ") {
                if let Some(ip) = rest.split('/').next() {
                    return Ok(Some(ip.to_string()));
                }
            }
        }
    }

    Ok(None)
}
