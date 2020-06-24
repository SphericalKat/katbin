use diesel::pg::PgConnection;
use diesel::{r2d2, Connection};
use diesel::r2d2::{PooledConnection, ConnectionManager};
use rocket::{Outcome, Request, State};
use rocket::http::Status;
use rocket::request::{self, FromRequest};
use std::env;
use std::ops::Deref;
use crate::utils::errors::{Error, ErrorCode};

pub type Pool = r2d2::Pool<ConnectionManager<PgConnection>>;

pub fn pool() -> Pool {
    let manager = ConnectionManager::<PgConnection>::new(database_url());
    Pool::new(manager).expect("db pool")
}

fn database_url() -> String {
    env::var("DATABASE_URL").expect("DATABASE_URL must be set")
}

pub fn pg_connection() -> PgConnection {
    PgConnection::establish(database_url().as_str()).unwrap()
}

pub struct DbConn(pub r2d2::PooledConnection<ConnectionManager<PgConnection>>);

impl<'a, 'r> FromRequest<'a, 'r> for DbConn {
    type Error = ();

    fn from_request(request: &'a Request<'r>) -> request::Outcome<DbConn, Self::Error> {
        let pool = request.guard::<State<Pool>>()?;
        match pool.get() {
            Ok(conn) => Outcome::Success(DbConn(conn)),
            Err(_) => Outcome::Failure((Status::ServiceUnavailable, ())),
        }
    }
}

impl Deref for DbConn {
    type Target = PgConnection;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

pub fn get_connection(pool: &Pool) -> Result<PooledConnection<ConnectionManager<PgConnection>>, Error> {
    let result = pool.get();
    if let Err(e) = result {
        return Err(Error::custom(ErrorCode::DatabaseError, e.to_string()));
    }

    Ok(result.unwrap())
}