use diesel::pg::PgConnection;
use diesel::result::Error;
use super::entity::Paste;
use crate::schema::pastes;
use diesel::{RunQueryDsl, QueryResult};

pub fn create(paste: &Paste, conn: &PgConnection) -> Result<usize, Error> {
    diesel::insert_into(pastes::table)
        .values(paste)
        .execute(conn)
}