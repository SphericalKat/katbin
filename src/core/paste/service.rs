use anyhow::Result;
use diesel::pg::PgConnection;
use regex::RegexBuilder;

use super::entity::Paste;
use super::postgres;

pub fn create_paste(paste: &mut Paste, conn: &PgConnection) -> Result<usize> {
    let re = RegexBuilder::new("^(https?://)?((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|((\\d{1,3}\\.){3}\\d{1,3}))(:\\d+)?(/[-a-z\\d%_.~+]*)*(\\?[;&a-z\\d%_.~+=-]*)?(#[-a-z\\d_]*)?$").case_insensitive(true).build().unwrap();
    paste.is_url = Some(re.is_match(&*paste.content.clone()));
    postgres::create_paste(paste, conn)
}

pub fn fetch_paste(id: String, conn: &PgConnection) -> Result<Paste> {
    postgres::fetch_paste(id, conn)
}
