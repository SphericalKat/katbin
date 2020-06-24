use std::env;
use std::result::Result;
use chrono::prelude::*;
use jsonwebtoken::{Header, Algorithm, EncodingKey, Validation, DecodingKey};
use rocket::request::{FromRequest, Outcome};
use rocket::http::{Status, ContentType};
use rocket::{Request, response, Response};

use crate::utils::errors::Error;
use crate::utils::errors::ErrorCode;
use rocket::response::Responder;
use std::io::Cursor;

#[derive(Serialize, Deserialize, Clone)]
pub struct Claims {
    pub username: String,
    #[serde(with = "date_serializer")]
    iat: DateTime<Utc>,
    #[serde(with = "date_serializer")]
    exp: DateTime<Utc>
}

mod date_serializer {
    use chrono::{DateTime, TimeZone, Utc};
    use serde::{self, Deserialize, Deserializer, Serializer};

    /// Serializes a DateTime<Utc> to a Unix timestamp (milliseconds since 1970/1/1T00:00:00T)
    pub fn serialize<S>(date: &DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: Serializer,
    {
        let timestamp = date.timestamp();
        serializer.serialize_i64(timestamp)
    }

    /// Attempts to deserialize an i64 and use as a Unix timestamp
    pub fn deserialize<'de, D>(deserializer: D) -> Result<DateTime<Utc>, D::Error>
        where
            D: Deserializer<'de>,
    {
        Utc.timestamp_opt(i64::deserialize(deserializer)?, 0)
            .single() // If there are multiple or no valid DateTimes from timestamp, return None
            .ok_or_else(|| serde::de::Error::custom("invalid Unix timestamp value"))
    }
}

impl Claims {
    pub fn new(username: String, access_level: AccessLevel) -> Claims {
        let iat = Utc::now();
        let exp = match access_level {
            AccessLevel::Admin => iat + chrono::Duration::minutes(30),
            _ => iat + chrono::Duration::days(1)
        };

        Claims {
            username,
            iat: iat.date().and_hms_milli(iat.hour(), iat.minute(), iat.second(), 0),
            exp: exp.date().and_hms_milli(exp.hour(), exp.minute(), exp.second(), 0)
        }
    }

    pub fn jwt(&self) -> Result<String, Error> {
        let mut header = Header::default();
        header.alg = Algorithm::HS512;
        header.kid = Some(env::var("JWT_SIGNING_KEY").unwrap());
        let key = env::var("JWT_PASSWORD").unwrap();


        match jsonwebtoken::encode(&header, self, &EncodingKey::from_secret(key.as_bytes())) {
            Ok(token) => Ok(token),
            Err(_) => Err(Error::new(ErrorCode::AuthTokenCreationFailed))
        }
    }

    pub fn from(token: String) -> Result<Claims, Error> {
        let key = env::var("JWT_PASSWORD").unwrap();
        match jsonwebtoken::decode::<Claims>(&token, &DecodingKey::from_secret(key.as_bytes()),
                                             &Validation::new(Algorithm::HS512)) {
            Ok(token_data) => Ok(token_data.claims),
            Err(_) => Err(Error::new(ErrorCode::MalformedAuthToken))
        }
    }
}

pub struct ClaimResult(Result<Claims, Error>);

impl ClaimResult {
    pub fn inner(&self) -> Result<Claims, Error> {
        self.0.clone()
    }
}

impl<'a, 'r> FromRequest<'a, 'r> for ClaimResult {
    type Error = Error;

    fn from_request(request: &'a Request<'r>) -> Outcome<Self, Self::Error> {
        let values: Vec<_> = request.headers().get("Authorization").collect();
        if values.len() > 1 {
            return Outcome::Success(ClaimResult(Err(Error::new(ErrorCode::MultipleAuthToken))));
        } else if values.len() == 0 {
            return Outcome::Success(ClaimResult(Err(Error::new(ErrorCode::NoAuthToken))));
        }

        let token = values[0].to_string();

        Outcome::Success(ClaimResult(Claims::from(token)))
    }
}