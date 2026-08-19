import { get } from '../base';
import { BatchTraceDTO, StockBalanceDTO, StockMovementDTO } from '../dto';

export interface StockBalanceParams {
  warehouse_code?: string;
  status?: string;
  search?: string;
  category_id?: number;
}

export interface StockLedgerParams {
  item_id?: number;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export const stockQueryService = {
  listBalances(params: StockBalanceParams = {}): Promise<StockBalanceDTO[]> {
    const query = new URLSearchParams();
    if (params.warehouse_code) query.set('warehouse_code', params.warehouse_code);
    if (params.status) query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    if (params.category_id && params.category_id > 0) {
      query.set('category_id', String(params.category_id));
    }
    const qs = query.toString();
    return get<StockBalanceDTO[]>(`/stock/balances${qs ? `?${qs}` : ''}`);
  },

  listBatchTrace(search?: string): Promise<BatchTraceDTO[]> {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    return get<BatchTraceDTO[]>(`/stock/batches${qs}`);
  },

  listLedger(params: StockLedgerParams = {}): Promise<StockMovementDTO[]> {
    const query = new URLSearchParams();
    if (params.item_id && params.item_id > 0) query.set('item_id', String(params.item_id));
    if (params.from) query.set('from', params.from);
    if (params.to) query.set('to', params.to);
    if (params.limit) query.set('limit', String(params.limit));
    if (params.offset && params.offset > 0) query.set('offset', String(params.offset));
    const qs = query.toString();
    return get<StockMovementDTO[]>(`/stock/ledger${qs ? `?${qs}` : ''}`);
  },
};
