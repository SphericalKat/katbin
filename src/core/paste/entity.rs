use crate::schema::pastes;

#[derive(AsChangeset, Serialize, Deserialize, Queryable, Insertable)]
#[table_name = "pastes"]
pub struct Paste {
    pub id: Option<String>,
    pub belongs_to: Option<String>,
    pub is_url: Option<bool>,
    pub content: String,
}
