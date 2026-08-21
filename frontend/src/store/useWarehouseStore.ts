import { create } from 'zustand';
import { Warehouse, MOCK_WAREHOUSES } from '../types/warehouse';

interface WarehouseState {
  warehouses: Warehouse[];
  activeWarehouseId: number;
  activeWarehouse: Warehouse | undefined;
  activeWarehouseCode: string | undefined;
  setActiveWarehouseId: (id: number) => void;
  setWarehouses: (warehouses: Warehouse[]) => void;
  setWarehousesFromCodes: (codes: string[]) => void;
  clear: () => void;
}

export const useWarehouseStore = create<WarehouseState>((set, get) => ({
  warehouses: MOCK_WAREHOUSES,
  activeWarehouseId: MOCK_WAREHOUSES[0].id,
  activeWarehouse: MOCK_WAREHOUSES[0],
  activeWarehouseCode: MOCK_WAREHOUSES[0].code,

  setActiveWarehouseId: (id: number) => {
    const found = get().warehouses.find((w) => w.id === id);
    if (found) {
      set({
        activeWarehouseId: found.id,
        activeWarehouse: found,
        activeWarehouseCode: found.code,
      });
    }
  },

  setWarehouses: (warehouses: Warehouse[]) => {
    if (warehouses.length === 0) return;
    set({
      warehouses,
      activeWarehouseId: warehouses[0].id,
      activeWarehouse: warehouses[0],
      activeWarehouseCode: warehouses[0].code,
    });
  },

  setWarehousesFromCodes: (codes: string[]) => {
    const clean = codes.filter(Boolean);
    if (clean.length === 0) return;

    // Filter against known warehouses or map cleanly
    const mapped: Warehouse[] = clean.map((code) => {
      const existing = MOCK_WAREHOUSES.find((w) => w.code === code);
      if (existing) {
        return existing;
      }
      return {
        id: code === 'WH02' ? 2 : 1,
        code,
        name: `Gudang ${code}`,
        address: '',
        isActive: true,
      };
    });

    set({
      warehouses: mapped,
      activeWarehouseId: mapped[0].id,
      activeWarehouse: mapped[0],
      activeWarehouseCode: mapped[0].code,
    });
  },

  clear: () => {
    set({
      warehouses: MOCK_WAREHOUSES,
      activeWarehouseId: MOCK_WAREHOUSES[0].id,
      activeWarehouse: MOCK_WAREHOUSES[0],
      activeWarehouseCode: MOCK_WAREHOUSES[0].code,
    });
  },
}));
