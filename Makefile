.PHONY: image
image:
	docker build -t atechnohazard/katbin-elixir .

.PHONY: push
push: image
	docker push atechnohazard/katbin-elixir