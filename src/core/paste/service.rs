use anyhow::Result;
use diesel::pg::PgConnection;

use super::entity::Paste;
use super::postgres;

pub fn create_paste(paste: &mut Paste, conn: &PgConnection) -> Result<usize> {
    paste.is_url = validator::validate_url(paste.content.clone());
    postgres::create_paste(paste, conn)
}

pub fn fetch_paste(id: String, conn: &PgConnection) -> Result<Paste> {
    postgres::fetch_paste(id, conn)
}
