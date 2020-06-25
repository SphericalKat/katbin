use anyhow::Result;
use diesel::pg::PgConnection;
use diesel::RunQueryDsl;

use crate::schema::pastes;

use super::entity::Paste;

pub fn create_paste(paste: &Paste, conn: &PgConnection) -> Result<usize> {
    let rows = diesel::insert_into(pastes::table)
        .values(paste)
        .execute(conn)?;
    Ok(rows)
}