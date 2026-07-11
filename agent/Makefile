SHELL := /bin/sh

VERSION ?= 0.1.0
COMMIT ?= $(shell git rev-parse --short HEAD 2>/dev/null || printf development)
DATE ?= $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS := -s -w -X github.com/HackintoshMatrix7132/NodeGuard/agent/internal/version.Version=$(VERSION) -X github.com/HackintoshMatrix7132/NodeGuard/agent/internal/version.Commit=$(COMMIT) -X github.com/HackintoshMatrix7132/NodeGuard/agent/internal/version.Date=$(DATE)

.PHONY: build build-linux-amd64 build-linux-arm64 test vet fmt fmt-check clean

build:
	mkdir -p bin
	go build -trimpath -ldflags "$(LDFLAGS)" -o bin/nodeguard-agent ./cmd/nodeguard-agent

build-linux-amd64:
	mkdir -p bin
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "$(LDFLAGS)" -o bin/nodeguard-agent-linux-amd64 ./cmd/nodeguard-agent

build-linux-arm64:
	mkdir -p bin
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags "$(LDFLAGS)" -o bin/nodeguard-agent-linux-arm64 ./cmd/nodeguard-agent

test:
	go test ./...

vet:
	go vet ./...

fmt:
	gofmt -w $$(find . -name '*.go' -type f)

fmt-check:
	test -z "$$(gofmt -l $$(find . -name '*.go' -type f))"

clean:
	rm -rf bin
