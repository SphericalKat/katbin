table! {
    games (id) {
        id -> Int4,
        name -> Text,
        developer -> Text,
        is_goty -> Bool,
    }
}

table! {
    pastes (id) {
        id -> Varchar,
        belongs_to -> Nullable<Varchar>,
        is_url -> Bool,
        content -> Text,
    }
}

table! {
    users (id) {
        id -> Varchar,
        username -> Nullable<Varchar>,
        password -> Nullable<Varchar>,
        activated -> Nullable<Bool>,
    }
}

joinable!(pastes -> users (belongs_to));

allow_tables_to_appear_in_same_query!(
    games,
    pastes,
    users,
);
