import React, { useState, useEffect } from 'react';
import { Card, Input, Button, Typography, Alert, Checkbox, Space, Divider, Tag } from 'antd';
import {
  UserOutlined,
  LockOutlined,
  SafetyOutlined,
  AuditOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { MOCK_CURRENT_USER, MOCK_DEMO_USERS, User } from '../types/user';

const { Title, Text } = Typography;

const loginSchema = z.object({
  username: z.string().min(3, 'Username minimal 3 karakter'),
  password: z.string().min(6, 'Kata sandi minimal 6 karakter'),
  mfaCode: z.string().optional(),
  rememberMe: z.boolean().optional(),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export const LoginPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showMfa, setShowMfa] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated } = useAuthStore();

  // Safely calculate destination path, avoiding redirecting back to /login
  const rawFrom = (location.state as any)?.from;
  const targetPath = typeof rawFrom === 'string' ? rawFrom : rawFrom?.pathname;
  const destination = targetPath && targetPath !== '/login' ? targetPath : '/dashboard';

  // If user is already authenticated, redirect straight to destination / dashboard
  useEffect(() => {
    if (isAuthenticated) {
      navigate(destination, { replace: true });
    }
  }, [isAuthenticated, navigate, destination]);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: 'dipo.inventory',
      password: 'password123',
      rememberMe: true,
    },
  });

  const performLogin = (userToLogin: User) => {
    setLoading(true);
    setErrorMsg(null);

    setTimeout(() => {
      login(userToLogin, 'mock-jwt-token-xyz-12345', 'mock-refresh-token-xyz-99999');
      setLoading(false);
      navigate(destination, { replace: true });
    }, 400);
  };

  const onSubmit = async (values: LoginFormValues) => {
    // Find matching demo user by username keyword or fallback to default MOCK_CURRENT_USER
    const lowerUser = values.username.toLowerCase();
    let targetUser: User = MOCK_CURRENT_USER;

    if (lowerUser.includes('inbound') || lowerUser.includes('budi')) {
      targetUser = MOCK_DEMO_USERS.inbound;
    } else if (lowerUser.includes('outbound') || lowerUser.includes('siti')) {
      targetUser = MOCK_DEMO_USERS.outbound;
    } else if (lowerUser.includes('supervisor') || lowerUser.includes('agus')) {
      targetUser = MOCK_DEMO_USERS.supervisor;
    }

    performLogin(targetUser);
  };

  const handleQuickLogin = (roleKey: 'manager' | 'inbound' | 'outbound' | 'supervisor') => {
    const demoUser = MOCK_DEMO_USERS[roleKey] || MOCK_CURRENT_USER;
    setValue('username', demoUser.username);
    setValue('password', 'password123');
    performLogin(demoUser);
  };


  return (
    <div
      data-testid="login-page"
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #001529 0%, #002140 50%, #0052cc 100%)',
        padding: 20,
      }}
    >
      <Card
        style={{
          width: '100%',
          maxWidth: 440,
          borderRadius: 14,
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <Space align="center" style={{ marginBottom: 6 }}>
            <AuditOutlined style={{ fontSize: 34, color: '#0052cc' }} />
            <Title level={2} style={{ margin: 0, fontWeight: 800, letterSpacing: 1 }}>
              SIMBAR
            </Title>
          </Space>
          <div>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Sistem Manajemen Barang & Distribusi (PERURI)
            </Text>
          </div>
          <div style={{ marginTop: 8 }}>
            <Tag color="processing" style={{ borderRadius: 10, fontSize: 11, padding: '0 10px' }}>
              Mode Demo Frontend (Mock Auth)
            </Tag>
          </div>
        </div>

        {errorMsg && (
          <Alert
            message={errorMsg}
            type="error"
            showIcon
            style={{ marginBottom: 20 }}
            data-testid="login-error-alert"
          />
        )}

        <form onSubmit={handleSubmit(onSubmit)} data-testid="login-form">
          {/* Username Field */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 13 }}>
              Username / Email
            </label>
            <Controller
              name="username"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  prefix={<UserOutlined style={{ color: 'rgba(0,0,0,.45)' }} />}
                  placeholder="Masukkan username atau email"
                  size="large"
                  status={errors.username ? 'error' : ''}
                  data-testid="input-username"
                />
              )}
            />
            {errors.username && (
              <Text type="danger" style={{ fontSize: 12 }}>
                {errors.username.message}
              </Text>
            )}
          </div>

          {/* Password Field */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 13 }}>
              Kata Sandi
            </label>
            <Controller
              name="password"
              control={control}
              render={({ field }) => (
                <Input.Password
                  {...field}
                  prefix={<LockOutlined style={{ color: 'rgba(0,0,0,.45)' }} />}
                  placeholder="Masukkan kata sandi"
                  size="large"
                  status={errors.password ? 'error' : ''}
                  data-testid="input-password"
                />
              )}
            />
            {errors.password && (
              <Text type="danger" style={{ fontSize: 12 }}>
                {errors.password.message}
              </Text>
            )}
          </div>

          {/* Optional MFA / 2FA TOTP Toggle */}
          {showMfa && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 13 }}>
                Kode 2FA / TOTP (6 Digit)
              </label>
              <Controller
                name="mfaCode"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    prefix={<SafetyOutlined style={{ color: 'rgba(0,0,0,.45)' }} />}
                    placeholder="Contoh: 123456"
                    size="large"
                    maxLength={6}
                    data-testid="input-mfa"
                  />
                )}
              />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, alignItems: 'center' }}>
            <Controller
              name="rememberMe"
              control={control}
              render={({ field }) => (
                <Checkbox checked={field.value} onChange={(e) => field.onChange(e.target.checked)}>
                  Ingat Saya
                </Checkbox>
              )}
            />
            <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setShowMfa(!showMfa)}>
              {showMfa ? 'Sembunyikan 2FA' : 'Gunakan 2FA'}
            </Button>
          </div>

          <Button
            type="primary"
            htmlType="submit"
            size="large"
            block
            loading={loading}
            data-testid="btn-login-submit"
            style={{ fontWeight: 600, height: 44, marginBottom: 12 }}
          >
            Masuk Aplikasi
          </Button>
        </form>

        <Divider style={{ margin: '16px 0 12px', fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
          <ThunderboltOutlined style={{ marginRight: 4 }} /> Quick Login (Akun Demo)
        </Divider>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Button
            size="small"
            onClick={() => handleQuickLogin('manager')}
            disabled={loading}
            data-testid="btn-quick-login-manager"
            style={{ textAlign: 'left', height: 'auto', padding: '6px 8px' }}
          >
            <div style={{ fontSize: 12, fontWeight: 600 }}>Manager / Admin</div>
            <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.45)' }}>Semua Hak Akses</div>
          </Button>

          <Button
            size="small"
            onClick={() => handleQuickLogin('supervisor')}
            disabled={loading}
            data-testid="btn-quick-login-supervisor"
            style={{ textAlign: 'left', height: 'auto', padding: '6px 8px' }}
          >
            <div style={{ fontSize: 12, fontWeight: 600 }}>Supervisor</div>
            <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.45)' }}>Approval & Audit</div>
          </Button>

          <Button
            size="small"
            onClick={() => handleQuickLogin('inbound')}
            disabled={loading}
            data-testid="btn-quick-login-inbound"
            style={{ textAlign: 'left', height: 'auto', padding: '6px 8px' }}
          >
            <div style={{ fontSize: 12, fontWeight: 600 }}>Staf Inbound</div>
            <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.45)' }}>GRN & Putaway</div>
          </Button>

          <Button
            size="small"
            onClick={() => handleQuickLogin('outbound')}
            disabled={loading}
            data-testid="btn-quick-login-outbound"
            style={{ textAlign: 'left', height: 'auto', padding: '6px 8px' }}
          >
            <div style={{ fontSize: 12, fontWeight: 600 }}>Staf Outbound</div>
            <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.45)' }}>DO, Picking & POD</div>
          </Button>
        </div>
      </Card>
    </div>
  );
};
