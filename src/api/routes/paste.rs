use std::ops::DerefMut;

use diesel::result::Error;
use rocket::{http::{Cookies, Status}, response::status, Rocket};
use rocket::response::status::Custom;
use rocket_contrib::json::Json;
use serde_json::Value;

use crate::api::catchers::{forbidden, internal_server_error, not_found, unprocessable_entity};
use crate::api::guards::db::DbConn;
use crate::core::paste::{entity::Paste, service::{create_paste, fetch_paste, update_paste};};
use crate::core::users::service::{create_or_fetch_user, fetch_user};
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
fn fetch(id: String, conn: DbConn, mut ck: Cookies) -> Custom<Json<Value>> {
    let user_id = get_session_id(&mut ck);

    let r_user = fetch_user(user_id, &conn);
    let user = match r_user {
        Ok(user) => user,
        Err(e) => {
            return match e.downcast_ref::<Error>() {
                Some(Error::NotFound) => not_found(),
                _ => internal_server_error(),
            };
        }
    };

    let paste = match fetch_paste(id, &conn) {
        Ok(paste) => paste,
        Err(e) => {
            return match e.downcast_ref::<Error>() {
                Some(Error::NotFound) => not_found(),
                _ => internal_server_error(),
            };
        }
    };

    let belongs_to = paste.belongs_to.as_ref().unwrap();

    return if user.id == *belongs_to {
        Custom(Status::Ok, Json(json!({
            "id": paste.id,
            "belongs_to": *belongs_to,
            "is_url": paste.is_url.unwrap(),
            "content": paste.content,
            "is_owner": true
        })))
    } else {
        Custom(Status::Ok, Json(json!(paste)))
    };
}

#[patch("/", data = "<paste>")]
fn update(mut paste: Json<Paste>, conn: DbConn, mut ck: Cookies) -> Custom<Json<Value>> {
    // Check if frontend sent a session cookie
    let user_id = get_session_id(&mut ck);

    // Create or fetch already existing user
    let user = match fetch_user(user_id, &conn) {
        Ok(user) => user,
        Err(_) => {
            return not_found();
        }
    };

    let new_paste = paste.deref_mut();

    if new_paste.id.is_none() {
        return not_found();
    }

    new_paste.belongs_to = match fetch_paste(new_paste.id.as_ref().unwrap().clone(), &conn) {
        Ok(paste) => paste.belongs_to,
        Err(_) => return internal_server_error()
    };

    if new_paste.belongs_to.is_some() {
        if *new_paste.belongs_to.as_ref().unwrap() == user.id {
            match update_paste(new_paste, &conn) {
                Ok(_) => status::Custom(
                    Status::Created,
                    Json(json!({
                "msg": "Successfully created paste",
                "paste_id": new_paste.id
            })),
                ),
                Err(_) => internal_server_error(),
            }
        } else {
            forbidden()
        }
    } else {
        unprocessable_entity()
    }
}

pub fn fuel(rocket: Rocket) -> Rocket {
    rocket.mount("/api/paste", routes![create, fetch, update])
}
