use jirachi::collision_resistant::Jirachi;
use jirachi::Wishable;



pub fn get_random_id() -> String {
    let mut jirachi = Jirachi::new().unwrap();
    jirachi.wish().unwrap()
}
