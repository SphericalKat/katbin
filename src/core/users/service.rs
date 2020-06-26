use anyhow::Result;
use bcrypt::{hash, DEFAULT_COST};
use diesel::pg::PgConnection;
use diesel::result::Error;

use crate::core::users::entity::User;

use super::postgres;

pub fn create_user(user: &mut User, conn: &PgConnection) -> Result<usize> {
    let hashed_pass = hash(user.password.as_ref().unwrap().as_bytes(), DEFAULT_COST)?;
    user.password = Some(hashed_pass);
    postgres::create_user(user, conn)
}

pub fn create_or_fetch_user(id: String, conn: &PgConnection) -> Result<User> {
    let user = match postgres::find_user(id.clone(), conn) {
        Ok(user) => user,
        Err(err) => match err.downcast_ref::<Error>() {
            Some(Error::NotFound) => {
                let new_user = User {
                    id: id.clone(),
                    username: None,
                    password: None,
                    activated: Some(false),
                };
                postgres::create_user(&new_user, conn)?;
                new_user
            }
            _ => return Err(err),
        },
    };
    Ok(user)
}
