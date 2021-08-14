.PHONY: image
image:
	docker build -t atechnohazard/katbin-elixir .

.PHONY: push
push:
	docker push atechnohazard/katbin-elixir