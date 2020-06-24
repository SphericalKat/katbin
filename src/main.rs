#![feature(proc_macro_hygiene, decl_macro)]

#[macro_use]
extern crate rocket;
#[macro_use]
extern crate rocket_contrib;
#[macro_use]
extern crate diesel;
#[macro_use]
extern crate serde;
#[macro_use]
extern crate slog;

pub mod api;
pub mod core;
pub mod utils;

use slog_term;
use slog_async;
use slog::Drain;


fn main() {
    let decorator = slog_term::TermDecorator::new().build();
    let drain = slog_term::FullFormat::new(decorator).build().fuse();
    let drain = slog_async::Async::new(drain).build().fuse();

    let logger = slog::Logger::root(drain, o!());

    let mut rocket = rocket::ignite();

    rocket = api::routes::fuel(rocket);

    rocket.manage(logger)
    .launch();
}
