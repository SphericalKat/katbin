use std::ops::DerefMut;

use rocket::response::status::Custom;
use rocket::{
    http::{Cookie, Cookies, Status},
    response::status,
    Rocket,
};
use rocket_contrib::json::Json;
use serde_json::Value;

use crate::api::guards::db;
use crate::core::paste::{entity::Paste, service::create_paste, service::fetch_paste};
use crate::core::users::service::create_or_fetch_user;
use crate::utils::phonetic_key;

use diesel::result::Error;

#[post("/", data = "<paste>")]
fn create(mut paste: Json<Paste>, conn: db::DbConn, mut ck: Cookies) -> Custom<Json<Value>> {
    // Check if frontend sent a session cookie
    let user_id = match ck.get_private("session") {
        Some(c) => c.value().to_string(),
        None => {
            let user_id = phonetic_key::get_random_id();
            ck.add_private(Cookie::new("session", user_id.clone()));
            user_id
        }
    };

    // Create or fetch already existing user
    let user = match create_or_fetch_user(user_id, &conn) {
        Ok(user) => user,
        Err(e) => {
            return status::Custom(
                Status::InternalServerError,
                Json(json!({
                    "err": e.to_string(),
                    "msg": "Failed to create or fetch user"
                })),
            )
        }
    };

    let new_paste = paste.deref_mut();
    if new_paste.id.is_none() {
        new_paste.id = Some(phonetic_key::get_random_id());
    }

    new_paste.belongs_to = Some(user.id);

    match create_paste(new_paste, &conn) {
        Ok(_) => status::Custom(
            Status::Created,
            Json(json!({
                "msg": "Successfully created paste",
                "paste_id": new_paste.id
            })),
        ),
        Err(e) => status::Custom(
            Status::InternalServerError,
            Json(json!({
                "err": e.to_string(),
                "msg": "Failed to create paste"
            })),
        ),
    }
}

#[get("/<id>")]
fn fetch(id: String, conn: db::DbConn) -> Custom<Json<Value>> {
    let paste = match fetch_paste(id, &conn) {
        Ok(paste) => paste,
        Err(err) => {
            return match err.downcast_ref::<Error>() {
                Some(Error::NotFound) => Custom(
                    Status::NotFound,
                    Json(json!({
                        "err": err.to_string(),
                        "msg": "Unable to find a paste with that ID"
                    })),
                ),
                _ => Custom(
                    Status::InternalServerError,
                    Json(json!({
                        "err": err.to_string(),
                        "msg": "Something went wrong, try again"
                    })),
                ),
            }
        }
    };

    Custom(Status::Found, Json(json!(paste)))
}

pub fn fuel(rocket: Rocket) -> Rocket {
    rocket.mount("/api/paste", routes![create, fetch])
}
