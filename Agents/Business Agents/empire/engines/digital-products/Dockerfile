FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . ./engines/digital-products/
COPY ../../shared/ ./shared/
CMD ["python", "engines/digital-products/engine.py"]
