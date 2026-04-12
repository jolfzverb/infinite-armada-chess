.PHONY: dev build serve

# Dev server on :1234, proxies /api and /ws to backend on :8080
dev:
	npm run dev

build:
	npm run build

serve: build
	python3 -m http.server 8080 --directory dist
