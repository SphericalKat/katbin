use rocket::Rocket;

pub mod health;

pub fn fuel(rocket: Rocket) -> Rocket {
    let mut rocket = rocket;

    rocket = health::fuel(rocket);

    rocket
}

