# Katbin

To start your Phoenix server:

  * Copy `config/dev.secret.sample.exs` to `config/dev.secret.exs`
  * Fill in the SMTP and database configuration in `config/dev.secret.exs`
  * Install dependencies with `mix deps.get`
  * Create and migrate your database with `mix ecto.setup`
  * Install Node.js dependencies with `npm install` inside the `assets` directory
  * Start Phoenix endpoint with `mix phx.server`

Now you can visit [`localhost:4000`](http://localhost:4000) from your browser.

# Self hosting

We recommend using our [official docker image](https://hub.docker.com/r/atechnohazard/katbin-elixir). If you wish to build your own docker image, the provided Dockerfile should work out of the box. If you run into any problems, please open an issue.

## Populating the environment
Copy the provided `sample.env` file to `.env`
```sh
cp sample.env .env
```

Fill in this new file with the required environment variables.

## Using the official docker image
```sh
docker run --env-file .env atechnohazard/katbin-elixir
```

## Building the docker image
```sh
git clone https://github.com/SphericalKat/katbin
cd katbin
docker build -t <username>/katbin .
```

## Running the built docker image
```sh
docker run --env-file .env <username>/katbin
```

For other methods of self hosting, please check the [official Phoenix deployment guides](https://hexdocs.pm/phoenix/deployment.html).


## Learn more

  * Official website: https://www.phoenixframework.org/
  * Guides: https://hexdocs.pm/phoenix/overview.html
  * Docs: https://hexdocs.pm/phoenix
  * Forum: https://elixirforum.com/c/phoenix-forum
  * Source: https://github.com/phoenixframework/phoenix
