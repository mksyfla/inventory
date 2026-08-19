import React, { useEffect } from 'react';
import {
  Card,
  Input,
  InputNumber,
  Select,
  Switch,
  Button,
  Space,
  Typography,
  Row,
  Col,
  notification,
} from 'antd';
import { SettingOutlined, SaveOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useForm, Controller } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SystemSettings, DEFAULT_SYSTEM_SETTINGS } from '../../types/admin';
import { adminService } from '../../api/services/admin';
import { SettingsPayload } from '../../api/dto';

const { Title, Paragraph, Text } = Typography;

// Coerce the flat GET /settings JSON object back into typed SystemSettings,
// falling back to defaults for any key the store does not carry yet.
const parseSettings = (raw: SettingsPayload): SystemSettings => {
  const num = (v: unknown, fallback: number) => (typeof v === 'number' ? v : fallback);
  const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  const valuation = str(raw.valuationMethod, DEFAULT_SYSTEM_SETTINGS.valuationMethod);
  return {
    companyName: str(raw.companyName, DEFAULT_SYSTEM_SETTINGS.companyName),
    minStockThresholdPct: num(raw.minStockThresholdPct, DEFAULT_SYSTEM_SETTINGS.minStockThresholdPct),
    expiryWarningDays: num(raw.expiryWarningDays, DEFAULT_SYSTEM_SETTINGS.expiryWarningDays),
    sessionTimeoutMinutes: num(raw.sessionTimeoutMinutes, DEFAULT_SYSTEM_SETTINGS.sessionTimeoutMinutes),
    valuationMethod:
      valuation === 'LIFO' || valuation === 'AVERAGE' ? valuation : 'FIFO',
    makerCheckerEnabled: bool(raw.makerCheckerEnabled, DEFAULT_SYSTEM_SETTINGS.makerCheckerEnabled),
  };
};

export const SettingsPage: React.FC = () => {
  const queryClient = useQueryClient();

  // Load persisted settings from the backend and seed the form.
  const { data: loadedSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => adminService.getSettings(),
  });

  const { control, handleSubmit, reset } = useForm<SystemSettings>({
    defaultValues: DEFAULT_SYSTEM_SETTINGS,
  });

  useEffect(() => {
    if (loadedSettings) {
      reset(parseSettings(loadedSettings));
    }
  }, [loadedSettings, reset]);

  const saveSettings = useMutation({
    mutationFn: (values: SystemSettings) => adminService.updateSettings({ ...values }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      notification.success({
        message: 'Pengaturan Sistem Berhasil Disimpan',
        description: 'Seluruh parameter operasional dan ambang batas peringatan telah tersimpan ke database.',
      });
    },
    onError: () => {
      notification.error({
        message: 'Gagal Menyimpan Pengaturan',
        description: 'Periksa koneksi dan data, lalu coba lagi.',
      });
    },
  });

  const handleSaveSettings = (values: SystemSettings) => {
    saveSettings.mutate(values);
  };

  return (
    <div data-testid="settings-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center">
              <SettingOutlined style={{ fontSize: 24, color: '#0052cc' }} />
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  Pengaturan Parameter Sistem & SLA (FE-803)
                </Title>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  Konfigurasi parameter global, ambang batas peringatan stok, dan pengamanan transaksi.
                </Paragraph>
              </div>
            </Space>
          </Col>
        </Row>

        <form onSubmit={handleSubmit(handleSaveSettings)} data-testid="form-settings">
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {/* General Settings */}
            <Card variant="borderless" title="1. Identitas Sistem & Instansi">
              <Row gutter={[16, 16]}>
                <Col xs={24} md={16}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                    Nama Perusahaan / Instansi <Text type="danger">*</Text>
                  </label>
                  <Controller
                    name="companyName"
                    control={control}
                    render={({ field }) => (
                      <Input {...field} style={{ width: '100%' }} data-testid="input-setting-company" />
                    )}
                  />
                </Col>

                <Col xs={24} md={8}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                    Metode Valuasi Stok Persediaan <Text type="danger">*</Text>
                  </label>
                  <Controller
                    name="valuationMethod"
                    control={control}
                    render={({ field }) => (
                      <Select
                        {...field}
                        style={{ width: '100%' }}
                        disabled
                        data-testid="select-setting-valuation"
                        options={[{ value: 'FIFO', label: 'FIFO (First-In, First-Out)' }]}
                      />
                    )}
                  />
                </Col>
              </Row>
            </Card>

            {/* Threshold & SLA Settings */}
            <Card variant="borderless" title="2. Ambang Batas Peringatan (Thresholds) & SLA">
              <Row gutter={[16, 16]}>
                <Col xs={24} md={8}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                    Ambang Batas Minimum Stock Alert (%) <Text type="danger">*</Text>
                  </label>
                  <Controller
                    name="minStockThresholdPct"
                    control={control}
                    render={({ field }) => (
                      <InputNumber
                        {...field}
                        min={1}
                        max={50}
                        addonAfter="%"
                        style={{ width: '100%' }}
                        data-testid="input-setting-minstock"
                      />
                    )}
                  />
                </Col>

                <Col xs={24} md={8}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                    Peringatan Kedaluwarsa Early Warning (Hari) <Text type="danger">*</Text>
                  </label>
                  <Controller
                    name="expiryWarningDays"
                    control={control}
                    render={({ field }) => (
                      <InputNumber
                        {...field}
                        min={7}
                        max={365}
                        addonAfter="Hari"
                        style={{ width: '100%' }}
                        data-testid="input-setting-expiry"
                      />
                    )}
                  />
                </Col>

                <Col xs={24} md={8}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                    Batas Waktu Idle Sesi Selesai (Menit) <Text type="danger">*</Text>
                  </label>
                  <Controller
                    name="sessionTimeoutMinutes"
                    control={control}
                    render={({ field }) => (
                      <InputNumber
                        {...field}
                        min={5}
                        max={120}
                        addonAfter="Menit"
                        style={{ width: '100%' }}
                        data-testid="input-setting-timeout"
                      />
                    )}
                  />
                </Col>
              </Row>
            </Card>

            {/* Maker Checker Safeguard Security */}
            <Card
              variant="borderless"
              title={
                <Space>
                  <SafetyCertificateOutlined style={{ color: '#0052cc' }} />
                  <span>3. Pengamanan Transaksi & Dual-Control (Maker-Checker)</span>
                </Space>
              }
            >
              <Row gutter={[16, 16]} align="middle">
                <Col xs={24} md={18}>
                  <Text strong style={{ fontSize: 14, display: 'block' }}>
                    Aktifkan Aturan Pengamanan Approval Berjenjang (Maker-Checker Safeguard)
                  </Text>
                  <Paragraph type="secondary" style={{ margin: 0 }}>
                    Mencegah pembuatan dan persetujuan dokumen penerimaan (GRN) oleh pengguna yang sama.
                  </Paragraph>
                </Col>

                <Col xs={24} md={6} style={{ textAlign: 'right' }}>
                  <Controller
                    name="makerCheckerEnabled"
                    control={control}
                    render={({ field }) => (
                      <Switch
                        checked={field.value}
                        onChange={(val) => field.onChange(val)}
                        checkedChildren="Aktif"
                        unCheckedChildren="Non-Aktif"
                        data-testid="switch-setting-makerchecker"
                      />
                    )}
                  />
                </Col>
              </Row>
            </Card>

            <Row justify="end">
              <Button
                type="primary"
                size="large"
                htmlType="submit"
                icon={<SaveOutlined />}
                loading={saveSettings.isPending}
                data-testid="btn-save-settings"
              >
                Simpan Pengaturan Sistem
              </Button>
            </Row>
          </Space>
        </form>
      </Space>
    </div>
  );
};
