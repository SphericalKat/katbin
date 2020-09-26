use anyhow::Result;
use rocket::{
    http::Status,
    response::status,
    Rocket,
};
use rocket::response::status::Custom;
use rocket_contrib::json::Json;
use serde_json::Value;

use crate::api::catchers::{internal_server_error, unprocessable_entity};
use crate::api::guards::db::DbConn;
use crate::core::users::entity::User;
use crate::core::users::service::{activate_user, create_or_fetch_user, fetch_user};

#[post("/", data = "<user>")]
fn activate(mut user: Json<User>, conn: DbConn) -> Custom<Json<Value>> {
    if user.username.is_none() || user.password.is_none() {
        return unprocessable_entity();
    }

    // Check if frontend sent a session cookie
    let user_id = user.id.clone();

    // Create or fetch already existing user
    let mut found_user = match create_or_fetch_user(user_id, &conn) {
        Ok(user) => user,
        Err(_) => {
            return internal_server_error();
        }
    };

    // Activate user
    found_user.activated = Some(true);

    let activated_user = activate_user(&mut user, &conn);
    match activated_user {
        Ok(u) => status::Custom(Status::Ok, Json(json!(u))),
        Err(_) => internal_server_error(),
    }
}

#[get("/<id>")]
fn fetch(id: String, conn: DbConn) -> Result<Json<User>> {
    Ok(Json(fetch_user(id, &conn)?))
}

pub fn fuel(rocket: Rocket) -> Rocket {
    rocket.mount("/api/user", routes![activate, fetch])
}
