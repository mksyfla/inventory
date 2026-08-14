import { notification } from 'antd';
import { ApiErrorDetail, ApiErrorCode } from './types';

export const ERROR_MESSAGES_ID: Record<ApiErrorCode | string, string> = {
  ERR_VALIDATION: 'Payload data tidak valid. Silakan periksa kembali isian form Anda.',
  ERR_UNAUTHENTICATED: 'Sesi Anda telah berakhir. Silakan login kembali untuk melanjutkan.',
  ERR_FORBIDDEN: 'Akses ditolak. Anda tidak memiliki izin untuk aksi ini pada gudang aktif.',
  ERR_NOT_FOUND: 'Data atau dokumen yang diminta tidak ditemukan.',
  ERR_STOCK_INSUFFICIENT: 'Saldo stok bebas tidak mencukupi untuk memenuhi permintaan ini.',
  ERR_INVALID_STATE: 'Transisi status dokumen tidak valid atau tidak diizinkan.',
  ERR_SELF_APPROVAL: 'Aturan Maker-Checker: Pembuat dokumen tidak boleh menyetujui dokumen sendiri.',
  ERR_SCAN_MISMATCH: 'Hasil scan barcode lokasi atau barang tidak cocok dengan alokasi!',
  ERR_DUPLICATE_KEY: 'Kode SKU, Barcode, atau Nomor Dokumen sudah terdaftar di sistem.',
  ERR_EXPIRED_STOCK: 'Batch barang sudah kedaluwarsa dan tidak diizinkan untuk dikeluarkan.',
  ERR_CONFLICT_VERSION: 'Terjadi konflik versi data (Optimistic Lock). Silakan muat ulang data.',
  ERR_INTERNAL: 'Kesalahan internal pada sistem server. Silakan hubungi tim administrator.',
};

/**
 * Maps an API error object to a friendly Indonesian message string.
 */
export function formatApiErrorMessage(error: ApiErrorDetail | null | undefined): string {
  if (!error) {
    return 'Terjadi kesalahan yang tidak diketahui.';
  }

  const baseMessage = ERROR_MESSAGES_ID[error.code] || error.message || 'Terjadi kesalahan pada sistem.';

  // Append specific detail strings if available (e.g., requested vs available stock)
  if (error.details && Array.isArray(error.details) && error.details.length > 0) {
    const detailStrings = error.details.map((d) => {
      if (d.sku && d.requested !== undefined && d.available !== undefined) {
        return `[${d.sku}: Diminta ${d.requested}, Tersedia ${d.available}]`;
      }
      if (d.field) {
        return `${d.field}: ${d.message || 'tidak valid'}`;
      }
      return JSON.stringify(d);
    });
    return `${baseMessage} (${detailStrings.join(', ')})`;
  }

  return baseMessage;
}

/**
 * Displays an Ant Design notification card for API errors.
 */
export function showApiErrorNotification(error: ApiErrorDetail | null | undefined): void {
  const messageText = formatApiErrorMessage(error);
  const codeText = error?.code ? ` [Kode: ${error.code}]` : '';

  notification.error({
    message: `Gagal Memproses Data${codeText}`,
    description: messageText,
    duration: 5,
    placement: 'topRight',
  });
}
