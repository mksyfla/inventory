import { Warehouse } from './location';

export type { Warehouse };

export const MOCK_WAREHOUSES: Warehouse[] = [
  {
    id: 1,
    code: 'WH01',
    name: 'Gudang Utama PERURI (WH01)',
    address: 'Kawasan Produksi Karawang Blok A',
    isActive: true,
  },
  {
    id: 2,
    code: 'WH02',
    name: 'Gudang Distribusi Jakarta (WH02)',
    address: 'Jl. Palatehan No. 4, Jakarta Selatan',
    isActive: true,
  },
];
