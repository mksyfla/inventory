import { describe, it, expect, beforeEach } from 'vitest';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/useAuthStore';
import { useWarehouseStore } from '../store/useWarehouseStore';

describe('ApiClient Interceptors & Headers', () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: 'test-jwt-token-123',
      isAuthenticated: true,
    });
    useWarehouseStore.setState({
      activeWarehouseId: 1,
      activeWarehouseCode: 'WH01',
    });
  });

  it('automatically injects Authorization, X-Request-Id, and X-Warehouse-Id headers into GET requests', async () => {
    const handlers = (apiClient.interceptors.request as any).handlers;
    const requestHandler = handlers[0]?.fulfilled;

    const config = await requestHandler({
      method: 'get',
      url: '/items',
      headers: {},
    });

    expect(config.headers.Authorization).toBe('Bearer test-jwt-token-123');
    expect(config.headers['X-Warehouse-Id']).toBe('WH01');
    expect(config.headers['X-Request-Id']).toBeDefined();
    expect(typeof config.headers['X-Request-Id']).toBe('string');
  });

  it('automatically injects Idempotency-Key header into mutation methods (POST/PUT/DELETE)', async () => {
    const handlers = (apiClient.interceptors.request as any).handlers;
    const requestHandler = handlers[0]?.fulfilled;

    const postConfig = await requestHandler({
      method: 'post',
      url: '/receipts',
      headers: {},
    });

    expect(postConfig.headers['Idempotency-Key']).toBeDefined();
    expect(typeof postConfig.headers['Idempotency-Key']).toBe('string');

    const putConfig = await requestHandler({
      method: 'put',
      url: '/items/1',
      headers: {},
    });

    expect(putConfig.headers['Idempotency-Key']).toBeDefined();
  });

  it('preserves custom Idempotency-Key header if explicitly provided in request config', async () => {
    const handlers = (apiClient.interceptors.request as any).handlers;
    const requestHandler = handlers[0]?.fulfilled;

    const customKey = 'custom-uuid-key-999';
    const config = await requestHandler({
      method: 'post',
      url: '/receipts',
      headers: {
        'Idempotency-Key': customKey,
      },
    });

    expect(config.headers['Idempotency-Key']).toBe(customKey);
  });

  it('rejects response if envelope contains success: false', async () => {
    const handlers = (apiClient.interceptors.response as any).handlers;
    const responseHandler = handlers[0]?.fulfilled;

    const mockResponse = {
      data: {
        success: false,
        data: null,
        error: {
          code: 'ERR_STOCK_INSUFFICIENT',
          message: 'Stok tidak mencukupi',
        },
      },
    };

    await expect(responseHandler(mockResponse)).rejects.toEqual({
      code: 'ERR_STOCK_INSUFFICIENT',
      message: 'Stok tidak mencukupi',
    });
  });
});

