cd backend
# активировать venv
uvicorn main:app --reload --port 8000
# Swagger: http://localhost:8000/docs

python -m venv venv
venv\Scripts\activate