package collectors

import (
	"bufio"
	"errors"
	"os"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/HackintoshMatrix7132/NodeGuard/agent/internal/model"
)

type cpuCounters struct {
	total uint64
	idle  uint64
}

type MetricsCollector struct {
	mu       sync.Mutex
	previous *cpuCounters
}

func readMemInfo() map[string]uint64 {
	values := map[string]uint64{}
	file, err := os.Open("/proc/meminfo")
	if err != nil {
		return values
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 2 {
			continue
		}
		value, err := strconv.ParseUint(fields[1], 10, 64)
		if err == nil {
			values[strings.TrimSuffix(fields[0], ":")] = value * 1024
		}
	}
	return values
}

func readCPUCounters() (cpuCounters, error) {
	data, err := os.ReadFile("/proc/stat")
	if err != nil {
		return cpuCounters{}, err
	}
	line := strings.SplitN(string(data), "\n", 2)[0]
	fields := strings.Fields(line)
	if len(fields) < 5 || fields[0] != "cpu" {
		return cpuCounters{}, errors.New("unexpected /proc/stat format")
	}
	values := make([]uint64, 0, len(fields)-1)
	for _, field := range fields[1:] {
		value, err := strconv.ParseUint(field, 10, 64)
		if err != nil {
			return cpuCounters{}, err
		}
		values = append(values, value)
	}
	var total uint64
	for _, value := range values {
		total += value
	}
	idle := values[3]
	if len(values) > 4 {
		idle += values[4]
	}
	return cpuCounters{total: total, idle: idle}, nil
}

func percentage(used, total uint64) *float64 {
	if total == 0 || used > total {
		return nil
	}
	value := float64(used) / float64(total) * 100
	return &value
}

func memoryValues(values map[string]uint64) (memoryUsed, memoryTotal *uint64, memoryPercent *float64, swapUsed, swapTotal *uint64, swapPercent *float64) {
	total, available := values["MemTotal"], values["MemAvailable"]
	if total > 0 && available <= total {
		used := total - available
		memoryUsed, memoryTotal, memoryPercent = &used, &total, percentage(used, total)
	}
	if totalSwap := values["SwapTotal"]; totalSwap > 0 {
		freeSwap := values["SwapFree"]
		if freeSwap <= totalSwap {
			used := totalSwap - freeSwap
			swapUsed, swapTotal, swapPercent = &used, &totalSwap, percentage(used, totalSwap)
		}
	}
	return
}

func (collector *MetricsCollector) cpuUsage() *float64 {
	collector.mu.Lock()
	defer collector.mu.Unlock()
	current, err := readCPUCounters()
	if err != nil {
		return nil
	}
	var previous cpuCounters
	if collector.previous == nil {
		previous = current
		time.Sleep(200 * time.Millisecond)
		current, err = readCPUCounters()
		if err != nil {
			return nil
		}
	} else {
		previous = *collector.previous
	}
	collector.previous = &current
	if current.total <= previous.total || current.idle < previous.idle {
		return nil
	}
	totalDelta := current.total - previous.total
	idleDelta := current.idle - previous.idle
	if totalDelta == 0 || idleDelta > totalDelta {
		return nil
	}
	value := float64(totalDelta-idleDelta) / float64(totalDelta) * 100
	return &value
}

func loadAverages() (*float64, *float64, *float64) {
	data, err := os.ReadFile("/proc/loadavg")
	if err != nil {
		return nil, nil, nil
	}
	fields := strings.Fields(string(data))
	if len(fields) < 3 {
		return nil, nil, nil
	}
	values := make([]*float64, 3)
	for index := 0; index < 3; index++ {
		value, err := strconv.ParseFloat(fields[index], 64)
		if err == nil && value >= 0 {
			values[index] = &value
		}
	}
	return values[0], values[1], values[2]
}

func rootDisk() (*uint64, *uint64, *float64) {
	var stats syscall.Statfs_t
	if err := syscall.Statfs("/", &stats); err != nil || stats.Blocks == 0 {
		return nil, nil, nil
	}
	total := stats.Blocks * uint64(stats.Bsize)
	available := stats.Bavail * uint64(stats.Bsize)
	used := total - available
	return &used, &total, percentage(used, total)
}

func (collector *MetricsCollector) Collect() model.MetricSample {
	memoryUsed, memoryTotal, memoryPercent, swapUsed, swapTotal, swapPercent := memoryValues(readMemInfo())
	diskUsed, diskTotal, diskPercent := rootDisk()
	load1, load5, load15 := loadAverages()
	uptimeSeconds, _ := uptime()
	return model.MetricSample{
		Timestamp: time.Now().UTC(), CPUUsagePercent: collector.cpuUsage(),
		MemoryUsedBytes: memoryUsed, MemoryTotalBytes: memoryTotal, MemoryUsagePercent: memoryPercent,
		DiskUsedBytes: diskUsed, DiskTotalBytes: diskTotal, DiskUsagePercent: diskPercent,
		SwapUsedBytes: swapUsed, SwapTotalBytes: swapTotal, SwapUsagePercent: swapPercent,
		LoadAverage1: load1, LoadAverage5: load5, LoadAverage15: load15, SystemUptimeSeconds: uptimeSeconds,
	}
}
