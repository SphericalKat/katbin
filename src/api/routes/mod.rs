use rocket::Rocket;
use rocket_cors::CorsOptions;

pub mod health;
pub mod paste;
pub mod responder;
pub mod user;

pub fn fuel(rocket: Rocket) -> Rocket {
    let mut rocket = rocket;
    let cors = CorsOptions::default().to_cors().unwrap();
    rocket = health::fuel(rocket);
    rocket = paste::fuel(rocket);
    rocket = user::fuel(rocket);
    rocket.attach(cors)
}
