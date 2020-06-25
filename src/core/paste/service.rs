use anyhow::Result;
use diesel::pg::PgConnection;

use super::entity::Paste;
use super::postgres;

pub fn create_paste(paste: &Paste, conn: &PgConnection) -> Result<usize> {
    postgres::create_paste(paste, conn)
}