.DEFAULT_GOAL := up
.PHONY: up demo down down-v seed

up:
	docker compose up -d --build

down:
	docker compose down

down-v:
	docker compose down -v

seed:
	docker compose up -d --wait postgres
	docker compose run --rm migrator
	docker compose exec -T postgres sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"' < infra/postgres/seed.sql
