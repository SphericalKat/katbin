use crate::api::fairings::cors::CORS;
use rocket::Rocket;

pub mod health;
pub mod paste;
pub mod responder;

pub fn fuel(rocket: Rocket) -> Rocket {
    let mut rocket = rocket;
    rocket = health::fuel(rocket);
    rocket = paste::fuel(rocket);
    rocket.attach(CORS())
}
