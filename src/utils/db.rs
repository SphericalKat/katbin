use diesel::pg::PgConnection;
use diesel::r2d2::ConnectionManager;
use diesel::{r2d2, Connection};
use std::env;

pub type Pool = r2d2::Pool<ConnectionManager<PgConnection>>;

pub fn pool() -> Pool {
    let manager = ConnectionManager::<PgConnection>::new(database_url());
    Pool::builder().max_size(15).build(manager).unwrap()
}

fn database_url() -> String {
    env::var("DATABASE_URL").expect("DATABASE_URL must be set")
}

pub fn pg_connection() -> PgConnection {
    PgConnection::establish(database_url().as_str()).unwrap()
}
