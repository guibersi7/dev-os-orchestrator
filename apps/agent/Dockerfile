FROM python:3.13-alpine

WORKDIR /app
COPY . .

ENV PYTHONUNBUFFERED=1
EXPOSE 8090

CMD ["python", "-m", "agent"]
