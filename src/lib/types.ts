// Mirrors the Rust-side serde shape for the client picker.

export type ClientInfo = {
  pid: number | null;
  process_name: string | null;
  process_creation_unix_ms: number | null;
  connection_count: number;
};
