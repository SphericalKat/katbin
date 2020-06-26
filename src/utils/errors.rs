use rocket::{http::{Status, ContentType}, response::Responder, Request, response, Response, Outcome, State};

use std::io::Cursor;
use slog::Logger;
use slog;

#[derive(Debug, Serialize, Clone)]
pub enum ErrorCode {
    InvalidCredentials,
    MultipleAuthToken,
    NoAuthToken,
    AuthTokenCreationFailed,
    MalformedAuthToken,
    ResourceNotFound,
    ResourceAlreadyExists,
    DatabaseError,
    InvalidData,
    NotAuthorized,
    CorruptResource,
    LogicalConflict,
    Unknown,
}

#[derive(Debug, Serialize, Clone)]
pub struct Error {
    code: ErrorCode,
    msg: String,
}

impl Error {
    pub fn new(code: ErrorCode) -> Error {
        Error {
            code,
            msg: "".to_string(),
        }.set_msg()
    }

    pub fn custom(code: ErrorCode, msg: String) -> Error {
        Error {
            code,
            msg,
        }
    }

    fn get_status_code(&self) -> Status {
        match self.code {
            ErrorCode::InvalidCredentials => Status::Forbidden,
            ErrorCode::ResourceNotFound => Status::NotFound,
            ErrorCode::MultipleAuthToken => Status::Conflict,
            ErrorCode::NoAuthToken => Status::Forbidden,
            ErrorCode::AuthTokenCreationFailed => Status::InternalServerError,
            ErrorCode::MalformedAuthToken => Status::Forbidden,
            ErrorCode::ResourceAlreadyExists => Status::Conflict,
            ErrorCode::DatabaseError => Status::InternalServerError,
            ErrorCode::InvalidData => Status::BadRequest,
            ErrorCode::NotAuthorized => Status::Forbidden,
            ErrorCode::CorruptResource => Status::InternalServerError,
            ErrorCode::LogicalConflict => Status::BadRequest,
            ErrorCode::Unknown => Status::InternalServerError
        }
    }

    fn set_msg(mut self) -> Self {
        self.msg = match self.code.clone() {
            ErrorCode::InvalidCredentials => "invalid credentials were provided".to_string(),
            ErrorCode::MultipleAuthToken => "multiple authorization tokens were provided".to_string(),
            ErrorCode::NoAuthToken => "no authorization token was found".to_string(),
            ErrorCode::AuthTokenCreationFailed => "authorization token creation failed".to_string(),
            ErrorCode::MalformedAuthToken => "authorization token was malformed".to_string(),
            ErrorCode::ResourceNotFound => "resource not found".to_string(),
            ErrorCode::ResourceAlreadyExists => "the given resource already exists".to_string(),
            ErrorCode::DatabaseError => "database error occured".to_string(),
            ErrorCode::InvalidData => "invalid data provided".to_string(),
            ErrorCode::NotAuthorized => "you are not authorized to perform the requested operation".to_string(),
            ErrorCode::CorruptResource => "requested resource was corrupted".to_string(),
            ErrorCode::LogicalConflict => "the request logically conflicts with the existing data".to_string(),
            ErrorCode::Unknown => "unknown error occured".to_string()
        };
        self
    }
}

impl<'r> Responder<'r> for Error {
    fn respond_to(self, request: &Request) -> response::Result<'r> {
        let logger = request.guard::<State<Logger>>();

        if let Outcome::Success(logger) = logger {
            error!(logger, "{}", serde_json::to_string(&self).unwrap());
        }

        Response::build()
            .status(self.get_status_code())
            .header(ContentType::JSON)
            .sized_body(Cursor::new(serde_json::to_string(&self).unwrap()))
            .ok()
    }
}