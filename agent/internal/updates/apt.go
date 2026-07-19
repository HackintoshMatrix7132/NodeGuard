package updates

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/model"
)

const (
	metadataRefreshTimeout  = 5 * time.Minute
	updateQueryTimeout      = 2 * time.Minute
	proxmoxQueryTimeout     = 10 * time.Second
	maximumPackageNameBytes = 128
	maximumVersionBytes     = 192
	maximumSourceBytes      = 96
)

type APTProviderOptions struct {
	Runner             CommandRunner
	LockChecker        PackageLockChecker
	OSReleasePath      string
	RebootRequiredPath string
	MaxPackages        int
	Now                func() time.Time
}

type APTProvider struct {
	runner             CommandRunner
	lockChecker        PackageLockChecker
	osReleasePath      string
	rebootRequiredPath string
	maxPackages        int
	now                func() time.Time
}

type osRelease struct {
	id         string
	idLike     []string
	versionID  string
	prettyName string
}

func NewAPTProvider() *APTProvider {
	return NewAPTProviderWithOptions(APTProviderOptions{})
}

func NewAPTProviderWithOptions(options APTProviderOptions) *APTProvider {
	if options.Runner == nil {
		options.Runner = SystemCommandRunner{}
	}
	if options.LockChecker == nil {
		options.LockChecker = NewSystemPackageLockChecker()
	}
	if options.OSReleasePath == "" {
		options.OSReleasePath = "/etc/os-release"
	}
	if options.RebootRequiredPath == "" {
		options.RebootRequiredPath = "/run/reboot-required"
	}
	if options.MaxPackages <= 0 || options.MaxPackages > MaximumPackageRows {
		options.MaxPackages = MaximumPackageRows
	}
	if options.Now == nil {
		options.Now = time.Now
	}
	return &APTProvider{
		runner: options.Runner, lockChecker: options.LockChecker, osReleasePath: options.OSReleasePath,
		rebootRequiredPath: options.RebootRequiredPath, maxPackages: options.MaxPackages, now: options.Now,
	}
}

func (provider *APTProvider) Name() string {
	return "apt"
}

func parseOSRelease(path string) (osRelease, error) {
	file, err := os.Open(path)
	if err != nil {
		return osRelease{}, err
	}
	defer file.Close()
	values := map[string]string{}
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, found := strings.Cut(line, "=")
		if !found {
			return osRelease{}, fmt.Errorf("malformed os-release entry")
		}
		key = strings.TrimSpace(key)
		if key == "" {
			return osRelease{}, fmt.Errorf("empty os-release key")
		}
		value = strings.TrimSpace(value)
		if strings.HasPrefix(value, "\"") || strings.HasSuffix(value, "\"") {
			if len(value) < 2 || value[0] != '"' || value[len(value)-1] != '"' {
				return osRelease{}, fmt.Errorf("malformed quoted os-release value")
			}
			unquoted, unquoteError := strconv.Unquote(value)
			if unquoteError != nil {
				return osRelease{}, fmt.Errorf("invalid quoted os-release value")
			}
			value = unquoted
		}
		values[key] = value
	}
	if err := scanner.Err(); err != nil {
		return osRelease{}, err
	}
	id := strings.ToLower(strings.TrimSpace(values["ID"]))
	if id == "" {
		return osRelease{}, fmt.Errorf("os-release ID is missing")
	}
	prettyName := strings.TrimSpace(values["PRETTY_NAME"])
	if prettyName == "" {
		prettyName = strings.TrimSpace(values["NAME"])
	}
	return osRelease{
		id: id, idLike: strings.Fields(strings.ToLower(values["ID_LIKE"])),
		versionID: strings.TrimSpace(values["VERSION_ID"]), prettyName: prettyName,
	}, nil
}

func supportsAPT(info osRelease) bool {
	if info.id == "debian" || info.id == "ubuntu" {
		return true
	}
	for _, value := range info.idLike {
		if value == "debian" || value == "ubuntu" {
			return true
		}
	}
	return false
}

func (provider *APTProvider) Supported() bool {
	info, err := parseOSRelease(provider.osReleasePath)
	return err == nil && supportsAPT(info)
}

func modelOS(info osRelease) model.UpdateOS {
	return model.UpdateOS{ID: clip(info.id, 64), VersionID: clip(info.versionID, 64), PrettyName: clip(info.prettyName, 120)}
}

func safeError(code, message string) (*string, *string) {
	return &code, &message
}

func (provider *APTProvider) failure(info osRelease, supported bool, status model.UpdateStatus, code, message string) model.UpdateInventory {
	errorCode, errorMessage := safeError(code, message)
	return model.UpdateInventory{
		SchemaVersion: SchemaVersion, Provider: provider.Name(), Supported: supported, Status: status,
		OS: modelOS(info), CheckedAt: provider.now().UTC(), Packages: []model.PackageUpdate{},
		ErrorCode: errorCode, ErrorMessage: errorMessage,
	}
}

func commandOutput(result CommandResult) string {
	return strings.ToLower(result.Stdout + "\n" + result.Stderr)
}

func packageManagerBusy(result CommandResult) bool {
	output := commandOutput(result)
	if strings.Contains(output, "permission denied") || strings.Contains(output, "read-only file system") {
		return false
	}
	for _, marker := range []string{
		"could not get lock", "unable to acquire the dpkg frontend lock", "unable to lock directory",
		"waiting for cache lock", "is another process using it", "could not open lock file",
	} {
		if strings.Contains(output, marker) {
			return true
		}
	}
	return false
}

func metadataArgs() []string {
	return []string{
		"-q", "-o", "Dpkg::Use-Pty=0", "-o", "Acquire::Languages=none", "-o", "DPkg::Lock::Timeout=0",
		"-o", "APT::Update::Error-Mode=any", "-o", "Dir::Cache::pkgcache=", "-o", "Dir::Cache::srcpkgcache=", "update",
	}
}

func queryArgs() []string {
	return []string{
		"-o", "APT::Color=0", "-o", "Dpkg::Use-Pty=0", "list", "--upgradable",
	}
}

func withTimeout(parent context.Context, timeout time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(parent, timeout)
}

func (provider *APTProvider) detectProxmox(ctx context.Context, info *osRelease) {
	if !provider.runner.Available("pveversion") {
		return
	}
	queryContext, cancel := withTimeout(ctx, proxmoxQueryTimeout)
	result, err := provider.runner.Run(queryContext, "pveversion")
	cancel()
	if err != nil {
		return
	}
	version := ""
	line := strings.TrimSpace(strings.SplitN(result.Stdout, "\n", 2)[0])
	if slash := strings.IndexByte(line, '/'); slash >= 0 {
		fields := strings.Fields(line[slash+1:])
		if len(fields) > 0 {
			version = fields[0]
			if separator := strings.IndexByte(version, '/'); separator >= 0 {
				version = version[:separator]
			}
		}
	}
	info.id = "proxmox"
	info.versionID = clip(version, 64)
	info.prettyName = "Proxmox VE"
	if info.versionID != "" {
		info.prettyName += " " + info.versionID
	}
}

func (provider *APTProvider) checkPackageLocks(info osRelease) (model.UpdateInventory, bool) {
	busy, err := provider.lockChecker.Busy()
	if err != nil {
		return provider.failure(info, true, model.UpdateStatusCheckFailed, "package_lock_check_failed", "The package manager lock state could not be checked safely."), false
	}
	if busy {
		return provider.failure(info, true, model.UpdateStatusPackageManagerBusy, "package_manager_busy", "The package manager is currently busy. NodeGuard will retry automatically."), false
	}
	return model.UpdateInventory{}, true
}

func (provider *APTProvider) Check(ctx context.Context) model.UpdateInventory {
	info, err := parseOSRelease(provider.osReleasePath)
	if err != nil {
		return provider.failure(info, true, model.UpdateStatusCheckFailed, "os_detection_failed", "Operating system information could not be read safely.")
	}
	if !supportsAPT(info) {
		return provider.failure(info, false, model.UpdateStatusUnsupported, "unsupported_os", "Update discovery is not available for this operating system.")
	}
	provider.detectProxmox(ctx, &info)
	if !provider.runner.Available("apt-get") || !provider.runner.Available("apt") {
		return provider.failure(info, true, model.UpdateStatusCheckFailed, "apt_unavailable", "The required APT tools are not available on this machine.")
	}
	if inventory, ready := provider.checkPackageLocks(info); !ready {
		return inventory
	}

	refreshContext, cancelRefresh := withTimeout(ctx, metadataRefreshTimeout)
	refreshResult, refreshError := provider.runner.Run(refreshContext, "apt-get", metadataArgs()...)
	refreshContextError := refreshContext.Err()
	cancelRefresh()
	if refreshError != nil {
		if errors.Is(refreshError, ErrCommandOutputTooLarge) {
			return provider.failure(info, true, model.UpdateStatusMetadataRefreshFailed, "metadata_output_too_large", "APT package metadata refresh produced too much diagnostic output.")
		}
		if packageManagerBusy(refreshResult) {
			return provider.failure(info, true, model.UpdateStatusPackageManagerBusy, "package_manager_busy", "The package manager is currently busy. NodeGuard will retry automatically.")
		}
		if errors.Is(refreshContextError, context.DeadlineExceeded) || errors.Is(refreshError, context.DeadlineExceeded) {
			return provider.failure(info, true, model.UpdateStatusMetadataRefreshFailed, "metadata_refresh_timeout", "APT package metadata refresh timed out.")
		}
		return provider.failure(info, true, model.UpdateStatusMetadataRefreshFailed, "metadata_refresh_failed", "APT package metadata could not be refreshed.")
	}
	if inventory, ready := provider.checkPackageLocks(info); !ready {
		return inventory
	}

	queryContext, cancelQuery := withTimeout(ctx, updateQueryTimeout)
	queryResult, queryError := provider.runner.Run(queryContext, "apt", queryArgs()...)
	queryContextError := queryContext.Err()
	cancelQuery()
	if queryError != nil {
		if errors.Is(queryError, ErrCommandOutputTooLarge) {
			return provider.failure(info, true, model.UpdateStatusCheckFailed, "check_output_too_large", "APT returned an update list that exceeded the safe output limit.")
		}
		if packageManagerBusy(queryResult) {
			return provider.failure(info, true, model.UpdateStatusPackageManagerBusy, "package_manager_busy", "The package manager is currently busy. NodeGuard will retry automatically.")
		}
		if errors.Is(queryContextError, context.DeadlineExceeded) || errors.Is(queryError, context.DeadlineExceeded) {
			return provider.failure(info, true, model.UpdateStatusCheckFailed, "check_timeout", "APT update discovery timed out.")
		}
		return provider.failure(info, true, model.UpdateStatusCheckFailed, "check_failed", "APT could not determine the available package updates.")
	}

	packages, total, securityCount, parseError := parseUpgradableList(queryResult.Stdout, provider.maxPackages)
	if parseError != nil {
		return provider.failure(info, true, model.UpdateStatusCheckFailed, "malformed_apt_output", "APT returned an unexpected update list.")
	}
	rebootRequired, rebootError := rebootRequired(provider.rebootRequiredPath)
	if rebootError != nil {
		return provider.failure(info, true, model.UpdateStatusCheckFailed, "reboot_state_unavailable", "The reboot-required state could not be read safely.")
	}
	checkedAt := provider.now().UTC()
	return model.UpdateInventory{
		SchemaVersion: SchemaVersion, Provider: provider.Name(), Supported: true, Status: model.UpdateStatusOK,
		OS: modelOS(info), CheckedAt: checkedAt, LastSuccessfulAt: &checkedAt,
		UpdateCount: total, SecurityUpdateCount: securityCount, RebootRequired: &rebootRequired,
		Truncated: total > len(packages), Packages: packages,
	}
}

func rebootRequired(path string) (bool, error) {
	_, err := os.Stat(path)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	return false, err
}

func parseUpgradableList(output string, maxPackages int) ([]model.PackageUpdate, int, int, error) {
	if maxPackages <= 0 || maxPackages > MaximumPackageRows {
		maxPackages = MaximumPackageRows
	}
	byName := map[string]model.PackageUpdate{}
	recognizedListing := false
	scanner := bufio.NewScanner(strings.NewReader(output))
	scanner.Buffer(make([]byte, 4096), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "Listing...") {
			recognizedListing = true
			continue
		}
		if line == "" || strings.HasPrefix(line, "WARNING:") ||
			strings.HasPrefix(line, "apt does not have a stable CLI interface") {
			continue
		}
		update, err := parseUpgradableLine(line)
		if err != nil {
			return nil, 0, 0, err
		}
		byName[update.Name] = update
	}
	if err := scanner.Err(); err != nil {
		return nil, 0, 0, err
	}
	if !recognizedListing && len(byName) == 0 {
		return nil, 0, 0, errors.New("APT update listing was empty or unrecognized")
	}
	all := make([]model.PackageUpdate, 0, len(byName))
	securityCount := 0
	for _, update := range byName {
		all = append(all, update)
		if update.Security {
			securityCount++
		}
	}
	sort.Slice(all, func(left, right int) bool { return all[left].Name < all[right].Name })
	total := len(all)
	if len(all) > maxPackages {
		all = all[:maxPackages]
	}
	return all, total, securityCount, nil
}

const upgradableFromMarker = " [upgradable from: "

func parseUpgradableLine(line string) (model.PackageUpdate, error) {
	marker := strings.LastIndex(line, upgradableFromMarker)
	if marker <= 0 || !strings.HasSuffix(line, "]") {
		return model.PackageUpdate{}, fmt.Errorf("missing upgradable version marker")
	}
	installed := strings.TrimSpace(line[marker+len(upgradableFromMarker) : len(line)-1])
	fields := strings.Fields(strings.TrimSpace(line[:marker]))
	if len(fields) != 3 {
		return model.PackageUpdate{}, fmt.Errorf("unexpected upgradable package fields")
	}
	nameAndSources := fields[0]
	slash := strings.IndexByte(nameAndSources, '/')
	if slash <= 0 || slash == len(nameAndSources)-1 {
		return model.PackageUpdate{}, fmt.Errorf("missing package source")
	}
	name := clip(nameAndSources[:slash], maximumPackageNameBytes)
	sourceText := nameAndSources[slash+1:]
	candidate := clip(fields[1], maximumVersionBytes)
	installed = clip(installed, maximumVersionBytes)
	if name == "" || candidate == "" || installed == "" {
		return model.PackageUpdate{}, fmt.Errorf("empty package update field")
	}
	security := isSecuritySource(sourceText)
	sourceValue := normalizeSource(sourceText)
	var source *string
	if sourceValue != "" {
		source = &sourceValue
	}
	return model.PackageUpdate{
		Name: name, InstalledVersion: installed, CandidateVersion: candidate,
		Security: security, Source: source,
	}, nil
}

func isSecuritySource(value string) bool {
	normalized := strings.ToLower(value)
	return strings.Contains(normalized, "-security") || strings.Contains(normalized, "debian-security") ||
		strings.Contains(normalized, "/security") || strings.Contains(normalized, " security")
}

func normalizeSource(value string) string {
	if strings.Contains(value, "://") || strings.Contains(value, "@") {
		return ""
	}
	selected := ""
	for _, token := range strings.FieldsFunc(value, func(character rune) bool {
		return unicode.IsSpace(character) || character == ','
	}) {
		token = strings.Trim(token, "()[]")
		if separator := strings.LastIndexByte(token, '/'); separator >= 0 {
			token = token[separator+1:]
		} else if separator := strings.IndexByte(token, ':'); separator >= 0 {
			token = token[:separator]
		}
		if token == "" || !isSafeSourceToken(token) {
			continue
		}
		if selected == "" {
			selected = token
		}
		if isSecuritySource(token) {
			selected = token
			break
		}
	}
	return clip(selected, maximumSourceBytes)
}

func isASCIIAlphaNumeric(character rune) bool {
	return character >= 'a' && character <= 'z' || character >= 'A' && character <= 'Z' || character >= '0' && character <= '9'
}

func isSafeSourceToken(value string) bool {
	for index, character := range value {
		if !isASCIIAlphaNumeric(character) && (index == 0 || !strings.ContainsRune("._+-", character)) {
			return false
		}
	}
	return true
}

func clip(value string, maximum int) string {
	value = strings.TrimSpace(value)
	if len(value) <= maximum {
		return value
	}
	end := maximum
	for end > 0 && !utf8.ValidString(value[:end]) {
		end--
	}
	return value[:end]
}
