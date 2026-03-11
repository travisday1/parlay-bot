FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . ./engines/pod/
COPY ../../shared/ ./shared/
CMD ["python", "engines/pod/engine.py"]
