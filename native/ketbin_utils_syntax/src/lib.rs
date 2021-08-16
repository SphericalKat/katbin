use syntect::{html::{ClassStyle, ClassedHTMLGenerator}, parsing::SyntaxSet, util::LinesWithEndings};

#[rustler::nif]
fn add(a: i64, b: i64) -> i64 {
    a + b
}

#[rustler::nif]
pub fn highlight_text(text: String, lang: String) -> String {
	let syntax_set = SyntaxSet::load_defaults_newlines();

	let syntax = syntax_set
			.find_syntax_by_extension(&lang)
			.unwrap_or(syntax_set.find_syntax_plain_text());

	let mut rs_html_generator =
			ClassedHTMLGenerator::new_with_class_style(syntax, &syntax_set, ClassStyle::Spaced);

	for line in LinesWithEndings::from(&text) {
			rs_html_generator.parse_html_for_line_which_includes_newline(&line)
	}

	rs_html_generator.finalize()
}

rustler::init!("Elixir.Ketbin.Utils.Syntax", [add, highlight_text]);
