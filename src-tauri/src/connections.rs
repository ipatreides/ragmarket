// Resolves and caches the owning PID for each observed TCP 4-tuple,
// and holds the currently-selected PID filter.

use crate::capture;
use crate::process;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

#[derive(Serialize, Deserialize, Clone, Hash, PartialEq, Eq, Debug)]
pub struct FourTuple {
    pub client_ip: String,
    pub client_port: u16,
    pub server_ip: String,
    pub server_port: u16,
}

#[derive(Serialize, Clone, Debug)]
pub struct ClientInfo {
    pub pid: Option<u32>,
    pub process_name: Option<String>,
    pub process_creation_unix_ms: Option<u64>,
    pub connection_count: usize,
}

#[derive(Clone, Debug, Default)]
struct CachedProcessInfo {
    name: Option<String>,
    creation_unix_ms: Option<u64>,
}

#[derive(Default)]
pub struct ConnectionsState {
    connections: Mutex<HashMap<FourTuple, Option<u32>>>,
    /// PID currently being followed. None = follow everything.
    /// Preserved across `reset()` so the user's pre-recording pick
    /// survives the capture-start handshake.
    selected_pid: Mutex<Option<u32>>,
    /// Process name + creation time are immutable for a PID's lifetime,
    /// so cache them across `discover_clients` polls (every 2 s while
    /// on the idle screen) to skip the 3 Win32 syscalls per known PID.
    process_cache: Mutex<HashMap<u32, CachedProcessInfo>>,
}

impl ConnectionsState {
    pub fn reset(&self) {
        self.connections.lock().unwrap().clear();
    }

    pub fn selected_pid(&self) -> Option<u32> {
        *self.selected_pid.lock().unwrap()
    }

    /// Record a 4-tuple if it's new, resolving the owning PID once.
    /// Caller should fast-path past this when no filter is active —
    /// observe's only consumer is `is_followed`, which short-circuits
    /// to true in that case.
    pub fn observe(&self, ft: &FourTuple) {
        {
            let map = self.connections.lock().unwrap();
            if map.contains_key(ft) {
                return;
            }
        }
        // GetExtendedTcpTable round-trip outside the lock so concurrent
        // is_followed checks don't block on the syscall.
        let pid = parse_ipv4(&ft.client_ip)
            .and_then(|ip| process::pid_for_local_endpoint(ip, ft.client_port));
        self.connections.lock().unwrap().entry(ft.clone()).or_insert(pid);
    }

    /// Filter predicate used by dispatch. No selection → every tuple
    /// passes. With a selected PID → only matching tuples.
    pub fn is_followed(&self, ft: &FourTuple) -> bool {
        let Some(want) = *self.selected_pid.lock().unwrap() else {
            return true;
        };
        self.connections.lock().unwrap().get(ft) == Some(&Some(want))
    }

    fn cached_process_info(&self, pid: u32) -> CachedProcessInfo {
        {
            let cache = self.process_cache.lock().unwrap();
            if let Some(hit) = cache.get(&pid) {
                return hit.clone();
            }
        }
        let info = process::process_info(pid);
        let entry = CachedProcessInfo {
            name: info.name,
            creation_unix_ms: info.creation_unix_ms,
        };
        self.process_cache
            .lock()
            .unwrap()
            .insert(pid, entry.clone());
        entry
    }

    /// One-shot scan of the kernel TCP table for processes currently
    /// connected to a Ragnarok server port. Drives the pre-recording
    /// client picker — no capture session needed.
    pub fn discover_clients(&self) -> Vec<ClientInfo> {
        let mut by_pid: HashMap<u32, usize> = HashMap::new();
        for conn in process::enumerate_tcp_connections() {
            if conn.state != process::TCP_STATE_ESTABLISHED {
                continue;
            }
            if !capture::is_target_port(conn.remote_port)
                && !capture::is_target_port(conn.local_port)
            {
                continue;
            }
            *by_pid.entry(conn.pid).or_insert(0) += 1;
        }

        let mut out: Vec<ClientInfo> = by_pid
            .into_iter()
            .map(|(pid, count)| {
                let info = self.cached_process_info(pid);
                ClientInfo {
                    pid: Some(pid),
                    process_name: info.name,
                    process_creation_unix_ms: info.creation_unix_ms,
                    connection_count: count,
                }
            })
            .collect();
        // Oldest process first so the list is stable across refreshes.
        out.sort_by_key(|c| c.process_creation_unix_ms.unwrap_or(u64::MAX));
        out
    }
}

fn parse_ipv4(s: &str) -> Option<[u8; 4]> {
    let mut parts = s.split('.');
    let a = parts.next()?.parse().ok()?;
    let b = parts.next()?.parse().ok()?;
    let c = parts.next()?.parse().ok()?;
    let d = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some([a, b, c, d])
}

// ---- Tauri commands ----

#[tauri::command]
pub fn discover_clients_cmd(state: State<ConnectionsState>) -> Vec<ClientInfo> {
    state.discover_clients()
}

#[tauri::command]
pub fn set_client_selection(
    pid: Option<u32>,
    state: State<ConnectionsState>,
) -> Result<(), String> {
    *state.selected_pid.lock().unwrap() = pid;
    Ok(())
}
