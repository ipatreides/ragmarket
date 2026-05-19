// Win32 process queries used by the client picker. WinDivert sees raw
// packets with no notion of process ownership; `GetExtendedTcpTable`
// gives us the PID for a 4-tuple in one call.

pub struct ProcessInfo {
    pub name: Option<String>,
    pub creation_unix_ms: Option<u64>,
}

pub struct TcpConnection {
    pub local_addr: [u8; 4],
    pub local_port: u16,
    pub remote_port: u16,
    pub pid: u32,
    pub state: u32,
}

#[cfg(windows)]
pub fn pid_for_local_endpoint(local_ip: [u8; 4], local_port: u16) -> Option<u32> {
    enumerate_tcp_connections()
        .into_iter()
        .find(|c| c.local_addr == local_ip && c.local_port == local_port)
        .map(|c| c.pid)
}

#[cfg(not(windows))]
pub fn pid_for_local_endpoint(_local_ip: [u8; 4], _local_port: u16) -> Option<u32> {
    None
}

/// Snapshot of every IPv4 TCP connection on the box with its owning
/// PID and TCP state. Drives the pre-recording client picker.
#[cfg(windows)]
pub fn enumerate_tcp_connections() -> Vec<TcpConnection> {
    use windows::Win32::NetworkManagement::IpHelper::{
        MIB_TCPROW_OWNER_PID, MIB_TCPTABLE_OWNER_PID,
    };

    let Some(buf) = read_tcp_table() else { return Vec::new() };
    let table = unsafe { &*(buf.as_ptr() as *const MIB_TCPTABLE_OWNER_PID) };
    let n = table.dwNumEntries as usize;
    let rows: &[MIB_TCPROW_OWNER_PID] =
        unsafe { std::slice::from_raw_parts(table.table.as_ptr(), n) };

    rows.iter()
        .map(|r| TcpConnection {
            // dwLocalAddr holds the IP in network byte order — reading
            // it as a little-endian u32 yields the bytes in IP order.
            local_addr: r.dwLocalAddr.to_le_bytes(),
            // dwLocalPort: low 16 bits, network byte order.
            local_port: u16::from_be(r.dwLocalPort as u16),
            remote_port: u16::from_be(r.dwRemotePort as u16),
            pid: r.dwOwningPid,
            state: r.dwState,
        })
        .collect()
}

#[cfg(not(windows))]
pub fn enumerate_tcp_connections() -> Vec<TcpConnection> {
    Vec::new()
}

/// Two-pass `GetExtendedTcpTable`: probe with NULL to learn the
/// required size, then alloc and read. Returns the raw buffer for the
/// caller to cast into `MIB_TCPTABLE_OWNER_PID`.
#[cfg(windows)]
fn read_tcp_table() -> Option<Vec<u8>> {
    use windows::Win32::NetworkManagement::IpHelper::{
        GetExtendedTcpTable, TCP_TABLE_OWNER_PID_ALL,
    };
    use windows::Win32::Networking::WinSock::AF_INET;

    let mut size: u32 = 0;
    unsafe {
        GetExtendedTcpTable(
            None,
            &mut size,
            false,
            AF_INET.0 as u32,
            TCP_TABLE_OWNER_PID_ALL,
            0,
        );
    }
    if size == 0 {
        return None;
    }
    let mut buf: Vec<u8> = vec![0; size as usize];
    let rc = unsafe {
        GetExtendedTcpTable(
            Some(buf.as_mut_ptr() as *mut _),
            &mut size,
            false,
            AF_INET.0 as u32,
            TCP_TABLE_OWNER_PID_ALL,
            0,
        )
    };
    if rc != 0 {
        return None;
    }
    Some(buf)
}

/// MIB_TCP_STATE_ESTAB — the value `dwState` reports for ESTABLISHED.
pub const TCP_STATE_ESTABLISHED: u32 = 5;

#[cfg(windows)]
pub fn process_info(pid: u32) -> ProcessInfo {
    use windows::Win32::Foundation::{CloseHandle, FILETIME};
    use windows::Win32::System::Threading::{
        GetProcessTimes, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };

    let handle = match unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) } {
        Ok(h) if !h.is_invalid() => h,
        _ => {
            return ProcessInfo {
                name: None,
                creation_unix_ms: None,
            }
        }
    };

    let mut name_buf = [0u16; 260];
    let mut name_len = name_buf.len() as u32;
    let name = if unsafe {
        QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_FORMAT(0),
            windows::core::PWSTR(name_buf.as_mut_ptr()),
            &mut name_len,
        )
    }
    .is_ok()
    {
        let path = String::from_utf16_lossy(&name_buf[..name_len as usize]);
        std::path::Path::new(&path)
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
    } else {
        None
    };

    let mut creation = FILETIME::default();
    let mut exit = FILETIME::default();
    let mut kernel = FILETIME::default();
    let mut user = FILETIME::default();
    let creation_unix_ms = if unsafe {
        GetProcessTimes(handle, &mut creation, &mut exit, &mut kernel, &mut user)
    }
    .is_ok()
    {
        Some(filetime_to_unix_ms(creation))
    } else {
        None
    };

    let _ = unsafe { CloseHandle(handle) };

    ProcessInfo {
        name,
        creation_unix_ms,
    }
}

#[cfg(not(windows))]
pub fn process_info(_pid: u32) -> ProcessInfo {
    ProcessInfo {
        name: None,
        creation_unix_ms: None,
    }
}

/// Convert a Win32 FILETIME (100ns ticks since 1601-01-01 UTC) to
/// Unix milliseconds. Saturates rather than panicking on overflow.
#[cfg(windows)]
fn filetime_to_unix_ms(ft: windows::Win32::Foundation::FILETIME) -> u64 {
    let ticks = ((ft.dwHighDateTime as u64) << 32) | (ft.dwLowDateTime as u64);
    // 11_644_473_600 seconds between 1601-01-01 and 1970-01-01.
    const EPOCH_DIFF_100NS: u64 = 11_644_473_600u64 * 10_000_000;
    ticks.saturating_sub(EPOCH_DIFF_100NS) / 10_000
}
