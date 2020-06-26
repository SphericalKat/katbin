use rocket::Rocket;

#[get("/")]
fn check() -> &'static str {
    "OK"
}

pub fn fuel(rocket: Rocket) -> Rocket {
    rocket.mount("/api/health", routes![check])
}
