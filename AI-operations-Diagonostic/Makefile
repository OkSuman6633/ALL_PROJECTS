.PHONY: install-api test-api run-api install-web run-web
install-api:
	python -m pip install -r api/requirements.txt
test-api:
	cd api && python -m pytest -q
run-api:
	cd api && python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
install-web:
	cd web && npm install
run-web:
	cd web && npm run dev
