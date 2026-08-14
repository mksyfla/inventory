package redisclient

import (
	"context"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestInMemoryStore_SetGet(t *testing.T) {
	store := NewInMemoryStore()
	ctx := context.Background()

	err := store.Set(ctx, "key1", "value1", 0)
	require.NoError(t, err)

	val, err := store.Get(ctx, "key1")
	require.NoError(t, err)
	assert.Equal(t, "value1", val)
}

func TestInMemoryStore_GetMissing(t *testing.T) {
	store := NewInMemoryStore()
	ctx := context.Background()

	_, err := store.Get(ctx, "nonexistent")
	assert.ErrorIs(t, err, redis.Nil)
}

func TestInMemoryStore_Expiry(t *testing.T) {
	store := NewInMemoryStore()
	ctx := context.Background()

	err := store.Set(ctx, "expiring", "val", 50*time.Millisecond)
	require.NoError(t, err)

	// Should exist immediately
	val, err := store.Get(ctx, "expiring")
	require.NoError(t, err)
	assert.Equal(t, "val", val)

	// Wait for expiry
	time.Sleep(100 * time.Millisecond)
	_, err = store.Get(ctx, "expiring")
	assert.ErrorIs(t, err, redis.Nil, "expired key should return redis.Nil")
}

func TestInMemoryStore_Del(t *testing.T) {
	store := NewInMemoryStore()
	ctx := context.Background()

	_ = store.Set(ctx, "k1", "v1", 0)
	_ = store.Set(ctx, "k2", "v2", 0)

	err := store.Del(ctx, "k1", "k2")
	require.NoError(t, err)

	_, err = store.Get(ctx, "k1")
	assert.ErrorIs(t, err, redis.Nil)
}

func TestInMemoryStore_Exists(t *testing.T) {
	store := NewInMemoryStore()
	ctx := context.Background()

	_ = store.Set(ctx, "present", "yes", 0)

	ok, err := store.Exists(ctx, "present")
	require.NoError(t, err)
	assert.True(t, ok)

	ok2, err := store.Exists(ctx, "absent")
	require.NoError(t, err)
	assert.False(t, ok2)
}

func TestInMemoryStore_IncrBy(t *testing.T) {
	store := NewInMemoryStore()
	ctx := context.Background()

	n, err := store.IncrBy(ctx, "counter", 1)
	require.NoError(t, err)
	assert.Equal(t, int64(1), n)

	n, err = store.IncrBy(ctx, "counter", 4)
	require.NoError(t, err)
	assert.Equal(t, int64(5), n)
}

func TestInMemoryStore_Expire(t *testing.T) {
	store := NewInMemoryStore()
	ctx := context.Background()

	_ = store.Set(ctx, "mykey", "hello", 0)
	err := store.Expire(ctx, "mykey", 50*time.Millisecond)
	require.NoError(t, err)

	time.Sleep(100 * time.Millisecond)
	_, err = store.Get(ctx, "mykey")
	assert.ErrorIs(t, err, redis.Nil, "key should have expired")
}

func TestInMemoryStore_Ping(t *testing.T) {
	store := NewInMemoryStore()
	err := store.Ping(context.Background())
	assert.NoError(t, err)
}

// Verify the interface is satisfied at compile-time
var _ KVStore = (*InMemoryStore)(nil)
