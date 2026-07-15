SHELL := /bin/sh

VERSION ?= 0.3.0
COMMIT ?= $(shell git rev-parse --short HEAD 2>/dev/null || printf development)
DATE ?= $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS := -s -w -X github.com/HackintoshMatrix7132/NodeGuard/agent/internal/version.Version=$(VERSION) -X github.com/HackintoshMatrix7132/NodeGuard/agent/internal/version.Commit=$(COMMIT) -X github.com/HackintoshMatrix7132/NodeGuard/agent/internal/version.Date=$(DATE)

.PHONY: build build-linux-amd64 build-linux-arm64 release installer-test test vet fmt fmt-check clean

build:
	mkdir -p bin
	go build -trimpath -ldflags "$(LDFLAGS)" -o bin/nodeguard-agent ./cmd/nodeguard-agent

build-linux-amd64:
	mkdir -p bin
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "$(LDFLAGS)" -o bin/nodeguard-agent-linux-amd64 ./cmd/nodeguard-agent

build-linux-arm64:
	mkdir -p bin
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags "$(LDFLAGS)" -o bin/nodeguard-agent-linux-arm64 ./cmd/nodeguard-agent

release: clean build-linux-amd64 build-linux-arm64
	cd bin && sha256sum nodeguard-agent-linux-amd64 nodeguard-agent-linux-arm64 > checksums.txt

installer-test:
	./tests/install-agent_test.sh

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
