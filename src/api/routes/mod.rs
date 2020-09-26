use rocket::Rocket;
use rocket_cors::CorsOptions;

pub mod health;
pub mod paste;
pub mod responder;
pub mod user;

pub fn fuel(rocket: Rocket) -> Rocket {
    let mut rocket = rocket;
    let mut cors_options = CorsOptions::default();
    cors_options.expose_headers.insert("Set-Cookie".to_owned());
    let cors = cors_options.to_cors().unwrap();
    rocket = health::fuel(rocket);
    rocket = paste::fuel(rocket);
    rocket = user::fuel(rocket);
    rocket.attach(cors)
}
