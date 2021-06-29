use jirachi::collision_resistant::Jirachi;
use jirachi::Wishable;

pub fn get_random_id() -> String {
    let mut jirachi = Jirachi::new().unwrap();
    jirachi.wish().unwrap()
}

// use rand::prelude::SliceRandom;

// static VLIST: [&'static str; 5] = ["a", "e", "i", "o", "u"];
// static CLIST: [&'static str; 21] = [
//     "b", "c", "d", "f", "g", "h", "j", "k", "l", "m", "n", "p", "q", "r", "s", "t", "v", "w", "x",
//     "y", "z",
// ];

// fn rand_vowel() -> String {
//     (*VLIST.choose(&mut rand::thread_rng()).unwrap()).to_owned()
// }

// fn rand_consonant() -> String {
//     (*CLIST.choose(&mut rand::thread_rng()).unwrap()).to_owned()
// }

// pub fn get_random_id() -> String {
//     let mut text = String::from("");
//     let start = if rand::random::<bool>() { 0 } else { 1 };

//     for i in 0..8 {
//         let to_push = if i % 2 == start {
//             rand_consonant()
//         } else {
//             rand_vowel()
//         };
//         text.push_str(&to_push)
//     }

//     text
// }
