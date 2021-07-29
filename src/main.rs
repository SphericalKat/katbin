#![feature(proc_macro_hygiene, decl_macro)]

#[macro_use]
extern crate diesel;
#[macro_use]
extern crate diesel_migrations;
#[macro_use]
extern crate rocket;
extern crate rocket_contrib;
#[macro_use]
extern crate serde;
#[macro_use]
extern crate serde_json;
#[macro_use]
extern crate slog;

use slog::{Drain, Logger};

pub mod api;
pub mod core;
pub mod schema;
pub mod utils;

embed_migrations!("migrations");

fn run_migrations(logger: &Logger) {
    let result = embedded_migrations::run(&utils::db::pg_connection());
    if let Err(e) = result {
        error!(logger, "migration error: {}", e.to_string());
    }
}

fn main() {
    dotenv::dotenv().ok();

    let decorator = slog_term::TermDecorator::new().build();
    let drain = slog_term::FullFormat::new(decorator).build().fuse();
    let drain = slog_async::Async::new(drain).build().fuse();
    let logger = slog::Logger::root(drain, o!());

    run_migrations(&logger);

    let mut rocket = rocket::ignite();

    rocket = api::routes::fuel(rocket);
    rocket = api::catchers::fuel(rocket);

    rocket.manage(utils::db::pool()).manage(logger).launch();
}
