package updates

import (
	"context"

	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/model"
)

const (
	SchemaVersion      = 1
	MaximumPackageRows = 500
)

type UpdateProvider interface {
	Name() string
	Supported() bool
	Check(ctx context.Context) model.UpdateInventory
}
