use rocket::http::{Cookie, Cookies, SameSite};

use crate::utils::phonetic_key;

pub fn get_session_id(ck: &mut Cookies) -> String {
    match ck.get_private("session") {
        Some(c) => c.value().to_string(),
        None => {
            let user_id = phonetic_key::get_random_id();
            let cookie = Cookie::build("session", user_id.clone())
                .domain(".katb.in")
                .same_site(SameSite::Lax)
                .secure(true)
                .permanent()
                .finish();
            ck.add_private(cookie);
            user_id
        }
    }
}
