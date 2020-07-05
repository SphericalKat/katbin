use jirachi::Jirachi;

pub fn get_random_id() -> String {
    let mut jirachi = Jirachi::new().unwrap();
    jirachi.wish().unwrap()
}
