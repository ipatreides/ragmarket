// IP/TCP header parsing helpers. The TCP reassembly and 0x0836 record
// decoding will go on top of these in a follow-up commit.

#[derive(Debug, Clone, Copy)]
pub struct IpHeader {
    pub src: [u8; 4],
    pub dst: [u8; 4],
    pub proto: u8,
    pub header_len: usize,
    pub total_len: usize,
}

#[derive(Debug, Clone)]
pub struct TcpSegment {
    pub src_port: u16,
    pub dst_port: u16,
    pub payload: Vec<u8>,
}

pub fn parse_ipv4(buf: &[u8]) -> Option<IpHeader> {
    if buf.len() < 20 {
        return None;
    }
    let version = buf[0] >> 4;
    if version != 4 {
        return None;
    }
    let ihl = (buf[0] & 0x0F) as usize;
    let header_len = ihl * 4;
    if header_len < 20 || buf.len() < header_len {
        return None;
    }
    let total_len = u16::from_be_bytes([buf[2], buf[3]]) as usize;
    if total_len < header_len || total_len > buf.len() {
        return None;
    }
    let proto = buf[9];
    let src = [buf[12], buf[13], buf[14], buf[15]];
    let dst = [buf[16], buf[17], buf[18], buf[19]];
    Some(IpHeader {
        src,
        dst,
        proto,
        header_len,
        total_len,
    })
}

pub fn parse_tcp(buf: &[u8]) -> Option<TcpSegment> {
    if buf.len() < 20 {
        return None;
    }
    let src_port = u16::from_be_bytes([buf[0], buf[1]]);
    let dst_port = u16::from_be_bytes([buf[2], buf[3]]);
    let data_offset = (buf[12] >> 4) as usize;
    let header_len = data_offset * 4;
    if header_len < 20 || buf.len() < header_len {
        return None;
    }
    let payload = buf[header_len..].to_vec();
    Some(TcpSegment {
        src_port,
        dst_port,
        payload,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_minimal_ipv4_header() {
        // Version 4, IHL 5 (20 bytes), total length 40, proto TCP (6)
        let mut buf = vec![0u8; 40];
        buf[0] = 0x45;
        buf[2] = 0x00;
        buf[3] = 40;
        buf[9] = 6;
        buf[12..16].copy_from_slice(&[192, 168, 1, 1]);
        buf[16..20].copy_from_slice(&[192, 168, 1, 2]);
        let h = parse_ipv4(&buf).expect("parse");
        assert_eq!(h.src, [192, 168, 1, 1]);
        assert_eq!(h.dst, [192, 168, 1, 2]);
        assert_eq!(h.proto, 6);
        assert_eq!(h.header_len, 20);
        assert_eq!(h.total_len, 40);
    }

    #[test]
    fn rejects_non_ipv4() {
        let mut buf = vec![0u8; 40];
        buf[0] = 0x65; // version 6
        assert!(parse_ipv4(&buf).is_none());
    }
}
