package collectors

import (
	"bufio"
	"fmt"
	"net"
	"os"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/model"
)

func pointer[T any](value T) *T {
	return &value
}

func readTrimmed(path string) *string {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	value := strings.TrimSpace(string(data))
	if value == "" {
		return nil
	}
	return &value
}

func osRelease() (*string, *string) {
	file, err := os.Open("/etc/os-release")
	if err != nil {
		return nil, nil
	}
	defer file.Close()
	values := map[string]string{}
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		key, value, found := strings.Cut(scanner.Text(), "=")
		if found {
			values[key] = strings.Trim(strings.TrimSpace(value), "\"")
		}
	}
	name := values["PRETTY_NAME"]
	if name == "" {
		name = values["NAME"]
	}
	version := values["VERSION_ID"]
	var namePointer, versionPointer *string
	if name != "" {
		namePointer = pointer(name)
	}
	if version != "" {
		versionPointer = pointer(version)
	}
	return namePointer, versionPointer
}

func cpuInformation() (*string, *int) {
	file, err := os.Open("/proc/cpuinfo")
	if err != nil {
		return nil, nil
	}
	defer file.Close()
	var modelName, physicalID, coreID string
	physicalCores := map[string]struct{}{}
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			if physicalID != "" || coreID != "" {
				physicalCores[physicalID+":"+coreID] = struct{}{}
			}
			physicalID, coreID = "", ""
			continue
		}
		key, value, found := strings.Cut(line, ":")
		if !found {
			continue
		}
		switch strings.TrimSpace(key) {
		case "model name", "Hardware", "Processor":
			if modelName == "" {
				modelName = strings.TrimSpace(value)
			}
		case "physical id":
			physicalID = strings.TrimSpace(value)
		case "core id":
			coreID = strings.TrimSpace(value)
		}
	}
	if physicalID != "" || coreID != "" {
		physicalCores[physicalID+":"+coreID] = struct{}{}
	}
	var modelPointer *string
	if modelName != "" {
		modelPointer = pointer(modelName)
	}
	if len(physicalCores) == 0 {
		return modelPointer, nil
	}
	count := len(physicalCores)
	return modelPointer, &count
}

func memoryInformation() (*uint64, *uint64) {
	values := readMemInfo()
	memory, memoryFound := values["MemTotal"]
	swap, swapFound := values["SwapTotal"]
	var memoryPointer, swapPointer *uint64
	if memoryFound {
		memoryPointer = pointer(memory)
	}
	if swapFound && swap > 0 {
		swapPointer = pointer(swap)
	}
	return memoryPointer, swapPointer
}

func filesystemInformation() []model.Filesystem {
	file, err := os.Open("/proc/mounts")
	if err != nil {
		return nil
	}
	defer file.Close()
	allowed := map[string]bool{
		"ext2": true, "ext3": true, "ext4": true, "xfs": true, "btrfs": true,
		"zfs": true, "f2fs": true, "reiserfs": true, "jfs": true, "overlay": true,
	}
	seen := map[string]bool{}
	filesystems := make([]model.Filesystem, 0, 8)
	scanner := bufio.NewScanner(file)
	for scanner.Scan() && len(filesystems) < 128 {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 3 || !allowed[fields[2]] || seen[fields[1]] {
			continue
		}
		seen[fields[1]] = true
		var stats syscall.Statfs_t
		var total *uint64
		if err := syscall.Statfs(fields[1], &stats); err == nil {
			value := stats.Blocks * uint64(stats.Bsize)
			total = &value
		}
		device, mount, filesystem := fields[0], fields[1], fields[2]
		filesystems = append(filesystems, model.Filesystem{
			Device: &device, Mount: mount, Filesystem: &filesystem, TotalBytes: total,
		})
	}
	return filesystems
}

func ipAddresses() []string {
	interfaces, err := net.Interfaces()
	if err != nil {
		return nil
	}
	addresses := []string{}
	for _, networkInterface := range interfaces {
		if networkInterface.Flags&net.FlagUp == 0 || networkInterface.Flags&net.FlagLoopback != 0 {
			continue
		}
		entries, err := networkInterface.Addrs()
		if err != nil {
			continue
		}
		for _, entry := range entries {
			ip, _, err := net.ParseCIDR(entry.String())
			if err == nil && !ip.IsLoopback() && !ip.IsLinkLocalUnicast() {
				addresses = append(addresses, ip.String())
			}
		}
	}
	sort.Strings(addresses)
	return addresses
}

func uptime() (*int64, *time.Time) {
	data, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return nil, nil
	}
	fields := strings.Fields(string(data))
	if len(fields) == 0 {
		return nil, nil
	}
	seconds, err := strconv.ParseFloat(fields[0], 64)
	if err != nil || seconds < 0 {
		return nil, nil
	}
	uptimeSeconds := int64(seconds)
	boot := time.Now().UTC().Add(-time.Duration(uptimeSeconds) * time.Second)
	return &uptimeSeconds, &boot
}

func CollectInventory(agentVersion string) (model.Inventory, error) {
	hostname, err := os.Hostname()
	if err != nil || strings.TrimSpace(hostname) == "" {
		return model.Inventory{}, fmt.Errorf("read hostname: %w", err)
	}
	osName, osVersion := osRelease()
	cpuModel, physicalCores := cpuInformation()
	memory, swap := memoryInformation()
	uptimeSeconds, bootTime := uptime()
	logicalCores := runtime.NumCPU()
	architecture := runtime.GOARCH
	return model.Inventory{
		Timestamp: time.Now().UTC(), Hostname: hostname, OSName: osName, OSVersion: osVersion,
		Kernel: readTrimmed("/proc/sys/kernel/osrelease"), Architecture: &architecture,
		CPUModel: cpuModel, PhysicalCoreCount: physicalCores, LogicalCPUCount: &logicalCores,
		TotalMemoryBytes: memory, TotalSwapBytes: swap, Filesystems: filesystemInformation(),
		IPAddresses: ipAddresses(), BootTime: bootTime, SystemUptimeSeconds: uptimeSeconds,
		AgentVersion: agentVersion,
	}, nil
}
