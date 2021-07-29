use crate::schema::users;

#[derive(Default, AsChangeset, Serialize, Deserialize, Queryable, Insertable)]
#[table_name = "users"]
pub struct User {
    pub id: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub activated: Option<bool>,
}

impl User {
    pub fn new() -> Self {
        User {
            id: "".to_string(),
            username: None,
            password: None,
            activated: None,
        }
    }
}
