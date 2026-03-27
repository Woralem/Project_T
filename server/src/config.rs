use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub bind_addr: String,
}

impl Config {
    pub fn from_env() -> Self {
        let bind_addr = env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:3000".to_string());
        Self { bind_addr }
    }
}
