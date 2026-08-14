export interface Warehouse {
  id: number;
  code: string;
  name: string;
  address: string;
  isActive: boolean;
}

export const MOCK_WAREHOUSES: Warehouse[] = [
  {
    id: 1,
    code: 'JKT01',
    name: 'Gudang Utama Jakarta',
    address: 'Jl. Industri No. 12, Jakarta Timur',
    isActive: true,
  },
  {
    id: 2,
    code: 'BDG01',
    name: 'Gudang Cabang Bandung',
    address: 'Jl. Soekarno Hatta No. 45, Bandung',
    isActive: true,
  },
  {
    id: 3,
    code: 'SUB01',
    name: 'Gudang Hub Surabaya',
    address: 'Kawasan Rungkut Industri III No. 8, Surabaya',
    isActive: true,
  },
];
