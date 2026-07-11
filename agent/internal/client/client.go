package client

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/config"
	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/model"
)

const userAgent = "NodeGuard-Agent/0.1.0"

type APIError struct {
	StatusCode int
	Code       string
	Message    string
}

func (err *APIError) Error() string {
	return fmt.Sprintf("NodeGuard API returned %d (%s): %s", err.StatusCode, err.Code, err.Message)
}

type Client struct {
	serverURL  string
	agentID    string
	credential string
	http       *http.Client
}

func New(cfg config.Config) *Client {
	return &Client{
		serverURL:  cfg.ServerURL,
		agentID:    cfg.AgentID,
		credential: cfg.Credential,
		http:       &http.Client{Timeout: 20 * time.Second},
	}
}

func Register(ctx context.Context, serverURL string, request model.RegistrationRequest) (model.RegistrationResponse, error) {
	var response model.RegistrationResponse
	client := &Client{serverURL: strings.TrimRight(serverURL, "/"), http: &http.Client{Timeout: 20 * time.Second}}
	if err := client.doJSON(ctx, http.MethodPost, "/api/agent/register", request, &response, false); err != nil {
		return response, err
	}
	if response.AgentID == "" || response.Credential == "" {
		return response, errors.New("registration response did not include agent credentials")
	}
	return response, nil
}

func (client *Client) Post(ctx context.Context, path string, payload any) error {
	return client.doJSON(ctx, http.MethodPost, path, payload, nil, true)
}

func (client *Client) Status(ctx context.Context) (model.AgentStatus, error) {
	var status model.AgentStatus
	err := client.doJSON(ctx, http.MethodGet, "/api/agent/status", nil, &status, true)
	return status, err
}

func (client *Client) doJSON(ctx context.Context, method string, path string, payload any, output any, authenticated bool) error {
	var body io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return fmt.Errorf("encode request: %w", err)
		}
		body = bytes.NewReader(encoded)
	}
	request, err := http.NewRequestWithContext(ctx, method, client.serverURL+path, body)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("User-Agent", userAgent)
	if payload != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if authenticated {
		request.Header.Set("Authorization", "Bearer "+client.credential)
		request.Header.Set("X-NodeGuard-Agent-ID", client.agentID)
	}
	response, err := client.http.Do(request)
	if err != nil {
		return fmt.Errorf("send request: %w", err)
	}
	defer response.Body.Close()
	limited := io.LimitReader(response.Body, 2*1024*1024)
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		var apiError struct {
			Code    string `json:"error"`
			Message string `json:"message"`
		}
		_ = json.NewDecoder(limited).Decode(&apiError)
		if apiError.Message == "" {
			apiError.Message = http.StatusText(response.StatusCode)
		}
		return &APIError{StatusCode: response.StatusCode, Code: apiError.Code, Message: apiError.Message}
	}
	if output != nil {
		if err := json.NewDecoder(limited).Decode(output); err != nil {
			return fmt.Errorf("decode response: %w", err)
		}
	}
	return nil
}
