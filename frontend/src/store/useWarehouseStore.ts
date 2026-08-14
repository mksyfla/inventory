import { create } from 'zustand';
import { Warehouse, MOCK_WAREHOUSES } from '../types/warehouse';

interface WarehouseState {
  warehouses: Warehouse[];
  activeWarehouseId: number;
  activeWarehouse: Warehouse | undefined;
  setActiveWarehouseId: (id: number) => void;
}

export const useWarehouseStore = create<WarehouseState>((set, get) => ({
  warehouses: MOCK_WAREHOUSES,
  activeWarehouseId: MOCK_WAREHOUSES[0].id,
  activeWarehouse: MOCK_WAREHOUSES[0],
  setActiveWarehouseId: (id: number) => {
    const found = get().warehouses.find((w) => w.id === id);
    set({
      activeWarehouseId: id,
      activeWarehouse: found || get().warehouses[0],
    });
  },
}));
