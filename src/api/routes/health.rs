use rocket::Rocket;

#[get("/check")]
fn check() -> &'static str {
    "OK"
}


pub fn fuel(rocket: Rocket) -> Rocket {
    rocket.mount("/api/health", routes![check])
}