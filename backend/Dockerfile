FROM python:3.12-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
RUN useradd --create-home api
COPY main.py queries.py checkout.py payments.py schema.sql ./
USER api
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM runtime AS test
USER root
COPY requirements-test.txt ./
RUN pip install --no-cache-dir -r requirements-test.txt
COPY tests ./tests
USER api
CMD ["python", "-m", "unittest", "discover", "-s", "tests", "-v"]
