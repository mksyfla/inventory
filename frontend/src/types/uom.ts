import { z } from 'zod';

export interface ItemUom {
  id: number;
  itemId: number;
  uomName: string;
  conversionFactor: number;
  barcode?: string;
  isBaseUom: boolean;
}

export const itemUomSchema = z.object({
  uomName: z
    .string()
    .min(1, 'Nama satuan wajib diisi')
    .max(20, 'Nama satuan maksimal 20 karakter')
    .toUpperCase(),
  conversionFactor: z
    .number({ invalid_type_error: 'Faktor konversi harus berupa angka' })
    .gt(0, 'Faktor konversi harus lebih besar dari 0 (misal: 1 BOX = 24 PCS)'),
  barcode: z
    .string()
    .max(50, 'Barcode maksimal 50 karakter')
    .optional()
    .nullable()
    .transform((val) => (val?.trim() === '' ? undefined : val)),
});

export type ItemUomFormValues = z.infer<typeof itemUomSchema>;

export const MOCK_ITEM_UOMS: ItemUom[] = [
  {
    id: 1,
    itemId: 1,
    uomName: 'CAN',
    conversionFactor: 1,
    barcode: '899000111222',
    isBaseUom: true,
  },
  {
    id: 2,
    itemId: 1,
    uomName: 'BOX',
    conversionFactor: 12,
    barcode: '899000111999',
    isBaseUom: false,
  },
  {
    id: 3,
    itemId: 1,
    uomName: 'KARTON',
    conversionFactor: 48,
    barcode: '899000111888',
    isBaseUom: false,
  },
];
