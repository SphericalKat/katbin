use crate::schema::pastes;

#[table_name="pastes"]
#[derive(AsChangeset, Serialize, Deserialize, Queryable, Insertable)]
pub struct Paste {
    id: String,
    belongs_to: String,
    is_url: bool,
    content: String
}