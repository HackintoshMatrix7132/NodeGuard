package queue

import (
	"sync"
	"time"
)

type Item struct {
	Path                string
	CoalesceKey         string
	Payload             any
	CreatedAt           time.Time
	RetainUntilReplaced bool
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
	if item.CoalesceKey != "" || item.Path == "/api/agent/heartbeat" || item.Path == "/api/agent/inventory" || item.Path == "/api/agent/docker" || item.Path == "/api/agent/updates" {
		coalesceKey := item.CoalesceKey
		if coalesceKey == "" {
			coalesceKey = item.Path
		}
		filtered := queue.items[:0]
		for _, existing := range queue.items {
			existingKey := existing.CoalesceKey
			if existingKey == "" {
				existingKey = existing.Path
			}
			if existingKey != coalesceKey {
				filtered = append(filtered, existing)
			}
		}
		queue.items = filtered
	}
	queue.items = append(queue.items, item)
	queue.trimLocked()
}

func (queue *Queue) trimLocked() {
	if queue.maxItems <= 0 {
		queue.items = nil
		return
	}
	if len(queue.items) > queue.maxItems {
		removeAt := -1
		for index, item := range queue.items {
			if !item.RetainUntilReplaced {
				removeAt = index
				break
			}
		}
		if removeAt < 0 {
			removeAt = 0
		}
		queue.items = append(queue.items[:removeAt], queue.items[removeAt+1:]...)
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
	filtered := queue.items[:0]
	for _, item := range queue.items {
		if !item.RetainUntilReplaced && item.CreatedAt.Before(cutoff) {
			continue
		}
		filtered = append(filtered, item)
	}
	queue.items = filtered
}
