FROM golang:1.22-alpine AS builder

WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/devos-api ./cmd/api

FROM alpine:3.22

RUN addgroup -S devos && adduser -S devos -G devos
USER devos

WORKDIR /app
COPY --from=builder /out/devos-api /app/devos-api

ENV API_ADDR=:8080
EXPOSE 8080

CMD ["/app/devos-api"]
