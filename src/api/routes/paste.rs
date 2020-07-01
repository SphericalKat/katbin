use std::ops::DerefMut;

use diesel::result::Error;
use rocket::response::status::Custom;
use rocket::{
    http::{Cookies, Status},
    response::status,
    Rocket,
};
use rocket_contrib::json::Json;
use serde_json::Value;

use crate::api::catchers::{internal_server_error, not_found};
use crate::api::guards::db::DbConn;
use crate::core::paste::{entity::Paste, service::create_paste, service::fetch_paste};
use crate::core::users::service::create_or_fetch_user;
use crate::utils::phonetic_key;
use crate::utils::users::get_session_id;

#[post("/", data = "<paste>")]
fn create(mut paste: Json<Paste>, conn: DbConn, mut ck: Cookies) -> Custom<Json<Value>> {
    // Check if frontend sent a session cookie
    let user_id = get_session_id(&mut ck);

    // Create or fetch already existing user
    let user = match create_or_fetch_user(user_id, &conn) {
        Ok(user) => user,
        Err(_) => {
            return internal_server_error();
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
        Err(_) => internal_server_error(),
    }
}

#[get("/<id>")]
fn fetch(id: String, conn: DbConn) -> Custom<Json<Value>> {
    let paste = match fetch_paste(id, &conn) {
        Ok(paste) => paste,
        Err(e) => {
            return match e.downcast_ref::<Error>() {
                Some(Error::NotFound) => not_found(),
                _ => internal_server_error(),
            };
        }
    };

    Custom(Status::Found, Json(json!(paste)))
}

pub fn fuel(rocket: Rocket) -> Rocket {
    rocket.mount("/api/paste", routes![create, fetch])
}
