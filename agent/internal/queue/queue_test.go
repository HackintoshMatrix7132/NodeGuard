package queue

import (
	"testing"
	"time"
)

func TestQueueIsBoundedAndCoalescesHeartbeats(t *testing.T) {
	buffer := New(3, time.Minute)
	buffer.Add(Item{Path: "/api/agent/heartbeat", Payload: 1, CreatedAt: time.Now()})
	buffer.Add(Item{Path: "/api/agent/heartbeat", Payload: 2, CreatedAt: time.Now()})
	if buffer.Len() != 1 {
		t.Fatalf("heartbeat queue length = %d, want 1", buffer.Len())
	}
	for index := 0; index < 5; index++ {
		buffer.Add(Item{Path: "/api/agent/metrics", Payload: index, CreatedAt: time.Now()})
	}
	if buffer.Len() != 3 {
		t.Fatalf("bounded queue length = %d, want 3", buffer.Len())
	}
}

func TestQueueDropsExpiredItems(t *testing.T) {
	buffer := New(10, time.Second)
	buffer.Add(Item{Path: "/old", CreatedAt: time.Now().Add(-time.Minute)})
	if buffer.Len() != 0 {
		t.Fatal("expired report remained in queue")
	}
}

func TestQueueCoalescesUpdateInventories(t *testing.T) {
	buffer := New(10, time.Minute)
	buffer.Add(Item{Path: "/api/agent/updates", Payload: 1, CreatedAt: time.Now()})
	buffer.Add(Item{Path: "/api/agent/updates", Payload: 2, CreatedAt: time.Now()})
	if buffer.Len() != 1 {
		t.Fatalf("update inventory queue length = %d, want 1", buffer.Len())
	}
	item, ok := buffer.Peek()
	if !ok || item.Payload != 2 {
		t.Fatal("newest update inventory did not replace the older snapshot")
	}
}

func TestRetainedUpdateSurvivesExpiryAndCapacityPressure(t *testing.T) {
	buffer := New(3, time.Second)
	buffer.Add(Item{
		Path: "/api/agent/updates", Payload: 1, CreatedAt: time.Now().Add(-time.Hour),
		RetainUntilReplaced: true,
	})
	for index := 0; index < 8; index++ {
		buffer.Add(Item{Path: "/api/agent/metrics", Payload: index, CreatedAt: time.Now()})
	}
	if buffer.Len() != 3 {
		t.Fatalf("queue length = %d, want 3", buffer.Len())
	}
	foundUpdate := false
	for _, item := range buffer.items {
		if item.Path == "/api/agent/updates" {
			foundUpdate = true
			if item.Payload != 1 {
				t.Fatalf("retained update payload = %v, want 1", item.Payload)
			}
		}
	}
	if !foundUpdate {
		t.Fatal("latest update inventory was evicted by expiry or capacity pressure")
	}

	buffer.Add(Item{Path: "/api/agent/updates", Payload: 2, CreatedAt: time.Now(), RetainUntilReplaced: true})
	updateCount := 0
	for _, item := range buffer.items {
		if item.Path == "/api/agent/updates" {
			updateCount++
			if item.Payload != 2 {
				t.Fatalf("newest retained update payload = %v, want 2", item.Payload)
			}
		}
	}
	if updateCount != 1 {
		t.Fatalf("retained update count = %d, want 1", updateCount)
	}
}
