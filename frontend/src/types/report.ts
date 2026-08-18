export interface InventoryValuationItem {
  id: number;
  sku: string;
  itemName: string;
  categoryName: string;
  uom: string;
  unitPrice: number;
  beginningQty: number;
  beginningValue: number;
  inboundQty: number;
  inboundValue: number;
  outboundQty: number;
  outboundValue: number;
  endingQty: number;
  endingValue: number;
}

export type FsnCategory = 'fast_moving' | 'slow_moving' | 'dead_stock';

export interface FsnItem {
  id: number;
  sku: string;
  itemName: string;
  categoryName: string;
  fsnCategory: FsnCategory;
  turnoverRatio: number; // e.g. 12.4x
  daysOfInventory: number; // e.g. 15 days
  lastMovementDate: string;
  currentQty: number;
  uom: string;
  totalValuation: number;
}

export interface ZoneSpaceUtilization {
  zoneName: string;
  capacityVolumeM3: number;
  usedVolumeM3: number;
  occupancyPct: number;
}

export interface WarehouseSpaceReport {
  warehouseId: number;
  warehouseName: string;
  totalVolumeM3: number;
  usedVolumeM3: number;
  volumeOccupancyPct: number;
  totalWeightKg: number;
  usedWeightKg: number;
  weightOccupancyPct: number;
  zones: ZoneSpaceUtilization[];
}

export function getFsnCategoryTagColor(category: FsnCategory): { color: string; label: string } {
  switch (category) {
    case 'fast_moving':
      return { color: 'success', label: 'Fast-Moving (F)' };
    case 'slow_moving':
      return { color: 'warning', label: 'Slow-Moving (S)' };
    case 'dead_stock':
      return { color: 'error', label: 'Dead-Stock / Non-Moving (N)' };
    default:
      return { color: 'default', label: category };
  }
}

export const MOCK_VALUATION_REPORTS: InventoryValuationItem[] = [
  {
    id: 1,
    sku: 'SKU-PITA-001',
    itemName: 'Pita Cukai Hasil Tembakau (CHT) 2026',
    categoryName: 'Pita Cukai',
    uom: 'RIM',
    unitPrice: 25000000,
    beginningQty: 100,
    beginningValue: 2500000000,
    inboundQty: 300,
    inboundValue: 7500000000,
    outboundQty: 150,
    outboundValue: 3750000000,
    endingQty: 250,
    endingValue: 6250000000,
  },
  {
    id: 2,
    sku: 'SKU-TINTA-002',
    itemName: 'Tinta Cetak Sekuritas Siklamat Biru',
    categoryName: 'Tinta Cetak Sekuritas',
    uom: 'KG',
    unitPrice: 15000000,
    beginningQty: 50,
    beginningValue: 750000000,
    inboundQty: 50,
    inboundValue: 750000000,
    outboundQty: 20,
    outboundValue: 300000000,
    endingQty: 80,
    endingValue: 1200000000,
  },
];

export const MOCK_FSN_REPORTS: FsnItem[] = [
  {
    id: 1,
    sku: 'SKU-PITA-001',
    itemName: 'Pita Cukai Hasil Tembakau (CHT) 2026',
    categoryName: 'Pita Cukai',
    fsnCategory: 'fast_moving',
    turnoverRatio: 14.5,
    daysOfInventory: 12,
    lastMovementDate: '2026-08-16',
    currentQty: 250,
    uom: 'RIM',
    totalValuation: 6250000000,
  },
  {
    id: 2,
    sku: 'SKU-TINTA-002',
    itemName: 'Tinta Cetak Sekuritas Siklamat Biru',
    categoryName: 'Tinta Cetak Sekuritas',
    fsnCategory: 'slow_moving',
    turnoverRatio: 2.1,
    daysOfInventory: 85,
    lastMovementDate: '2026-07-20',
    currentQty: 80,
    uom: 'KG',
    totalValuation: 1200000000,
  },
  {
    id: 3,
    sku: 'SKU-KERTAS-003',
    itemName: 'Kertas Banknote Uang Kertas Rp 100.000',
    categoryName: 'Kertas Sekuritas',
    fsnCategory: 'dead_stock',
    turnoverRatio: 0.0,
    daysOfInventory: 365,
    lastMovementDate: '2025-08-10',
    currentQty: 15,
    uom: 'REAM',
    totalValuation: 450000000,
  },
];

export const MOCK_SPACE_REPORTS: WarehouseSpaceReport[] = [
  {
    warehouseId: 1,
    warehouseName: 'Gudang Utama Jakarta (Kawasan Peruri)',
    totalVolumeM3: 500,
    usedVolumeM3: 385,
    volumeOccupancyPct: 77.0,
    totalWeightKg: 100000,
    usedWeightKg: 65000,
    weightOccupancyPct: 65.0,
    zones: [
      {
        zoneName: 'Zona A - Bahan Baku & Tinta Cetak',
        capacityVolumeM3: 200,
        usedVolumeM3: 160,
        occupancyPct: 80.0,
      },
      {
        zoneName: 'Zona B - Produk Sekuritas Jadi',
        capacityVolumeM3: 250,
        usedVolumeM3: 180,
        occupancyPct: 72.0,
      },
      {
        zoneName: 'Area Staging Inbound & Outbound',
        capacityVolumeM3: 50,
        usedVolumeM3: 45,
        occupancyPct: 90.0,
      },
    ],
  },
  {
    warehouseId: 2,
    warehouseName: 'Gudang Satelit Bandung',
    totalVolumeM3: 200,
    usedVolumeM3: 90,
    volumeOccupancyPct: 45.0,
    totalWeightKg: 40000,
    usedWeightKg: 15000,
    weightOccupancyPct: 37.5,
    zones: [
      {
        zoneName: 'Zona Utama Satelit',
        capacityVolumeM3: 200,
        usedVolumeM3: 90,
        occupancyPct: 45.0,
      },
    ],
  },
];
