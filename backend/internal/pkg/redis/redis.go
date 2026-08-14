package redisclient

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// Client wraps a go-redis client so callers can use it without caring about connection details.
type Client struct {
	rdb *redis.Client
}

// New creates a Redis client connected to the given address.
func New(addr string) *Client {
	rdb := redis.NewClient(&redis.Options{
		Addr: addr,
	})
	return &Client{rdb: rdb}
}

// Set stores a key-value pair with an expiration time.
func (c *Client) Set(ctx context.Context, key, value string, ttl time.Duration) error {
	return c.rdb.Set(ctx, key, value, ttl).Err()
}

// Get retrieves a value by key. Returns redis.Nil if the key doesn't exist.
func (c *Client) Get(ctx context.Context, key string) (string, error) {
	return c.rdb.Get(ctx, key).Result()
}

// Del deletes one or more keys.
func (c *Client) Del(ctx context.Context, keys ...string) error {
	return c.rdb.Del(ctx, keys...).Err()
}

// Exists checks whether a key exists in Redis.
func (c *Client) Exists(ctx context.Context, key string) (bool, error) {
	n, err := c.rdb.Exists(ctx, key).Result()
	return n > 0, err
}

// IncrBy increments an integer key and sets TTL only on creation. Used for rate limiting.
func (c *Client) IncrBy(ctx context.Context, key string, val int64) (int64, error) {
	return c.rdb.IncrBy(ctx, key, val).Result()
}

// Expire sets an expiration on an existing key.
func (c *Client) Expire(ctx context.Context, key string, ttl time.Duration) error {
	return c.rdb.Expire(ctx, key, ttl).Err()
}

// Ping checks the Redis connection health.
func (c *Client) Ping(ctx context.Context) error {
	return c.rdb.Ping(ctx).Err()
}

// -------------------------------------------------------------------
// InMemoryStore — lightweight in-memory Redis substitute for unit tests.
// -------------------------------------------------------------------

type entry struct {
	value  string
	expiry time.Time
}

// InMemoryStore is a thread-safe in-memory key-value store implementing the same interface as Client,
// intended for use in unit tests where a real Redis instance is unavailable.
type InMemoryStore struct {
	mu   sync.RWMutex
	data map[string]entry
}

// NewInMemoryStore creates a new InMemoryStore.
func NewInMemoryStore() *InMemoryStore {
	return &InMemoryStore{data: make(map[string]entry)}
}

func (s *InMemoryStore) Set(_ context.Context, key, value string, ttl time.Duration) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	expiry := time.Time{}
	if ttl > 0 {
		expiry = time.Now().Add(ttl)
	}
	s.data[key] = entry{value: value, expiry: expiry}
	return nil
}

func (s *InMemoryStore) Get(_ context.Context, key string) (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	e, ok := s.data[key]
	if !ok || (!e.expiry.IsZero() && time.Now().After(e.expiry)) {
		return "", redis.Nil
	}
	return e.value, nil
}

func (s *InMemoryStore) Del(_ context.Context, keys ...string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, k := range keys {
		delete(s.data, k)
	}
	return nil
}

func (s *InMemoryStore) Exists(_ context.Context, key string) (bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	e, ok := s.data[key]
	if !ok || (!e.expiry.IsZero() && time.Now().After(e.expiry)) {
		return false, nil
	}
	return true, nil
}

func (s *InMemoryStore) IncrBy(_ context.Context, key string, val int64) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	// Parse existing integer
	var cur int64
	if e, ok := s.data[key]; ok && (e.expiry.IsZero() || time.Now().Before(e.expiry)) {
		_, _ = scanInt64(e.value, &cur)
	}
	cur += val
	exp := s.data[key].expiry
	s.data[key] = entry{value: formatInt64(cur), expiry: exp}
	return cur, nil
}

func (s *InMemoryStore) Expire(_ context.Context, key string, ttl time.Duration) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if e, ok := s.data[key]; ok {
		e.expiry = time.Now().Add(ttl)
		s.data[key] = e
	}
	return nil
}

func (s *InMemoryStore) Ping(_ context.Context) error { return nil }

// KVStore is the interface both Client and InMemoryStore satisfy.
type KVStore interface {
	Set(ctx context.Context, key, value string, ttl time.Duration) error
	Get(ctx context.Context, key string) (string, error)
	Del(ctx context.Context, keys ...string) error
	Exists(ctx context.Context, key string) (bool, error)
	IncrBy(ctx context.Context, key string, val int64) (int64, error)
	Expire(ctx context.Context, key string, ttl time.Duration) error
	Ping(ctx context.Context) error
}

// helpers
func scanInt64(s string, out *int64) (int, error) {
	n, err := fmt.Sscanf(s, "%d", out)
	return n, err
}

func formatInt64(n int64) string {
	return fmt.Sprintf("%d", n)
}
