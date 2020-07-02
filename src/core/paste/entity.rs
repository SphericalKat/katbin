use crate::schema::pastes;

#[table_name = "pastes"]
#[derive(AsChangeset, Serialize, Deserialize, Queryable, Insertable)]
pub struct Paste {
    pub id: Option<String>,
    pub belongs_to: Option<String>,
    pub is_url: Option<bool>,
    pub content: String,
}
