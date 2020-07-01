use rocket::http::{Cookie, Cookies};

use crate::utils::phonetic_key;

pub fn get_session_id(ck: &mut Cookies) -> String {
    match ck.get_private("session") {
        Some(c) => c.value().to_string(),
        None => {
            let user_id = phonetic_key::get_random_id();
            ck.add_private(Cookie::new("session", user_id.clone()));
            user_id
        }
    }
}
