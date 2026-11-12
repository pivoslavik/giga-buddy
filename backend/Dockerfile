FROM --platform=$BUILDPLATFORM golang:1.27-alpine AS builder

ARG TARGETOS
ARG TARGETARCH


WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -p 1 -trimpath -ldflags="-s -w" -o /app/server ./cmd/server

FROM alpine:3.20

ENV GIN_MODE=release

WORKDIR /app

COPY --from=builder /app/server /app/server

CMD ["./server"]
