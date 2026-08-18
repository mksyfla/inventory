import { create } from 'zustand';
import { Warehouse, MOCK_WAREHOUSES } from '../types/warehouse';

interface WarehouseState {
  warehouses: Warehouse[];
  activeWarehouseId: number;
  activeWarehouse: Warehouse | undefined;
  activeWarehouseCode: string | undefined;
  setActiveWarehouseId: (id: number) => void;
  setWarehousesFromCodes: (codes: string[]) => void;
}

export const useWarehouseStore = create<WarehouseState>((set, get) => ({
  warehouses: MOCK_WAREHOUSES,
  activeWarehouseId: MOCK_WAREHOUSES[0].id,
  activeWarehouse: MOCK_WAREHOUSES[0],
  activeWarehouseCode: MOCK_WAREHOUSES[0].code,

  setActiveWarehouseId: (id: number) => {
    const found = get().warehouses.find((w) => w.id === id);
    set({
      activeWarehouseId: id,
      activeWarehouse: found || get().warehouses[0],
      activeWarehouseCode: found?.code || get().warehouses[0]?.code,
    });
  },

  // Seed the store from JWT `warehouses` claims (backend warehouse codes, e.g. "WH01").
  setWarehousesFromCodes: (codes: string[]) => {
    const clean = codes.filter(Boolean);
    if (clean.length === 0) return;
    const warehouses: Warehouse[] = clean.map((code, idx) => ({
      id: idx + 1,
      code,
      name: code,
      address: '',
      isActive: true,
    }));
    set({
      warehouses,
      activeWarehouseId: warehouses[0].id,
      activeWarehouse: warehouses[0],
      activeWarehouseCode: warehouses[0].code,
    });
  },
}));
