use anyhow::{anyhow, Result};
use serde::Serialize;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::{Duration, Instant};
use tokio::process::{Child, Command};

use crate::adb;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const BOOT_TIMEOUT: Duration = Duration::from_secs(180);
const POLL_INTERVAL: Duration = Duration::from_millis(500);

#[derive(Debug, Clone, Serialize)]
pub struct Avd {
    pub name: String,
    pub running_serial: Option<String>,
}

/// Stages a caller can surface while an AVD boots — cold start runs well past a minute.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BootStage {
    Spawned,
    Online,
    Booted,
}

fn emulator_binary_name() -> &'static str {
    if cfg!(windows) { "emulator.exe" } else { "emulator" }
}

fn emulator_path() -> PathBuf {
    adb::sdk_tool_path("emulator", emulator_binary_name())
        .unwrap_or_else(|| PathBuf::from(emulator_binary_name()))
}

fn emulator_command() -> Command {
    let mut cmd = Command::new(emulator_path());
    #[cfg(windows)]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}

pub async fn list_avds() -> Result<Vec<Avd>> {
    let output = emulator_command()
        .arg("-list-avds")
        .output()
        .await
        .map_err(|e| anyhow!("Failed to run emulator: {}", e))?;

    let names = parse_avd_list(&String::from_utf8_lossy(&output.stdout));
    let running = running_emulators().await;

    Ok(names
        .into_iter()
        .map(|name| {
            let running_serial = running
                .iter()
                .find(|(_, avd)| avd.as_deref() == Some(name.as_str()))
                .map(|(serial, _)| serial.clone());
            Avd { name, running_serial }
        })
        .collect())
}

async fn running_emulators() -> Vec<(String, Option<String>)> {
    let devices = match adb::list_devices().await {
        Ok(devices) => devices,
        Err(_) => return Vec::new(),
    };
    devices
        .into_iter()
        .filter(|d| d.serial.starts_with(adb::EMULATOR_SERIAL_PREFIX))
        .map(|d| (d.serial, d.avd_name))
        .collect()
}

async fn booted(serial: &str) -> bool {
    adb::getprop(serial, "sys.boot_completed")
        .await
        .map(|value| value.trim() == "1")
        .unwrap_or(false)
}

/// Boots the AVD and resolves once Android itself is up: a serial showing in `adb devices` only
/// means the console answers, the system is still seconds-to-minutes away from usable.
///
/// Hands back the child next to the serial. The `emulator` binary execs into qemu, so the handle
/// tracks the instance for its whole life — a serial alone would not: once an instance dies,
/// `emulator-5554` is handed to whatever boots next, and killing "our" serial would kill a stranger.
pub async fn start_avd<F>(name: &str, headless: bool, mut on_stage: F) -> Result<(String, Child)>
where
    F: FnMut(BootStage),
{
    if running_emulators()
        .await
        .into_iter()
        .any(|(_, avd)| avd.as_deref() == Some(name))
    {
        return Err(anyhow!("{} is already running", name));
    }

    let known_before: Vec<String> = running_emulators().await.into_iter().map(|(s, _)| s).collect();

    let mut cmd = emulator_command();
    cmd.args(["-avd", name, "-gpu", "auto", "-no-boot-anim"]);
    if headless {
        cmd.arg("-no-window");
    }
    let mut child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| anyhow!("Failed to launch emulator: {}", e))?;
    on_stage(BootStage::Spawned);

    let deadline = Instant::now() + BOOT_TIMEOUT;
    let mut serial: Option<String> = None;

    while Instant::now() < deadline {
        if let Ok(Some(status)) = child.try_wait() {
            return Err(anyhow!("Emulator exited before booting ({})", status));
        }

        if serial.is_none() {
            serial = running_emulators()
                .await
                .into_iter()
                .find(|(s, avd)| !known_before.contains(s) && avd.as_deref() == Some(name))
                .map(|(s, _)| s);
            if serial.is_some() {
                on_stage(BootStage::Online);
            }
        }

        if let Some(serial) = serial.as_deref() {
            if booted(serial).await {
                on_stage(BootStage::Booted);
                return Ok((serial.to_string(), child));
            }
        }

        tokio::time::sleep(POLL_INTERVAL).await;
    }

    let _ = child.kill().await;
    Err(anyhow!("{} did not finish booting within {}s", name, BOOT_TIMEOUT.as_secs()))
}

/// Shuts an instance down only while the process we started still owns the serial — a dead handle
/// means the serial was recycled and belongs to someone else's emulator now.
pub async fn stop_owned(serial: &str, child: &mut Child) -> Result<()> {
    match child.try_wait() {
        Ok(Some(_)) => Ok(()),
        _ => {
            adb::emu_kill(serial).await?;
            let _ = child.wait().await;
            Ok(())
        }
    }
}

/// `emulator -list-avds` writes its own diagnostics into stdout next to the names —
/// a crashdata banner on every run, HAXM/GPU warnings on some machines.
pub fn parse_avd_list(stdout: &str) -> Vec<String> {
    stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.contains('|'))
        .filter(|line| {
            line.chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
        })
        .map(str::to_string)
        .collect()
}

/// `adb emu avd name` answers with the name and a trailing `OK`, or a bare `KO: reason`.
pub fn parse_avd_name(stdout: &str) -> Option<String> {
    stdout
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && *line != "OK" && !line.starts_with("KO"))
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn avd_list_drops_the_crashdata_banner() {
        let out = "INFO    | Storing crashdata in: /tmp/android-u/emu-crash.db, detection is enabled for process: 26860\nPixel_6_API_33\nreversing\n";
        assert_eq!(parse_avd_list(out), vec!["Pixel_6_API_33", "reversing"]);
    }

    #[test]
    fn avd_list_keeps_names_with_dots_and_dashes() {
        let out = "Nexus_5X_API_29\nmy-avd.test_1\n";
        assert_eq!(parse_avd_list(out), vec!["Nexus_5X_API_29", "my-avd.test_1"]);
    }

    #[test]
    fn avd_list_ignores_warnings_and_blank_lines() {
        let out = "WARNING | no HAXM\n\nPixel_6_API_33\n\nERROR   | broken\n";
        assert_eq!(parse_avd_list(out), vec!["Pixel_6_API_33"]);
    }

    #[test]
    fn avd_list_is_empty_when_nothing_is_installed() {
        assert!(parse_avd_list("INFO    | banner only\n").is_empty());
    }

    #[test]
    fn avd_name_takes_the_line_before_ok() {
        assert_eq!(parse_avd_name("Pixel_6_API_33\nOK\n"), Some("Pixel_6_API_33".to_string()));
    }

    #[test]
    fn avd_name_is_none_when_the_console_refuses() {
        assert_eq!(parse_avd_name("KO: unknown command\n"), None);
    }

    #[test]
    fn avd_name_is_none_on_empty_output() {
        assert_eq!(parse_avd_name(""), None);
    }
}
