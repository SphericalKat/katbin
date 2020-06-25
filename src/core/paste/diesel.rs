use diesel::{RunQueryDsl};
use diesel::pg::PgConnection;
use diesel::result::Error;

use crate::schema::pastes;

use super::entity::Paste;

pub fn create_paste(paste: &Paste, conn: &PgConnection) -> Result<usize, Error> {
    diesel::insert_into(pastes::table)
        .values(paste)
        .execute(conn)
}