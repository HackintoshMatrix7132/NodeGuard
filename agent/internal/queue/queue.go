package queue

import (
	"sync"
	"time"
)

type Item struct {
	Path      string
	Payload   any
	CreatedAt time.Time
}

type Queue struct {
	mu       sync.Mutex
	items    []Item
	maxItems int
	maxAge   time.Duration
}

func New(maxItems int, maxAge time.Duration) *Queue {
	return &Queue{maxItems: maxItems, maxAge: maxAge}
}

func (queue *Queue) Add(item Item) {
	queue.mu.Lock()
	defer queue.mu.Unlock()
	queue.pruneLocked(time.Now())
	if item.Path == "/api/agent/heartbeat" || item.Path == "/api/agent/inventory" || item.Path == "/api/agent/docker" || item.Path == "/api/agent/updates" {
		filtered := queue.items[:0]
		for _, existing := range queue.items {
			if existing.Path != item.Path {
				filtered = append(filtered, existing)
			}
		}
		queue.items = filtered
	}
	queue.items = append(queue.items, item)
	if len(queue.items) > queue.maxItems {
		queue.items = queue.items[len(queue.items)-queue.maxItems:]
	}
}

func (queue *Queue) Peek() (Item, bool) {
	queue.mu.Lock()
	defer queue.mu.Unlock()
	queue.pruneLocked(time.Now())
	if len(queue.items) == 0 {
		return Item{}, false
	}
	return queue.items[0], true
}

func (queue *Queue) RemoveFirst() {
	queue.mu.Lock()
	defer queue.mu.Unlock()
	if len(queue.items) > 0 {
		queue.items = queue.items[1:]
	}
}

func (queue *Queue) Len() int {
	queue.mu.Lock()
	defer queue.mu.Unlock()
	queue.pruneLocked(time.Now())
	return len(queue.items)
}

func (queue *Queue) pruneLocked(now time.Time) {
	cutoff := now.Add(-queue.maxAge)
	first := 0
	for first < len(queue.items) && queue.items[first].CreatedAt.Before(cutoff) {
		first++
	}
	queue.items = queue.items[first:]
}
