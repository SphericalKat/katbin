use rocket::Rocket;

#[get("/health")]
fn check() -> &'static str {
    "OK"
}


pub fn fuel(rocket: Rocket) -> Rocket {
    rocket.mount("/api", routes![check])
}