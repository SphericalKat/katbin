use anyhow::Result;
use diesel::pg::PgConnection;
use diesel::prelude::*;

use crate::schema::pastes;

use super::entity::Paste;

pub fn create_paste(paste: &Paste, conn: &PgConnection) -> Result<usize> {
    let rows = diesel::insert_into(pastes::table)
        .values(paste)
        .on_conflict_do_nothing()
        .execute(conn)?;
    Ok(rows)
}

pub fn update_paste(paste: &Paste, conn: &PgConnection) -> Result<Paste> {
    use crate::schema::pastes::dsl::*;
    let updated_user = diesel::update(pastes.filter(id.eq(paste.id.as_ref().unwrap())))
        .set(paste)
        .get_result(conn)?;
    Ok(updated_user)
}

pub fn fetch_paste(id: String, conn: &PgConnection) -> Result<Paste> {
    let paste = pastes::table.find(id).get_result::<Paste>(conn)?;
    Ok(paste)
}
