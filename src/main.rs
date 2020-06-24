#![feature(proc_macro_hygiene, decl_macro)]

#[macro_use]
extern crate rocket;

pub mod api;
pub mod core;



fn main() {
    let mut rocket = rocket::ignite();

    rocket = api::routes::fuel(rocket);

    rocket.launch();
}
