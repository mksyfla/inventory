package redisclient

import (
	"context"
	"crypto/tls"
	"fmt"
	"path"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// Client wraps a go-redis client so callers can use it without caring about connection details.
type Client struct {
	rdb *redis.Client
}

// Options configures the go-redis connection (M-05). Zero values fall back to
// the go-redis defaults (DialTimeout 5s, Read/Write 3s, MaxRetries 3), so a
// caller that only sets Addr gets a sane, retrying client — not a bare socket.
type Options struct {
	Addr         string
	Username     string
	Password     string
	DB           int
	PoolSize     int
	DialTimeout  time.Duration
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
	TLSConfig    *tls.Config
}

// New creates a Redis client connected to the given address with safe defaults.
func New(addr string) *Client {
	return NewWithOptions(Options{Addr: addr})
}

// NewWithOptions creates a Redis client with explicit connection options. Redis
// holds refresh sessions and rate-limit state, so auth, pool sizing and timeouts
// are wired here instead of a bare Addr (M-05).
func NewWithOptions(o Options) *Client {
	rdb := redis.NewClient(&redis.Options{
		Addr:         o.Addr,
		Username:     o.Username,
		Password:     o.Password,
		DB:           o.DB,
		PoolSize:     o.PoolSize,
		DialTimeout:  o.DialTimeout,
		ReadTimeout:  o.ReadTimeout,
		WriteTimeout: o.WriteTimeout,
		TLSConfig:    o.TLSConfig,
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

// DelPattern deletes every key matching a glob pattern. Used for refresh-token
// family revocation (M-03): when a consumed token is replayed, the whole
// `refresh:<userID>:*` family is purged. Scans with the cursor API rather than
// KEYS so the call is O(N) without blocking the event loop.
func (c *Client) DelPattern(ctx context.Context, pattern string) error {
	var keys []string
	iter := c.rdb.Scan(ctx, 0, pattern, 0).Iterator()
	for iter.Next(ctx) {
		keys = append(keys, iter.Val())
	}
	if err := iter.Err(); err != nil {
		return err
	}
	if len(keys) == 0 {
		return nil
	}
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

// ExpireNX sets an expiration on a key only when it currently has none. The
// rate limiter uses this to arm a fixed-window TTL exactly once per window
// (H-02): sustained traffic past the limit never re-arms the expiry.
func (c *Client) ExpireNX(ctx context.Context, key string, ttl time.Duration) error {
	return c.rdb.ExpireNX(ctx, key, ttl).Err()
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

func (s *InMemoryStore) DelPattern(_ context.Context, pattern string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for k := range s.data {
		if ok, _ := path.Match(pattern, k); ok {
			delete(s.data, k)
		}
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

func (s *InMemoryStore) ExpireNX(_ context.Context, key string, ttl time.Duration) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.data[key]
	if !ok {
		return nil
	}
	// Only arm the TTL when the key is not already expiring (fixed-window
	// semantics: the counter resets `ttl` after its first request, not after
	// its last).
	if !e.expiry.IsZero() && time.Now().Before(e.expiry) {
		return nil
	}
	e.expiry = time.Now().Add(ttl)
	s.data[key] = e
	return nil
}

func (s *InMemoryStore) Ping(_ context.Context) error { return nil }

// KVStore is the interface both Client and InMemoryStore satisfy.
type KVStore interface {
	Set(ctx context.Context, key, value string, ttl time.Duration) error
	Get(ctx context.Context, key string) (string, error)
	Del(ctx context.Context, keys ...string) error
	// DelPattern deletes every key matching a glob pattern (M-03: refresh-token
	// family revocation on reuse).
	DelPattern(ctx context.Context, pattern string) error
	Exists(ctx context.Context, key string) (bool, error)
	IncrBy(ctx context.Context, key string, val int64) (int64, error)
	Expire(ctx context.Context, key string, ttl time.Duration) error
	// ExpireNX sets a TTL only when the key has no TTL yet (fixed-window rate
	// limiting; H-02).
	ExpireNX(ctx context.Context, key string, ttl time.Duration) error
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
