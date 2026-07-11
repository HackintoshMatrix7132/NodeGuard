package logging

import (
	"log/slog"
	"os"
)

func New(component string) *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})).With("component", component)
}
