import { z } from 'zod';

export type PartnerType = 'supplier' | 'customer' | 'internal_unit';

export interface Partner {
  id: number;
  code: string;
  name: string;
  type: PartnerType;
  address?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  createdAt?: string;
}

export const partnerSchema = z.object({
  code: z
    .string()
    .min(2, 'Kode mitra minimal 2 karakter')
    .max(50, 'Kode mitra maksimal 50 karakter')
    .regex(/^[A-Za-z0-9_-]+$/, 'Kode mitra hanya boleh huruf, angka, strip, dan underscore')
    .toUpperCase(),
  name: z.string().min(2, 'Nama mitra minimal 2 karakter').max(100, 'Nama mitra maksimal 100 karakter'),
  type: z.enum(['supplier', 'customer', 'internal_unit'], {
    required_error: 'Tipe mitra wajib dipilih',
  }),
  address: z.string().optional().nullable(),
  contactPerson: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z
    .string()
    .email('Format email tidak valid')
    .optional()
    .nullable()
    .or(z.literal('')),
  isActive: z.boolean(),
});

export type PartnerFormValues = z.infer<typeof partnerSchema>;

export const MOCK_PARTNERS: Partner[] = [
  {
    id: 1,
    code: 'SUP-INK-01',
    name: 'PT SICPA Perdana Printing Inks',
    type: 'supplier',
    address: 'Kawasan Industri Pulogadung, Jakarta Timur',
    contactPerson: 'Bpk. Hendra Wahyudi',
    phone: '021-4601234',
    email: 'sales@sicpa.co.id',
    isActive: true,
    createdAt: '2026-08-01T08:00:00Z',
  },
  {
    id: 2,
    code: 'SUP-PPR-02',
    name: 'PT Pura Barutama (Paper Division)',
    type: 'supplier',
    address: 'Jl. AKBP Agil Kusumadya No. 203, Kudus',
    contactPerson: 'Ibu Rina Sastrowardoyo',
    phone: '0291-432111',
    email: 'paper@puragroup.com',
    isActive: true,
    createdAt: '2026-08-02T10:00:00Z',
  },
  {
    id: 3,
    code: 'CUST-BI-01',
    name: 'Bank Indonesia (Departemen Pengelolaan Uang)',
    type: 'customer',
    address: 'Jl. MH Thamrin No. 2, Jakarta Pusat',
    contactPerson: 'Bpk. Agus Rahardjo',
    phone: '021-2981000',
    email: 'dpu@bi.go.id',
    isActive: true,
    createdAt: '2026-08-03T11:30:00Z',
  },
  {
    id: 4,
    code: 'INT-DEPT-PASPOR',
    name: 'Divisi Cetak Paspor & Dokumen Imigrasi (Internal)',
    type: 'internal_unit',
    address: 'Gedung Plant 1 Karawang',
    contactPerson: 'Manajer Produksi Paspor',
    phone: '0267-890123',
    email: 'prod.paspor@peruri.co.id',
    isActive: true,
    createdAt: '2026-08-04T09:00:00Z',
  },
];
