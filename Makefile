.PHONY: dev build test db\:migrate db\:seed local-models docker-up docker-down

dev:
	pnpm dev

build:
	pnpm build

test:
	pnpm test

db\:migrate:
	pnpm db:migrate

db\:seed:
	pnpm db:seed

local-models:
	ollama pull qwen3:8b && ollama serve

docker-up:
	docker-compose up -d

docker-down:
	docker-compose down
