.PHONY: dev build serve

dev:
	npm run dev

build:
	npm run build

serve: build
	python3 -m http.server 8080 --directory dist
