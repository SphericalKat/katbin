#![feature(proc_macro_hygiene, decl_macro)]

#[macro_use]
extern crate rocket;

#[get("/alive")]
fn alive() -> &'static str {
    "OK"
}

fn main() {
    rocket::ignite()
        .mount("/", routes![index])
        .launch();
}
