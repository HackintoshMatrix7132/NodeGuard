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
