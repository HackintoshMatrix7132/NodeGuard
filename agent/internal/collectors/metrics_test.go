package collectors

import "testing"

func TestMissingSwapIsUnavailable(t *testing.T) {
	_, _, _, swapUsed, swapTotal, swapPercent := memoryValues(map[string]uint64{
		"MemTotal": 1024, "MemAvailable": 512, "SwapTotal": 0, "SwapFree": 0,
	})
	if swapUsed != nil || swapTotal != nil || swapPercent != nil {
		t.Fatal("missing swap was reported as a false zero value")
	}
}

func TestMemoryUsage(t *testing.T) {
	used, total, percent, _, _, _ := memoryValues(map[string]uint64{"MemTotal": 1000, "MemAvailable": 250})
	if used == nil || *used != 750 || total == nil || *total != 1000 || percent == nil || *percent != 75 {
		t.Fatal("memory usage was not normalized correctly")
	}
}

func TestFirstCPUCollectionUsesARealDelta(t *testing.T) {
	sample := (&MetricsCollector{}).Collect()
	if sample.CPUUsagePercent == nil || *sample.CPUUsagePercent < 0 || *sample.CPUUsagePercent > 100 {
		t.Fatal("first CPU sample did not contain a valid measured delta")
	}
}
