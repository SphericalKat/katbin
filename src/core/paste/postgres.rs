use anyhow::Result;
use diesel::pg::PgConnection;
use diesel::prelude::*;

use crate::schema::pastes;

use super::entity::Paste;

pub fn create_paste(paste: &Paste, conn: &PgConnection) -> Result<usize> {
    let rows = diesel::insert_into(pastes::table)
        .values(paste)
        .execute(conn)?;
    Ok(rows)
}

pub fn fetch_paste(id: String, conn: &PgConnection) -> Result<Paste> {
    let paste = pastes::table.find(id).get_result::<Paste>(conn)?;
    Ok(paste)
}
