use std::env;

pub fn get_domain() -> String {
    env::var("KATBIN_DOMAIN_NAME").unwrap().parse::<String>().expect("domain name")
}