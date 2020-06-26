use crate::schema::users;

#[table_name = "users"]
#[derive(AsChangeset, Serialize, Deserialize, Queryable, Insertable)]
pub struct User {
    pub id: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub activated: Option<bool>,
}
