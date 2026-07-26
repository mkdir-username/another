use crate::audio::AudioHandle;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::net::TcpStream;
use tokio::process::Child;
use tokio::sync::Mutex;

pub struct ScrcpySession {
    pub device_serial: String,
    pub control_socket: Arc<Mutex<TcpStream>>,
    pub screen_width: u32,
    pub screen_height: u32,
    pub shutdown: Arc<tokio::sync::Notify>,
    pub audio: Option<Arc<AudioHandle>>,
}

pub struct AppState {
    pub session: Arc<Mutex<Option<ScrcpySession>>>,
    /// Emulators this app booted, kept as live process handles so a recycled serial can never
    /// make us shut down an emulator somebody else started.
    pub started_emulators: Arc<Mutex<HashMap<String, Child>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            session: Arc::new(Mutex::new(None)),
            started_emulators: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}
