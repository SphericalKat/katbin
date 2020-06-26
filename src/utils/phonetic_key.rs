use uuid::Uuid;

// const VOWELS: Vec<&str> = vec!["a", "e", "i", "o", "u", "y"];
// const CONSONANTS: Vec<&str> = vec!["b", "c", "d", "f", "g", "h", "l", "m", "n", "p", "r", "s", "t", "v", "w"];
// const UNCOMMON_CON: Vec<&str> = vec!["x", "z", "q", "j", "k"];
// const COMMON_VOW_VOW_ST: Vec<&str> = vec!["ea", "ai", "a", "yu"];
// const COMMON_VOW_VOW: Vec<&str> = vec!["ee", "oo", "ea", "ai", "ay", "uy"];
// const COMMON_VOW_CON: Vec<&str> = vec!["in", "an", "ing", "im", "er", "ex", "un", "est", "ux", "am", "ap"];
// const COMMON_VOW_CON_ST: Vec<&str> = vec!["un", "im", "in", "ex"];
// const COMMON_CON_VOW: Vec<&str> = vec!["me", "li", "le", "ly", "pe", "re", "fi", "nu", "co", "lo", "cu", "ki", "cy", "fu", "mo", "bi"];
// const COMMON_CON_VOW_ST: Vec<&str> = vec!["me", "li", "fu", "pe", "lo", "mo"];
// const COMMON_CON_CON_ST: Vec<&str> = vec!["gh", "th", "gr", "st", "ph", "pr", "t", "cr"];
// const COMMON_CON_CON: Vec<&str> = vec!["ll", "pp", "gh", "th", "gr", "ng", "st", "ph", "rr", "gn", "ck", "rf", "tt", "cr"];
//
// const CONSONANT: i8 = 1;
// const VOWEL: i8 = 0;

pub fn get_random_id() -> String {
    Uuid::new_v4().to_string()
}
